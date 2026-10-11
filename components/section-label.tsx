export function SectionLabel({ label, index }: { label: string; index: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{label}</span>
      <div className="flex-1 border-t border-border" />
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground">{index}</span>
    </div>
  );
}
