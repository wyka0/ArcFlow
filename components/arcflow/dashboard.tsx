"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/card";
import { AppHeader } from "./app-header";

const statCards = [
  {
    label: "USDC Balance",
    value: "$0.00",
    description: "Connect wallet to view balance",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <line x1={12} y1={1} x2={12} y2={23} />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "Active Flows",
    value: "0",
    description: "No flows deployed yet",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1={12} y1={22.08} x2={12} y2={12} />
      </svg>
    ),
  },
  {
    label: "Executed",
    value: "0",
    description: "No executions recorded",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1={16} y1={13} x2={8} y2={13} />
        <line x1={16} y1={17} x2={8} y2={17} />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

const templateFlow = {
  name: "Revenue Split",
  description: "When payment ≥ 10 USDC, split 80% to Treasury and 20% to Contributor",
  trigger: "Payment Received",
  condition: "≥ 10 USDC",
  actions: [
    { label: "Treasury", percentage: 80 },
    { label: "Contributor", percentage: 20 },
  ],
};

export function Dashboard() {
  return (
    <div className="dot-grid-bg flex min-h-full flex-col font-mono">
      <AppHeader />

      <main className="w-full flex-1">
        <div className="w-full px-6 pb-16 lg:px-12">
          {/* Overview Stats */}
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label} variant="default" className="relative">
                <CardBody className="pt-6 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground mb-2">
                        {stat.label}
                      </div>
                      <div className="font-mono font-bold text-2xl lg:text-3xl text-foreground">{stat.value}</div>
                      <p className="mt-1 text-xs text-muted-foreground font-mono">{stat.description}</p>
                    </div>
                    <div className="flex-shrink-0 p-2 border border-border rounded-none bg-muted/50">
                      {stat.icon}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Flow List */}
          <div className="border-2 border-foreground">
            <CardHeader label="// SECTION: AUTOMATED_FLOWS" />
            <CardBody className="p-0">
              <div className="p-6 lg:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                  <div>
                    <h2 className="font-mono font-bold text-lg tracking-[0.1em] uppercase text-foreground">Your Flows</h2>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">Manage your programmable money workflows</p>
                  </div>
                  <Link
                    href="/app/flows/new"
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-foreground bg-foreground text-background font-mono text-xs tracking-[0.1em] uppercase hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1={12} y1={5} x2={12} y2={19} />
                      <line x1={5} y1={12} x2={19} y2={12} />
                    </svg>
                    + CREATE FLOW
                  </Link>
                </div>

                {/* Empty State */}
                <div className="border-2 border-border bg-background/50 p-8 lg:p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 border-2 border-border rounded-none bg-background mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1={12} y1={22.08} x2={12} y2={12} />
                    </svg>
                  </div>
                  <h3 className="font-mono font-bold text-lg tracking-[0.1em] uppercase text-foreground mb-2">
                    No automated flows yet
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono max-w-md mx-auto mb-6">
                    Create your first programmable-money workflow to automatically split incoming USDC payments.
                  </p>
                  <Link
                    href="/app/flows/new"
                    className="inline-flex items-center gap-2 px-6 py-3 border-2 border-foreground bg-foreground text-background font-mono text-xs tracking-[0.1em] uppercase hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1={12} y1={5} x2={12} y2={19} />
                      <line x1={5} y1={12} x2={19} y2={12} />
                    </svg>
                    CREATE YOUR FIRST FLOW
                  </Link>
                </div>

                {/* Template */}
                <div className="mt-8 border-2 border-border bg-background">
                  <CardBody className="p-6 lg:p-8">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-14 h-14 border-2 border-foreground rounded-none bg-background flex items-center justify-center">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-mono font-bold text-lg tracking-[0.1em] uppercase text-foreground">{templateFlow.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground font-mono">{templateFlow.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-mono">
                            <span className="text-muted-foreground">Trigger:</span>
                            <span className="text-foreground">{templateFlow.trigger}</span>
                            <span className="text-muted-foreground">|</span>
                            <span className="text-muted-foreground">Condition:</span>
                            <span className="text-foreground">{templateFlow.condition}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-mono">
                            <span className="text-muted-foreground">Actions:</span>
                            {templateFlow.actions.map((action, i) => (
                              <span key={i} className="text-foreground">
                                {action.percentage}% → {action.label}
                                {i < templateFlow.actions.length - 1 && <span className="text-muted-foreground mx-1">|</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/40 text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">
                          Template
                        </span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground font-mono text-center lg:text-left">
                      This template has not been deployed. Click &apos;Create Flow&apos; to customize and deploy your own version.
                    </p>
                  </CardBody>
                </div>
              </div>
            </CardBody>
          </div>

          <footer className="mt-10 flex flex-col gap-2 border-t-2 border-foreground pt-6 md:flex-row md:items-center md:justify-between">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase">ArcFlow</span>
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Build rules. Move money automatically.
            </span>
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Phase 1 — UI Foundation
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}