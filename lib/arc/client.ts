import { createPublicClient, http, type PublicClient, type Transport } from "viem";

import { getActiveArcNetwork, getArcRpcUrl, type ArcNetwork } from "./network";

/**
 * Builds a read-only Arc client.
 *
 * The transport is injectable so the wallet session can route reads through the
 * connected injected wallet (avoiding provider CORS issues) while the default
 * remains a direct HTTP connection to the documented Arc RPC endpoint. Either
 * way the client is read-only.
 */
export function createArcReadClient(
  network: ArcNetwork = getActiveArcNetwork(),
  transport?: Transport,
): PublicClient {
  return createPublicClient({
    chain: network.chain,
    transport: transport ?? http(getArcRpcUrl(network)),
  });
}
