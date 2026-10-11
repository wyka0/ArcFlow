"use client";

import { Card, CardBody, CardHeader } from "@/components/card";
import { DemoBadge, LiveBadge } from "@/components/demo-badge";
import { StatusPill } from "@/components/status-pill";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";
import type { Agent } from "@/types";

export function AgentCard({ agent }: { agent: Agent }) {
  const { session, balance, connection, network, refreshBalance } = useWallet();
  const { address } = session.wallet;

  const walletValue =
    connection === "connecting"
      ? "Connecting…"
      : connection === "connected" || connection === "wrong-network"
        ? (address ? shortenAddress(address) : "Connected")
        : "Not connected";

  return (
    <Card>
      <CardHeader
        action={<StatusPill status={agent.status} />}
        label="agent.state"
        meta="001"
      />
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center border-2 border-foreground text-sm font-bold"
          >
            {agent.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase">{agent.name}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
          </div>
        </div>

        <dl className="grid gap-0 border-2 border-foreground sm:grid-cols-2">
          <div className="border-b-2 border-foreground p-3 sm:border-r-2 sm:border-b-0">
            <dt className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Wallet</dt>
            <dd
              className={`mt-1.5 font-mono text-sm ${walletValue === "Not connected" ? "text-muted-foreground" : ""}`}
              title={address ?? undefined}
            >
              {walletValue}
            </dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center justify-between gap-2 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              <span>USDC Balance</span>
              {balance.kind === "available" ? <LiveBadge /> : null}
            </dt>
            <dd className="mt-1.5 font-mono text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              {renderBalance(balance)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DemoBadge label="DEMO AGENT" />
            {balance.kind === "available" ? (
              <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                READ FROM {network.label} · BLOCK {balance.blockNumber.toString()}
              </span>
            ) : (
              <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                NO LIVE WALLET DATA YET
              </span>
            )}
          </div>
          {connection === "connected" ? (
            <button
              className="border border-foreground/40 px-2 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              onClick={refreshBalance}
              type="button"
            >
              Refresh balance
            </button>
          ) : null}
        </div>

        {balance.kind === "available" ? (
          <p className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
            Read {new Date(balance.readAt).toLocaleTimeString()} — live on-chain value.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function renderBalance(balance: ReturnType<typeof useWallet>["balance"]) {
  switch (balance.kind) {
    case "available":
      return `${balance.formatted} USDC`;
    case "reading":
      return <span className="text-muted-foreground">Reading balance…</span>;
    case "unavailable":
      return (
        <span className="text-accent" title={balance.message}>
          Balance unavailable
        </span>
      );
    case "wrong-network":
      return <span className="text-accent">Wrong network</span>;
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}
