import { defineChain, type Chain } from "viem";

/**
 * Authoritative Arc network configuration.
 *
 * Every Arc-specific constant lives in this one module. Values were verified
 * against the official Arc documentation on 2026-09-21:
 *
 *   - https://docs.arc.io/arc/references/connect-to-arc
 *   - https://docs.arc.io/arc/references/contract-addresses
 *
 * Verified values:
 *   Arc Mainnet  chainId 5042    rpc https://rpc.mainnet.arc.io     explorer https://explorer.arc.io
 *   Arc Testnet  chainId 5042002 rpc https://rpc.testnet.arc.io     explorer https://explorer.testnet.arc.io
 *   USDC ERC-20 0x3600000000000000000000000000000000000000 (6 decimals, same address on both networks)
 *
 * Arc uses USDC as its native gas token (18 decimals). The optional ERC-20
 * interface uses 6 decimals and shares the same underlying balance, so the UI
 * must show a single USDC balance and read via the ERC-20 interface.
 */

export type ArcNetworkId = "mainnet" | "testnet";

export interface ArcNetwork {
  id: ArcNetworkId;
  label: string;
  chain: Chain;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdcAddress: `0x${string}`;
  /** Decimals of the USDC ERC-20 interface used for balance reads. */
  usdcDecimals: number;
  /** Decimals of the native USDC gas token. Never mix with `usdcDecimals`. */
  nativeUsdcDecimals: number;
  testnet: boolean;
}

const ARC_USDC_ERC20_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_TESTNET_CHAIN_ID = 5042002;

function buildChain(params: {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerName: string;
  explorerUrl: string;
  testnet: boolean;
}): Chain {
  return defineChain({
    id: params.chainId,
    name: params.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [params.rpcUrl] } },
    blockExplorers: { default: { name: params.explorerName, url: params.explorerUrl } },
    testnet: params.testnet,
  });
}

export const ARC_MAINNET: ArcNetwork = {
  id: "mainnet",
  label: "Arc",
  chainId: ARC_MAINNET_CHAIN_ID,
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  usdcAddress: ARC_USDC_ERC20_ADDRESS,
  usdcDecimals: 6,
  nativeUsdcDecimals: 18,
  testnet: false,
  chain: buildChain({
    chainId: ARC_MAINNET_CHAIN_ID,
    name: "Arc",
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerName: "Arc Explorer",
    explorerUrl: "https://explorer.arc.io",
    testnet: false,
  }),
};

export const ARC_TESTNET: ArcNetwork = {
  id: "testnet",
  label: "Arc Testnet",
  chainId: ARC_TESTNET_CHAIN_ID,
  rpcUrl: "https://rpc.testnet.arc.io",
  explorerUrl: "https://explorer.testnet.arc.io",
  usdcAddress: ARC_USDC_ERC20_ADDRESS,
  usdcDecimals: 6,
  nativeUsdcDecimals: 18,
  testnet: true,
  chain: buildChain({
    chainId: ARC_TESTNET_CHAIN_ID,
    name: "Arc Testnet",
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerName: "Arc Testnet Explorer",
    explorerUrl: "https://explorer.testnet.arc.io",
    testnet: true,
  }),
};

export const ARC_NETWORKS: readonly ArcNetwork[] = [ARC_MAINNET, ARC_TESTNET];

/**
 * The network the application targets. Defaults to mainnet; set
 * `NEXT_PUBLIC_ARC_NETWORK=testnet` to target Arc Testnet.
 */
export function getConfiguredNetworkId(): ArcNetworkId {
  const raw = process.env.NEXT_PUBLIC_ARC_NETWORK?.trim().toLowerCase();
  return raw === "testnet" ? "testnet" : "mainnet";
}

export function getActiveArcNetwork(): ArcNetwork {
  return getConfiguredNetworkId() === "testnet" ? ARC_TESTNET : ARC_MAINNET;
}

export function getArcNetworkByChainId(chainId: number | null | undefined): ArcNetwork | null {
  if (typeof chainId !== "number") return null;
  return ARC_NETWORKS.find((network) => network.chainId === chainId) ?? null;
}

/** Optional RPC override (for example a dedicated provider) per network. */
export function getArcRpcUrl(network: ArcNetwork = getActiveArcNetwork()): string {
  const override = process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim();
  return override && override.length > 0 ? override : network.rpcUrl;
}

export function getExplorerAddressUrl(
  address: string,
  network: ArcNetwork = getActiveArcNetwork(),
): string {
  return `${network.explorerUrl}/address/${address}`;
}

export function getExplorerTxUrl(
  transactionHash: string,
  network: ArcNetwork = getActiveArcNetwork(),
): string {
  return `${network.explorerUrl}/tx/${transactionHash}`;
}

/** EIP-3085 params used when a user explicitly asks to add/switch to Arc. */
export function getWalletChainParams(network: ArcNetwork) {
  return {
    chainId: `0x${network.chainId.toString(16)}`,
    chainName: network.label,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: network.nativeUsdcDecimals },
    rpcUrls: [getArcRpcUrl(network)],
    blockExplorerUrls: [network.explorerUrl],
  };
}
