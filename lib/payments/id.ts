/** Generates a client-side payment id. Not a transaction hash. */
export function createPaymentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pay_${crypto.randomUUID()}`;
  }
  return `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
