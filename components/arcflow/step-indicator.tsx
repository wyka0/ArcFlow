"use client";

interface StepNumberProps {
  number: number;
  active?: boolean;
  completed?: boolean;
}

export function StepNumber({ number, active = false, completed = false }: StepNumberProps) {
  return (
    <div
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 sm:size-8 ${
        active
          ? "bg-primary text-primary-foreground"
          : completed
          ? "bg-success text-success-foreground"
          : "border border-border bg-muted text-muted-foreground"
      }`}
      aria-hidden="true"
    >
      {completed && !active ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        number
      )}
    </div>
  );
}

interface StepConnectorProps {
  active?: boolean;
  completed?: boolean;
}

export function StepConnector({ active = false, completed = false }: StepConnectorProps) {
  return (
    <div
      className={`h-px min-w-3 flex-1 transition-colors duration-200 ${
        completed ? "bg-success" : active ? "bg-primary" : "bg-border"
      }`}
      aria-hidden="true"
    />
  );
}

interface StepHeaderProps {
  number: number;
  label: string;
  active?: boolean;
  completed?: boolean;
}

/*
 * Step navigation item — a compact circle + label unit designed to sit inline
 * with StepConnector inside a single stepper strip. The per-step description
 * lives in the editor panel header, so the navigation stays one consistent row.
 */
export function StepHeader({ number, label, active = false, completed = false }: StepHeaderProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      aria-current={active ? "step" : undefined}
    >
      <StepNumber number={number} active={active} completed={completed} />
      <span
        className={`truncate text-xs font-medium transition-colors sm:text-sm ${
          active ? "text-foreground" : completed ? "text-success" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
