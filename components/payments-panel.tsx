"use client";

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/card";
import { usePayments } from "@/components/payments-provider";
import { PAYMENT_PHASE_LABELS } from "@/lib/payments/store";
import { formatUtcDateTime } from "@/lib/time";

/**
 * Browser-local cache.
 *
 * This panel exists for UX continuity only. It is explicitly NOT the source of
 * truth: the authoritative ledger is `trusted.ledger`, read from the server.
 */
export function PaymentsPanel() {
  const { payments, clearLocalHistory, persistence } = usePayments();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const entries = payments.entries;

  return (
    <Card>
      <CardHeader
        action={
          <span className="flex items-center gap-2 text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
            <span className="border border-border px-1.5 py-0.5" title={persistence.note}>
              CACHE ONLY
            </span>
            <span>{persistence.label}</span>
          </span>
        }
        label="local.cache"
        meta="006"
      />
      <CardBody className="p-0">
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              No local cache entries.
            </p>
          </div>
        ) : (
          <ul>
            {entries.map((entry) => (
              <li
                className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
                key={entry.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold uppercase">{entry.serviceName}</p>
                  <p className="mt-0.5 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {PAYMENT_PHASE_LABELS[entry.phase]}
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                    {entry.transactionHash ?? "—"}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {formatUtcDateTime(entry.createdAt)}
                  </p>
                  {entry.failureReason ? (
                    <p className="mt-1 text-[10px] leading-relaxed text-accent">
                      {entry.failureReason}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-sm">
                  {entry.amount} {entry.currency}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border px-4 py-3">
          {confirmingClear ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[9px] tracking-[0.15em] text-accent uppercase">
                Clearing the local cache does not reverse or delete the on-chain transaction.
              </span>
              <button
                className="border-2 border-foreground bg-foreground px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  clearLocalHistory();
                  setConfirmingClear(false);
                }}
                type="button"
              >
                Clear cache
              </button>
              <button
                className="border border-foreground/40 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                onClick={() => setConfirmingClear(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] leading-relaxed tracking-[0.15em] text-muted-foreground uppercase">
                Browser cache. Not authoritative. Not a security boundary.
              </span>
              {entries.length > 0 ? (
                <button
                  className="border border-foreground/40 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  onClick={() => setConfirmingClear(true)}
                  type="button"
                >
                  Clear local
                </button>
              ) : null}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
