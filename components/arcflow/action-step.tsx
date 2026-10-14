"use client";

import { useCallback, type ChangeEvent, type FocusEvent } from "react";
import { Card, CardBody } from "@/components/card";
import { StepHeader } from "./step-indicator";
import { Button } from "@/components/ui/button";
import type { FlowAction, Address } from "@/types/flow";
import { isValidAddress } from "@/types/flow";

interface ActionStepProps {
  actions: FlowAction[];
  onChange: (actions: FlowAction[]) => void;
  onBlur: () => void;
  active: boolean;
  completed: boolean;
  errors?: string[];
}

export function ActionStep({ actions, onChange, onBlur, active, completed, errors = [] }: ActionStepProps) {
  const totalPercentage = actions.reduce((sum, a) => sum + a.percentage, 0);
  const isValidTotal = totalPercentage === 100;
  const hasError = errors.length > 0;

  const handleRecipientChange = useCallback(
    (index: number, value: string) => {
      const newActions = [...actions];
      newActions[index] = { ...newActions[index], recipient: value as Address };
      onChange(newActions);
    },
    [actions, onChange]
  );

  const handlePercentageChange = useCallback(
    (index: number, e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow only digits
      const sanitized = value.replace(/[^0-9]/g, "");
      const num = sanitized ? Number(sanitized) : 0;
      const newActions = [...actions];
      newActions[index] = { ...newActions[index], percentage: num };
      onChange(newActions);
    },
    [actions, onChange]
  );

  const handlePercentageBlur = useCallback(
    (index: number, e: FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const num = Number(value);
      if (value && (isNaN(num) || num < 0)) {
        // Keep invalid for user to correct
      }
      onBlur();
    },
    [onBlur]
  );

  const handleAddAction = useCallback(() => {
    if (actions.length >= 5) return;
    const newActions = [
      ...actions,
      { type: "TRANSFER" as const, recipient: "0x" as Address, percentage: 0 },
    ];
    onChange(newActions);
  }, [actions, onChange]);

  const handleRemoveAction = useCallback(
    (index: number) => {
      if (actions.length <= 2) return;
      const newActions = actions.filter((_, i) => i !== index);
      // Redistribute percentage to first action
      if (newActions.length > 0) {
        const removedPercentage = actions[index].percentage;
        newActions[0] = { ...newActions[0], percentage: newActions[0].percentage + removedPercentage };
      }
      onChange(newActions);
    },
    [actions, onChange]
  );

  const recipientErrors = actions.map((action) => {
    if (!action.recipient || action.recipient === "0x") return "Address required";
    if (!isValidAddress(action.recipient)) return "Invalid EVM address";
    return "";
  });

  const percentageErrors = actions.map((action) => {
    if (typeof action.percentage !== "number" || action.percentage <= 0) return "Must be positive";
    return "";
  });

  return (
    <Card variant="default" className="w-full">
      <CardBody>
        <StepHeader
          number={3}
          label="ACTION"
          description="Split the payment between recipients by percentage."
          active={active}
          completed={completed}
        />
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground">Recipients</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddAction}
              disabled={actions.length >= 5 || !active}
            >
              + Add recipient
            </Button>
          </div>

          <div className="space-y-3" role="list" aria-label="Payment recipients">
            {actions.map((action, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-200 ${
                  active ? "border-border bg-card" : "border-border/50 bg-muted/50"
                }`}
                role="listitem"
              >
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground w-8 flex-shrink-0">
                  {index + 1}.
                </div>

                <div className="flex-1 min-w-0">
                  <label htmlFor={`action-recipient-${index}`} className="sr-only">
                    Recipient {index + 1} address
                  </label>
                  <input
                    id={`action-recipient-${index}`}
                    type="text"
                    value={action.recipient}
                    onChange={(e) => handleRecipientChange(index, e.target.value)}
                    onBlur={onBlur}
                    placeholder="0x..."
                    className={`w-full rounded-md border bg-card px-3 py-2 font-mono text-sm transition-colors ${
                      recipientErrors[index] ? "border-destructive focus:border-destructive" : "border-border focus:border-accent"
                    }`}
                    aria-invalid={!!recipientErrors[index]}
                    aria-describedby={recipientErrors[index] ? `action-recipient-${index}-error` : undefined}
                    disabled={!active}
                  />
                  {recipientErrors[index] && (
                    <p id={`action-recipient-${index}-error`} className="mt-1 text-xs text-destructive font-mono" role="alert">
                      {recipientErrors[index]}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 w-32 flex-shrink-0">
                  <label htmlFor={`action-percentage-${index}`} className="sr-only">
                    Recipient {index + 1} percentage
                  </label>
                  <input
                    id={`action-percentage-${index}`}
                    type="text"
                    inputMode="numeric"
                    value={action.percentage > 0 ? String(action.percentage) : ""}
                    onChange={(e) => handlePercentageChange(index, e)}
                    onBlur={(e) => handlePercentageBlur(index, e)}
                    placeholder="%"
                    className={`w-full rounded-md border bg-card px-3 py-2 text-center font-mono text-sm transition-colors ${
                      percentageErrors[index] ? "border-destructive focus:border-destructive" : "border-border focus:border-accent"
                    }`}
                    aria-invalid={!!percentageErrors[index]}
                    aria-describedby={percentageErrors[index] ? `action-percentage-${index}-error` : undefined}
                    disabled={!active}
                  />
                  <span className="text-sm font-mono text-muted-foreground">%</span>
                </div>

                {actions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAction(index)}
                    disabled={!active}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-40"
                    aria-label={`Remove recipient ${index + 1}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <line x1={18} y1={6} x2={6} y2={18} />
                      <line x1={6} y1={6} x2={18} y2={18} />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            className={`rounded-lg border p-3 text-sm transition-all duration-200 ${
              isValidTotal
                ? "border-success bg-success/10 text-success"
                : "border-warning bg-warning/10 text-warning"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span>{totalPercentage}%</span>
            </div>
            <div className="mt-1 text-xs">
              {actions
                .map((a) => `${a.percentage}%`)
                .join(" + ")} = {totalPercentage}%
              {isValidTotal ? " ✓" : " — Must equal 100%"}
            </div>
          </div>

          {hasError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-xs text-destructive" role="alert">
              {errors.join(", ")}
            </div>
          )}

          {active && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground font-mono">
                Each recipient must be a valid EVM address (0x...). Percentages must be positive integers summing to 100%.
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}