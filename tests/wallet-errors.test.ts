import { describe, expect, it } from "vitest";

import { toWalletError } from "@/lib/wallet/state";

describe("toWalletError", () => {
  it("maps EIP-1193 code 4001 to USER_REJECTED", () => {
    expect(toWalletError({ code: 4001 })).toEqual({
      code: "USER_REJECTED",
      message: "Request rejected in the wallet.",
    });
  });

  it("maps pending-request code to CONNECTION_FAILED", () => {
    expect(toWalletError({ code: -32002 }).code).toBe("CONNECTION_FAILED");
  });

  it("passes through typed wallet errors", () => {
    expect(toWalletError({ code: "WALLET_NOT_DETECTED", message: "No wallet." })).toEqual({
      code: "WALLET_NOT_DETECTED",
      message: "No wallet.",
    });
  });

  it("never leaks a raw error message", () => {
    const error = new Error("TypeError: cannot read properties of undefined");
    expect(toWalletError(error)).toEqual({
      code: "UNKNOWN",
      message: "The wallet request could not be completed.",
    });
  });
});
