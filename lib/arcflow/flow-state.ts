/**
 * Phase 33 — initial render states for the read-only flow views.
 *
 * The contract address is a build-time constant (`NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS`),
 * so when it is absent the correct UI state is known at render time. Deriving the
 * initial state here lets the server-rendered HTML and the first client render agree:
 * the not-configured notice is shown immediately instead of a misleading loading
 * spinner that clears only after hydration.
 *
 * Runtime validation is unchanged — the read functions still fail closed, and the
 * loaders still re-check configuration before any RPC call.
 */

import type { ContractFlow } from "./interactions";

export type FlowListState =
  | { kind: "config-missing" }
  | { kind: "no-wallet" }
  | { kind: "wrong-network" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "loaded"; flows: { id: bigint; flow: ContractFlow }[] };

export type FlowDetailState =
  | { kind: "invalid-id" }
  | { kind: "config-missing" }
  | { kind: "loading" }
  | { kind: "not-found"; message: string }
  | { kind: "error"; message: string }
  | { kind: "loaded"; flowId: bigint; flow: ContractFlow };

/** Initial list state: the not-configured notice when the address is absent. */
export function initialFlowListState(configured: boolean): FlowListState {
  return configured ? { kind: "loading" } : { kind: "config-missing" };
}

/**
 * Initial detail state. An invalid ID takes precedence (it is a pure input
 * error); then a missing configuration; otherwise loading.
 */
export function initialFlowDetailState(configured: boolean, flowId: bigint | null): FlowDetailState {
  if (flowId === null) return { kind: "invalid-id" };
  if (!configured) return { kind: "config-missing" };
  return { kind: "loading" };
}
