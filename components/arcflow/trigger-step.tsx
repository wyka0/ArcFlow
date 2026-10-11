"use client";

import { Card, CardBody } from "@/components/card";
import { StepHeader } from "./step-indicator";

interface TriggerStepProps {
  active: boolean;
  completed: boolean;
}

export function TriggerStep({ active, completed }: TriggerStepProps) {
  const trigger = {
    type: "PAYMENT_RECEIVED" as const,
    label: "Payment Received",
    description: "Detect an incoming USDC payment on Arc.",
  };

  return (
    <Card variant="default" className="w-full">
      <CardBody>
        <StepHeader
          number={1}
          label="TRIGGER"
          description={trigger.description}
          active={active}
          completed={completed}
        />
        <div className="mt-6">
          <div
            className={`flex items-center gap-4 p-4 border-2 rounded-none transition-all duration-200 ${
              active ? "border-foreground bg-background" : "border-border bg-muted/50"
            }`}
            role="radiogroup"
            aria-label="Select trigger"
          >
            <div className="flex items-center gap-3 flex-1">
              <div
                className={`w-5 h-5 border-2 rounded-none flex items-center justify-center transition-all duration-200 ${
                  active ? "border-foreground bg-foreground" : "border-border bg-transparent"
                }`}
                aria-hidden="true"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="text-background">
                  <path d="M21 12.79A9 9 0 1 1 14.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="font-mono font-medium text-sm text-foreground">{trigger.label}</span>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">Detect an incoming USDC payment on Arc</p>
              </div>
              <span className="text-[10px] font-mono tracking-[0.1em] uppercase text-accent">ONLY TRIGGER</span>
            </div>
          </div>
        </div>
        {active && (
          <p className="mt-4 text-xs text-muted-foreground font-mono">
            Additional triggers (schedule, contract event, webhook) will be available in future phases.
          </p>
        )}
      </CardBody>
    </Card>
  );
}