"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const ease = [0.22, 1, 0.36, 1] as const;

export function ArcSection() {
  return (
    <section id="arc" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground bg-muted/30">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: ARC_INFRASTRUCTURE
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">009</span>
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
            SETTLED
            <br />
            ON <span className="text-accent">ARC</span>.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            AgentPay uses Arc mainnet for USDC settlement. Native gas. Native USDC. Verified on-chain.
          </p>
        </motion.div>

        {/* Arc Specs Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          <ArcSpecCard label="NETWORK" value="ARC MAINNET" />
          <ArcSpecCard label="CHAIN ID" value="5042" />
          <ArcSpecCard label="SETTLEMENT TOKEN" value="USDC" />
          <ArcSpecCard label="GAS TOKEN" value="USDC" />
        </motion.div>

        {/* Technical Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.1, duration: 0.5, ease }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16"
        >
          <ArcDetailCard
            title="NATIVE USDC"
            points={[
              "USDC is the native gas token on Arc",
              "No wrapped tokens or bridges required",
              "Direct settlement in the payment currency",
            ]}
          />
          <ArcDetailCard
            title="VERIFICATION"
            points={[
              "Server independently verifies every transaction",
              "Receipt checked against Arc RPC",
              "Amount, recipient, sender, token all validated",
            ]}
          />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.3, duration: 0.5, ease }}
          className="text-center"
        >
          <Link
            href="/app"
            className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3 text-sm font-mono tracking-[0.15em] uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
          >
            OPEN AGENTPAY
            <motion.span
              className="inline-flex"
              whileHover={{ x: 3 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1={5} y1={12} x2={19} y2={12} />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function ArcSpecCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-foreground p-6 text-center">
      <span className="text-[10px] tracking-[0.2em] uppercase text-accent font-mono block mb-2">
        {label}
      </span>
      <p className="text-3xl sm:text-4xl font-bold text-accent font-mono tracking-[0.05em]">
        {value}
      </p>
    </div>
  );
}

function ArcDetailCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="border-2 border-foreground p-6">
      <h3 className="text-sm font-bold uppercase text-accent font-mono tracking-[0.1em] mb-4">
        {title}
      </h3>
      <ul className="space-y-3">
        {points.map((point, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
            className="flex items-start gap-3 text-sm text-muted-foreground font-mono leading-relaxed"
          >
            <span className="w-1.5 h-1.5 rounded-none flex-shrink-0 mt-1.5" style={{ backgroundColor: "#ea580c" }} />
            {point}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}