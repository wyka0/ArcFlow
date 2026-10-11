export type Currency = "USDC";

export type TransactionHash = `0x${string}`;

/** A 20-byte EVM address. Kept framework-free so `types/` has no dependencies. */
export type EvmAddress = `0x${string}`;

export interface TokenAmount {
  amount: number;
  currency: Currency;
}
