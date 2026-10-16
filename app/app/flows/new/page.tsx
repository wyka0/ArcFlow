"use client";

import { FlowBuilder } from "@/components/arcflow/flow-builder";
import { Card } from "@/components/card";

export default function NewFlowPage() {
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
        <FlowBuilder />
      </Card>
    </div>
  );
}
