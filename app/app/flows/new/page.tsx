"use client";

import { FlowBuilder } from "@/components/arcflow/flow-builder";
import { AppHeader } from "@/components/arcflow/app-header";
import { CardBody } from "@/components/card";
import { Providers } from "@/components/providers";
import type { Flow } from "@/types/flow";

export default function NewFlowPage() {
  const handleActivate = (flow: Flow) => {
    console.log("Flow ready for deployment:", flow);
    // In Phase 2, this will deploy the smart contract
    alert("Flow validated! Ready for deployment in Phase 2.");
  };

  return (
    <Providers>
      <div className="dot-grid-bg flex min-h-full flex-col font-mono">
        <AppHeader />

        <main className="w-full flex-1">
          <div className="w-full px-6 pb-16 lg:px-12">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="font-mono font-bold text-2xl lg:text-3xl tracking-[0.1em] uppercase text-foreground">Create Flow</h1>
              <p className="mt-1 text-xs text-muted-foreground font-mono">Build a programmable money workflow in three steps</p>
            </div>

            {/* Flow Builder */}
            <div className="border-2 border-foreground">
              <CardBody className="p-6 lg:p-8">
                <FlowBuilder onActivate={handleActivate} />
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
    </Providers>
  );
}