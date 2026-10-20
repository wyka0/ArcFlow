/** Generates a client-side payment id. Not a transaction hash. */
export function createPaymentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pay_${crypto.randomUUID()}`;
  }
  return `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Generates a flow-execution record id. Not a transaction hash. */
export function createFlowExecutionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `flx_${crypto.randomUUID()}`;
  }
  return `flx_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
