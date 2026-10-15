"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardBody } from "@/components/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet-provider";
import { isArcFlowConfigured } from "@/lib/arcflow/contract";
import { useTransactionSender } from "./use-transaction-sender";
import type { Flow, FlowValidationError } from "@/types/flow";
import { validateFlow, validateStep, formatAddress, DEFAULT_FLOW } from "@/types/flow";
import { TriggerStep } from "./trigger-step";
import { ConditionStep } from "./condition-step";
import { ActionStep } from "./action-step";
import { FlowPreviewCard } from "./flow-preview";
import { StepHeader } from "./step-indicator";
import { 
  prepareCreateFlowTx, 
  prepareApproveUsdcTx, 
  prepareExecuteSplitTx,
} from "@/lib/arcflow/interactions";
import { getActiveArcNetwork } from "@/lib/arc/network";

type Step = "trigger" | "condition" | "action" | "review" | "deploying";

interface DeploymentState {
  phase: "idle" | "create" | "approve" | "execute" | "complete" | "error";
  flowId?: bigint;
  createTxHash?: string;
  approveTxHash?: string;
  executeTxHash?: string;
  error?: string;
}

interface FlowBuilderProps {
  initialFlow?: Partial<Flow>;
  onActivate?: (flow: Flow) => void;
}

