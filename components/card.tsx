import type { ReactNode } from "react";

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
    default: "border-2 border-foreground bg-background",
    primary: "border-2 border-foreground bg-background shadow-[0_4px_0_0_hsl(var(--border))]",
    compact: "border border-foreground/60 bg-background/80",
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
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground px-5 py-3 lg:px-6 lg:py-4">
      <span className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase font-mono">{label}</span>
      <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-mono">
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
    <div className="flex items-center gap-4 mb-6">
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-mono">{label}</span>
      <div className="flex-1 border-t border-border" />
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-mono">{index}</span>
    </div>
  );
}