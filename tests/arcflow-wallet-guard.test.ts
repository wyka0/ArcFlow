/**
 * Phase 23.58 — wallet pre-submission guard (pure).
 *
 * Proves a mid-sequence chain switch or account change is detected BEFORE any
 * transaction is submitted, and that the failure message is explicit and never
 * implies an automatic network/account switch.
 */
import { describe, expect, it } from "vitest";

import { checkWalletForSubmission, walletGuardFailureMessage } from "@/lib/arcflow/wallet-guard";

const EXPECTED = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ARC_CHAIN = 5042;

describe("checkWalletForSubmission", () => {
  it("passes when the chain and account match", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [EXPECTED],
        currentChainId: ARC_CHAIN,
      }),
    ).toBeNull();
  });

  it("matches the account case-insensitively", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [EXPECTED.toLowerCase()],
        currentChainId: ARC_CHAIN,
      }),
    ).toBeNull();
  });

  it("reports no-account when there is no expected account", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: null,
        currentAccounts: [],
        currentChainId: ARC_CHAIN,
      }),
    ).toEqual({ kind: "no-account" });
  });

  it("reports account-changed when a different account is selected", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [OTHER],
        currentChainId: ARC_CHAIN,
      }),
    ).toEqual({ kind: "account-changed", expected: EXPECTED, actual: OTHER });
  });

  it("reports account-changed when the wallet returns no accounts", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [],
        currentChainId: ARC_CHAIN,
      }),
    ).toEqual({ kind: "account-changed", expected: EXPECTED, actual: null });
  });

  it("reports wrong-chain when the chain id differs", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [EXPECTED],
        currentChainId: 1,
      }),
    ).toEqual({ kind: "wrong-chain", expectedChainId: ARC_CHAIN, actualChainId: 1 });
  });

  it("treats a null chain id as wrong-chain", () => {
    expect(
      checkWalletForSubmission({
        expectedChainId: ARC_CHAIN,
        expectedAccount: EXPECTED,
        currentAccounts: [EXPECTED],
        currentChainId: null,
      }),
    ).toEqual({ kind: "wrong-chain", expectedChainId: ARC_CHAIN, actualChainId: null });
  });
});

describe("walletGuardFailureMessage", () => {
  it("says the wallet is not connected", () => {
    expect(walletGuardFailureMessage({ kind: "no-account" })).toMatch(/not connected/i);
  });

  it("names the account change and states no transaction was sent", () => {
    const message = walletGuardFailureMessage({
      kind: "account-changed",
      expected: EXPECTED,
      actual: OTHER,
    });
    expect(message).toMatch(/account changed/i);
    expect(message).toMatch(/no transaction was sent/i);
    expect(message).toMatch(/re-select/i);
  });

  it("names the wrong chain and states no transaction was sent", () => {
    const message = walletGuardFailureMessage({
      kind: "wrong-chain",
      expectedChainId: ARC_CHAIN,
      actualChainId: 1,
    });
    expect(message).toMatch(/no longer on chain 5042/i);
    expect(message).toMatch(/no transaction was sent/i);
  });
});
