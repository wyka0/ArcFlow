import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";

import {
  buildUSDCTransferWithAuthorizationSignMessage,
  computeUSDCAuthorizationDigest,
  parseEIP712Signature,
  verifyUSDCAuthorization,
  verifyUSDCAuthorizationDigest,
} from "@/lib/arcflow/authorization/arc-usdc-eip3009";
import {
  ARC_USDC_DOMAIN_SEPARATOR,
  requireArcFlowV2ContractAddress,
  isArcFlowV2AddressConfigured,
  ARCFLOW_V2_FORBIDDEN_PREDECESSOR,
} from "@/lib/arcflow/authorization/authorization-types";
import {
  buildArcFlowV2ExecuteTypedDataMessage,
} from "@/lib/arcflow/authorization/arcflow-eip712";
import {
  computeArcFlowV2AuthorizationDigest,
  verifyArcFlowV2Authorization,
} from "@/lib/arcflow/authorization/authorization-recovery";
import { ARC_MAINNET } from "@/lib/arc/network";
import {
  getArcFlowV2ContractAddress,
  isArcFlowV2Configured,
} from "@/lib/arcflow/contract";

/**
 * Phase 21.1 — clean-build remediation tests for the authorization modules.
 *
 * These tests close the gap that let viem 2.56.8 type errors hide: they
 * exercise the real sign → digest → recover chain with a throwaway key
 * (generated fresh per run — no key material is committed), plus explicit
 * failure paths (wrong signer, malformed/oversize components, invalid v,
 * unset V2 configuration).
 */

const V2_ENV_KEY = "NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS";
// Any well-formed 40-hex address works for digest construction in tests;
// this is an explicitly test-only stand-in, never a real deployment.
const TEST_V2_ADDRESS = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const USDC_PROXY = "0x3600000000000000000000000000000000000000";

function randomNonce(): `0x${string}` {
  return keccak256(toHex(`${Date.now()}-${Math.random()}-nonce`));
}

function splitSignature(signature: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const parsed = (
    {
      r: signature.slice(0, 66) as `0x${string}`,
      s: `0x${signature.slice(66, 130)}` as `0x${string}`,
      v: parseInt(signature.slice(130, 132), 16),
    }
  );
  return parsed;
}

