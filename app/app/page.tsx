"use client";

import { Dashboard } from "@/components/arcflow/dashboard";
import { Providers } from "@/components/providers";

export default function AppPage() {
  return (
    <Providers>
      <Dashboard />
    </Providers>
  );
}