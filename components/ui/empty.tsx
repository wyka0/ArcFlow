import type { ReactNode } from "react";

/*
 * Empty state — compound component modeled on the reference kit's ui/empty.tsx.
 * Renders a centered icon, title, description, and optional action.
 */

export function Empty({
  children,
  className = "",
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  /** Reduced vertical padding for a compact, content-proportional panel. */
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 text-center ${compact ? "py-8 sm:py-10" : "py-10 sm:py-14"} ${className}`}>
      {children}
    </div>
  );
}

export function EmptyIcon({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-6">
      {children}
    </div>
  );
}

export function EmptyTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

export function EmptyDescription({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p>
  );
}

export function EmptyAction({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-4 ${className}`}>{children}</div>;
}
