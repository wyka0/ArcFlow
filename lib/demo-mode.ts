/**
 * Demo mode configuration for AgentPay.
 *
 * This module provides a safe, explicit opt-in mechanism for simulating
 * payment completion in development/test environments WITHOUT executing
 * real blockchain transactions.
 *
 * CRITICAL SECURITY RULES:
 * - Demo mode MUST be explicitly enabled via environment variable
 * - Demo mode is REJECTED in production (NODE_ENV=production)
 * - Demo mode endpoints are NOT exposed in production builds
 * - No way for external agents to trigger demo mode themselves
 * - Demo mode still exercises: authentication, policy, ownership, state transitions
 */
export type DemoModeStatus = "enabled" | "disabled" | "production-blocked";

let cachedStatus: DemoModeStatus | null = null;

export function getDemoModeStatus(): DemoModeStatus {
  if (cachedStatus !== null) return cachedStatus;

  const isProduction = process.env.NODE_ENV === "production";
  const demoModeEnabled = process.env.AGENTPAY_DEMO_MODE === "true";

  if (isProduction) {
    cachedStatus = "production-blocked";
    return cachedStatus;
  }

  if (demoModeEnabled) {
    cachedStatus = "enabled";
    return cachedStatus;
  }

  cachedStatus = "disabled";
  return cachedStatus;
}

export function isDemoModeEnabled(): boolean {
  return getDemoModeStatus() === "enabled";
}

export function assertDemoMode(): void {
  const status = getDemoModeStatus();
  if (status !== "enabled") {
    throw new Error(
      status === "production-blocked"
        ? "Demo mode is disabled in production."
        : "Demo mode is not enabled. Set AGENTPAY_DEMO_MODE=true to enable.",
    );
  }
}

/** Test seam. */
export function setDemoModeStatusForTesting(status: DemoModeStatus | null): void {
  cachedStatus = status;
}