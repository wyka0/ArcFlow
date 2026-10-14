import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { AppShell } from "@/components/arcflow/app-shell";

export default function ActivityLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
