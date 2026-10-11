"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    number: "01",
    title: "REQUEST",
    description: "Agent requests a service by selecting from the available registry and providing required input parameters.",
  },
  {
    number: "02",
    title: "POLICY",
    description: "Server evaluates the request against the agent's spending policy using trusted accounting from the verified ledger.",
  },
  {
    number: "03",
    title: "INTENT",
    description: "AgentPay creates an immutable payment intent with fixed amount, recipient, chain, and expiry. Values cannot be modified.",
  },
  {
    number: "04",
    title: "SIGN",
    description: "User wallet explicitly authorizes the transaction. No autonomous signing. The user must confirm in their wallet.",
  },
  {
    number: "05",
    title: "SETTLE",
    description: "USDC transfers on Arc mainnet (chain 5042). Native gas token is USDC. Transaction settles in seconds.",
  },
  {
    number: "06",
    title: "VERIFY",
    description: "Server independently verifies the Arc transaction against the intent. Only on success is a trusted payment recorded.",
  },
  {
    number: "07",
    title: "FULFILL",
    description: "Service executes only after trusted payment verification. Fulfillment is gated by server-authoritative payment proof.",
  },
  {
    number: "08",
    title: "RESULT",
    description: "Agent receives the structured service result. The result is bound to the request, payment, and trusted ledger entry.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: LIFECYCLE
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">004</span>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.number}
            custom={i}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08, duration: 0.5, ease }}
            className="flex flex-col sm:flex-row gap-6 sm:gap-8 py-8 border-b border-border first:border-t-2 border-foreground"
          >
            <div className="flex items-start gap-4 sm:gap-6 flex-shrink-0 w-full sm:w-32">
              <span className="text-3xl sm:text-4xl font-bold text-accent font-mono tracking-[0.1em] leading-none pt-1">
                {step.number}
              </span>
            </div>

            <div className="flex-1 pt-2">
              <h3 className="text-xl sm:text-2xl font-bold text-foreground font-mono tracking-[0.05em] uppercase mb-2">
                {step.title}
              </h3>
              <p className="text-base sm:text-lg text-muted-foreground font-mono leading-relaxed">
                {step.description}
              </p>
            </div>

            {/* Connecting line */}
            {i < STEPS.length - 1 && (
              <div className="hidden sm:block w-px h-16 bg-border/50 ml-16" />
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}