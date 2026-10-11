import type { Currency } from "@/types";

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${formatUsd(amount)} ${currency}`;
}

export function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
