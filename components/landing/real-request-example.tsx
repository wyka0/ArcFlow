"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const REQUEST_STEPS = [
  {
    actor: "USER TASK",
    action: '"Find the current BTC market price."',
    icon: null,
  },
  {
    actor: "AI AGENT",
    action: "Decides it needs market data service.",
    icon: null,
  },
  {
    actor: "AGENTPAY",
    action: "Checks: authenticated? owns request? service allowed? price within policy? daily spend available?",
    icon: null,
  },
  {
    actor: "PAYMENT",
    action: "Explicit USDC payment authorized by wallet.",
    icon: null,
  },
  {
    actor: "ARC",
    action: "USDC settles on Arc mainnet (chain 5042).",
    icon: null,
  },
  {
    actor: "VERIFICATION",
    action: "Server independently verifies transaction on Arc.",
    icon: null,
  },
  {
    actor: "SERVICE",
    action: "Market-data service executes with verified payment.",
    icon: null,
  },
  {
    actor: "RESULT",
    action: "BTC market data returned to the agent.",
    icon: null,
  },
];

export function RealRequestExample() {
  return (
    <section id="example" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground bg-muted/30">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: REAL_REQUEST
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">005</span>
      </motion.div>

      <div className="max-w-3xl mx-auto">
        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-12"
        >
          <p className="text-3xl sm:text-4xl lg:text-5xl tracking-tight text-foreground font-bold leading-[1.1] mb-4">
            WHAT HAPPENS
            <br />
            IN A REAL REQUEST
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            Conceptual example — no live data or fabricated transactions.
          </p>
        </motion.div>

        {/* Vertical flow */}
        <div className="space-y-0">
          {REQUEST_STEPS.map((step, i) => (
            <motion.div
              key={step.actor}
              custom={i}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className="flex flex-col sm:flex-row gap-4 sm:gap-6 py-4 border-b border-border first:border-t-2 border-foreground"
            >
              <div className="flex items-start gap-3 sm:gap-4 flex-shrink-0 w-full sm:w-32">
                <span className="text-2xl sm:text-3xl font-bold text-accent font-mono tracking-[0.1em] leading-none pt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="flex-1 pt-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-lg sm:text-xl font-bold text-foreground font-mono tracking-[0.05em] uppercase">
                    {step.actor}
                  </span>
                  <span className="text-base sm:text-lg text-muted-foreground font-mono leading-relaxed flex-1">
                    {step.action}
                  </span>
                </div>
              </div>

              {/* Vertical connector line on mobile */}
              {i < REQUEST_STEPS.length - 1 && (
                <div className="hidden sm:block w-px h-8 bg-border/50 ml-16" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.3, duration: 0.5, ease }}
          className="text-center mt-8"
        >
          <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-mono max-w-xl mx-auto">
            Conceptual flow. Service prices from registry. No fabricated transaction hashes or live BTC prices.
          </p>
        </motion.div>
      </div>
    </section>
  );
}