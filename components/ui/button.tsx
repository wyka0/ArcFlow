import type { ButtonHTMLAttributes } from "react";

/*
 * Shared button — class API modeled on the reference kit's ui/button.tsx.
 * Plain variant records instead of cva to avoid a new dependency.
 */

export type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-border bg-card hover:bg-muted hover:text-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  link: "text-accent underline-offset-4 hover:underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-3 text-xs",
  default: "h-9 rounded-md px-4 text-sm",
  lg: "h-10 rounded-md px-6 text-sm",
  icon: "size-9 rounded-md",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export function buttonClasses(
  variant: ButtonVariant = "default",
  size: ButtonSize = "default",
  className = "",
): string {
  return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "default", size = "default", className = "", type, ...props }: ButtonProps) {
  return <button type={type ?? "button"} className={buttonClasses(variant, size, className)} {...props} />;
}
