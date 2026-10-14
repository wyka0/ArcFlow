import type { HTMLAttributes } from "react";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "accent";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "text-foreground",
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/15 text-warning",
  destructive: "border-transparent bg-destructive/15 text-destructive",
  accent: "border-transparent bg-accent/10 text-accent",
};

const baseClasses =
  "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium transition-colors";

export function badgeClasses(variant: BadgeVariant = "default", className = ""): string {
  return `${baseClasses} ${variantClasses[variant]} ${className}`;
}

export function Badge({
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={badgeClasses(variant, className)} {...props} />;
}
