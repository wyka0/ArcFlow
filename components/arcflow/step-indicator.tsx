"use client";

interface StepNumberProps {
  number: number;
  active?: boolean;
  completed?: boolean;
}

export function StepNumber({ number, active = false, completed = false }: StepNumberProps) {
  return (
    <div
      className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm transition-all duration-200 ${
        completed
          ? "bg-success text-success-foreground"
          : active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground border border-border"
      }`}
      aria-hidden="true"
    >
      {completed ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
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
      className={`relative flex-1 h-px transition-colors duration-200 ${
        completed ? "bg-success" : active ? "bg-foreground" : "bg-border"
      }`}
      aria-hidden="true"
    />
  );
}

interface StepHeaderProps {
  number: number;
  label: string;
  description: string;
  active?: boolean;
  completed?: boolean;
}

export function StepHeader({ number, label, description, active = false, completed = false }: StepHeaderProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        <StepNumber number={number} active={active} completed={completed} />
        <StepConnector active={active} completed={completed} />
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <h3 className={`text-sm font-semibold transition-colors ${
          completed ? "text-success" : active ? "text-foreground" : "text-muted-foreground"
        }`}>
          {label}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}