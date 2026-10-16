"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import {
  Shield,
  Zap,
  Settings,
  Database,
  ArrowRight,
  CheckSquare,
  Workflow,
} from "lucide-react";

const tickerItems = [
  "Atomic USDC Split Execution",
  "Non-Custodial",
  "Arc Mainnet (5042)",
  "Origin Validation",
  "Rate Limiting",
  "USDC on Arc",
];

const features = [
  {
    icon: Shield,
    title: "Dual-Authorization (V2)",
    description: "Frozen at RC3 — not deployed. V2 adds ArcFlow EIP-712 and USDC EIP-3009 signature verification.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: Zap,
    title: "Atomic Execution",
    description: "Pulls and splits USDC in a single non-reentrant transaction (V1, live).",
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    icon: Settings,
    title: "Policy Enforcement (agent API)",
    description: "Server-side spending limits and recipient checks for the agent payment API (demo configuration).",
    color: "text-info",
    bg: "bg-info/10",
  },
  {
    icon: Database,
    title: "PostgreSQL Ledger (agent API)",
    description: "Neon PostgreSQL persistence for the agent payment API; ArcFlow flow definitions are stored on-chain.",
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    icon: CheckSquare,
    title: "Origin Validation",
    description: "Fail-closed same-origin enforcement in production",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    icon: Workflow,
    title: "No-Code Flow Builder",
    description: "Design triggers, conditions, and actions visually. Public flow deployment is disabled; execution is a manual one-shot split with no trigger monitoring.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
];

const exploreRoutes = [
  { title: "Flow Builder", description: "Create and manage payment workflows", href: "/app" },
  { title: "Flow List", description: "UI preview — on-chain listing is not yet implemented.", href: "/app/flows" },
  { title: "New Flow", description: "Create a new payment workflow", href: "/app/flows/new" },
];

const techStack = ["Arc", "USDC", "Next.js 16", "React 19", "Tailwind v4", "PostgreSQL", "Foundry"];

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Feature Ticker */}
      <div className="w-full overflow-hidden border-b border-border bg-muted/30 py-2">
        <div className="animate-marquee flex w-max items-center gap-8 px-4">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-muted-foreground uppercase whitespace-nowrap">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Brand row */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-6">
        <div className="flex items-center gap-2">
          <BrandMark size={22} className="text-accent" />
          <span className="text-sm font-semibold tracking-tight">ArcFlow</span>
        </div>
      </div>

      {/* Main content — two column grid */}
      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 transition-colors hover:bg-card">
                <span className="text-xs text-muted-foreground">Built on</span>
                <span className="text-xs font-medium text-foreground">Arc</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 transition-colors hover:bg-card">
                <span className="text-xs text-muted-foreground">Powered by</span>
                <span className="text-xs font-medium text-foreground">USDC</span>
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ship your <span className="text-accent">USDC</span> payment workflows on Arc
            </h1>
            <p className="text-sm text-muted-foreground">
              Design non-custodial USDC split flows on Arc and execute them atomically. Dual-authorization (V2) is frozen at RC3 and not deployed.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {techStack.map((tech) => (
                <span key={tech} className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px]">
                  {tech}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              {exploreRoutes.map((route) => (
                <Link key={route.title} href={route.href} className="group flex flex-col rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent/50 hover:bg-accent/5">
                  <span className="text-sm font-medium transition-colors group-hover:text-accent">{route.title}</span>
                  <span className="text-[10px] text-muted-foreground">{route.description}</span>
                  <ArrowRight className="mt-auto h-3 w-3 self-end text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </div>

          {/* Right column — Features grid */}
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-success">
                <Shield className="h-3 w-3" />
                V1 Deployed on Arc Mainnet
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ArcFlowV1 is live on Arc mainnet with 1 active flow. ArcFlowV2 (dual-authorization) is frozen at RC3 and not deployed. Public flow deployment is disabled.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-lg border border-border bg-card p-3">
                  <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${feature.bg}`}>
                    <feature.icon className={`h-4 w-4 ${feature.color}`} />
                  </div>
                  <span className="text-sm font-medium">{feature.title}</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>

            <Link href="/app" className="group flex w-full items-center justify-between rounded-lg border border-accent/50 bg-accent/5 p-4 transition-colors hover:bg-accent/10">
              <div>
                <span className="text-sm font-medium">Open Arc Flow</span>
                <span className="block text-[11px] text-muted-foreground">Connect your wallet to start building payment workflows</span>
              </div>
              <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 md:flex-row">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">ArcFlow</span>
          <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <span>Build rules</span>
            <span>Split money on demand</span>
            <span>On Arc</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
