"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardBody } from "@/components/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet-provider";
import { isArcFlowConfigured, resolveArcFlowContractAddress, getArcFlowContractAddress } from "@/lib/arcflow/contract";
import { useTransactionSender } from "./use-transaction-sender";
import type { Flow, FlowValidationError } from "@/types/flow";
import { validateFlow, validateStep, formatAddress, DEFAULT_FLOW } from "@/types/flow";
import { TriggerStep } from "./trigger-step";
import { ConditionStep } from "./condition-step";
import { ActionStep } from "./action-step";
import { FlowPreviewCard } from "./flow-preview";
import { StepConnector, StepHeader } from "./step-indicator";
import { deployFlow, canBeginDeployment, applyDeploymentProgress, DEPLOYMENT_DISCLOSURE_STEPS, EXECUTION_AMOUNT_DISCLOSURE, UNKNOWN_OUTCOME_DISCLOSURE, RESTORED_UNKNOWN_OUTCOME_ERROR, type DeployStepKey, type UnresolvedDeployment } from "@/lib/arcflow/deploy-flow";
import { saveDeploymentRecoveryRecord, loadDeploymentRecoveryRecord, clearDeploymentRecoveryRecord } from "@/lib/arcflow/deployment-recovery";
import { createBrowserStorage } from "@/lib/payments/storage";
import { UnknownTransactionOutcomeError } from "@/lib/arcflow/send-transaction";
import { getActiveArcNetwork } from "@/lib/arc/network";
import { verifyFlowExecution } from "@/lib/payments/client";

type Step = "trigger" | "condition" | "action" | "review" | "deploying";

const STEP_LABELS: Record<Step, string> = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  review: "Review",
  deploying: "Deploying",
};

// Presentation-only copy for the editor panel header. The workflow behavior,
// validation, and on-chain steps are unaffected by these labels.
const BUILDER_STEP_META = {
  trigger: {
    label: "Trigger",
    description: "Records the payment event this workflow is configured for.",
  },
  condition: {
    label: "Condition",
    description: "Set the exact USDC amount this workflow will split in one manual run.",
  },
  action: {
    label: "Action",
    description: "Split the payment between recipients by percentage.",
  },
} as const;


interface DeploymentState {
  phase: "idle" | "create" | "activate" | "approve" | "execute" | "complete" | "error";
  flowId?: bigint;
  createTxHash?: string;
  activateTxHash?: string;
  approveTxHash?: string;
  executeTxHash?: string;
  error?: string;
  /** True when the outcome is UNKNOWN (timeout / RPC error), not a confirmed failure. */
  outcomeUnknown?: boolean;
  /** The submitted hash whose outcome is unknown, for explorer lookup. */
  uncertainTxHash?: string;
  /** The phase whose transaction failed (confirmed revert or unknown outcome). */
  failedPhase?: DeployStepKey;
}

interface FlowBuilderProps {
  initialFlow?: Partial<Flow>;
}

