export function DemoBadge({ label = "DEMO DATA" }: { label?: string }) {
  return (
    <span className="border border-border px-1.5 py-0.5 text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
      {label}
    </span>
  );
}

export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-[0.2em] text-accent-foreground uppercase">
      <span aria-hidden className="size-1 bg-accent-foreground" />
      {label}
    </span>
  );
}
