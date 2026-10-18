"use client";

import type { Flow } from "@/types/flow";
import { formatAddress } from "@/types/flow";

interface FlowPreviewProps {
  flow: Partial<Flow>;
}

function Connector() {
  return <div className="mx-auto h-4 w-px bg-border" aria-hidden="true" />;
}

export function FlowPreview({ flow }: FlowPreviewProps) {
  const { condition, actions } = flow;
  const totalPercentage = (actions ?? []).reduce((sum, action) => sum + action.percentage, 0);

  return (
    <div className="mx-auto w-full max-w-[260px]">
      {/* Trigger */}
      <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
            <path d="M21 12.79A9 9 0 1 1 14.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-foreground">Payment Received</span>
      </div>

      <Connector />

      {/* Condition */}
      <div className="text-center font-mono text-xs text-muted-foreground">
        {condition?.operator === "GTE" ? "≥" : condition?.operator} {condition?.amount || "—"} USDC
      </div>

      <Connector />

      {/* Action */}
      <div className="flex justify-center">
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
          Split Payment
        </span>
      </div>

      <Connector />

      {/* Recipients */}
      {actions?.length ? (
        <div className="space-y-1.5">
          {actions.map((action, index) => (
            <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] font-semibold text-foreground">
                {action.percentage}%
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {action.recipient && action.recipient !== "0x" ? formatAddress(action.recipient) : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center font-mono text-xs text-muted-foreground">No actions configured</p>
      )}

      {actions?.length ? (
        <p className={`mt-3 text-center font-mono text-[11px] ${totalPercentage === 100 ? "text-muted-foreground" : "text-warning"}`}>
          {actions.map((action) => `${action.percentage}%`).join(" + ")} = {totalPercentage}%
        </p>
      ) : null}
    </div>
  );
}

interface FlowPreviewCardProps {
  flow: Partial<Flow>;
  title?: string;
}

export function FlowPreviewCard({ flow, title = "Flow preview" }: FlowPreviewCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <FlowPreview flow={flow} />
    </div>
  );
}
