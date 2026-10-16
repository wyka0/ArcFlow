/**
 * Phase 33 — initial render states for the read-only flow views (P1).
 *
 * Proves that, when the contract address is absent, the not-configured state is
 * the *initial* state (so SSR and the first client render show it immediately,
 * with no loading flash), while the configured path is unchanged. Determinism
 * across repeated calls is asserted as a proxy for SSR/client agreement.
 */
import { describe, expect, it } from "vitest";

import { initialFlowDetailState, initialFlowListState } from "@/lib/arcflow/flow-state";

describe("initialFlowListState", () => {
  it("renders the not-configured state immediately when the address is absent", () => {
    const state = initialFlowListState(false);
    expect(state.kind).toBe("config-missing");
    expect(state.kind).not.toBe("loading"); // no misleading spinner first
  });

  it("keeps the loading state when the address is configured (unchanged)", () => {
    expect(initialFlowListState(true).kind).toBe("loading");
  });

  it("is deterministic for the same configuration (SSR/client agreement proxy)", () => {
    expect(initialFlowListState(false)).toEqual(initialFlowListState(false));
    expect(initialFlowListState(true)).toEqual(initialFlowListState(true));
  });
});

describe("initialFlowDetailState", () => {
  it("renders the not-configured state immediately for a valid id when unconfigured", () => {
    const state = initialFlowDetailState(false, 0n);
    expect(state.kind).toBe("config-missing");
    expect(state.kind).not.toBe("loading");
  });

  it("keeps the loading state for a valid id when configured (unchanged)", () => {
    expect(initialFlowDetailState(true, 0n).kind).toBe("loading");
    expect(initialFlowDetailState(true, 12n).kind).toBe("loading");
  });

  it("shows the invalid-id state for an invalid id, even when unconfigured", () => {
    expect(initialFlowDetailState(false, null).kind).toBe("invalid-id");
  });

  it("shows the invalid-id state for an invalid id when configured", () => {
    expect(initialFlowDetailState(true, null).kind).toBe("invalid-id");
  });

  it("prioritises invalid-id over the missing-configuration state", () => {
    // Invalid input is a pure error and must win regardless of configuration.
    expect(initialFlowDetailState(false, null)).toEqual(initialFlowDetailState(true, null));
  });

  it("is deterministic for the same inputs (SSR/client agreement proxy)", () => {
    expect(initialFlowDetailState(false, 1n)).toEqual(initialFlowDetailState(false, 1n));
    expect(initialFlowDetailState(true, 1n)).toEqual(initialFlowDetailState(true, 1n));
  });
});
