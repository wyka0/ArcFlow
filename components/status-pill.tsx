import type { AgentStatus } from "@/types";

const LABELS: Record<AgentStatus, string> = {
  active: "ACTIVE",
  disabled: "DISABLED",
};

export function StatusPill({ status }: { status: AgentStatus }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground"
      }`}
    >
      {LABELS[status]}
    </span>
  );
}
