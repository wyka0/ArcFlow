"use client";

import { motion } from "framer-motion";
import { listActiveServices, getService } from "@/lib/services/registry";
import { formatMoney } from "@/lib/money";

const ease = [0.22, 1, 0.36, 1] as const;

export function PolicySection() {
  const services = listActiveServices();

  return (
    <section id="policy" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground bg-muted/30">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: POLICY_ENGINE
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">005</span>
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
            PAYMENT IS NOT
            <br />
            PERMISSION.
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            The agent can request. The server decides. The wallet signs. The ledger verifies.
          </p>
        </motion.div>

        {/* Policy Card Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16"
        >
          <PolicyCard
            label="MAX / TRANSACTION"
            value="$0.25"
            subtitle="Configured per service"
          />
          <PolicyCard
            label="DAILY LIMIT"
            value="$5.00"
            subtitle="Per agent, per UTC day"
          />
          <PolicyCard
            label="CURRENCY"
            value="USDC"
            subtitle="Arc native gas token"
          />
        </motion.div>

        {/* Network & Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.1, duration: 0.5, ease }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16"
        >
          <PolicyCard
            label="NETWORK"
            value="ARC MAINNET"
            subtitle="Chain ID 5042"
          />
          <PolicyCard
            label="POLICY AUTHORITY"
            value="SERVER"
            subtitle="Never browser storage"
          />
        </motion.div>

        {/* Allowed Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: 0.2, duration: 0.5, ease }}
          className="border-2 border-foreground p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase text-accent font-mono tracking-[0.1em]">
              ALLOWED SERVICES
            </h3>
            <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-accent">
              {services.length} ACTIVE
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service, i) => (
              <motion.div
                key={service.id}
                custom={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4, ease }}
                className="border-2 border-foreground p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase text-accent font-mono">
                    {service.name}
                  </span>
                  <span className="text-xs font-mono text-accent font-mono">
                    {formatMoney(service.price, service.currency)}
                  </span>
                </div>
                <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-mono">
                  {service.category}
                </p>
                <span className="inline-block mt-2 px-2 py-1 border border-accent text-[9px] font-mono tracking-[0.15em] uppercase text-accent">
                  LOCAL DEMO
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PolicyCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="border-2 border-foreground p-6">
      <span className="text-[10px] tracking-[0.2em] uppercase text-accent font-mono block mb-2">
        {label}
      </span>
      <p className="text-3xl sm:text-4xl font-bold text-accent font-mono tracking-[0.05em] mb-1">
        {value}
      </p>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-mono">
        {subtitle}
      </p>
    </div>
  );
}