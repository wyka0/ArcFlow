"use client";

import type { Flow } from "@/types/flow";
import { formatAddress } from "@/types/flow";

interface FlowPreviewProps {
  flow: Partial<Flow>;
  compact?: boolean;
}

export function FlowPreview({ flow, compact = false }: FlowPreviewProps) {
  const { condition, actions } = flow;

  const renderTrigger = () => (
    <div className="flex items-center gap-2 text-center">
      <div className="flex items-center justify-center w-8 h-8 border-2 border-foreground rounded-none bg-background">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
          <path d="M21 12.79A9 9 0 1 1 14.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>
      <span className="font-mono font-medium text-sm">Payment Received</span>
    </div>
  );

  const renderCondition = () => (
    <div className="flex items-center gap-2 text-center text-muted-foreground">
      <span className="font-mono font-medium text-sm">
        {condition?.operator === "GTE" ? "≥" : condition?.operator} {condition?.amount || "—"} USDC
      </span>
    </div>
  );

  const renderActions = () => {
    if (!actions?.length) return <span className="text-muted-foreground text-sm font-mono">No actions configured</span>;

    return (
      <div className="space-y-2">
        {actions.map((action, index) => (
          <div key={index} className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 border-2 border-border rounded-none flex items-center justify-center bg-background">
                <span className="font-mono font-bold text-sm text-foreground">{action.percentage}%</span>
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {action.recipient && action.recipient !== "0x" ? formatAddress(action.recipient) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center gap-1">
          {renderTrigger()}
          <div className="w-px h-4 bg-border" />
          {renderCondition()}
          <div className="w-px h-4 bg-border" />
          <div className="text-center">
            <span className="font-mono font-bold text-xs text-accent">Split Payment</span>
          </div>
          <div className="w-px h-4 bg-border" />
          {renderActions()}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trigger */}
      <div className="flex flex-col items-center gap-2">
        {renderTrigger()}
        <div className="w-px h-6 bg-border" />
      </div>

      {/* Condition */}
      <div className="flex flex-col items-center gap-2">
        {renderCondition()}
        <div className="w-px h-6 bg-border" />
      </div>

      {/* Action */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-center">
          <span className="font-mono font-bold text-sm text-accent uppercase tracking-[0.1em]">Split Payment</span>
        </div>
        <div className="w-px h-6 bg-border" />
      </div>

      {/* Recipients */}
      <div className="flex flex-col items-center gap-3">
        {renderActions()}
      </div>
    </div>
  );
}

interface FlowPreviewCardProps {
  flow: Partial<Flow>;
  title?: string;
}

export function FlowPreviewCard({ flow, title = "FLOW PREVIEW" }: FlowPreviewCardProps) {
  return (
    <div className="border-2 border-foreground bg-background p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h3 className="text-xs font-mono tracking-[0.2em] uppercase text-muted-foreground">{title}</h3>
      </div>
      <div className="flex flex-col items-center">
        <FlowPreview flow={flow} />
      </div>
    </div>
  );
}