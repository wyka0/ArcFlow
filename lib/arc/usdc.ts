import { erc20Abi, formatUnits, type Address, type PublicClient } from "viem";

import type { ArcNetwork } from "./network";

/** Minimal ERC-20 surface used to read the USDC balance. */
export const USDC_ABI = erc20Abi;

/**
 * The ERC-20 surface needed to read USDC transfers out of a receipt.
 *
 * Kept explicit (rather than reusing `erc20Abi`) so server-side verification
 * decoding is stable and self-describing.
 */
export const ARC_ABI_PAYMENT_RECEIPT = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export type UsdcBalanceErrorCode =
  | "ARC_NOT_CONFIGURED"
  | "RPC_UNAVAILABLE"
  | "CONTRACT_READ_FAILED"
  | "INVALID_ACCOUNT";

export interface UsdcBalance {
  address: Address;
  amount: bigint;
  formatted: string;
  decimals: number;
  blockNumber: bigint;
  readAt: string;
}

export interface UsdcBalanceError {
  code: UsdcBalanceErrorCode;
  message: string;
}

/**
 * A discriminated result. A failed read is never `ok: true`, so callers can
 * never accidentally render a failure as a zero balance.
 */
export type UsdcBalanceResult =
  | { ok: true; value: UsdcBalance }
  | { ok: false; error: UsdcBalanceError };

/** Format base units into a canonical decimal string, e.g. 1500000n -> "1.500000". */
export function formatUsdcUnits(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Format base units for display: grouped thousands, at least two decimals, at
 * most `maxDecimals` significant decimals. Pure string math so arbitrarily
 * large balances never lose precision.
 */
export function formatUsdcDisplay(amount: bigint, decimals: number, maxDecimals = 6): string {
  const raw = formatUnits(amount, decimals);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = unsigned.split(".");

  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  const displayFraction = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${groupedWhole}.${displayFraction}`;
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

/**
 * Maps an arbitrary read failure to a human-readable, typed error. Raw RPC
 * messages are never surfaced to the UI.
 */
export function classifyUsdcError(error: unknown): UsdcBalanceError {
  const name = errorName(error);
  if (/http|fetch|timeout|network|socket|connection/i.test(name)) {
    return {
      code: "RPC_UNAVAILABLE",
      message: "Could not reach the Arc RPC endpoint. Balance unavailable.",
    };
  }
  return {
    code: "CONTRACT_READ_FAILED",
    message: "The Arc USDC contract read failed. Balance unavailable.",
  };
}

export type UsdcReadOutcome =
  | { ok: true; baseUnits: bigint; blockNumber: bigint }
  | { ok: false; error: unknown };

/**
 * Pure settlement of a read outcome. This is the single place where a read
 * becomes UI state, and it never converts a failure into a zero balance.
 */
export function settleUsdcRead(
  outcome: UsdcReadOutcome,
  context: { address: Address; decimals: number; now?: Date },
): UsdcBalanceResult {
  if (!outcome.ok) {
    return { ok: false, error: classifyUsdcError(outcome.error) };
  }

  return {
    ok: true,
    value: {
      address: context.address,
      amount: outcome.baseUnits,
      formatted: formatUsdcDisplay(outcome.baseUnits, context.decimals),
      decimals: context.decimals,
      blockNumber: outcome.blockNumber,
      readAt: (context.now ?? new Date()).toISOString(),
    },
  };
}

/**
 * Reads the connected account's USDC balance via the Arc USDC ERC-20 interface.
 *
 * Return `{ ok: false }` on any failure — callers must render an "unavailable"
 * state, never `0 USDC`.
 */
export async function readUsdcBalance(input: {
  client: PublicClient;
  network: ArcNetwork;
  address: Address;
  now?: Date;
}): Promise<UsdcBalanceResult> {
  const { client, network, address, now } = input;

  if (!network.usdcAddress) {
    return {
      ok: false,
      error: { code: "ARC_NOT_CONFIGURED", message: "Arc USDC address is not configured." },
    };
  }

  try {
    const [baseUnits, blockNumber] = await Promise.all([
      client.readContract({
        address: network.usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [address],
      }),
      client.getBlockNumber(),
    ]);

    return settleUsdcRead({ ok: true, baseUnits, blockNumber }, { address, decimals: network.usdcDecimals, now });
  } catch (error) {
    return settleUsdcRead({ ok: false, error }, { address, decimals: network.usdcDecimals, now });
  }
}
