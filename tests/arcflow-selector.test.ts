/**
 * Phase 10.8 Blocker 1 — Selector regression tests (frontend side).
 *
 * Proves:
 *  - viem's keccak256 is Ethereum keccak-256 (NOT NIST SHA3-256) via known vectors
 *  - the canonical 14-param signature derives 0x6d200078
 *  - ARCFLOW_V2_ABI encodes calldata beginning with that same selector
 *  - 0x00e10fab (Phase 10.6 brief expectation) is NOT the canonical selector
 */
import { describe, expect, it } from "vitest";
import { keccak256, toHex, encodeFunctionData, pad } from "viem";

import { ARCFLOW_V2_ABI } from "@/lib/arcflow/contract";

const CANONICAL_SIG =
  "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)";

const CANONICAL_SELECTOR = "0x6d200078";
const PHASE106_EXPECTED = "0x00e10fab";

function selectorOf(sig: string): `0x${string}` {
  return keccak256(toHex(sig)).slice(0, 10) as `0x${string}`;
}

describe("Phase 10.8 — keccak-256 (not SHA3-256) implementation vectors", () => {
  it("hashes the empty string to the canonical keccak-256 digest", () => {
    expect(keccak256(toHex(""))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("hashes 'abc' to the canonical keccak-256 digest (SHA3-256 would differ)", () => {
    expect(keccak256(toHex("abc"))).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });

  it("reproduces Circle's published TransferWithAuthorization typehash", () => {
    expect(
      keccak256(
        toHex(
          "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
        ),
      ),
    ).toBe("0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267");
  });
});

describe("Phase 10.8 — canonical executeSplitWithDualAuth selector", () => {
  it("derives 0x6d200078 from the canonical 14-parameter signature", () => {
    expect(selectorOf(CANONICAL_SIG)).toBe(CANONICAL_SELECTOR);
  });

  it("does NOT derive the Phase 10.6 expectation 0x00e10fab", () => {
    expect(selectorOf(CANONICAL_SIG)).not.toBe(PHASE106_EXPECTED);
  });

  it("ARCFLOW_V2_ABI calldata begins with the canonical selector", () => {
    const data = encodeFunctionData({
      abi: ARCFLOW_V2_ABI,
      functionName: "executeSplitWithDualAuth",
      args: [
        0n, 1n, 0n, 1n,
        pad("0x00", { size: 32 }), 27, pad("0x00", { size: 32 }), pad("0x00", { size: 32 }),
        0n, 1n, pad("0x00", { size: 32 }), 27, pad("0x00", { size: 32 }), pad("0x00", { size: 32 }),
      ],
    });
    expect(data.slice(0, 10)).toBe(CANONICAL_SELECTOR);
  });
});
