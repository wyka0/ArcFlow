"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

export function TrustedLedgerSection() {
  return (
    <section id="trusted-ledger" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: TRUSTED_LEDGER
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">008</span>
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
            LOCAL STATE
            <br />
            IS NOT
            <br />
            THE AUTHORITY.
          </p>
        </motion.div>

        {/* Architecture Diagram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="mb-16"
        >
          <LedgerArchitectureDiagram />
        </motion.div>

        {/* Explanation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.2, duration: 0.5, ease }}
          className="max-w-3xl mx-auto space-y-6 text-center"
        >
          <p className="text-lg text-muted-foreground font-mono leading-relaxed">
            Browser <code className="bg-muted px-1.5 py-0.5 font-mono">browser storage</code> exists only for UI
            convenience — it caches payment history for display continuity.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed">
            Trusted spending comes from <strong className="text-foreground">server-side verified payments</strong>.
            The trusted ledger is the only source of truth for policy decisions.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed">
            This is a critical differentiator: <strong className="text-foreground">authorization is server-authoritative</strong>,
            never client-derived.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function LedgerArchitectureDiagram() {
  const layers = [
    { label: "BROWSER", subtitle: "untrusted", color: "hsl(var(--muted-foreground))", details: ["browser storage (UI cache only)", "No authorization", "No policy evaluation"] },
    { label: "SERVER", subtitle: "policy authority", color: "#ea580c", details: ["Policy evaluation", "Intent creation", "Trusted spending calc"] },
    { label: "TRUSTED LEDGER", subtitle: "verified payments", color: "#ea580c", details: ["Immutable payment records", "txHash uniqueness", "Spending accounting"] },
    { label: "SPENDING", subtitle: "server-derived", color: "hsl(var(--foreground))", details: ["Daily limit enforcement", "Per-transaction limits", "Real-time balance"] },
  ];

  return (
    <div className="relative max-w-2xl mx-auto">
      {/* Vertical connecting line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-border" />

      <div className="space-y-8">
        {layers.map((layer, i) => (
          <motion.div
            key={layer.label}
            custom={i}
            initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.1, duration: 0.5, ease }}
            className={`relative flex items-center gap-6 ${i % 2 === 0 ? "flex-row" : "flex-row-reverse"}`}
          >
            {/* Circle marker */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-10 w-4 h-4 border-2 rounded-none flex-shrink-0"
              style={{ borderColor: layer.color }}
            >
              <motion.div
                className="w-2 h-2 rounded-none"
                style={{ backgroundColor: layer.color }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 400, damping: 20 }}
              />
            </motion.div>

            {/* Content card */}
            <div className={`w-[calc(50%-2rem)] p-5 border-2 ${i % 2 === 0 ? "text-right pr-8" : "pl-8"} min-w-[280px]`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-[0.15em] font-mono" style={{ color: layer.color }}>
                  {layer.label}
                </span>
                <span className="text-[9px] tracking-[0.2em] uppercase font-mono" style={{ color: layer.color }}>
                  {layer.subtitle.toUpperCase()}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground font-mono">
                {layer.details.map((detail, di) => (
                  <motion.li
                    key={di}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 + di * 0.05, duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-none" style={{ backgroundColor: layer.color }} />
                    {detail}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Spacer for alternating layout */}
            <div className="w-[calc(50%-2rem)]" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}