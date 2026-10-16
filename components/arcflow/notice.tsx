"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

/**
 * Phase 25 — small inline notice used by the read-only flow pages to render
 * explicit states (missing configuration, disconnected wallet, wrong network,
 * read failures). Never used to disguise an error as a successful empty result.
 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "destructive";
  title: string;
  children: ReactNode;
}) {
  const border =
    tone === "destructive"
      ? "border-destructive bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-warning bg-warning/10 text-warning"
        : "border-info bg-info/10 text-info";
  return (
    <div className={`rounded-lg border p-4 text-sm ${border}`}>
      <div className="mb-1 flex items-center gap-2">
        <AlertCircle className="size-4" />
        <span className="font-semibold">{title}</span>
      </div>
      <p className="ml-6">{children}</p>
    </div>
  );
}
