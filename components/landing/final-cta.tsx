"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const ease = [0.22, 1, 0.36, 1] as const;

export function FinalCTA() {
  return (
    <section id="cta" className="w-full px-6 py-20 lg:px-12 lg:py-28 border-t-2 border-foreground bg-muted/30">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="mb-12"
        >
          <p className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-foreground font-bold leading-[1.05] mb-6">
            LET YOUR <span className="text-accent">AGENT</span>
            <br />
            REQUEST.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7, ease }}
          className="mb-12"
        >
          <p className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-foreground font-bold leading-[1.05] mb-6">
            LET YOUR <span className="text-accent">POLICY</span>
            <br />
            DECIDE.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease }}
          className="mb-16"
        >
          <p className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl tracking-tight text-foreground font-bold leading-[1.05] mb-6">
            LET <span className="text-accent">ARC</span>
            <br />
            SETTLE.
          </p>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/app"
            className="group flex items-center gap-0 bg-foreground text-background text-lg font-mono tracking-[0.15em] uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
          >
            <span className="flex items-center justify-center w-12 h-12 bg-accent">
              <motion.span
                className="inline-flex"
                whileHover={{ x: 4 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent-foreground">
                  <line x1={5} y1={12} x2={19} y2={12} />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </motion.span>
            </span>
            <span className="px-8 py-3.5">
              OPEN AGENTPAY
            </span>
          </Link>
          <Link
            href="#how-it-works"
            className="border border-foreground/20 bg-transparent text-foreground text-lg font-mono tracking-[0.15em] uppercase px-8 py-3.5 hover:bg-foreground hover:text-background transition-colors duration-200"
          >
            EXPLORE THE SYSTEM
          </Link>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-12 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono"
        >
          NO CUSTODIAL KEYS · NO AUTONOMOUS SIGNING · SERVER VERIFIED
        </motion.p>
      </div>
    </section>
  );
}