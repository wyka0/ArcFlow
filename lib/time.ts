/**
 * Centralised date handling for daily spending accounting.
 *
 * ACCOUNTING WINDOW: there are two explicit, documented windows.
 *
 *  - `"utc"`   — a day runs 00:00:00.000–23:59:59.999 UTC. Used by the trusted
 *                server ledger so accounting is deterministic regardless of the
 *                machine timezone or region.
 *  - `"local"` — a day runs 00:00:00.000–23:59:59.999 in the runtime's local
 *                timezone. Used for the browser cache display.
 *
 * Callers must choose a window explicitly; nothing here guesses.
 */
export type AccountingZone = "utc" | "local";

export function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return !Number.isNaN(new Date(value).getTime());
}

function dayKey(date: Date, zone: AccountingZone): string {
  if (zone === "utc") {
    return date.toISOString().slice(0, 10);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True when the timestamp falls on the same accounting day as `now`. */
export function isSameAccountingDay(
  isoTimestamp: string,
  now: Date = new Date(),
  zone: AccountingZone = "local",
): boolean {
  if (!isValidTimestamp(isoTimestamp)) return false;
  return dayKey(new Date(isoTimestamp), zone) === dayKey(now, zone);
}

/** Human-readable date/time for ledger rows (always explicit UTC). */
export function formatUtcDateTime(isoTimestamp: string): string {
  if (!isValidTimestamp(isoTimestamp)) return "unknown";
  return `${new Date(isoTimestamp).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export const ACCOUNTING_ZONE_NOTES: Record<AccountingZone, string> = {
  utc: "UTC day window · resets at 00:00 UTC",
  local: "Local browser timezone · resets at 00:00 local time",
};

/** Local-day start, retained for cache-side window calculations. */
export function startOfLocalDay(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}
