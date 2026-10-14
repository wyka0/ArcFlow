"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardBody } from "@/components/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet-provider";
import { useTransactionSender } from "./use-transaction-sender";
import type { Flow, FlowValidationError } from "@/types/flow";
import { validateFlow, DEFAULT_FLOW } from "@/types/flow";
import { TriggerStep } from "./trigger-step";
import { ConditionStep } from "./condition-step";
import { ActionStep } from "./action-step";
import { FlowPreviewCard } from "./flow-preview";
import { StepNumber } from "./step-indicator";
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

  const canDeploy = useMemo(
    () => isWalletConnected && !isWrongNetwork && !!walletAddress && validateAll(),
    [isWalletConnected, isWrongNetwork, walletAddress, errors, flow],
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
    const validationErrors = validateFlow(flow);
    setErrors(validationErrors);
    return validationErrors.length === 0;
  }, [flow]);

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
    if (validateCurrentStepRef.current()) {
      if (currentStepIndex < stepOrder.length - 1) {
        setCurrentStep(stepOrder[currentStepIndex + 1]);
      } else {
        setShowReview(true);
      }
    }
  }, [currentStepIndex]);

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
  }, [canDeploy, sendTransaction]);

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
          return (
            <div key={step} className="flex items-center flex-1">
              <StepNumber
                number={index + 1}
                active={isStepActive(step)}
                completed={isStepCompleted(step)}
              />
              <span
                className={`hidden sm:block text-center text-xs font-medium transition-colors ${
                  isStepCompleted(step) ? "text-success" : isStepActive(step) ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {labels[step]}
              </span>
              {index < stepOrder.length - 1 && (
                <div
                  className={`hidden lg:block h-px flex-1 transition-colors ${
                    isStepCompleted(step) ? "bg-success" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
              )}
            </div>
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
  walletConnected, 
  wrongNetwork,
  isSending
}: { 
  flow: Partial<Flow>; 
  onBack: () => void; 
  onDeploy: () => void;
  canDeploy: boolean;
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
            <h2 className="text-xl font-semibold text-success">Ready for deployment</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your workflow is valid. Connect wallet and deploy to Arc mainnet.</p>
          </div>

          <div className="space-y-4 text-sm">
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
              <div className="space-y-1 font-mono">
                {flow.actions?.map((action, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-foreground">{action.percentage}%</span>
                    <span className="text-muted-foreground">{action.recipient && action.recipient !== "0x" ? action.recipient.slice(0, 10) + "..." : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

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

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={onBack} className="sm:flex-none">
              Back to edit
            </Button>
            <Button
              onClick={onDeploy}
              disabled={!canDeploy || isSending}
              className="bg-success text-success-foreground hover:bg-success/90 sm:flex-none"
            >
              {isSending ? "Deploying…" : "Deploy to Arc mainnet"}
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