"use client";

import { Card, CardBody, CardHeader } from "@/components/card";
import { usePayments } from "@/components/payments-provider";
import { useTrustedLedger } from "@/components/trusted-ledger-provider";
import { formatUsd } from "@/lib/money";
import { ACCOUNTING_ZONE_NOTES } from "@/lib/time";
import type { SpendingPolicy } from "@/types";

export function PolicyCard({ policy }: { policy: SpendingPolicy }) {
  const { state, refresh } = useTrustedLedger();
  const { persistence } = usePayments();

  const stats = [
    { label: "Max / transaction", value: formatUsd(policy.maxPerTransaction) },
    { label: "Daily limit", value: formatUsd(policy.dailyLimit) },
    { label: "Approved categories", value: String(policy.allowedCategories.length) },
  ];

  const available = state.status === "available" ? state.spending : null;
  const usedPct =
    available && policy.dailyLimit > 0
      ? Math.min(Math.round((available.spentToday / policy.dailyLimit) * 100), 100)
      : 0;
  const persistenceDescriptor = state.status === "available" ? state.persistence : null;

  return (
    <Card>
      <CardHeader
        action={<span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">POLICY DEMO</span>}
        label="policy.rules"
        meta="002"
      />
      <CardBody className="flex flex-col gap-5">
        <dl className="grid gap-0 border-2 border-foreground sm:grid-cols-3">
          {stats.map((stat, index) => (
            <div
              className={`p-3 ${index < stats.length - 1 ? "border-b-2 border-foreground sm:border-r-2 sm:border-b-0" : ""}`}
              key={stat.label}
            >
              <dt className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                {stat.label}
              </dt>
              <dd
                className="mt-1.5 text-lg font-bold tracking-tight"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            Allowed categories
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {policy.allowedCategories.map((category) => (
              <li
                className="border border-border px-2 py-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase"
                key={category}
              >
                {category}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t-2 border-foreground pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Daily spend
            </p>
            <button
              className="border border-foreground/40 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          </div>

          {state.status === "loading" ? (
            <p className="mt-3 border-2 border-border p-3 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              Reading trusted ledger…
            </p>
          ) : null}

          {state.status === "unavailable" ? (
            <div className="mt-3 border-2 border-accent p-3" role="alert">
              <p className="text-sm font-bold tracking-wide text-accent uppercase">
                DAILY SPEND UNAVAILABLE
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed uppercase">
                Trusted ledger unavailable. Spending policy cannot be verified.
              </p>
              <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground uppercase">
                {state.message}
              </p>
            </div>
          ) : null}

          {available ? (
            <>
              <div className="mt-3 grid gap-0 border-2 border-foreground sm:grid-cols-2">
                <div className="border-b-2 border-foreground p-3 sm:border-r-2 sm:border-b-0">
                  <p
                    className="text-lg font-bold tracking-tight"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatUsd(available.spentToday)} / {formatUsd(available.dailyLimit)}
                  </p>
                  <p className="mt-1 text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                    Spent / limit
                  </p>
                </div>
                <div className="p-3">
                  <p
                    className="text-lg font-bold tracking-tight text-accent"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatUsd(available.remainingToday)}
                  </p>
                  <p className="mt-1 text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                    Remaining
                  </p>
                </div>
              </div>

              <div className="mt-3 h-2 w-full border border-foreground">
                <div className="h-full bg-foreground" style={{ width: `${usedPct}%` }} />
              </div>

              <dl className="mt-3 flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                    Source
                  </dt>
                  <dd className="text-[9px] tracking-[0.15em] uppercase">
                    {persistenceDescriptor?.label ?? "TRUSTED SERVER LEDGER"}
                    {persistenceDescriptor && !persistenceDescriptor.durable ? " · NON-DURABLE" : ""}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                    Day boundary
                  </dt>
                  <dd className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
                    {ACCOUNTING_ZONE_NOTES[available.zone]}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground uppercase">
          Limits are local demo configuration. Daily spend is calculated server-side from
          on-chain-verified transactions using a UTC accounting day.
        </p>
        <p className="text-[9px] leading-relaxed text-muted-foreground uppercase">
          Local cache ({persistence.label.toLowerCase()}) is a UI convenience only and is not used
          for spending limits.
        </p>
      </CardBody>
    </Card>
  );
}
