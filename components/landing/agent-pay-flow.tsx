"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const FLOW_STEPS = [
  {
    number: "01",
    title: "AGENT",
    subtitle: '"I need market data."',
  },
  {
    number: "02",
    title: "AGENTPAY",
    subtitle: '"Is this allowed?"',
  },
  {
    number: "03",
    title: "POLICY",
    subtitle: "Check limit, ownership, service.",
  },
  {
    number: "04",
    title: "PAYMENT",
    subtitle: "Explicit USDC payment.",
  },
  {
    number: "05",
    title: "ARC",
    subtitle: "Settlement + verification.",
  },
  {
    number: "06",
    title: "SERVICE",
    subtitle: "Market data / research / AI summary.",
  },
  {
    number: "07",
    title: "RESULT",
    subtitle: "Data returned to agent.",
  },
];

export function AgentPayFlow() {
  return (
    <section id="flow" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: PAYMENT_FLOW
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">004</span>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        {/* Compact vertical flow */}
        <div className="flex flex-col items-center gap-0">
          {FLOW_STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              custom={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.4, ease }}
              className="w-full max-w-md flex items-center gap-4 py-3 sm:py-4"
            >
              {/* Step number + title */}
              <div className="flex flex-col items-center sm:items-end w-28 sm:w-32 flex-shrink-0 text-right">
                <span className="text-2xl sm:text-3xl font-bold text-accent font-mono tracking-[0.1em] leading-none">
                  {step.number}
                </span>
                <span className="text-sm sm:text-lg font-bold uppercase text-foreground font-mono tracking-[0.05em] mt-1">
                  {step.title}
                </span>
              </div>

              {/* Vertical line / arrow connector */}
              <div className="flex-1 flex items-center">
                <div className="w-full h-px bg-border/50" />
                {i < FLOW_STEPS.length - 1 && (
                  <div className="absolute w-px h-8 bg-border/50 left-32 top-full -translate-x-1/2" />
                )}
              </div>

              {/* Subtitle */}
              <div className="w-64 text-left sm:text-right">
                <p className="text-xs sm:text-sm text-muted-foreground font-mono leading-relaxed">
                  {step.subtitle}
                </p>
              </div>

              {/* Arrow indicator between steps */}
              {i < FLOW_STEPS.length - 1 && (
                <div className="flex items-center justify-center w-8 h-8 text-accent font-mono">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={12} y1={5} x2={12} y2={19} />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Mobile stacked view */}
        <div className="hidden lg:flex flex-col items-center gap-0 mt-4">
          {FLOW_STEPS.map((step, i) => (
            <motion.div
              key={`${step.number}-mobile`}
              custom={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.4, ease }}
              className="w-full max-w-md flex items-center gap-4 py-2"
            >
              <div className="flex flex-col items-center w-20 flex-shrink-0 text-center">
                <span className="text-xl font-bold text-accent font-mono tracking-[0.1em] leading-none">
                  {step.number}
                </span>
                <span className="text-xs font-bold uppercase text-foreground font-mono tracking-[0.05em] mt-0.5">
                  {step.title}
                </span>
              </div>
              <div className="flex-1 flex items-center">
                <div className="w-full h-px bg-border/50" />
              </div>
              <div className="w-48 text-left">
                <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                  {step.subtitle}
                </p>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div className="flex items-center justify-center w-8 h-8 text-accent font-mono">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={12} y1={5} x2={12} y2={19} />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}