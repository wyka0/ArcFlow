"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

const STAGES = [
  { id: "requesting_intent", label: "REQUESTING INTENT", status: "pending" },
  { id: "intent_approved", label: "INTENT APPROVED", status: "pending" },
  { id: "awaiting_signature", label: "AWAITING SIGNATURE", status: "pending" },
  { id: "submitted", label: "TRANSACTION SUBMITTED", status: "pending" },
  { id: "verification_pending", label: "VERIFYING ON ARC", status: "pending" },
  { id: "confirmed", label: "PAYMENT CONFIRMED", status: "pending" },
  { id: "fulfillment_pending", label: "FULFILLMENT PENDING", status: "pending" },
  { id: "fulfilled", label: "SERVICE FULFILLED", status: "pending" },
];

// Map stage IDs to their corresponding active concept for orange emphasis
const STAGE_ACTIVE_CONCEPTS: Record<string, string> = {
  requesting_intent: "AGENT",
  intent_approved: "POLICY",
  awaiting_signature: "WALLET",
  submitted: "PAYMENT",
  verification_pending: "ARC",
  confirmed: "VERIFIED",
  fulfillment_pending: "SERVICE",
  fulfilled: "RESULT",
};

export function ExecutionTerminal() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const timer = setTimeout(() => {
      setCompleted((prev) => {
        const next = new Set(prev);
        next.add(currentStep);
        return next;
      });
      setCurrentStep((prev) => (prev + 1) % STAGES.length);
    }, 1800);

    return () => clearTimeout(timer);
  }, [currentStep]);

  if (!mounted) {
    return <div className="h-[400px] w-full" />;
  }

  return (
    <section id="execution" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground bg-muted/30">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: EXECUTION_LIFECYCLE
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">007</span>
      </motion.div>

      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-10"
        >
          <p className="text-4xl sm:text-5xl lg:text-6xl tracking-tight text-foreground font-bold leading-[1.1] mb-4">
            PAYMENT
            <br />
            EXECUTION
            <br />
            TERMINAL
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            Visualization of the AgentPay payment flow. Each stage must complete
            before the next begins. No stage can be skipped.
          </p>
        </motion.div>

        <div className="border-2 border-foreground p-6 font-mono">
          {STAGES.map((stage, i) => (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 py-3 border-b border-border/50 last:border-b-0"
            >
              {/* Step number */}
              <span className={`text-sm font-bold w-8 flex-shrink-0 ${completed.has(i) ? "text-accent" : "text-muted-foreground"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* Status indicator */}
              <motion.div
                className="w-3 h-3 rounded-none flex-shrink-0"
                animate={{
                  backgroundColor: completed.has(i)
                    ? "#ea580c"
                    : currentStep === i
                      ? "#ea580c"
                      : "transparent",
                  borderColor: completed.has(i)
                    ? "#ea580c"
                    : currentStep === i
                      ? "#ea580c"
                      : "hsl(var(--border))",
                }}
                transition={{ duration: 0.3 }}
              >
                {completed.has(i) && (
                  <motion.svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </motion.svg>
                )}
              </motion.div>

              {/* Label */}
              <span className={`text-sm font-bold flex-1 text-left ${completed.has(i) ? "text-foreground" : currentStep === i ? "text-accent" : "text-muted-foreground"}`}>
                {stage.label}
              </span>

              {/* Active concept indicator - small orange tag when active */}
              {currentStep === i && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                  className="px-2 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase text-accent bg-accent/10 border border-accent/20"
                >
                  {STAGE_ACTIVE_CONCEPTS[stage.id]}
                </motion.span>
              )}

              {/* Status text */}
              <span className={`text-[10px] tracking-[0.15em] uppercase ${completed.has(i) ? "text-accent" : currentStep === i ? "text-accent" : "text-muted-foreground"}`}>
                {completed.has(i) ? "DONE" : currentStep === i ? "ACTIVE" : "PENDING"}
              </span>
            </motion.div>
          ))}

          {/* Conceptual disclaimer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.5 }}
            className="mt-6 pt-4 border-t border-border text-[10px] tracking-[0.15em] uppercase text-muted-foreground text-center"
          >
            CONCEPTUAL VISUALIZATION NO LIVE TRANSACTION DISPLAYED
          </motion.p>
        </div>
      </div>
    </section>
  );
}