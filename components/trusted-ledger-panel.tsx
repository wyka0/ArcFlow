"use client";

import { Card, CardBody, CardHeader } from "@/components/card";
import { useTrustedLedger } from "@/components/trusted-ledger-provider";
import { getExplorerTxUrl, getArcNetworkByChainId } from "@/lib/arc/network";
import { formatMoney } from "@/lib/money";
import { formatUtcDateTime } from "@/lib/time";
import { shortenAddress } from "@/lib/wallet/state";
import { PipelineVisualization } from "@/components/pipeline-visualization";

/**
 * The authoritative ledger, read from the server.
 *
 * Browser-local entries are shown separately by `PaymentsPanel` and are clearly
 * labelled as a cache.
 */
export function TrustedLedgerPanel() {
  const { state, refresh } = useTrustedLedger();

  return (
    <Card variant="primary">
      <CardHeader
        action={
          <span className="flex items-center gap-2 text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
            {state.status === "available" ? (
              <>
                <span className="text-success">{state.records.length} VERIFIED</span>
                <span className="border border-border px-1.5 py-0.5" title={state.persistence.note}>
                  {state.persistence.label}
                </span>
              </>
            ) : null}
            <button
              className="border border-foreground/40 px-2 py-1 font-bold transition-colors hover:border-foreground hover:text-foreground"
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          </span>
        }
        label="trusted.ledger"
        meta="005"
      />
      <CardBody className="p-0">
        {state.status === "loading" ? (
          <div className="px-5 py-12 text-center">
            <PipelineVisualization currentPhase="requesting_intent" compact className="mb-4" />
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Reading trusted server ledger…
            </p>
          </div>
        ) : null}

        {state.status === "unavailable" ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
            <span aria-hidden className="grid size-12 place-items-center border-2 border-accent">
              <span className="size-2 animate-blink bg-accent" />
            </span>
            <p className="mt-4 text-sm font-bold uppercase text-accent">
              TRUSTED LEDGER UNAVAILABLE
            </p>
            <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-muted-foreground uppercase">
              {state.message} No spending limit can be verified while the trusted ledger is
              unreachable, so payments fail closed.
            </p>
          </div>
        ) : null}

        {state.status === "available" && state.records.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center animate-fade-up">
            <span aria-hidden className="grid size-12 place-items-center border-2 border-border">
              <span className="size-2 animate-blink bg-accent" />
            </span>
            <p className="mt-4 text-sm font-bold uppercase">NO VERIFIED PAYMENTS YET</p>
            <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-muted-foreground uppercase">
              Your agent has not made any payments. Only transactions independently verified against
              Arc appear here.
            </p>
          </div>
        ) : null}

        {state.status === "available" && state.records.length > 0 ? (
          <ul>
            {state.records.map((record) => {
              const chain = getArcNetworkByChainId(record.chainId);
              return (
                <li className="border-b border-border px-5 py-4 last:border-b-0 animate-fade-up" key={record.id}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold uppercase">{record.serviceName}</p>
                      <p className="mt-1 text-[10px] tracking-[0.15em] text-success uppercase">
                        CONFIRMED · VERIFIED
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-mono text-xl"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoney(record.amount.amount, record.currency)}
                    </span>
                  </div>

                  <PipelineVisualization currentPhase="confirmed" compact className="mb-3" />

                  <dl className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
                    <Line label="Recipient" value={shortenAddress(record.recipient)} title={record.recipient} />
                    <Line label="Sender" value={shortenAddress(record.sender)} title={record.sender} />
                    <Line label="Transaction" value={record.txHash} />
                    <Line label="Block" value={record.blockNumber} />
                    <Line label="Verified" value={formatUtcDateTime(record.confirmedAt)} />
                  </dl>

                  {chain ? (
                    <a
                      className="mt-3 inline-block border border-foreground/40 px-3 py-1.5 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      href={getExplorerTxUrl(record.txHash, chain)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View on Arc Explorer
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Line({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="border-b border-border p-3 last:border-b-0 sm:odd:border-r-2 sm:odd:border-r-foreground">
      <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 min-w-0 break-all font-mono text-[10px]" title={title}>
        {value}
      </dd>
    </div>
  );
}