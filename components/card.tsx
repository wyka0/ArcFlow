import type { ReactNode } from "react";

/*
 * Shared card primitives — restyled to the reference kit's design language:
 * rounded-lg, 1px border-border, bg-card surfaces. The exported API
 * (Card / CardHeader / CardBody / SectionLabel) is unchanged, so existing
 * consumers (flow builder steps) adopt the new style automatically.
 */

export function Card({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "primary" | "compact";
}) {
  const variantClasses = {
    default: "rounded-lg border border-border bg-card text-card-foreground",
    primary: "rounded-lg border border-accent/40 bg-card text-card-foreground shadow-sm",
    compact: "rounded-md border border-border bg-card/80",
  };
  return <section className={`${variantClasses[variant]} ${className}`}>{children}</section>;
}

export function CardHeader({
  label,
  meta,
  action,
  badge,
}: {
  label: string;
  meta?: string;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 lg:px-6">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {badge && <span className="text-accent">{badge}</span>}
        {meta && <span>{meta}</span>}
        {action}
      </div>
    </header>
  );
}

export function CardBody({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`${padded ? "p-5 lg:p-6" : "p-0"} ${className}`}>{children}</div>;
}

/* Section label component - now exported from here too */
export function SectionLabel({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted-foreground">{index}</span>
    </div>
  );
}
