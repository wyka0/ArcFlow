"use client";

import { useMemo } from "react";

interface PipelineStep {
  id: string;
  label: string;
  subtitle: string;
  status: "upcoming" | "active" | "completed" | "failed";
}

const PIPELINE_STEPS: Omit<PipelineStep, "status">[] = [
  { id: "agent", label: "AGENT", subtitle: "Requests service" },
  { id: "agentpay", label: "AGENTPAY", subtitle: "Validates request" },
  { id: "policy", label: "POLICY", subtitle: "Checks limits" },
  { id: "payment", label: "PAYMENT", subtitle: "USDC transfer" },
  { id: "arc", label: "ARC", subtitle: "Settlement" },
  { id: "verify", label: "VERIFY", subtitle: "Trusted ledger" },
  { id: "service", label: "SERVICE", subtitle: "Executes task" },
  { id: "result", label: "RESULT", subtitle: "Data returned" },
];

const STATUS_COLORS = {
  upcoming: "border-border text-muted-foreground",
  active: "border-accent text-accent animate-node-activate",
  completed: "border-success text-success",
  failed: "border-destructive text-destructive",
} as const;

const STATUS_DOT_COLORS = {
  upcoming: "bg-border",
  active: "bg-accent animate-pipeline-pulse",
  completed: "bg-success",
  failed: "bg-destructive",
} as const;

interface PipelineVisualizationProps {
  currentPhase: string;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}

export function PipelineVisualization({
  currentPhase,
  className = "",
  showLabels = true,
  compact = false,
}: PipelineVisualizationProps) {
  const steps = useMemo(() => {
    const phaseOrder = [
      "idle",
      "requesting_intent",
      "intent_approved",
      "awaiting_signature",
      "submitted",
      "verification_pending",
      "confirmed",
      "fulfillment_pending",
      "fulfilled",
      "failed",
    ];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    
    return PIPELINE_STEPS.map((step, index) => {
      let status: PipelineStep["status"] = "upcoming";
      if (index < currentIndex) status = "completed";
      else if (index === currentIndex) status = "active";
      else if (currentPhase === "failed" && index === currentIndex - 1) status = "failed";
      return { ...step, status };
    });
  }, [currentPhase]);

  if (compact) {
    return (
      <div className={`flex items-center gap-1 overflow-x-auto pb-2 ${className}`}>
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-1.5 flex-shrink-0 group">
            <div className="relative flex flex-col items-center">
              <span className={`status-dot ${STATUS_DOT_COLORS[step.status]} size-2.5 z-10 transition-all duration-300 group-hover:size-3`} />
              {index < steps.length - 1 && (
                <div className="absolute top-1/2 left-full h-px w-8 -translate-y-1/2 bg-gradient-to-r from-border to-transparent" />
              )}
            </div>
            {showLabels && (
              <span className={`text-[9px] tracking-[0.1em] font-mono uppercase whitespace-nowrap ${STATUS_COLORS[step.status]}`}>
                {step.label}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex flex-col items-center gap-2 w-full sm:w-auto">
          <div className="relative flex flex-col items-center">
            <span className={`status-dot ${STATUS_DOT_COLORS[step.status]} size-3.5 z-10 transition-all duration-300`} />
            {index < steps.length - 1 && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-px h-10 bg-gradient-to-b from-border/50 to-transparent" />
            )}
          </div>
          {showLabels && (
            <div className="text-center">
              <span className={`text-[10px] tracking-[0.15em] font-mono uppercase font-bold ${STATUS_COLORS[step.status]}`}>
                {step.label}
              </span>
              <span className={`block text-[9px] tracking-[0.1em] font-mono ${STATUS_COLORS[step.status]}`}>
                {step.subtitle}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* Horizontal pipeline for landing page */
interface HorizontalPipelineProps {
  currentPhase: string;
  className?: string;
}

export function HorizontalPipeline({ currentPhase, className = "" }: HorizontalPipelineProps) {
  const steps = useMemo(() => {
    const phaseOrder = [
      "idle",
      "requesting_intent",
      "intent_approved",
      "awaiting_signature",
      "submitted",
      "verification_pending",
      "confirmed",
      "fulfillment_pending",
      "fulfilled",
      "failed",
    ];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    
    return PIPELINE_STEPS.map((step, index) => {
      let status: PipelineStep["status"] = "upcoming";
      if (index < currentIndex) status = "completed";
      else if (index === currentIndex) status = "active";
      else if (currentPhase === "failed" && index === currentIndex - 1) status = "failed";
      return { ...step, status };
    });
  }, [currentPhase]);

  return (
    <div className={`flex flex-col items-center gap-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center gap-2 relative">
            <div className="relative flex flex-col items-center">
              <span className={`status-dot ${STATUS_DOT_COLORS[step.status]} size-4 z-10 transition-all duration-300`} />
              {index < steps.length - 1 && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 h-px w-16 bg-gradient-to-r from-border/50 to-transparent" />
              )}
            </div>
            <div className="text-center w-28">
              <span className={`text-xl font-bold font-mono tracking-[0.1em] leading-none ${STATUS_COLORS[step.status]}`}>
                {step.label}
              </span>
              <span className={`block text-[9px] tracking-[0.1em] font-mono uppercase leading-relaxed ${STATUS_COLORS[step.status]}`}>
                {step.subtitle}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}