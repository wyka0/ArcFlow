import type { EvmAddress, TokenAmount, TransactionHash } from "./money";

/**
 * A verified ArcFlow `executeSplit` execution.
 *
 * This is the authoritative record for a flow execution. It exists only after
 * the server independently verified a successful receipt from the configured
 * ArcFlow contract: exactly one `FlowExecuted` event, the owner-only sender,
 * the split arithmetic, and the exact expected USDC transfers. Client-supplied
 * amounts, recipients, and flow ids are never trusted.
 *
 * Flow executions are recorded separately from agent-service payments and
 * never affect agent spending calculations.
 */
export interface FlowExecutionRecord {
  /** Discriminator: distinguishes flow executions from agent-service payments. */
  kind: "flow_execution";
  id: string;
  txHash: TransactionHash;
  chainId: number;
  /** The configured ArcFlow contract that emitted the event. */
  contractAddress: EvmAddress;
  /** Flow id as a decimal string (JSON-safe; large ids never lose precision). */
  flowId: string;
  /** The on-chain flow owner — the wallet that may see this record. */
  ownerWalletAddress: EvmAddress;
  /** The transaction sender (the flow owner: `executeSplit` is owner-only). */
  sender: EvmAddress;
  /** The USDC ERC-20 contract address. */
  tokenAddress: EvmAddress;
  treasury: EvmAddress;
  treasuryAmount: TokenAmount;
  /** Exact treasury amount in USDC base units (6 decimals). */
  treasuryAmountBaseUnits: string;
  contributor: EvmAddress;
  contributorAmount: TokenAmount;
  /** Exact contributor amount in USDC base units (6 decimals). */
  contributorAmountBaseUnits: string;
  totalAmount: TokenAmount;
  /** Exact total split amount in USDC base units (6 decimals). */
  totalAmountBaseUnits: string;
  status: "confirmed";
  /** Block number as a decimal string so the record is JSON-safe. */
  blockNumber: string;
  confirmedAt: string;
  createdAt: string;
}

/**
 * Derive the display amount from verified base units.
 *
 * Base-unit strings are the source of truth; the numeric form exists only for
 * display compatibility with `TokenAmount` consumers.
 */
export function usdcTokenAmountFromBaseUnits(baseUnits: string): TokenAmount {
  return { amount: Number(baseUnits) / 1_000_000, currency: "USDC" };
}
