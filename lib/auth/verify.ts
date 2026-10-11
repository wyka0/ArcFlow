import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

/**
 * Verify an EIP-191 personal_sign signature over the server-issued challenge
 * message.
 *
 * The recovered signer must equal the wallet that requested the challenge.
 * We also enforce a checksummed, lower-cased-normalised comparison so that a
 * wallet presenting the same address in mixed case still passes.
 */
export async function verifyAuthSignature(input: {
  message: string;
  signature: string;
  expectedWallet: Address;
}): Promise<{ ok: true; signer: Address } | { ok: false; reason: string }> {
  if (typeof input.signature !== "string" || input.signature.length === 0) {
    return { ok: false, reason: "EMPTY_SIGNATURE" };
  }
  if (!/^0x[0-9a-fA-F]+$/.test(input.signature)) {
    return { ok: false, reason: "MALFORMED_SIGNATURE" };
  }
  if (!isAddress(input.expectedWallet, { strict: false })) {
    return { ok: false, reason: "MALFORMED_WALLET" };
  }

  // EIP-55 canonicalise the expected wallet so viem's comparison is
  // case-insensitive but checksummed.
  let expectedCanonical: Address;
  try {
    expectedCanonical = getAddress(input.expectedWallet);
  } catch {
    return { ok: false, reason: "MALFORMED_WALLET" };
  }

  let valid: boolean;
  try {
    // viem 2.x: verifyMessage({ address, message, signature }) -> Promise<boolean>
    valid = await verifyMessage({
      address: expectedCanonical,
      message: input.message,
      signature: input.signature as Hex,
    });
  } catch {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  if (!valid) {
    return { ok: false, reason: "WRONG_SIGNER" };
  }

  return { ok: true, signer: expectedCanonical };
}

/** Validate that a string is a syntactically-valid EVM address. */
export function isEvmAddress(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value, { strict: false });
}
