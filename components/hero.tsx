export function Hero() {
  return (
    <section className="px-6 pt-10 pb-12 lg:px-12 lg:pt-14 lg:pb-16">
      <div className="flex flex-col items-center text-center">
        <span className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
          {"// AGENT_PAYMENTS: POLICY_GATED"}
        </span>
        <h1 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight text-balance uppercase sm:text-5xl lg:text-6xl">
          Give your AI agent spending power.
        </h1>
        <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted-foreground lg:text-sm">
          Autonomous USDC payments with programmable spending policies.
        </p>
        <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-muted-foreground/80">
          The agent decides whether a service is useful. The policy engine decides whether the agent
          is allowed to pay.
        </p>
      </div>
    </section>
  );
}
