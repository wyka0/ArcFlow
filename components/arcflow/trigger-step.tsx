"use client";

interface TriggerStepProps {
  active: boolean;
  completed: boolean;
}

export function TriggerStep({ active }: TriggerStepProps) {
  const trigger = {
    type: "PAYMENT_RECEIVED" as const,
    label: "Payment Received",
    description: "Records the payment event this workflow is configured for.",
  };

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center gap-4 rounded-lg border p-4 transition-all duration-200 ${
          active ? "border-accent/40 bg-accent/5" : "border-border bg-muted/50"
        }`}
        role="radiogroup"
        aria-label="Select trigger"
      >
        <div className="flex flex-1 items-center gap-3">
          <div
            className={`flex size-5 items-center justify-center rounded-full border transition-all duration-200 ${
              active ? "border-primary/60 bg-primary/10" : "border-border bg-transparent"
            }`}
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="text-primary/70">
              <path d="M21 12.79A9 9 0 1 1 14.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium text-foreground">{trigger.label}</span>
            <p className="mt-0.5 text-xs text-muted-foreground">Configured for incoming USDC payments on Arc</p>
          </div>
          <span className="text-xs text-accent">Only trigger</span>
        </div>
      </div>
      {active && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Currently supports the Payment Received trigger as configuration. No background
          monitoring yet — each split is started manually from the Flow Builder.
        </p>
      )}
    </div>
  );
}
