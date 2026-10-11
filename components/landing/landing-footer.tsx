"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const ease = [0.22, 1, 0.36, 1] as const;

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease }}
      className="w-full border-t-2 border-foreground px-6 py-10 lg:px-12 lg:py-12"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.15em] uppercase text-foreground font-mono">
            AGENTPAY
          </span>
          <span className="text-[10px] tracking-widest text-muted-foreground font-mono">
            ARC / USDC / AI AGENT INFRASTRUCTURE
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/app"
            className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            APP
          </Link>
          <a
            href="#services"
            className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            SERVICES
          </a>
          <a
            href="#security"
            className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            SECURITY
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            GITHUB
          </a>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6, ease }}
        className="mt-8 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4"
      >
        <div className="flex flex-col gap-1 text-center md:text-left">
          <span className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
            BUILT ON ARC
          </span>
          <span className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground">
            USDC · CHAIN 5042
          </span>
        </div>
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground">
          (C) 2026 AGENTPAY
        </div>
      </motion.div>
    </motion.footer>
  );
}