import Link from "next/link";
import { Plus } from "lucide-react";

import { Card, CardBody } from "@/components/card";
import { Button } from "@/components/ui/button";
import { FlowList } from "@/components/arcflow/flow-list";

export default function FlowsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Flows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Flows read directly from the deployed ArcFlow contract on Arc mainnet
          </p>
        </div>
        <Link href="/app/flows/new" className="sm:shrink-0">
          <Button>
            <Plus />
            Create Flow
          </Button>
        </Link>
      </div>

      {/* On-chain flow list (read-only) */}
      <Card>
        <CardBody className="p-5 lg:p-6">
          <FlowList />
        </CardBody>
      </Card>

      <footer className="mt-8 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
        <span className="font-medium text-foreground">ArcFlow</span>
        <span>Build rules. Split money on demand. On Arc.</span>
      </footer>
    </div>
  );
}
