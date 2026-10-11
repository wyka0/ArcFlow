"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { FlowPreview } from "./flow-preview";

const ease = [0.22, 1, 0.36, 1] as const;

const previewFlow = {
  trigger: { type: "PAYMENT_RECEIVED" as const },
  condition: { operator: "GTE" as const, amount: "10.00" },
  actions: [
    { type: "TRANSFER" as const, recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" as `0x${string}`, percentage: 80 },
    { type: "TRANSFER" as const, recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`, percentage: 20 },
  ],
};

export function LandingPage() {
  return (
    <div className="dot-grid-bg flex min-h-full flex-col font-mono">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="w-full px-4 pt-4 lg:px-6 lg:pt-6"
      >
        <nav className="w-full border border-foreground/20 bg-background/80 backdrop-blur-sm px-6 py-3 lg:px-8">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-xs font-mono tracking-[0.15em] uppercase font-bold">
                ARCFLOW
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="flex items-center gap-4"
            >
              <Link
                href="/app"
                className="bg-foreground text-background px-4 py-2 text-xs font-mono tracking-widest uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
              >
                OPEN ARC FLOW
              </Link>
            </motion.div>
          </div>
        </nav>
      </motion.header>

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="relative w-full px-6 pt-16 pb-20 lg:px-12 lg:pt-24 lg:pb-32 flex-1 flex flex-col"
        >
          <div className="flex flex-col items-center text-center max-w-[1400px] mx-auto flex-1">
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease }}
              className="mb-6"
            >
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
                PROGRAMMABLE MONEY INFRASTRUCTURE
              </span>
            </motion.div>

            {/* Primary Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.1, ease }}
              className="text-5xl sm:text-7xl lg:text-8xl xl:text-[clamp(4rem,8vw,8rem)] tracking-tight mb-4 select-none font-bold leading-[1.0] whitespace-nowrap max-w-full"
            >
              <span className="text-foreground">ARC</span>{" "}
              <span style={{ color: "#EA580C" }}>FLOW</span>
            </motion.h1>

            {/* Tagline */}
            <motion.h2
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.2, ease }}
              className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl tracking-tight mb-6 select-none font-medium leading-[1.1] text-muted-foreground"
            >
              PROGRAMMABLE MONEY.<br />
              <span className="block">WITHOUT CODE.</span>
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease }}
              className="text-base lg:text-lg text-muted-foreground max-w-2xl mb-12 leading-relaxed font-mono"
            >
              Build rules that automatically move USDC on Arc. Define triggers, conditions, and actions — deploy as smart contracts.
            </motion.p>

            {/* Technical badges */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, ease }}
              className="flex flex-wrap items-center justify-center gap-3 mb-12"
            >
              <span className="px-3 py-1.5 border border-foreground/40 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                ARC MAINNET
              </span>
              <span className="px-3 py-1.5 border border-foreground/40 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                USDC
              </span>
              <span className="px-3 py-1.5 border border-foreground/40 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                NO-CODE BUILDER
              </span>
              <span className="px-3 py-1.5 border border-foreground/40 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                SMART CONTRACTS
              </span>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, ease }}
              className="mb-16"
            >
              <Link
                href="/app"
                className="group inline-flex items-center gap-0 bg-foreground text-background text-base font-mono tracking-[0.15em] uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
              >
                <span className="flex items-center justify-center w-12 h-12 bg-accent">
                  <motion.span
                    className="inline-flex"
                    whileHover={{ x: 3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent-foreground">
                      <line x1={5} y1={12} x2={19} y2={12} />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </motion.span>
                </span>
                <span className="px-6 py-3">
                  OPEN ARC FLOW
                </span>
              </Link>
            </motion.div>

            {/* Disclaimer */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6, ease }}
              className="text-[11px] text-muted-foreground/80 font-mono mb-16"
            >
              Phase 1 — UI Foundation. Smart contract deployment and on-chain execution coming in Phase 2.
            </motion.p>

            {/* Workflow Preview */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.7, ease }}
              className="w-full max-w-[760px] mx-auto"
            >
              <div className="border-2 border-foreground bg-background p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6 lg:mb-8">
                  <h3 className="text-xs font-mono tracking-[0.2em] uppercase text-muted-foreground">WORKFLOW PREVIEW</h3>
                  <span className="px-2 py-1 border border-foreground/40 text-[9px] font-mono tracking-[0.1em] uppercase text-muted-foreground">
                    EXAMPLE
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <FlowPreview flow={previewFlow} />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-foreground/20 px-6 py-6 lg:px-12">
          <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase">ArcFlow</span>
            <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>Build rules</span>
              <span>Move money automatically</span>
              <span>On Arc</span>
            </div>
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Phase 1 — UI Foundation
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}