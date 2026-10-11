import type { AccountingPayment, PolicyViolationCode, SpendingSummary } from "@/lib/agent/policy";
import type { SpendingPolicy } from "@/types";
import type { TrustedPayment } from "@/types";
import { roundToCents } from "@/lib/money";
import { isSameAccountingDay } from "@/lib/time";

/**
 * Server-side trusted accounting using bigint base units.
 *
 * This module is the authoritative source for spending calculations on the server.
 * It operates entirely in base units (USDC = 6 decimals) to avoid floating-point
 * errors, converting to cents only for policy comparison at the boundary.
 */

/** USDC decimals = 6 */
const USDC_DECIMALS = 6;
const CENTS_TO_BASE_UNITS = 10n ** BigInt(USDC_DECIMALS - 2);

/** Convert number amount (e.g. 0.10) to base units bigint (e.g. 100_000n) */
export function amountToBaseUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive finite number.");
  }
  const cents = Math.round(amount * 100);
  return BigInt(cents) * CENTS_TO_BASE_UNITS;
}

/** Convert base units bigint to number amount (for policy comparison) */
export function baseUnitsToAmount(baseUnits: bigint): number {
  return Number(baseUnits / CENTS_TO_BASE_UNITS) / 100;
}

/** Convert base units bigint to cents (integer) */
export function baseUnitsToCents(baseUnits: bigint): number {
  return Number(baseUnits / CENTS_TO_BASE_UNITS);
}

/**
 * Sum confirmed payments for today in UTC using bigint arithmetic.
 *
 * Returns total spent today in base units.
 */
export function sumConfirmedTodayTrusted(
  history: readonly TrustedPayment[],
  currency: SpendingPolicy["currency"],
  now: Date = new Date(),
): bigint {
  let total = 0n;

  for (const record of history) {
    if (record.currency !== currency) continue;
    if (!isSameAccountingDay(record.confirmedAt, now, "utc")) continue;
    total += amountToBaseUnits(record.amount.amount);
  }

  return total;
}

/**
 * Build spending summary from trusted payments using bigint arithmetic.
 *
 * All calculations done in base units, converted to cents for policy boundary.
 */
export function buildSpendingSummaryTrusted(
  policy: SpendingPolicy,
  history: readonly TrustedPayment[],
  now: Date = new Date(),
): SpendingSummary {
  const spentTodayBaseUnits = sumConfirmedTodayTrusted(history, policy.currency, now);
  const spentTodayCents = baseUnitsToCents(spentTodayBaseUnits);
  const dailyLimitCents = Math.round(policy.dailyLimit * 100);

  const remainingCents = Math.max(dailyLimitCents - spentTodayCents, 0);

  return {
    currency: policy.currency,
    dailyLimit: policy.dailyLimit,
    spentToday: roundToCents(spentTodayCents / 100),
    remainingToday: roundToCents(remainingCents / 100),
    zone: "utc",
  };
}

/**
 * Evaluate a payment request against trusted spending.
 *
 * Returns the policy decision with violations if any.
 * All arithmetic uses bigint base units until the final policy comparison.
 */
export interface TrustedPolicyEvaluationInput {
  policy: SpendingPolicy;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  servicePrice: number;
  serviceCurrency: SpendingPolicy["currency"];
  serviceActive: boolean;
  history: readonly TrustedPayment[];
  now?: Date;
}

export interface TrustedPolicyResult {
  allowed: boolean;
  violations: ReadonlyArray<{
    code: PolicyViolationCode;
    message: string;
  }>;
  spending: SpendingSummary;
  spentTodayBaseUnits: bigint;
  dailyLimitBaseUnits: bigint;
  maxPerTransactionBaseUnits: bigint;
  requestedBaseUnits: bigint;
}

export function evaluateTrustedPolicy(input: TrustedPolicyEvaluationInput): TrustedPolicyResult {
  const { policy, serviceName, serviceCategory, servicePrice, serviceCurrency, serviceActive, history, now = new Date() } = input;

  const violations: Array<{ code: PolicyViolationCode; message: string }> = [];

  const requestedBaseUnits = amountToBaseUnits(servicePrice);
  const dailyLimitBaseUnits = amountToBaseUnits(policy.dailyLimit);
  const maxPerTransactionBaseUnits = amountToBaseUnits(policy.maxPerTransaction);
  const spentTodayBaseUnits = sumConfirmedTodayTrusted(history, policy.currency, now);
  const spending = buildSpendingSummaryTrusted(policy, history, now);

  // 1. Service active
  if (!serviceActive) {
    violations.push({
      code: "SERVICE_INACTIVE",
      message: `Service "${serviceName}" is not active.`,
    });
  }

  // 2. Category allowed
  if (!policy.allowedCategories.includes(serviceCategory as SpendingPolicy["allowedCategories"][number])) {
    violations.push({
      code: "CATEGORY_NOT_ALLOWED",
      message: `Category "${serviceCategory}" is not in the agent's approved categories.`,
    });
  }

  // 3. Currency matches
  if (serviceCurrency !== policy.currency) {
    violations.push({
      code: "CURRENCY_MISMATCH",
      message: `Service is priced in ${serviceCurrency} but the policy is denominated in ${policy.currency}.`,
    });
  }

  // 4. Max per transaction (bigint comparison)
  if (requestedBaseUnits > maxPerTransactionBaseUnits) {
    violations.push({
      code: "EXCEEDS_MAX_PER_TRANSACTION",
      message: `Amount ${servicePrice} exceeds the per-transaction maximum of ${policy.maxPerTransaction} ${policy.currency}.`,
    });
  }

  // 5. Daily limit (bigint comparison)
  const projectedBaseUnits = spentTodayBaseUnits + requestedBaseUnits;
  if (projectedBaseUnits > dailyLimitBaseUnits) {
    violations.push({
      code: "EXCEEDS_DAILY_LIMIT",
      message: `This payment would bring today's confirmed spend to ${baseUnitsToAmount(projectedBaseUnits).toFixed(2)} ${policy.currency}, above the daily limit of ${policy.dailyLimit} ${policy.currency}.`,
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
    spending,
    spentTodayBaseUnits,
    dailyLimitBaseUnits,
    maxPerTransactionBaseUnits,
    requestedBaseUnits,
  };
}

/**
 * Convert TrustedPayment records to AccountingPayment shape for legacy compatibility.
 */
export function trustedToAccounting(records: readonly TrustedPayment[]): AccountingPayment[] {
  return records.map((record) => ({
    amount: record.amount.amount,
    currency: record.currency,
    createdAt: record.confirmedAt,
  }));
}