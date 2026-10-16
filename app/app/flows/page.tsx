"use client";

import Link from "next/link";
import { Layers, Plus, Workflow } from "lucide-react";

import { Card, CardBody } from "@/components/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@/components/ui/empty";

export default function FlowsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Flows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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

      {/* Flow list */}
      <Card>
        <CardBody className="p-5 lg:p-6">
          {/* Empty state — no flows exist yet */}
          <Empty>
            <EmptyIcon>
              <Workflow />
            </EmptyIcon>
            <EmptyTitle>No flows configured yet</EmptyTitle>
            <EmptyDescription>
              Create your first workflow to split USDC. Each run is started manually from the
              Flow Builder — no background monitoring yet.
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
                      <h3 className="font-semibold text-foreground">Revenue Split</h3>
                      <Badge variant="accent">Template</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Configured threshold ≥ 10 USDC · split 80% to Treasury and 20% to Contributor
                      on execution
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">
                        Trigger: <span className="text-foreground">Payment Received</span>
                      </span>
                      <span className="text-muted-foreground">
                        Condition: <span className="text-foreground">≥ 10 USDC</span>
                      </span>
                      <span className="text-muted-foreground">
                        Actions: <span className="text-foreground">80% → Treasury</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-foreground">20% → Contributor</span>
                      </span>
                    </div>
                  </div>
                </div>
                <Link href="/app/flows/new" className="shrink-0">
                  <Button variant="ghost" size="sm">
                    Use template
                  </Button>
                </Link>
              </div>
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                This template has not been deployed. Click &lsquo;Create Flow&rsquo; to customize
                and deploy your own version.
              </p>
            </CardBody>
          </Card>
        </CardBody>
      </Card>

      <footer className="mt-8 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
        <span className="font-medium text-foreground">ArcFlow</span>
        <span>Build rules. Split money on demand. On Arc.</span>
      </footer>
    </div>
  );
}