describe("ArcFlow authorization signing and recovery (Phase 21.1)", () => {
  let privateKey: `0x${string}`;
  let account: ReturnType<typeof privateKeyToAccount>;

  beforeEach(() => {
    privateKey = generatePrivateKey();
    account = privateKeyToAccount(privateKey);
  });

  describe("USDC EIP-3009", () => {
    it("signs with the documented domain and recovers the signer from the computed digest", async () => {
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 10_000n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: randomNonce(),
      };

      // The sign-message builder must produce types consistent with the
      // 6-field on-chain typehash (no v/r/s in the signed struct).
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });
      const components = splitSignature(signature);

      const digest = computeUSDCAuthorizationDigest(params);
      const recovered = await verifyUSDCAuthorizationDigest(digest, components, account.address);
      expect(recovered).toBe(true);

      const full = await verifyUSDCAuthorization({ ...params, ...components }, account.address);
      expect(full).toBe(true);
    });

    it("rejects a signature from a different signer", async () => {
      const other = privateKeyToAccount(generatePrivateKey());
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 10_000n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: randomNonce(),
      };
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await other.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });
      const components = splitSignature(signature);

      const digest = computeUSDCAuthorizationDigest(params);
      expect(await verifyUSDCAuthorizationDigest(digest, components, account.address)).toBe(false);
      expect(await verifyUSDCAuthorization({ ...params, ...components }, account.address)).toBe(false);
    });

    it("fails closed on malformed signature components", async () => {
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 10_000n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: randomNonce(),
      };
      const digest = computeUSDCAuthorizationDigest(params);

      // Odd-length (unparseable) component.
      expect(
        await verifyUSDCAuthorizationDigest(digest, { v: 27, r: "0x123" as `0x${string}`, s: `0x${"ab".repeat(32)}` as `0x${string}` }, account.address),
      ).toBe(false);

      // Oversized (33-byte) component must be rejected, not truncated.
      expect(
        await verifyUSDCAuthorizationDigest(
          digest,
          { v: 27, r: `0x${"ab".repeat(33)}` as `0x${string}`, s: `0x${"ab".repeat(32)}` as `0x${string}` },
          account.address,
        ),
      ).toBe(false);

      // Invalid recovery id must fail closed.
      expect(
        await verifyUSDCAuthorizationDigest(
          digest,
          { v: 5, r: `0x${"ab".repeat(32)}` as `0x${string}`, s: `0x${"ab".repeat(32)}` as `0x${string}` },
          account.address,
        ),
      ).toBe(false);
    });

    it("returns a promise from the verification API", async () => {
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 1n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 60),
        nonce: randomNonce(),
      };
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });
      const components = splitSignature(signature);
      const pending = verifyUSDCAuthorization({ ...params, ...components }, account.address);
      expect(pending).toBeInstanceOf(Promise);
      expect(await pending).toBe(true);
    });

    it("pins the verified Arc USDC domain separator constant", () => {
      expect(ARC_USDC_DOMAIN_SEPARATOR).toBe(
        "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84",
      );
    });

    it("binds the USDC domain to the verified proxy in the signing builder", () => {
      const typedData = buildUSDCTransferWithAuthorizationSignMessage({
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 1n,
        validAfter: 0n,
        validBefore: 1n,
        nonce: randomNonce(),
      });
      expect(typedData.domain.name).toBe("USDC");
      expect(typedData.domain.version).toBe("2");
      expect(typedData.domain.chainId).toBe(5042);
      expect(typedData.domain.verifyingContract?.toLowerCase()).toBe(USDC_PROXY);
    });

    it("signs exactly the six-field on-chain struct (no v/r/s in the signed types)", () => {
      // Regression guard for the Phase 21.1 finding: v/r/s must never appear
      // in the SIGNED types, or wallets would sign a struct the contract's
      // six-field TransferWithAuthorization typehash can never verify.
      const typedData = buildUSDCTransferWithAuthorizationSignMessage({
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 1n,
        validAfter: 0n,
        validBefore: 1n,
        nonce: randomNonce(),
      });
      const fieldNames = typedData.types.TransferWithAuthorization.map((f) => f.name);
      expect(fieldNames).toEqual(["from", "to", "value", "validAfter", "validBefore", "nonce"]);
      expect(fieldNames).not.toContain("v");
      expect(fieldNames).not.toContain("r");
      expect(fieldNames).not.toContain("s");
    });

    it("accepts the yParity (0/1) recovery-id form as the equivalent 27/28 signature", async () => {
      // Mirrors real USDC's v<27 normalization (v += 27): the parity form of
      // a signature recovers the same signer locally. (Note: the ArcFlowV2
      // on-chain flow pre-check is stricter and only accepts 27/28 —
      // fail-closed on-chain — while real USDC normalizes like we do.)
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 10_000n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: randomNonce(),
      };
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });
      const components = splitSignature(signature);
      expect([27, 28]).toContain(components.v);

      // The same r/s with the parity form (v-27) recovers the same signer.
      const parityForm = { ...components, v: components.v - 27 };
      const digest = computeUSDCAuthorizationDigest(params);
      expect(await verifyUSDCAuthorizationDigest(digest, parityForm, account.address)).toBe(true);
    });
  });

  describe("ArcFlow V2", () => {
    afterEach(() => {
      delete process.env[V2_ENV_KEY];
    });

    it("recovers the signer for a configured V2 deployment (round-trip)", async () => {
      process.env[V2_ENV_KEY] = TEST_V2_ADDRESS;
      const params = {
        flowId: 0n,
        amount: 10_000n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: randomNonce(),
      };
      const typedData = buildArcFlowV2ExecuteTypedDataMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "ExecuteWithAuthorization",
        message: typedData.message,
      });
      const components = splitSignature(signature);

      const digest = computeArcFlowV2AuthorizationDigest(params);
      expect(await verifyArcFlowV2Authorization({ ...params, ...components }, account.address)).toBe(true);
    });

    it("fails closed when the V2 address is unset", async () => {
      delete process.env[V2_ENV_KEY];
      expect(() =>
        computeArcFlowV2AuthorizationDigest({
          flowId: 0n,
          amount: 1n,
          validAfter: 0n,
          validBefore: 1n,
          nonce: randomNonce(),
        }),
      ).toThrow(/ArcFlowV2 contract address is not configured/);
    });
  });

  describe("V2 address resolution (Phase 21.3 canonical resolver)", () => {
    afterEach(() => {
      delete process.env[V2_ENV_KEY];
    });

    it("rejects an unset address (resolver + probe + delegation)", () => {
      delete process.env[V2_ENV_KEY];
      expect(() => requireArcFlowV2ContractAddress()).toThrow(/not configured/);
      expect(isArcFlowV2AddressConfigured()).toBe(false);
      expect(() => getArcFlowV2ContractAddress(ARC_MAINNET)).toThrow(/not configured/);
      expect(isArcFlowV2Configured(ARC_MAINNET)).toBe(false);
    });

    it("rejects a malformed address", () => {
      process.env[V2_ENV_KEY] = "0x1234"; // too short
      expect(() => requireArcFlowV2ContractAddress()).toThrow(/malformed/);
      expect(() => requireArcFlowV2ContractAddress()).toThrow(/not configured/);
      expect(isArcFlowV2AddressConfigured()).toBe(false);
    });

    it("rejects the zero address", () => {
      process.env[V2_ENV_KEY] = "0x0000000000000000000000000000000000000000";
      expect(() => requireArcFlowV2ContractAddress()).toThrow(/zero address/);
      expect(isArcFlowV2AddressConfigured()).toBe(false);
    });

    it("rejects the deprecated predecessor deployment", () => {
      process.env[V2_ENV_KEY] = ARCFLOW_V2_FORBIDDEN_PREDECESSOR;
      expect(() => requireArcFlowV2ContractAddress()).toThrow(/predecessor/);
      expect(isArcFlowV2AddressConfigured()).toBe(false);
    });

    it("resolves a valid configured address to the exact configured value", () => {
      process.env[V2_ENV_KEY] = TEST_V2_ADDRESS;
      expect(requireArcFlowV2ContractAddress()).toBe(TEST_V2_ADDRESS);
      expect(isArcFlowV2AddressConfigured()).toBe(true);
      expect(getArcFlowV2ContractAddress(ARC_MAINNET)).toBe(TEST_V2_ADDRESS);
      expect(isArcFlowV2Configured(ARC_MAINNET)).toBe(true);
    });

    it("makes the non-Direct digest and typed-data builders fail closed (no 0x fallback)", async () => {
      delete process.env[V2_ENV_KEY];
      const eip712 = await import("@/lib/arcflow/authorization/arcflow-eip712");
      const params = {
        flowId: 0n,
        amount: 1n,
        validAfter: 0n,
        validBefore: 1n,
        nonce: randomNonce(),
      };
      expect(() => eip712.computeArcFlowV2AuthorizationDigest(params)).toThrow(/not configured/);
      expect(() => eip712.buildArcFlowV2ExecuteTypedData(params)).toThrow(/not configured/);
      expect(() => eip712.getArcFlowV2EIP712Domain(ARC_MAINNET)).toThrow(/not configured/);
    });
  });

  describe("EIP-712 signature parsing (Phase 21.3 shared helper)", () => {
    it("parses a valid 65-byte wallet signature with recovery id 27/28 and recoverable components", async () => {
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 1n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 60),
        nonce: randomNonce(),
      };
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });

      const parsed = parseEIP712Signature(signature);
      expect([27, 28]).toContain(parsed.v);
      expect(parsed.r.length).toBe(66);
      expect(parsed.s.length).toBe(66);

      const digest = computeUSDCAuthorizationDigest(params);
      expect(await verifyUSDCAuthorizationDigest(digest, parsed, account.address)).toBe(true);
    });

    it("rejects signatures that are not exactly 65 bytes", () => {
      const short = `0x${"ab".repeat(64)}` as `0x${string}`; // 64 bytes
      const long = `0x${"ab".repeat(66)}` as `0x${string}`; // 66 bytes
      expect(() => parseEIP712Signature(short)).toThrow(/132 hex chars/);
      expect(() => parseEIP712Signature(long)).toThrow(/132 hex chars/);
    });

    it("normalizes the yParity (0/1) signature form to the contract's 27/28", async () => {
      const params = {
        from: account.address,
        to: TEST_V2_ADDRESS,
        value: 1n,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 60),
        nonce: randomNonce(),
      };
      const typedData = buildUSDCTransferWithAuthorizationSignMessage(params);
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: "TransferWithAuthorization",
        message: typedData.message,
      });
      expect([27, 28]).toContain(parseEIP712Signature(signature).v);

      // Rewrite the last byte to the yParity form (0x00/0x01) — parseSignature
      // then reports yParity, and the helper must normalize back to 27/28.
      const parityZero = `${signature.slice(0, 130)}00` as `0x${string}`;
      const parityOne = `${signature.slice(0, 130)}01` as `0x${string}`;
      expect(parseEIP712Signature(parityZero).v).toBe(27);
      expect(parseEIP712Signature(parityOne).v).toBe(28);
    });
  });
});
