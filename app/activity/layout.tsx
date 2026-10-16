import type { ReactNode } from "react";

import { AgentPayProviders, Providers } from "@/components/providers";
import { AppShell } from "@/components/arcflow/app-shell";

export default function ActivityLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AgentPayProviders>
        <AppShell>{children}</AppShell>
      </AgentPayProviders>
    </Providers>
  );
}
