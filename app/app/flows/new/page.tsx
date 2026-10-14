"use client";

import { FlowBuilder } from "@/components/arcflow/flow-builder";
import { Card } from "@/components/card";
import type { Flow } from "@/types/flow";

export default function NewFlowPage() {
  const handleActivate = (flow: Flow) => {
    console.log("Flow ready for deployment:", flow);
    // In Phase 2, this will deploy the smart contract
    alert("Flow validated! Ready for deployment in Phase 2.");
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Flow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a programmable money workflow in three steps
        </p>
      </div>

      {/* Flow builder */}
      <Card>
        <FlowBuilder onActivate={handleActivate} />
      </Card>
    </div>
  );
}
