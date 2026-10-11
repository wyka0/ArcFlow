import { roundToCents } from "@/lib/money";
import { isSameAccountingDay, type AccountingZone } from "@/lib/time";
import type { Currency, Service, SpendingPolicy } from "@/types";

export type PolicyViolationCode =
  | "SERVICE_INACTIVE"
  | "CATEGORY_NOT_ALLOWED"
  | "CURRENCY_MISMATCH"
  | "EXCEEDS_MAX_PER_TRANSACTION"
  | "EXCEEDS_DAILY_LIMIT";

export interface PolicyViolation {
  code: PolicyViolationCode;
  message: string;
}

export type PolicyDecision =
  | { allowed: true; violations: readonly [] }
  | { allowed: false; violations: readonly PolicyViolation[] };

export interface PolicyEvaluationInput {
  policy: SpendingPolicy;
  service: Service;
  amount: number;
  spentToday: number;
}

/**
 * The minimal shape the accounting needs.
 *
 * Both the browser `ConfirmedPayment` cache and the server `TrustedPayment`
 * record satisfy this, so there is exactly one daily-spend implementation.
 */
export interface AccountingPayment {
  amount: number;
  currency: Currency;
  createdAt: string;
}

/** Today's confirmed spend accounting for a policy. */
export interface SpendingSummary {
  currency: SpendingPolicy["currency"];
  dailyLimit: number;
  spentToday: number;
  remainingToday: number;
  /** The accounting window the summary was computed with. */
  zone: AccountingZone;
}

/**
 * Sums a day's CONFIRMED payments only.
 *
 * Pending, submitted, failed, blocked, cancelled, unverified, and duplicate
 * payments never count toward daily spend. The window is explicit — the trusted
 * server ledger uses UTC, the browser cache uses the local timezone.
 */
export function sumConfirmedToday(
  history: readonly AccountingPayment[],
  currency: SpendingPolicy["currency"],
  now: Date = new Date(),
  zone: AccountingZone = "local",
): number {
  const total = history
    .filter((payment) => payment.currency === currency)
    .filter((payment) => isSameAccountingDay(payment.createdAt, now, zone))
    .reduce((sum, payment) => sum + payment.amount, 0);

  return roundToCents(total);
}

/**
 * The single calculation of daily spend / remaining spend. Used by the policy
 * gate and by the UI, so the two can never disagree.
 */
export function buildSpendingSummary(
  policy: SpendingPolicy,
  history: readonly AccountingPayment[],
  now: Date = new Date(),
  zone: AccountingZone = "local",
): SpendingSummary {
  const spentToday = sumConfirmedToday(history, policy.currency, now, zone);
  return {
    currency: policy.currency,
    dailyLimit: policy.dailyLimit,
    spentToday,
    remainingToday: roundToCents(Math.max(policy.dailyLimit - spentToday, 0)),
    zone,
  };
}

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
  const { policy, service, amount, spentToday } = input;
  const violations: PolicyViolation[] = [];

  if (!service.active) {
    violations.push({
      code: "SERVICE_INACTIVE",
      message: `Service "${service.name}" is not active.`,
    });
  }

  if (!policy.allowedCategories.includes(service.category)) {
    violations.push({
      code: "CATEGORY_NOT_ALLOWED",
      message: `Category "${service.category}" is not in the agent's approved categories.`,
    });
  }

  if (service.currency !== policy.currency) {
    violations.push({
      code: "CURRENCY_MISMATCH",
      message: `Service is priced in ${service.currency} but the policy is denominated in ${policy.currency}.`,
    });
  }

  if (roundToCents(amount) > roundToCents(policy.maxPerTransaction)) {
    violations.push({
      code: "EXCEEDS_MAX_PER_TRANSACTION",
      message: `Amount ${amount} exceeds the per-transaction maximum of ${policy.maxPerTransaction} ${policy.currency}.`,
    });
  }

  if (roundToCents(spentToday + amount) > roundToCents(policy.dailyLimit)) {
    violations.push({
      code: "EXCEEDS_DAILY_LIMIT",
      message: `This payment would bring today's confirmed spend to ${roundToCents(spentToday + amount)} ${policy.currency}, above the daily limit of ${policy.dailyLimit} ${policy.currency}.`,
    });
  }

  return violations.length === 0 ? { allowed: true, violations: [] } : { allowed: false, violations };
}
