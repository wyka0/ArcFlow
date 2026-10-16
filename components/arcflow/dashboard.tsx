"use client";

import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  FileText,
  Layers,
  Plus,
  Shield,
  Workflow,
} from "lucide-react";

import { Card, CardBody } from "@/components/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@/components/ui/empty";

/*
 * ArcFlow dashboard — visual language adopted from the reference kit:
 * rounded stat cards with soft icon chips, a bordered section card for the
 * flow list, and a dashed empty state. Values are honest placeholders that
 * describe the disconnected-wallet state; no fabricated records.
 */

const statCards = [
  {
    label: "USDC Balance",
    value: "$0.00",
    description: "Connect wallet to view balance",
    icon: CircleDollarSign,
    chip: "bg-accent/10 text-accent",
  },
  {
    label: "Active Flows",
    value: "0",
    description: "No flows deployed yet",
    icon: Workflow,
    chip: "bg-success/10 text-success",
  },
  {
    label: "Executed",
    value: "0",
    description: "No executions recorded",
    icon: FileText,
    chip: "bg-info/10 text-info",
  },
];

const templateFlow = {
  name: "Revenue Split",
  description: "Configured threshold ≥ 10 USDC · split 80% to Treasury and 20% to Contributor on execution",
  trigger: "Payment Received",
  condition: "≥ 10 USDC",
  actions: [
    { label: "Treasury", percentage: 80 },
    { label: "Contributor", percentage: 20 },
  ],
};

export function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Overview stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardBody className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground">{stat.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
                    {stat.value}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
                </div>
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${stat.chip}`}>
                  <stat.icon className="size-5" />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Your flows */}
      <Card>
        <CardBody className="p-5 lg:p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Your Flows</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Manage your programmable money workflows
              </p>
            </div>
            <Link href="/app/flows/new" className="sm:shrink-0">
              <Button>
                <Plus />
                Create Flow
              </Button>
            </Link>
          </div>

          {/* Empty state — no flows exist yet */}
          <Empty>
            <EmptyIcon>
              <Workflow />
            </EmptyIcon>
            <EmptyTitle>No flows configured yet</EmptyTitle>
            <EmptyDescription>
              Create your first workflow to split USDC. Each run is started manually
              from the Flow Builder — no background monitoring yet.
            </EmptyDescription>
            <EmptyAction>
              <Link href="/app/flows/new">
                <Button variant="outline">
                  <Plus />
                  Create your first flow
                </Button>
              </Link>
            </EmptyAction>
          </Empty>

          {/* Template — clearly labeled, not deployed */}
          <Card variant="compact" className="mt-6">
            <CardBody className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Layers className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{templateFlow.name}</h3>
                      <Badge variant="accent">Template</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{templateFlow.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">
                        Trigger: <span className="text-foreground">{templateFlow.trigger}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Condition: <span className="text-foreground">{templateFlow.condition}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Actions:{" "}
                        {templateFlow.actions.map((action, i) => (
                          <span key={action.label} className="text-foreground">
                            {action.percentage}% → {action.label}
                            {i < templateFlow.actions.length - 1 && (
                              <span className="text-muted-foreground"> · </span>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
                <Link href="/app/flows/new" className="shrink-0">
                  <Button variant="ghost" size="sm">
                    Use template
                    <ArrowRight />
                  </Button>
                </Link>
              </div>
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Shield className="mr-1.5 inline size-3.5 -translate-y-px" />
                This template has not been deployed. Click &lsquo;Create Flow&rsquo; to customize and
                deploy your own version.
              </p>
            </CardBody>
          </Card>
        </CardBody>
      </Card>

      <footer className="mt-8 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          ArcFlow
        </span>
        <span>Build rules. Split money on Arc.</span>
      </footer>
    </div>
  );
}