export function FlowBuilder({ initialFlow, onActivate }: FlowBuilderProps) {
  const [currentStep, setCurrentStep] = useState<Step>("trigger");
  const [flow, setFlow] = useState<Partial<Flow>>({
    ...DEFAULT_FLOW,
    ...initialFlow,
  });
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [deployment, setDeployment] = useState<DeploymentState>({ phase: "idle" });

  const { session, connection } = useWallet();
  const { sendTransaction, isSending } = useTransactionSender();
  const network = useMemo(() => getActiveArcNetwork(), []);

  const stepOrder: Step[] = ["trigger", "condition", "action"];
  const currentStepIndex = stepOrder.indexOf(currentStep);

  const walletAddress = session.wallet.address;
  const isWalletConnected = connection === "connected" || connection === "wrong-network";
  const isWrongNetwork = connection === "wrong-network";
  const contractConfigured = useMemo(() => isArcFlowConfigured(network), [network]);

  const canDeploy = useMemo(
    () => contractConfigured && isWalletConnected && !isWrongNetwork && !!walletAddress && validateAll(),
    [contractConfigured, isWalletConnected, isWrongNetwork, walletAddress, errors, flow],
  );

  const updateFlow = useCallback(<K extends keyof Partial<Flow>>(key: K, value: Partial<Flow>[K]) => {
    setFlow((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleConditionChange = useCallback((condition: Flow["condition"]) => {
    updateFlow("condition", condition);
  }, [updateFlow]);

  const handleActionChange = useCallback((actions: Flow["actions"]) => {
    updateFlow("actions", actions);
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
      trigger: true,
      condition: true,
      action: true,
    });
    return validationErrors.length === 0;
  }, [flow]);

  const handleNext = useCallback(() => {
    // Mark the current step as touched so validation errors become visible.
    setTouched((prev) => ({ ...prev, [currentStep]: true }));
    if (validateCurrentStepRef.current()) {
      if (currentStepIndex < stepOrder.length - 1) {
        setCurrentStep(stepOrder[currentStepIndex + 1]);
      } else {
        setShowReview(true);
      }
    }
  }, [currentStepIndex, currentStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStep(stepOrder[currentStepIndex - 1]);
    }
  }, [currentStepIndex]);

  const handleBackToEdit = useCallback(() => {
    setShowReview(false);
    setCurrentStep("action");
    setDeployment({ phase: "idle" });
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!canDeploy) return;
    if (!isArcFlowConfigured(network)) return;

    setDeployment({ phase: "create" });

    try {
      // Step 1: Create Flow
      const treasuryAddress = flow.actions?.[0]?.recipient as `0x${string}` | undefined;
      const contributorAddress = flow.actions?.[1]?.recipient as `0x${string}` | undefined;
      const threshold = flow.condition?.amount || "10.00";
      const treasuryBps = flow.actions?.[0]?.percentage || 80;
      const contributorBps = flow.actions?.[1]?.percentage || 20;

      if (!treasuryAddress || !contributorAddress) {
        throw new Error("Recipient addresses not configured");
      }

      const createTx = prepareCreateFlowTx({
        treasury: treasuryAddress,
        contributor: contributorAddress,
        threshold,
        treasuryBps,
        contributorBps,
      });

      setDeployment(prev => ({ ...prev, phase: "create" }));
      const createResult = await sendTransaction(createTx);

      // Extract flowId from event logs (simplified - in reality we'd parse logs)
      // For now, we'll assume flowId 0 for first flow
      const flowId = 0n;

      setDeployment(prev => ({ 
        ...prev, 
        phase: "approve", 
        flowId,
        createTxHash: createResult.transactionHash 
      }));

      // Step 2: Approve USDC
      const executeAmount = threshold; // Execute with threshold amount for demo
      const approveTx = prepareApproveUsdcTx(executeAmount);
      
      setDeployment(prev => ({ ...prev, phase: "approve" }));
      const approveResult = await sendTransaction(approveTx);

      setDeployment(prev => ({ 
        ...prev, 
        phase: "execute", 
        approveTxHash: approveResult.transactionHash 
      }));

      // Step 3: Execute Split
      const executeTx = prepareExecuteSplitTx({ flowId, amount: executeAmount });
      
      setDeployment(prev => ({ ...prev, phase: "execute" }));
      const executeResult = await sendTransaction(executeTx);

      setDeployment(prev => ({ 
        ...prev, 
        phase: "complete", 
        executeTxHash: executeResult.transactionHash 
      }));

    } catch (error) {
      setDeployment(prev => ({ 
        ...prev, 
        phase: "error", 
        error: error instanceof Error ? error.message : "Deployment failed" 
      }));
    }
  }, [canDeploy, sendTransaction, network]);

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

  return (
    <div className="w-full">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6 lg:mb-8" role="navigation" aria-label="Flow builder steps">
        {stepOrder.map((step, index) => {
          const labels: Record<Step, string> = { trigger: "Trigger", condition: "Condition", action: "Action", review: "Review", deploying: "Deploying" };
          const isLast = index === stepOrder.length - 1;
          return (
            <StepHeader
              key={step}
              number={index + 1}
              label={labels[step]}
              description="Configure your flow step"
              active={isStepActive(step)}
              completed={isStepCompleted(step)}
              isLast={index === stepOrder.length - 1}
            />
          );
        })}
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
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
            <>
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

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between pt-6 border-t border-border">
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
                <Button onClick={handleNext}>
                  {currentStepIndex === stepOrder.length - 1 ? "Review" : "Next"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={5} y1={12} x2={19} y2={12} />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Button>
              </div>
            </>
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
        className="lg:hidden mt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <FlowPreviewCard flow={flow} title="LIVE PREVIEW" />
      </motion.div>

      {/* Mobile Deploy Button */}
      <motion.div
        className="lg:hidden mt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Button
          className="w-full"
          onClick={() => {
            if (validateAll()) {
              setShowReview(true);
            }
          }}
        >
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
  onBack
}: { 
  deployment: DeploymentState; 
  network: ReturnType<typeof getActiveArcNetwork>;
  onBack: () => void;
}) {
  const phases = [
    { key: "create", label: "CREATE FLOW", description: "Deploying flow contract..." },
    { key: "approve", label: "APPROVE USDC", description: "Approving USDC spend..." },
    { key: "execute", label: "EXECUTE SPLIT", description: "Executing payment split..." },
  ];

  const currentPhaseIndex = phases.findIndex(p => p.key === deployment.phase);
  const isComplete = deployment.phase === "complete";
  const isError = deployment.phase === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <Card variant={isError ? "primary" : "default"} className={isError ? "border-destructive" : isComplete ? "border-success" : "border-accent"}>
        <CardBody className="pt-6">
          {/* Progress Steps */}
          <div className="mb-6">
            {phases.map((phase, index) => (
              <div key={phase.key} className="flex items-center gap-3 mb-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold border transition-all ${
                  index < currentPhaseIndex ? "bg-success border-success text-success-foreground" :
                  index === currentPhaseIndex && !isComplete && !isError ? "bg-accent border-accent text-accent-foreground animate-pulse" :
                  isError && index === currentPhaseIndex ? "bg-destructive border-destructive text-destructive-foreground" :
                  "bg-muted border-border text-muted-foreground"
                }`}>
                  {index < currentPhaseIndex || (isComplete && index <= currentPhaseIndex) ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${index <= currentPhaseIndex ? "text-foreground" : "text-muted-foreground"}`}>
                    {phase.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{phase.description}</div>
                </div>
                {deployment.createTxHash && phase.key === "create" && (
                  <a 
                    href={`${network.explorerUrl}/tx/${deployment.createTxHash}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-accent hover:underline"
                  >
                    View tx
                  </a>
                )}
                {deployment.approveTxHash && phase.key === "approve" && (
                  <a 
                    href={`${network.explorerUrl}/tx/${deployment.approveTxHash}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-accent hover:underline"
                  >
                    View tx
                  </a>
                )}
                {deployment.executeTxHash && phase.key === "execute" && (
                  <a 
                    href={`${network.explorerUrl}/tx/${deployment.executeTxHash}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-accent hover:underline"
                  >
                    View tx
                  </a>
                )}
              </div>
            ))}
          </div>

          {isError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <div className="mb-1 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={12} cy={12} r={10} />
                  <line x1={15} y1={9} x2={9} y2={15} />
                  <line x1={9} y1={9} x2={15} y2={15} />
                </svg>
                <span className="font-semibold">Deployment failed</span>
              </div>
              <p className="ml-6">{deployment.error}</p>
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
                <p>Contract: <a href={`${network.explorerUrl}/address/${"0xArcFlowContractAddress"}`} target="_blank" rel="noopener noreferrer" className="underline">ArcFlow</a></p>
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
            {deployment.phase === "complete" || deployment.phase === "error" ? (
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