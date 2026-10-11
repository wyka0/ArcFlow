"use client";

import { useState, type ReactNode } from "react";

import { formatUsd } from "@/lib/money";
import { usePayments } from "@/components/payments-provider";
import { usePaymentFlow } from "@/components/payment-flow-provider";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";
import { PipelineVisualization } from "@/components/pipeline-visualization";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "border border-foreground/40 px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground";

export function PaymentPanel() {
  const { gate, status, activeEntry, error, isSubmitting, explorerUrl, confirm, cancel, dismiss } =
    usePaymentFlow();
  const { connection, network } = useWallet();
  const { payments } = usePayments();
  const [copied, setCopied] = useState(false);

  if (status === "idle") {
    return (
      <Frame label="payment.panel" meta="004" badge="AWAITING SELECTION">
        <Empty
          message="NO PAYMENT SELECTED"
          detail="Choose an available service to build a policy-gated payment request."
        />
        {payments.entries.length > 0 ? (
          <RecentCount count={payments.entries.length} onClear={dismiss} />
        ) : null}
      </Frame>
    );
  }

  if (status === "checking") {
    return (
      <Frame label="payment.panel" meta="004" badge="CHECKING">
        <div className="flex flex-col gap-4 p-5 lg:p-6">
          <p className="text-sm font-bold tracking-wide uppercase">VERIFYING SPENDING POLICY</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground uppercase">
            Requesting an approved payment intent from the trusted server ledger…
          </p>
          <PipelineVisualization currentPhase="requesting_intent" compact />
          <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            <span aria-hidden className="size-2 animate-blink bg-accent" />
            Server policy check
          </span>
        </div>
      </Frame>
    );
  }

  if (status === "unavailable" && gate.status === "unavailable") {
    return (
      <Frame label="payment.panel" meta="004" badge="BLOCKED">
        <div className="flex flex-col gap-5 p-5 lg:p-6">
          <p className="text-sm font-bold tracking-wide text-accent uppercase">
            PAYMENT BLOCKED
          </p>
          <div className="border-2 border-accent p-4">
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Reason</p>
            <p className="mt-1.5 text-xs leading-relaxed">{gate.message}</p>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground uppercase">
            The wallet was not contacted and no transaction was created. An unreadable ledger is
            never treated as &ldquo;nothing spent yet&rdquo;.
          </p>
          <div>
            <button className={SECONDARY} onClick={cancel} type="button">
              Dismiss
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  if (status === "blocked" && gate.status === "blocked") {
    return (
      <Frame label="payment.panel" meta="004" badge="BLOCKED">
        <div className="flex flex-col gap-5 p-5 lg:p-6">
          <p className="text-sm font-bold tracking-wide text-accent uppercase">PAYMENT BLOCKED</p>
          <div className="border-2 border-accent p-4">
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Reason</p>
            <p className="mt-1.5 text-xs leading-relaxed">{gate.reason}</p>
          </div>
          {gate.violations.length > 1 ? (
            <ul className="flex flex-col gap-1">
              {gate.violations.slice(1).map((violation) => (
                <li className="text-[10px] text-muted-foreground uppercase" key={violation.code}>
                  · {violation.message}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[10px] leading-relaxed text-muted-foreground uppercase">
            The wallet was not contacted and no transaction was created.
          </p>
          <div>
            <button className={SECONDARY} onClick={cancel} type="button">
              Dismiss
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  if (gate.status !== "ready") {
    return (
      <Frame label="payment.panel" meta="004">
        <Empty message="NO PAYMENT SELECTED" detail="Choose a service to begin." />
      </Frame>
    );
  }

  const request = gate.request;
  const ready = status === "ready";
  const pending = status === "pending";
  const submitted = status === "submitted";
  const confirmed = status === "confirmed";
  const failed = status === "failed";

  const headline = ready
    ? "PAYMENT READY"
    : pending
      ? "PAYMENT PENDING"
      : submitted
        ? "TRANSACTION SUBMITTED"
        : confirmed
          ? "PAYMENT CONFIRMED"
          : "PAYMENT FAILED";

  const subline = ready
    ? "Policy approved. Awaiting confirmation."
    : pending
      ? isSubmitting
        ? "Waiting for wallet confirmation…"
        : "Waiting for confirmation…"
      : submitted
        ? "Waiting for Arc confirmation…"
        : confirmed
          ? "The trusted server ledger verified this transaction on Arc."
          : "No successful payment was recorded.";

  const busy = pending || submitted;

  return (
    <Frame
      label="payment.panel"
      meta="004"
      badge={confirmed ? "CONFIRMED" : failed ? "FAILED" : busy ? "IN FLIGHT" : "READY"}
    >
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="border-2 border-foreground p-5">
          <p className="text-sm font-bold tracking-wide uppercase">{headline}</p>
          <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {subline}
          </p>
        </div>

        {/* Pipeline visualization for all states */}
        <PipelineVisualization 
          currentPhase={
            ready ? "intent_approved" :
            pending ? "awaiting_signature" :
            submitted ? "submitted" :
            confirmed ? "confirmed" :
            "failed"
          } 
        />

        <dl className="grid gap-0 border-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Service" value={activeEntry?.serviceName ?? request.serviceId} />
          <Row label="Amount" value={`${formatUsd(request.amount.amount)} ${request.currency}`} />
          <Row label="Recipient" value={shortenAddress(request.recipient)} mono title={request.recipient} />
          <Row label="Network" value={network.label} />
          <Row label="Agent" value={activeEntry?.agentId ?? request.agentId} mono />
          <Row
            label="Policy"
            value={ready || busy || confirmed ? "Approved" : "Rejected"}
            tone={ready || busy || confirmed ? "ok" : "bad"}
          />
        </dl>

        {confirmed && activeEntry?.transactionHash ? (
          <div className="border-2 border-success bg-success/2 p-5 animate-panel-slide-in">
            <p className="text-[10px] tracking-[0.2em] text-success uppercase mb-3">VERIFIED TRANSACTION</p>
            <p className="break-all font-mono text-sm">{activeEntry.transactionHash}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {explorerUrl ? (
                <a
                  className={PRIMARY}
                  href={explorerUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View on Arc Explorer
                </a>
              ) : null}
              <button
                className={SECONDARY}
                onClick={async () => {
                  if (!activeEntry.transactionHash) return;
                  try {
                    await navigator.clipboard.writeText(activeEntry.transactionHash);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
                type="button"
              >
                {copied ? "Copied" : "Copy hash"}
              </button>
            </div>
          </div>
        ) : null}

        {submitted && activeEntry?.transactionHash ? (
          <div className="border border-border p-4 animate-panel-slide-in">
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2">Submitted</p>
            <p className="break-all font-mono text-sm">{activeEntry.transactionHash}</p>
          </div>
        ) : null}

        {failed && activeEntry?.failureReason ? (
          <div className="border-2 border-destructive bg-destructive/2 p-4 animate-panel-slide-in">
            <p className="text-[10px] tracking-[0.2em] text-destructive uppercase mb-2">Reason</p>
            <p className="text-xs leading-relaxed">{activeEntry.failureReason}</p>
          </div>
        ) : null}

        {error && !failed ? (
          <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {ready ? (
            <>
              <button
                className={PRIMARY}
                disabled={isSubmitting || connection !== "connected"}
                onClick={() => void confirm()}
                type="button"
              >
                Confirm & Pay
              </button>
              <button className={SECONDARY} onClick={cancel} type="button">
                Cancel
              </button>
              {connection !== "connected" ? (
                <span className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                  Connect a wallet to continue
                </span>
              ) : null}
            </>
          ) : null}

          {failed ? (
            <button className={PRIMARY} onClick={cancel} type="button">
              Try Again
            </button>
          ) : null}

          {busy ? (
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              <span aria-hidden className="size-2 animate-blink bg-accent" />
              Do not close this tab
            </span>
          ) : null}

          {confirmed ? (
            <button className={SECONDARY} onClick={dismiss} type="button">
              Done
            </button>
          ) : null}
        </div>

        <p className="text-[9px] leading-relaxed tracking-[0.15em] text-muted-foreground uppercase">
          Nothing is sent until you press Confirm & Pay. The agent cannot submit a payment.
        </p>
      </div>
    </Frame>
  );
}

function Frame({
  label,
  meta,
  badge,
  children,
}: {
  label: string;
  meta: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col border-2 border-foreground bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground px-5 py-3 lg:px-6 lg:py-4">
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-mono">{label}</span>
        <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-mono">
          {badge && <span className="text-accent">{badge}</span>}
          <span>{meta}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  tone,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ok" | "bad";
  title?: string;
}) {
  return (
    <div className="border-b border-border p-4 last:border-b-0 sm:odd:border-r-2 sm:odd:border-r-foreground">
      <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
      <dd
        className={`mt-1.5 text-sm ${mono ? "font-mono" : ""} ${
          tone === "ok" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function Empty({ message, detail }: { message: string; detail: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-5 lg:p-6">
      <p className="text-sm font-bold tracking-wide uppercase">{message}</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground uppercase">{detail}</p>
    </div>
  );
}

function RecentCount({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
      <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        {count} record{count === 1 ? "" : "s"} in the ledger
      </span>
      <button className={SECONDARY} onClick={onClear} type="button">
        Clear selection
      </button>
    </div>
  );
}