"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { listActiveServices, getService } from "@/lib/services/registry";
import { formatMoney } from "@/lib/money";

const ease = [0.22, 1, 0.36, 1] as const;

export function ServicesSection() {
  const services = listActiveServices();

  return (
    <section id="services" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease }}
        className="flex items-center gap-4 mb-12"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
          SECTION: SERVICE_MARKETPLACE
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">006</span>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        {/* Clarification headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-12"
        >
          <p className="text-3xl sm:text-4xl lg:text-5xl tracking-tight text-foreground font-bold leading-[1.1] mb-4">
            SERVICES
            <br />
            AGENTS CAN PAY FOR
          </p>
          <p className="text-lg text-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto">
            AgentPay provides the payment rail. The agent decides which service it needs.
            Prices are server-defined. Demo services return fixture data.
          </p>
        </motion.div>

        {/* Service relationship diagram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="text-center mb-12"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-4 p-6 border-2 border-foreground bg-background">
            <div className="text-center sm:w-1/3">
              <p className="text-sm font-bold uppercase text-accent font-mono tracking-[0.05em] mb-1">
                AI AGENT
              </p>
              <p className="text-xs text-muted-foreground font-mono">decides what it needs</p>
            </div>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <line x1={12} y1={5} x2={12} y2={19} />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            <div className="text-center sm:w-1/3">
              <p className="text-sm font-bold uppercase text-accent font-mono tracking-[0.05em] mb-1">
                AGENTPAY
              </p>
              <p className="text-xs text-muted-foreground font-mono">handles payment</p>
            </div>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <line x1={12} y1={5} x2={12} y2={19} />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            <div className="text-center sm:w-1/3">
              <p className="text-sm font-bold uppercase text-foreground font-mono tracking-[0.05em] mb-1">
                SERVICE
              </p>
              <p className="text-xs text-muted-foreground font-mono">executes & returns result</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              custom={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className="border-2 border-foreground p-6 hover:border-accent hover:bg-accent/5 transition-colors duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-bold uppercase text-accent font-mono">
                  {service.name}
                </span>
                <span className="text-lg font-mono text-accent font-bold">
                  {formatMoney(service.price, service.currency)}
                </span>
              </div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-mono mb-3">
                {service.category}
              </p>
              <p className="text-sm text-muted-foreground font-mono leading-relaxed mb-4">
                {service.id === "market-data"
                  ? "Real-time market intelligence via CoinGecko (when enabled) or fixture data."
                  : service.id === "research-report"
                  ? "Structured research output on requested topics."
                  : "AI-powered text summarization with configurable length."}
              </p>
              <span className="inline-block px-2 py-1 border border-accent text-[9px] font-mono tracking-[0.15em] uppercase text-accent">
                LOCAL DEMO
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: 0.3, duration: 0.5, ease }}
          className="text-center mt-12"
        >
          <Link
            href="/app"
            className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3 text-sm font-mono tracking-[0.15em] uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
          >
            OPEN SERVICES
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