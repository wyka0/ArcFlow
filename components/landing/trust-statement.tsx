"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

export function TrustStatement() {
  return (
    <section id="trust" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease }}
        className="max-w-4xl mx-auto text-center"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono mb-6 block">
          TRUST ARCHITECTURE
        </span>

        {/* Core product statement */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease }}
          className="mb-10"
        >
          <p className="text-4xl sm:text-5xl lg:text-6xl tracking-tight text-foreground font-bold leading-[1.1] mb-6">
            THE AGENT DECIDES
            <br />
            WHAT IT NEEDS.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease }}
          className="mb-10"
        >
          <p className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-bold leading-[1.1] mb-6">
            <span className="text-accent">AGENTPAY</span> DECIDES
            <br />
            WHAT IT CAN PAY FOR.
          </p>
        </motion.div>

        {/* What AgentPay is */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease }}
          className="max-w-2xl mx-auto text-left space-y-6 mb-10"
        >
          <p className="text-base lg:text-lg text-foreground font-mono leading-relaxed font-medium">
            <span className="text-accent">AGENTPAY</span> IS THE PAYMENT RAIL.
          </p>
          <p className="text-base lg:text-lg text-muted-foreground font-mono leading-relaxed">
            AgentPay gives AI agents controlled access to USDC payments,
            policy enforcement, verified settlement, and paid service fulfillment on Arc.
          </p>
        </motion.div>

        {/* Trust mechanics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease }}
          className="max-w-2xl mx-auto text-left space-y-4"
        >
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            The agent chooses a service based on its objective.
          </p>
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            The server evaluates policy against trusted spending.
          </p>
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            The wallet explicitly authorizes the transaction.
          </p>
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            Arc settles USDC on chain.
          </p>
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            AgentPay independently verifies the transaction.
          </p>
          <p className="text-sm lg:text-base text-muted-foreground font-mono leading-relaxed">
            The trusted ledger updates spending.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}