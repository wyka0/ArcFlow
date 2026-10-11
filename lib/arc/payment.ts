import { encodeFunctionData, type Address, type Hex, type PublicClient } from "viem";

import type { EvmAddress, PaymentRequest, TransactionHash } from "@/types";

import { getActiveArcNetwork, type ArcNetwork } from "./network";
import { USDC_ABI } from "./usdc";

/** USDC ERC-20 interface uses 6 decimals. Never the 18-decimal native gas token. */
const USDC_DECIMALS = 6;

/** 10^(decimals - 2): amounts are validated to 2 decimals by the policy engine. */
const CENTS_TO_BASE_UNITS = 10n ** BigInt(USDC_DECIMALS - 2);

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * The single definition of a well-formed 32-byte transaction hash.
 *
 * Shared by the wallet sender (validating the wallet's response) and the
 * persistence validator, so the two can never disagree.
 */
export function isTransactionHash(value: unknown): value is TransactionHash {
  return typeof value === "string" && TX_HASH_PATTERN.test(value);
}

/**
 * Convert a USDC amount to 6-decimal base units using integer math only.
 *
 * The policy engine rounds to cents, so scaling from integer cents keeps this
 * exact and avoids floating point drift (0.1 + 0.2 style errors).
 */
export function toUsdcBaseUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("USDC amount must be a positive finite number.");
  }
  const cents = Math.round(amount * 100);
  return BigInt(cents) * CENTS_TO_BASE_UNITS;
}

export interface UsdcTransferEncoding {
  token: Address;
  recipient: Address;
  amountBaseUnits: bigint;
  data: Hex;
  value: bigint;
}

/**
 * Encode an ERC-20 `transfer(address,uint256)` call against the configured Arc
 * USDC contract. Pure — no wallet, no network.
 */
export function encodeUsdcTransfer(input: {
  recipient: EvmAddress;
  amount: number;
  network?: ArcNetwork;
}): UsdcTransferEncoding {
  const network = input.network ?? getActiveArcNetwork();
  const amountBaseUnits = toUsdcBaseUnits(input.amount);
  const recipient = input.recipient as Address;

  return {
    token: network.usdcAddress,
    recipient,
    amountBaseUnits,
    data: encodeFunctionData({
      abi: USDC_ABI,
      functionName: "transfer",
      args: [recipient, amountBaseUnits],
    }),
    value: 0n,
  };
}

export interface PreparedUsdcPayment {
  request: PaymentRequest;
  chainId: number;
  /** The USDC ERC-20 contract. */
  to: Address;
  recipient: Address;
  amountBaseUnits: bigint;
  data: Hex;
  value: bigint;
}

/** Build the unsigned call a wallet must submit. No key, no submission. */
export function prepareUsdcPayment(
  request: PaymentRequest,
  network: ArcNetwork = getActiveArcNetwork(),
): PreparedUsdcPayment {
  if (request.currency !== "USDC" || request.amount.currency !== "USDC") {
    throw new Error("Only USDC payments are supported.");
  }

  const encoding = encodeUsdcTransfer({
    recipient: request.recipient,
    amount: request.amount.amount,
    network,
  });

  return {
    request,
    chainId: network.chainId,
    to: encoding.token,
    recipient: encoding.recipient,
    amountBaseUnits: encoding.amountBaseUnits,
    data: encoding.data,
    value: encoding.value,
  };
}

export type ReceiptFailureReason = "TRANSACTION_REVERTED" | "RPC_UNAVAILABLE";

export type UsdcReceiptOutcome =
  | { ok: true; transactionHash: TransactionHash; blockNumber: bigint }
  | { ok: false; reason: ReceiptFailureReason; message: string };

/**
 * Classify a transaction receipt. Pure: a receipt only counts as confirmed when
 * the chain reports `status === "success"`.
 */
export function classifyReceipt(receipt: {
  transactionHash: string;
  status: "success" | "reverted";
  blockNumber: bigint;
}): UsdcReceiptOutcome {
  if (receipt.status !== "success") {
    return {
      ok: false,
      reason: "TRANSACTION_REVERTED",
      message: "The Arc transaction was mined but reverted. No payment was recorded.",
    };
  }
  return {
    ok: true,
    transactionHash: receipt.transactionHash as TransactionHash,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Wait for the real Arc receipt and classify it.
 *
 * Never reports success on an RPC failure or a missing receipt.
 */
export async function verifyUsdcTransaction(
  client: PublicClient,
  transactionHash: TransactionHash,
  options: { confirmations?: number } = {},
): Promise<UsdcReceiptOutcome> {
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: options.confirmations ?? 1,
    });
    return classifyReceipt(receipt);
  } catch {
    return {
      ok: false,
      reason: "RPC_UNAVAILABLE",
      message:
        "The transaction was submitted but its Arc receipt could not be confirmed. It is not marked confirmed.",
    };
  }
}
