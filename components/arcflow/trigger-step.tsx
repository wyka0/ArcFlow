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
            className={`flex items-center gap-4 p-4 border rounded-lg transition-all duration-200 ${
              active ? "border-accent/40 bg-accent/5" : "border-border bg-muted/50"
            }`}
            role="radiogroup"
            aria-label="Select trigger"
          >
            <div className="flex items-center gap-3 flex-1">
              <div
                className={`w-5 h-5 border rounded-full flex items-center justify-center transition-all duration-200 ${
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
                <p className="mt-0.5 text-xs text-muted-foreground">Detect an incoming USDC payment on Arc</p>
              </div>
              <span className="text-xs text-accent">Only trigger</span>
            </div>
          </div>
        </div>
        {active && (
          <p className="mt-4 text-xs text-muted-foreground">
            Currently supports Payment Received triggers.
          </p>
        )}
      </CardBody>
    </Card>
  );
}