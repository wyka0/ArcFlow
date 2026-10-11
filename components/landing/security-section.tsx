"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const SECURITY_CARDS = [
  {
    title: "SERVER POLICY",
    description: "Policy evaluation occurs against trusted server-side accounting. The browser never decides what an agent can spend.",
  },
  {
    title: "IMMUTABLE INTENTS",
    description: "Approved payment values cannot be modified by the agent, the user, or any client-side logic. The intent is fixed at creation.",
  },
  {
    title: "ON-CHAIN VERIFICATION",
    description: "Transaction facts are independently verified on Arc. The server checks amount, recipient, sender, and token against the intent.",
  },
  {
    title: "EXPLICIT SIGNING",
    description: "Wallet authorization remains an explicit user boundary. No autonomous signing. No custodial keys. The user confirms every transaction.",
  },
  {
    title: "TRUSTED LEDGER",
    description: "Verified payments become the accounting authority. Browser storage is never the source of truth for spending limits.",
  },
  {
    title: "SERVICE GATING",
    description: "Service fulfillment requires verified payment. The service adapter only executes after the trusted ledger confirms payment.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: SECURITY_MODEL
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">010</span>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-16"
        >
          <p className="text-4xl sm:text-5xl lg:text-6xl tracking-tight text-foreground font-bold leading-[1.1] mb-6">
            TRUST IS
            <br />
            VERIFIED.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            Every layer of AgentPay is designed so that trust never assumes — it verifies.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {SECURITY_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              custom={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className="border-2 border-foreground p-6 hover:border-accent hover:bg-accent/5 transition-colors duration-200"
            >
              <h3 className="text-sm font-bold uppercase text-foreground font-mono tracking-[0.1em] mb-3">
                {card.title}
              </h3>
              <p className="text-sm text-muted-foreground font-mono leading-relaxed">
                {card.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}