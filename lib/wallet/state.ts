import type { Address } from "viem";

export type WalletAvailability = "unknown" | "detected" | "not-detected";

export type WalletConnectionStatus = "disconnected" | "connecting" | "connected";

export type WalletErrorCode =
  | "WALLET_NOT_DETECTED"
  | "USER_REJECTED"
  | "CONNECTION_FAILED"
  | "MALFORMED_ACCOUNT"
  | "CHAIN_SWITCH_FAILED"
  | "UNKNOWN";

export interface WalletError {
  code: WalletErrorCode;
  message: string;
}

export interface WalletState {
  availability: WalletAvailability;
  status: WalletConnectionStatus;
  address: Address | null;
  chainId: number | null;
  error: WalletError | null;
}

export const initialWalletState: WalletState = {
  availability: "unknown",
  status: "disconnected",
  address: null,
  chainId: null,
  error: null,
};

/** Thrown by the wallet client with a typed, human-readable error code. */
export class WalletClientError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletClientError";
    this.code = code;
  }
}

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Parses an EIP-1193 chain id (hex string or number) into a number. */
export function parseChainId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function getProviderErrorCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
    if (typeof code === "string") {
      const parsed = Number.parseInt(code, 10);
      return Number.isInteger(parsed) ? parsed : null;
    }
  }
  return null;
}

const WALLET_ERROR_CODES: readonly WalletErrorCode[] = [
  "WALLET_NOT_DETECTED",
  "USER_REJECTED",
  "CONNECTION_FAILED",
  "MALFORMED_ACCOUNT",
  "CHAIN_SWITCH_FAILED",
  "UNKNOWN",
];

/** Normalises any thrown value into a typed, user-safe wallet error. */
export function toWalletError(error: unknown): WalletError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && (WALLET_ERROR_CODES as readonly string[]).includes(code)) {
      const message = "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "The wallet request could not be completed.";
      return { code: code as WalletErrorCode, message };
    }
  }

  const providerCode = getProviderErrorCode(error);
  if (providerCode === 4001) {
    return { code: "USER_REJECTED", message: "Request rejected in the wallet." };
  }
  if (providerCode === -32002) {
    return {
      code: "CONNECTION_FAILED",
      message: "A wallet request is already pending. Open your wallet to continue.",
    };
  }

  return { code: "UNKNOWN", message: "The wallet request could not be completed." };
}