export function FlowBuilder({ initialFlow }: FlowBuilderProps) {
  const [currentStep, setCurrentStep] = useState<Step>("trigger");
  const [flow, setFlow] = useState<Partial<Flow>>({
    ...DEFAULT_FLOW,
    ...initialFlow,
  });
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [deployment, setDeployment] = useState<DeploymentState>({ phase: "idle" });
  // Phase 48.1 — synchronous single-flight guard. A ref (not state) so the
  // check-and-set happens before any await and never depends on React's next
  // render to disable the button.
  const deployInFlightRef = useRef(false);
  // Tracks the failing phase synchronously (state may not have flushed when a
  // send rejects), so partial completion can be attributed to the right step.
  const journeyPhaseRef = useRef<DeployStepKey | null>(null);
  // The created flow id, tracked synchronously so the durable recovery record
  // can include it when an unknown outcome happens after a confirmed create.
  const journeyFlowIdRef = useRef<bigint | null>(null);
  // A submitted transaction whose outcome is unknown. While set, a blind
  // restart of the deployment journey is blocked until the user explicitly
  // acknowledges the risk (or reconciles the outcome on the explorer).
  const [unresolvedUnknown, setUnresolvedUnknown] = useState<UnresolvedDeployment | null>(null);

  const { session, connection } = useWallet();
  const { sendTransaction, isSending } = useTransactionSender();
  const network = useMemo(() => getActiveArcNetwork(), []);

  const stepOrder: Step[] = ["trigger", "condition", "action"];
  const currentStepIndex = stepOrder.indexOf(currentStep);

  const walletAddress = session.wallet.address;
  const isWalletConnected = connection === "connected" || connection === "wrong-network";
  const isWrongNetwork = connection === "wrong-network";
  const contractConfigured = useMemo(() => isArcFlowConfigured(network), [network]);

  // Phase 49B.11.8 — pure derivation. The previous useMemo factory called
  // validateAll() during render (setErrors/setTouched inside the render pass),
  // which re-invoked the component and crashed with a TDZ ReferenceError
  // ("Cannot access '$' before initialization") on the connected Arc Mainnet
  // path — the only path where the full conjunction holds. Deploy eligibility
  // is now derived from the maintained validation state; the authoritative
  // full-form validation runs in the review/deploy event handlers.
  const canDeploy =
    contractConfigured && isWalletConnected && !isWrongNetwork && !!walletAddress && errors.length === 0;

  const updateFlow = useCallback(<K extends keyof Partial<Flow>>(key: K, value: Partial<Flow>[K]) => {
    setFlow((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleConditionChange = useCallback((condition: Flow["condition"]) => {
    updateFlow("condition", condition);
  }, [updateFlow]);

  const handleActionChange = useCallback((actions: Flow["actions"]) => {
    updateFlow("actions", actions);
  }, [updateFlow]);

  const handleNameChange = useCallback((name: string) => {
    updateFlow("name", name);
  }, [updateFlow]);

  const validateCurrentStep = useCallback(() => {
    const stepErrors = validateStep(flow, currentStep);
    setErrors(validateFlow(flow)); // store all errors for later display
    return stepErrors.length === 0;
  }, [flow, currentStep]);

  const validateCurrentStepRef = useRef(validateCurrentStep);
  useEffect(() => {
    validateCurrentStepRef.current = validateCurrentStep;
  }, [validateCurrentStep]);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateCurrentStepRef.current();
  }, []);

  const validateAll = useCallback(() => {
    const validationErrors = validateFlow(flow);
    setErrors(validationErrors);
    setTouched({
      name: true,
      trigger: true,
      condition: true,
      action: true,
    });
    return validationErrors.length === 0;
  }, [flow]);

  /**
   * Single review gate shared by the desktop footer "Review" button and the
   * mobile "Review & Deploy" button. Both run the full-flow validation
   * (`validateAll`) so neither action can bypass a required field — notably
   * the flow name, which per-step validation intentionally does not check
   * (see STEP_FIELD_PREFIXES in types/flow.ts).
   */
  const handleReview = useCallback(() => {
    if (validateAll()) {
      setShowReview(true);
    }
  }, [validateAll]);

  const handleNext = useCallback(() => {
    // Mark the current step as touched so validation errors become visible.
    setTouched((prev) => ({ ...prev, [currentStep]: true }));
    // "Next" only advances through the wizard steps. The final step's
    // "Review" button uses handleReview (full-flow validation) instead, so
    // the desktop and mobile review actions enforce identical gates.
    if (currentStepIndex < stepOrder.length - 1 && validateCurrentStepRef.current()) {
      setCurrentStep(stepOrder[currentStepIndex + 1]);
    }
  }, [currentStepIndex, currentStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStep(stepOrder[currentStepIndex - 1]);
    }
  }, [currentStepIndex]);

  const handleBackToEdit = useCallback(() => {
    deployInFlightRef.current = false;
    setShowReview(false);
    setCurrentStep("action");
    setDeployment({ phase: "idle" });
  }, []);

  /**
   * Phase 48.1 — explicit acknowledgment that a previous submission's outcome
   * is unknown. Clears the reconciliation block and returns to the builder so
   * a new deployment journey is only ever started deliberately.
   *
   * Phase 48.4 (finding F1) — also clears the durable recovery record. This is
   * the ONLY removal path: unmounts, refreshes, and route changes preserve the
   * record. If the wallet scope is unavailable the record is preserved and the
   * guard will restore again on the next visit for that account.
   */
  const handleAcknowledgeUnknownOutcome = useCallback(() => {
    setUnresolvedUnknown(null);
    deployInFlightRef.current = false;
    clearDeploymentRecoveryRecord(createBrowserStorage(), {
      account: walletAddress,
      chainId: network.chainId,
      contractAddress: resolveArcFlowContractAddress(network),
    });
    setShowReview(false);
    setCurrentStep("action");
    setDeployment({ phase: "idle" });
  }, [walletAddress, network]);

  /**
   * Phase 48.4 (finding F1) — restore a persisted unknown-outcome record when
   * the wallet scope becomes known (mount, wallet connect, or scope change).
   * Restoring blocks deployment until the user reconciles the transaction or
   * explicitly acknowledges the risk. Fail-safe rules:
   *  - a storage/validation failure never clears an in-session block;
   *  - records for a different account/chain/contract never restore here and
   *    are never deleted (they belong to another journey);
   *  - an in-flight or completed deployment is never overwritten.
   */
  const restoredScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletAddress) return;
    const contractAddress = resolveArcFlowContractAddress(network);
    const signature = `${walletAddress.toLowerCase()}|${network.chainId}|${contractAddress ?? "unconfigured"}`;
    if (restoredScopeRef.current === signature) return;
    restoredScopeRef.current = signature;

    const outcome = loadDeploymentRecoveryRecord(
      createBrowserStorage(),
      { account: walletAddress, chainId: network.chainId, contractAddress },
    );
    if (outcome.status !== "restored") return;
    const record = outcome.record;

    setUnresolvedUnknown({ transactionHash: record.transactionHash, phase: record.phase });
    setDeployment((prev) =>
      prev.phase === "idle"
        ? {
            phase: "error",
            failedPhase: record.phase,
            outcomeUnknown: true,
            uncertainTxHash: record.transactionHash,
            flowId: record.flowId !== null ? BigInt(record.flowId) : undefined,
            error: RESTORED_UNKNOWN_OUTCOME_ERROR,
          }
        : prev,
    );
  }, [walletAddress, network]);

  const handleDeploy = useCallback(async () => {
    // Phase 48.1 — synchronous gate evaluated before any await: a double-click
    // cannot start a second journey, and an unresolved unknown outcome (from a
    // previous timed-out / RPC-lost submission) blocks a blind restart until
    // the user explicitly acknowledges the risk.
    const gate = canBeginDeployment({
      inFlight: deployInFlightRef.current,
      unresolvedUnknown,
    });
    if (!gate.ok) return;
    if (!canDeploy) return;
    // Phase 49B.11.8 — authoritative fresh full-form validation at deploy
    // time (event handler, so the state updates here are legal): a pure
    // render-time gate must never let invalid fields bypass validation.
    if (!validateAll()) return;
    if (!isArcFlowConfigured(network)) return;

    deployInFlightRef.current = true;
    journeyPhaseRef.current = "create";
    journeyFlowIdRef.current = null;
    setDeployment({ phase: "create" });

    try {
      const result = await deployFlow({
        flow,
        network,
        sendTransaction,
        onProgress: (progress) => {
          // Track the phase synchronously so a rejection right after a patch
          // still attributes partial completion to the correct step.
          journeyPhaseRef.current = (progress.phase as DeployStepKey) ?? journeyPhaseRef.current;
          if (progress.flowId !== undefined) journeyFlowIdRef.current = progress.flowId;
          setDeployment((prev) => applyDeploymentProgress(prev, progress));
        },
      });

      // Phase 49B.12.3 — best-effort Activity recording. The on-chain journey
      // is already complete; a recording failure is intentionally not surfaced
      // (the hash stays verifiable from Activity) and can never turn a
      // confirmed execution into a failed state, block the success flow, or
      // trigger another transaction. No local record is written on failure.
      void verifyFlowExecution({ txHash: result.executeTxHash }).catch(() => {});
    } catch (error) {
      const outcomeUnknown = error instanceof UnknownTransactionOutcomeError;
      const failedPhase = journeyPhaseRef.current ?? undefined;
      setDeployment((prev) => ({
        ...prev,
        phase: "error",
        failedPhase,
        outcomeUnknown,
        uncertainTxHash: outcomeUnknown ? error.transactionHash : undefined,
        error: error instanceof Error ? error.message : "Deployment failed",
      }));
      if (outcomeUnknown) {
        // Retain the submitted hash and block a blind restart of this journey.
        const unresolved: UnresolvedDeployment = {
          transactionHash: error.transactionHash,
          phase: failedPhase ?? "execute",
        };
        setUnresolvedUnknown(unresolved);
        // Phase 48.4 (finding F1) — persist the evidence so a refresh or
        // navigation cannot clear the guard. Persistence failure is fail-safe:
        // the in-memory guard above still blocks this session.
        saveDeploymentRecoveryRecord(createBrowserStorage(), {
          account: walletAddress,
          chainId: network.chainId,
          contractAddress: getArcFlowContractAddress(network),
          transactionHash: error.transactionHash,
          phase: unresolved.phase,
          flowId: journeyFlowIdRef.current,
        });
      }
    } finally {
      deployInFlightRef.current = false;
    }
  }, [canDeploy, sendTransaction, network, flow, unresolvedUnknown, walletAddress]);

  const isStepCompleted = (step: Step) => {
    const index = stepOrder.indexOf(step);
    if (index < currentStepIndex) return true;
    if (index === currentStepIndex) {
      if (step === "trigger") return true;
      if (step === "condition") return !!flow.condition?.amount && Number(flow.condition.amount) > 0;
      if (step === "action") {
        const actions = flow.actions || [];
        if (actions.length === 0) return false;
        const total = actions.reduce((sum, a) => sum + a.percentage, 0);
        return total === 100 && actions.every(a => a.recipient && a.recipient !== "0x" && a.percentage > 0);
      }
    }
    return false;
  };

  const isStepActive = (step: Step) => step === currentStep;

  // Inline error for the flow name. Shown once the field has been touched —
  // either by blurring the input or by a failed review attempt (validateAll
  // marks the name touched). The input itself is always visible so the error
  // can be seen and corrected from any wizard step.
  const nameErrors = touched.name ? errors.filter((e) => e.field === "name").map((e) => e.message) : [];
  const nameError = nameErrors[0];

  const currentStepMeta =
    currentStep === "condition" || currentStep === "action"
      ? BUILDER_STEP_META[currentStep]
      : BUILDER_STEP_META.trigger;

  return (
    <div className="w-full">
      {/* Flow name — always visible so it can be set or corrected from any step.
          It does not block step progression (documented in STEP_FIELD_PREFIXES,
          types/flow.ts) but both review actions enforce it via validateAll. */}
      <div className="mb-4">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor="flow-name" className="shrink-0 text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground sm:w-28">
            Flow name
          </label>
          <div className="min-w-0 flex-1">
            <input
              id="flow-name"
              type="text"
              value={flow.name ?? ""}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => handleBlur("name")}
              placeholder="e.g. Treasury revenue split"
              className={`w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground transition-colors ${
                nameError ? "border-destructive focus:border-destructive" : "border-border focus:border-accent"
              }`}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "flow-name-error" : undefined}
            />
            {nameError && (
              <p id="flow-name-error" className="mt-1 text-xs text-destructive font-mono" role="alert">
                {nameError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Step navigation — one aligned strip with consistent circles, labels,
          and connectors; descriptions live in the editor panel header. */}
      <div
        className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-3 sm:gap-3 sm:px-4"
        role="navigation"
        aria-label="Flow builder steps"
      >
        {stepOrder.map((step, index) => (
          <Fragment key={step}>
            {index > 0 ? <StepConnector completed={index - 1 < currentStepIndex} /> : null}
            <StepHeader
              number={index + 1}
              label={STEP_LABELS[step]}
              active={isStepActive(step)}
              completed={isStepCompleted(step)}
            />
          </Fragment>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Builder */}
        <motion.div
          className="lg:col-span-7"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {deployment.phase !== "idle" ? (
            <DeploymentScreen 
              deployment={deployment} 
              network={network}
              onBack={handleBackToEdit}
              onAcknowledgeUnknown={handleAcknowledgeUnknownOutcome}
            />
          ) : showReview ? (
            <ReviewScreen 
              flow={flow} 
              onBack={handleBackToEdit} 
              onDeploy={handleDeploy}
              canDeploy={canDeploy}
              contractConfigured={contractConfigured}
              walletConnected={isWalletConnected}
              wrongNetwork={isWrongNetwork}
              isSending={isSending}
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-4 lg:px-6">
                <p className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                  Step {currentStepIndex + 1} of {stepOrder.length}
                </p>
                <h2 className="mt-1 text-base font-semibold text-foreground">{currentStepMeta.label}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{currentStepMeta.description}</p>
              </div>
              <CardBody>
                {currentStep === "trigger" && (
                  <TriggerStep
                    active={isStepActive("trigger")}
                    completed={isStepCompleted("trigger")}
                  />
                )}
                {currentStep === "condition" && (
                  <ConditionStep
                    condition={flow.condition || { operator: "GTE", amount: "10.00" }}
                    onChange={handleConditionChange}
                    onBlur={() => handleBlur("condition")}
                    active={isStepActive("condition")}
                    completed={isStepCompleted("condition")}
                    errors={touched.condition ? errors.filter((e) => e.field.startsWith("condition")).map((e) => e.message) : []}
                  />
                )}
                {currentStep === "action" && (
                  <ActionStep
                    actions={flow.actions || []}
                    onChange={handleActionChange}
                    onBlur={() => handleBlur("action")}
                    active={isStepActive("action")}
                    completed={isStepCompleted("action")}
                    errors={touched.action ? errors.filter((e) => e.field.startsWith("action")).map((e) => e.message) : []}
                  />
                )}

                {/* Step validation errors */}
                {touched[currentStep] && (() => {
                  const stepErrs = validateStep(flow, currentStep);
                  if (stepErrs.length === 0) return null;
                  return (
                    <div className="mt-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-xs text-destructive">
                      <span className="font-semibold">Please fix the following:</span>
                      <ul className="mt-1 ml-4 list-disc">
                        {stepErrs.map((e, i) => (
                          <li key={i}>{e.message}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </CardBody>

              {/* Footer navigation — aligned within the editor panel */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3.5 lg:px-6">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStepIndex === 0}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={19} y1={12} x2={5} y2={12} />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  Back
                </Button>
                <Button onClick={currentStepIndex === stepOrder.length - 1 ? handleReview : handleNext}>
                  {currentStepIndex === stepOrder.length - 1 ? "Review" : "Next"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={5} y1={12} x2={19} y2={12} />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Button>
              </div>
            </Card>
          )}
        </motion.div>

        {/* Preview Panel */}
        <motion.div
          className="hidden lg:block lg:col-span-5"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="sticky top-24">
            <FlowPreviewCard flow={flow} />
          </div>
        </motion.div>
      </div>

      {/* Mobile Preview */}
      <motion.div
        className="mt-5 lg:hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <FlowPreviewCard flow={flow} title="LIVE PREVIEW" />
      </motion.div>

      {/* Mobile Deploy Button */}
      <motion.div
        className="mt-5 lg:hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Button className="w-full" onClick={handleReview}>
          Review & Deploy
        </Button>
      </motion.div>
    </div>
  );
}

function ReviewScreen({ 
  flow, 
  onBack, 
  onDeploy, 
  canDeploy, 
  contractConfigured,
  walletConnected, 
  wrongNetwork,
  isSending
}: { 
  flow: Partial<Flow>; 
  onBack: () => void; 
  onDeploy: () => void;
  canDeploy: boolean;
  contractConfigured: boolean;
  walletConnected: boolean;
  wrongNetwork: boolean;
  isSending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <Card variant="primary" className="border-success">
        <CardBody className="pt-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-success/10 mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-success">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-success">
              {contractConfigured ? "Ready for deployment" : "Flow review"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {contractConfigured
                ? "Your workflow is valid. Connect wallet and deploy to Arc mainnet."
                : "Your workflow is valid. Deployment is disabled in this configuration."}
            </p>
          </div>

          <div className="space-y-6">
        <div className="p-4 border border-border bg-background">
          <div className="flex items-center gap-2 text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground mb-2">
            Trigger
          </div>
          <div className="font-mono text-foreground">Payment received</div>
        </div>

        <div className="p-4 border border-border bg-background">
          <div className="flex items-center gap-2 text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground mb-2">
            Condition
          </div>
          <div className="font-mono text-foreground">≥ {flow.condition?.amount || "—"} USDC</div>
        </div>

        <div className="p-4 border border-border bg-background">
          <div className="flex items-center gap-2 text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground mb-2">
            Actions
          </div>
          <div className="space-y-3">
            {flow.actions?.map((action, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full max-w-xs">
                  <div className="flex size-6 items-center justify-center rounded-md border border-border bg-muted">
                    <span className="text-xs font-semibold text-foreground">{action.percentage}%</span>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground truncate max-w-[240px]">
                    {action.recipient && action.recipient !== "0x" ? formatAddress(action.recipient) : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

          <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="font-semibold">Deploying sends four separate transactions</span>
            </div>
            <ol className="ml-6 mt-1 list-decimal space-y-0.5">
              {DEPLOYMENT_DISCLOSURE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-2">
              Each transaction may require a separate wallet confirmation and may incur gas costs.
              The sequence is not atomic: an earlier transaction can succeed even if a later one fails.
            </p>
            <p className="mt-2 font-medium text-foreground">
              {EXECUTION_AMOUNT_DISCLOSURE}
            </p>
          </div>

          {!contractConfigured && (
            <div className="rounded-lg border border-info bg-info/10 p-4 text-xs text-info">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={12} cy={12} r={10} />
                  <line x1={12} y1={16} x2={12} y2={12} />
                  <line x1={12} y1={8} x2={12.01} y2={8} />
                </svg>
                <span className="font-semibold">Public review mode</span>
              </div>
              <p className="ml-6">
                Flow deployment is disabled because no production contract is configured.
                You can explore the flow builder, but no flow will be submitted on-chain.
              </p>
            </div>
          )}

          {!walletConnected && (
            <div className="rounded-lg border border-warning bg-warning/10 p-4 text-xs text-warning">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1={12} y1={9} x2={12} y2={13} />
                  <line x1={12} y1={17} x2={12.01} y2={17} />
                </svg>
                <span className="font-semibold">Wallet not connected</span>
              </div>
              <p className="ml-6">Connect your wallet to deploy this flow to Arc mainnet.</p>
            </div>
          )}

          {wrongNetwork && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-xs text-destructive">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={12} cy={12} r={10} />
                  <line x1={15} y1={9} x2={9} y2={15} />
                  <line x1={9} y1={9} x2={15} y2={15} />
                </svg>
                <span className="font-semibold">Wrong network</span>
              </div>
              <p className="ml-6">Switch to Arc mainnet (chain ID 5042) in your wallet.</p>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center gap-4">
            <Button variant="outline" onClick={onBack} className="sm:flex-none">
              Back to edit
            </Button>
            <Button
              onClick={onDeploy}
              disabled={!canDeploy || isSending}
              className="bg-success text-success-foreground hover:bg-success/90"
              title={contractConfigured ? undefined : "No production contract configured — deployment is disabled."}
            >
              {isSending ? "Deploying…" : contractConfigured ? "Deploy to Arc mainnet" : "Deployment unavailable"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function DeploymentScreen({ 
  deployment, 
  network,
  onBack,
  onAcknowledgeUnknown
}: { 
  deployment: DeploymentState; 
  network: ReturnType<typeof getActiveArcNetwork>;
  onBack: () => void;
  onAcknowledgeUnknown: () => void;
}) { 
  const phases = [
    { key: "create", label: "CREATE FLOW", description: "Recording the flow on-chain..." },
    { key: "activate", label: "ACTIVATE FLOW", description: "Activating flow for execution..." },
    { key: "approve", label: "APPROVE USDC", description: "Approving USDC spend..." },
    { key: "execute", label: "EXECUTE SPLIT", description: "Executing payment split..." },
  ];

  const contractAddress = resolveArcFlowContractAddress(network);

  // Phase 48.1 — partial completion is derived from the retained evidence:
  // a step is complete iff its confirmed tx hash exists, and the failing step
  // is marked explicitly (confirmed revert vs unknown outcome).
  const stepHash: Record<string, string | undefined> = {
    create: deployment.createTxHash,
    activate: deployment.activateTxHash,
    approve: deployment.approveTxHash,
    execute: deployment.executeTxHash,
  };
  const completedPhaseLabels = phases.filter((p) => !!stepHash[p.key]).map((p) => p.label);
  const failedPhaseLabel = phases.find((p) => p.key === deployment.failedPhase)?.label;
  const isComplete = deployment.phase === "complete";
  const isError = deployment.phase === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <Card variant={isError ? "primary" : "default"} className={isError ? (deployment.outcomeUnknown ? "border-warning" : "border-destructive") : isComplete ? "border-success" : "border-accent"}>
        <CardBody className="pt-6">
          {/* Progress Steps */}
          <div className="mb-6">
            {phases.map((phase, index) => {
              const hash = stepHash[phase.key];
              const isCompleted = !!hash;
              const isFailedStep = deployment.failedPhase === phase.key;
              const isUnknownStep = isFailedStep && !!deployment.outcomeUnknown;
              const isFailedConfirmed = isFailedStep && !deployment.outcomeUnknown;
              const isCurrent = deployment.phase === phase.key && !isCompleted;
              return (
                <div key={phase.key} className="flex items-center gap-3 mb-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold border transition-all ${
                    isCompleted ? "bg-success border-success text-success-foreground" :
                    isUnknownStep ? "bg-warning border-warning text-warning-foreground" :
                    isFailedConfirmed ? "bg-destructive border-destructive text-destructive-foreground" :
                    isCurrent ? "bg-accent border-accent text-accent-foreground animate-pulse" :
                    "bg-muted border-border text-muted-foreground"
                  }`}>
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isUnknownStep ? (
                      <span className="text-xs font-bold">?</span>
                    ) : isFailedConfirmed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-semibold ${isCompleted || isCurrent || isFailedStep ? "text-foreground" : "text-muted-foreground"}`}>
                      {phase.label}
                    </div>
                    <div className="text-xs text-muted-foreground">{phase.description}</div>
                  </div>
                  {isUnknownStep && (
                    <span className="text-xs font-semibold text-warning">Outcome unknown</span>
                  )}
                  {isFailedConfirmed && (
                    <span className="text-xs font-semibold text-destructive">Failed</span>
                  )}
                  {hash && (
                    <a 
                      href={`${network.explorerUrl}/tx/${hash}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-accent hover:underline"
                    >
                      View tx
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {isError && deployment.outcomeUnknown && (
            <div role="alert" className="rounded-lg border border-warning bg-warning/10 p-4 text-sm text-warning">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1={12} y1={9} x2={12} y2={13} />
                  <line x1={12} y1={17} x2={12.01} y2={17} />
                </svg>
                <span className="font-semibold">Confirmation unknown</span>
              </div>
              <p className="ml-6">
                The transaction submitted during {failedPhaseLabel ?? "this step"} is unresolved.{" "}
                {UNKNOWN_OUTCOME_DISCLOSURE}
              </p>
              {deployment.uncertainTxHash && (
                <p className="ml-6 mt-2">
                  Submitted tx:{" "}
                  <a
                    href={`${network.explorerUrl}/tx/${deployment.uncertainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline"
                  >
                    {deployment.uncertainTxHash.slice(0, 10)}...
                  </a>
                </p>
              )}
            </div>
          )}

          {isError && !deployment.outcomeUnknown && (
            <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={12} cy={12} r={10} />
                  <line x1={15} y1={9} x2={9} y2={15} />
                  <line x1={9} y1={9} x2={15} y2={15} />
                </svg>
                <span className="font-semibold">Deployment failed</span>
              </div>
              <p className="ml-6">{deployment.error}</p>
              {completedPhaseLabels.length > 0 && (
                <div className="ml-6 mt-3 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Partial completion:</span>{" "}
                  {deployment.flowId !== undefined && (
                    <>flow #{deployment.flowId.toString()} was created; </>
                  )}
                  {completedPhaseLabels.join(", ")} confirmed before the failure. Retrying starts a
                  new flow rather than resuming this one — check the tx links above first.
                </div>
              )}
            </div>
          )}

          {isComplete && (
            <div className="rounded-lg border border-success bg-success/10 p-4 text-sm text-success">
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="font-semibold">Deployment complete</span>
              </div>
              <div className="ml-6 space-y-1">
                <p>Flow ID: <span className="font-bold">#{deployment.flowId?.toString()}</span></p>
                <p>
                  Contract:{" "}
                  {contractAddress ? (
                    <a
                      href={`${network.explorerUrl}/address/${contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {contractAddress}
                    </a>
                  ) : (
                    <span className="font-mono">unavailable</span>
                  )}
                </p>
                <p>Execute tx: <a href={`${network.explorerUrl}/tx/${deployment.executeTxHash}`} target="_blank" rel="noopener noreferrer" className="underline">{deployment.executeTxHash?.slice(0, 10)}...</a></p>
              </div>
            </div>
          )}

          {deployment.phase !== "complete" && deployment.phase !== "error" && (
            <div className="mt-6 rounded-lg border border-border bg-card p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-sm">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                <span>Waiting for transaction confirmation…</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            {isError && deployment.outcomeUnknown ? (
              // Phase 48.1 — while an unknown outcome is unresolved, the only
              // exit is an explicit acknowledgment; "Back to edit" is withheld
              // so a blind restart of the same journey is impossible.
              <Button variant="outline" onClick={onAcknowledgeUnknown}>
                I understand — return to the builder
              </Button>
            ) : isComplete || isError ? (
              <Button variant="outline" onClick={onBack}>
                Back to edit
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}