/**
 * Phase 37 — provider scoping.
 *
 * The AgentPay-only providers (TrustedLedger/Payments/PaymentFlow) must not mount
 * on the ArcFlow flow routes. These are source-level assertions (the same style
 * as `architecture.test.ts`) because the repository has no DOM test environment.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p: string) => readFileSync(root + p, "utf8");

const AGENTPAY = ["TrustedLedgerProvider", "PaymentsProvider", "PaymentFlowProvider"];

describe("providers.tsx — scope split", () => {
  const src = read("components/providers.tsx");

  it("exports both Providers and AgentPayProviders", () => {
    expect(src).toMatch(/export function Providers\b/);
    expect(src).toMatch(/export function AgentPayProviders\b/);
  });

  it("the shared Providers mounts only Wallet + Auth", () => {
    // Isolate the Providers body.
    const shared = src.slice(src.indexOf("export function Providers"), src.indexOf("export function AgentPayProviders"));
    expect(shared).toContain("WalletProvider");
    expect(shared).toContain("AuthProvider");
    for (const name of AGENTPAY) {
      expect(shared).not.toContain(`<${name}`);
    }
  });

  it("AgentPayProviders nests TrustedLedger → Payments → PaymentFlow (order preserved)", () => {
    const agent = src.slice(src.indexOf("export function AgentPayProviders"));
    const iLedger = agent.indexOf("<TrustedLedgerProvider");
    const iPayments = agent.indexOf("<PaymentsProvider");
    const iFlow = agent.indexOf("<PaymentFlowProvider");
    expect(iLedger).toBeGreaterThan(-1);
    expect(iPayments).toBeGreaterThan(iLedger);
    expect(iFlow).toBeGreaterThan(iPayments);
  });
});

describe("route layouts — where the providers mount", () => {
  it("the ArcFlow /app layout does NOT mount AgentPayProviders", () => {
    const src = read("app/app/layout.tsx");
    expect(src).not.toContain("AgentPayProviders");
    for (const name of AGENTPAY) {
      expect(src).not.toContain(name);
    }
  });

  it("the Activity layout mounts AgentPayProviders inside Providers", () => {
    const src = read("app/activity/layout.tsx");
    expect(src).toContain("AgentPayProviders");
    expect(src.indexOf("<Providers>")).toBeLessThan(src.indexOf("<AgentPayProviders>"));
  });

  it("the root layout keeps only the shared Providers (wallet + auth)", () => {
    const src = read("app/layout.tsx");
    expect(src).toContain("<Providers>");
    expect(src).not.toContain("AgentPayProviders");
  });
});
