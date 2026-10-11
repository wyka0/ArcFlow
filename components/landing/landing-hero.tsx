"use client";

import { motion } from "framer-motion";
import { HeroSystemDiagram } from "./hero-system-diagram";

const ease = [0.22, 1, 0.36, 1] as const;

export function LandingHero() {
  return (
    <section className="relative w-full px-6 pt-10 pb-12 lg:px-12 lg:pt-16 lg:pb-20">
      <div className="flex flex-col items-center text-center max-w-[1400px] mx-auto">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease }}
          className="mb-4"
        >
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-mono">
            AGENT PAYMENT INFRASTRUCTURE
          </span>
        </motion.div>

        {/* Primary headline - DOMINANT, single line on desktop */}
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.1, ease }}
          className="text-6xl sm:text-8xl lg:text-9xl xl:text-[clamp(4.5rem,8vw,9rem)] tracking-tight mb-3 select-none font-bold leading-[1.0] whitespace-nowrap max-w-full"
        >
          <span style={{ color: "#EA580C" }}>AI</span>{" "}
          <span style={{ color: "#000000" }}>AGENTS</span>
        </motion.h1>

        {/* Secondary headline - NOTICEABLY SMALLER */}
        <motion.h2
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.2, ease }}
          className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl tracking-tight mb-4 select-none font-medium leading-[1.1] text-muted-foreground"
        >
          NEED PAYMENT RAILS.
        </motion.h2>

        {/* Supporting copy */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease }}
          className="text-sm lg:text-base text-muted-foreground max-w-2xl mb-10 leading-relaxed font-mono"
        >
          AgentPay gives AI agents controlled USDC spending on Arc with server-enforced policy, verified settlement, and service fulfillment.
        </motion.p>

        {/* Technical metadata badges - NO CHAIN 5042 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease }}
          className="flex flex-wrap items-center justify-center gap-3 mb-10"
        >
          <span style={{ 
            padding: "4px 12px", 
            border: "1px solid #EA580C", 
            fontSize: "10px", 
            fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#EA580C",
            borderColor: "#EA580C"
          }}>
            ARC MAINNET
          </span>
          <span style={{ 
            padding: "4px 12px", 
            border: "1px solid #EA580C", 
            fontSize: "10px", 
            fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#EA580C",
            borderColor: "#EA580C"
          }}>
            USDC
          </span>
          <span style={{ 
            padding: "4px 12px", 
            border: "1px solid #EA580C", 
            fontSize: "10px", 
            fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#EA580C",
            borderColor: "#EA580C"
          }}>
            POLICY CONTROL
          </span>
          <span style={{ 
            padding: "4px 12px", 
            border: "1px solid #EA580C", 
            fontSize: "10px", 
            fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#EA580C",
            borderColor: "#EA580C"
          }}>
            VERIFIED SETTLEMENT
          </span>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <a
            href="/app"
            className="group flex items-center gap-0 bg-foreground text-background text-base font-mono tracking-[0.15em] uppercase hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
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
              OPEN AGENTPAY
            </span>
          </a>
          <a
            href="#how-it-works"
            className="border border-foreground/20 bg-transparent text-foreground text-base font-mono tracking-[0.15em] uppercase px-6 py-3 hover:bg-foreground hover:text-background transition-colors duration-200"
          >
            SEE HOW IT WORKS
          </a>
        </motion.div>

        {/* System Diagram - centered BELOW the hero content, contained in normal flow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.7, ease }}
          className="w-full max-w-[760px] mx-auto"
        >
          <HeroSystemDiagram />
        </motion.div>
      </div>
    </section>
  );
}