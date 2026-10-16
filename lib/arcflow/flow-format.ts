/**
 * Phase 25 — presentation helpers for V1 on-chain flow data.
 *
 * Pure functions only. Contract values (basis points, 6-decimal USDC base
 * units) are converted to display strings exclusively here, so the data layer
 * keeps its exact on-chain representation.
 */

import { formatUsdcDisplay } from "@/lib/arc/usdc";

/**
 * Contract basis points (0–10000) → display percentage.
 * `8000 → "80%"`, `8050 → "80.5%"`.
 */
export function formatBasisPointsPercent(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const percent = bps / 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${rounded}%`;
}

/**
 * USDC 6-decimal base units → display amount with the `USDC` suffix.
 * `10000n → "0.01 USDC"`. Negative values are clamped to zero (never shown).
 */
export function formatFlowUsdc(baseUnits: bigint): string {
  const safe = baseUnits < 0n ? 0n : baseUnits;
  return `${formatUsdcDisplay(safe, 6)} USDC`;
}

/** Human label for a flow's on-chain `active` flag. */
export function flowStatusLabel(active: boolean): string {
  return active ? "Active" : "Paused";
}

/**
 * Parse a route/param flow id. Returns `null` for anything that is not a
 * non-negative integer (so the caller can render an explicit invalid state).
 */
export function parseFlowId(raw: string | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const value = BigInt(trimmed);
    return value >= 0n ? value : null;
  } catch {
    return null;
  }
}

/** Shorten an address for inline display (`0x1234…abcd`). */
export function shortenFlowAddress(address: string): string {
  if (typeof address !== "string" || address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
