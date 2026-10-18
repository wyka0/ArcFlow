"use client";

import { FlowBuilder } from "@/components/arcflow/flow-builder";

export default function NewFlowPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create Flow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a programmable money workflow in three steps
        </p>
      </div>

      {/* Flow builder — editor and preview are the two primary surfaces; the
          builder supplies its own integrated editor card. */}
      <FlowBuilder />
    </div>
  );
}
