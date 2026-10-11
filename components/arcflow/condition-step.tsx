"use client";

import { useCallback, useRef, type ChangeEvent, type FocusEvent } from "react";
import { Card, CardBody } from "@/components/card";
import { StepHeader } from "./step-indicator";
import type { FlowCondition } from "@/types/flow";

interface ConditionStepProps {
  condition: FlowCondition;
  onChange: (condition: FlowCondition) => void;
  onBlur: () => void;
  active: boolean;
  completed: boolean;
  errors?: string[];
}

const OPERATORS = [
  { value: "GTE" as const, label: "≥", description: "Greater than or equal" },
] as const;

export function ConditionStep({ condition, onChange, onBlur, active, completed, errors = [] }: ConditionStepProps) {
  const amountInputRef = useRef<HTMLInputElement>(null);
  const hasError = errors.length > 0;

  const handleAmountChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow only digits, decimal point, and backspace
      const sanitized = value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
      onChange({ ...condition, amount: sanitized });
    },
    [condition, onChange]
  );

  const handleAmountBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const num = Number(value);
      if (value && (isNaN(num) || num <= 0)) {
        // Keep the invalid value for user to correct, validation will catch it
      }
      onBlur();
    },
    [onBlur]
  );

  const handleOperatorChange = useCallback(
    (operator: FlowCondition["operator"]) => {
      onChange({ ...condition, operator });
    },
    [condition, onChange]
  );

  return (
    <Card variant="default" className="w-full">
      <CardBody>
        <StepHeader
          number={2}
          label="CONDITION"
          description="Set the minimum payment amount to trigger this flow."
          active={active}
          completed={completed}
        />
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="condition-operator" className="block text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground mb-2">
              Operator
            </label>
            <div className="flex items-center gap-3">
              {OPERATORS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => handleOperatorChange(op.value)}
                  className={`flex items-center gap-2 px-4 py-2.5 border-2 rounded-none font-mono text-sm transition-all duration-200 ${
                    condition.operator === op.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:border-foreground"
                  }`}
                  role="radio"
                  aria-checked={condition.operator === op.value}
                  aria-label={op.description}
                >
                  <span className="text-xl font-bold">{op.label}</span>
                  <span className="text-xs tracking-[0.1em] uppercase">{op.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="condition-amount" className="block text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground mb-2">
              Amount (USDC)
            </label>
            <div className="relative flex items-center gap-3">
              <input
                ref={amountInputRef}
                id="condition-amount"
                type="text"
                inputMode="decimal"
                value={condition.amount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                placeholder="10.00"
                className={`flex-1 px-4 py-3 border-2 rounded-none font-mono text-lg bg-background transition-all duration-200 ${
                  hasError ? "border-destructive focus:border-destructive" : "border-border focus:border-foreground"
                }`}
                aria-invalid={hasError}
                aria-describedby={hasError ? "condition-amount-error" : undefined}
                disabled={!active}
              />
              <span className="text-lg font-mono text-muted-foreground px-2">USDC</span>
            </div>
            {hasError && (
              <p id="condition-amount-error" className="mt-1.5 text-xs text-destructive font-mono" role="alert">
                {errors.join(", ")}
              </p>
            )}
            {!hasError && active && (
              <p className="mt-1.5 text-xs text-muted-foreground font-mono">
                Minimum payment amount to trigger the flow. Supports up to 6 decimal places.
              </p>
            )}
          </div>

          {active && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground font-mono">
                Additional operators (LTE, EQ, GT, LT) and compound conditions will be available in future phases.
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}