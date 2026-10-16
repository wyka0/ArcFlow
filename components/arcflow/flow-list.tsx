"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Plus, Workflow } from "lucide-react";
import { custom, type Address, type PublicClient } from "viem";

import { Card, CardBody } from "@/components/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@/components/ui/empty";
import { Notice } from "@/components/arcflow/notice";
import { useWallet } from "@/components/wallet-provider";
import { createArcReadClient } from "@/lib/arc/client";
import { isArcFlowConfigured } from "@/lib/arcflow/contract";
import { readFlow, readFlowsByOwner, type ContractFlow } from "@/lib/arcflow/interactions";
import {
  formatBasisPointsPercent,
  formatFlowUsdc,
  flowStatusLabel,
  shortenFlowAddress,
} from "@/lib/arcflow/flow-format";

/**
 * Phase 25 — on-chain flow list for the connected owner.
 *
 * Every state is explicit: a missing configuration, a disconnected wallet, a
 * wrong network, an RPC error, an empty result, and a loaded list are all
 * distinguished. An RPC error is NEVER rendered as "no flows".
 */
type ListState =
  | { kind: "config-missing" }
  | { kind: "no-wallet" }
  | { kind: "wrong-network" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "loaded"; flows: { id: bigint; flow: ContractFlow }[] };

export function FlowList() {
  const { session, connection, network, providerRef } = useWallet();
  const configured = isArcFlowConfigured(network);
  const address = session.wallet.address;
  const [state, setState] = useState<ListState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!configured) {
      setState({ kind: "config-missing" });
      return;
    }
    if (connection === "wrong-network") {
      setState({ kind: "wrong-network" });
      return;
    }
    if (!address) {
      setState({ kind: "no-wallet" });
      return;
    }

    // Build the read client inside the callback (never read a ref during render).
    const provider = providerRef.current;
    const client: PublicClient = provider
      ? createArcReadClient(network, custom({ request: (args) => provider.request(args) }))
      : createArcReadClient(network);

    setState({ kind: "loading" });

    const ids = await readFlowsByOwner(address as Address, client, network);
    if (!ids.ok) {
      setState({ kind: "error", message: ids.message });
      return;
    }
    if (ids.flowIds.length === 0) {
      setState({ kind: "empty" });
      return;
    }

    const flows: { id: bigint; flow: ContractFlow }[] = [];
    for (const id of ids.flowIds) {
      const result = await readFlow(id, client, network);
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      flows.push({ id, flow: result.flow });
    }
    setState({ kind: "loaded", flows });
  }, [configured, connection, address, network, providerRef]);

  useEffect(() => {
    // Fetch on mount / when the wallet context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (state.kind === "config-missing") {
    return (
      <Notice tone="info" title="On-chain flows unavailable">
        The ArcFlow contract address is not configured in this deployment, so flows cannot be read.
        No on-chain data is shown rather than a misleading empty list.
      </Notice>
    );
  }

  if (state.kind === "no-wallet") {
    return (
      <Notice tone="warning" title="Wallet not connected">
        Connect your wallet to read the flows owned by your address.
      </Notice>
    );
  }

  if (state.kind === "wrong-network") {
    return (
      <Notice tone="destructive" title="Wrong network">
        Switch to Arc mainnet (chain ID 5042) to read your flows.
      </Notice>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Reading flows from Arc…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2">
          <AlertCircle className="size-4" />
          <span className="font-semibold">Could not read flows</span>
        </div>
        <p className="ml-6">{state.message}</p>
        <div className="ml-6 mt-3">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <Empty>
        <EmptyIcon>
          <Workflow />
        </EmptyIcon>
        <EmptyTitle>No flows found</EmptyTitle>
        <EmptyDescription>
          This wallet has no on-chain flows yet. Create one to get started.
        </EmptyDescription>
        <EmptyAction>
          <Link href="/app/flows/new">
            <Button variant="outline">
              <Plus />
              Create your first flow
            </Button>
          </Link>
        </EmptyAction>
      </Empty>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {state.flows.map(({ id, flow }) => (
        <li key={id.toString()}>
          <Link
            href={`/app/flows/${id.toString()}`}
            className="flex flex-col gap-2 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">
                Flow #{id.toString()}
              </span>
              <Badge variant={flow.active ? "accent" : "outline"}>{flowStatusLabel(flow.active)}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Treasury{" "}
                <span className="font-mono text-foreground">{shortenFlowAddress(flow.treasury)}</span>{" "}
                · {formatBasisPointsPercent(flow.treasuryBps)}
              </span>
              <span>
                Contributor{" "}
                <span className="font-mono text-foreground">
                  {shortenFlowAddress(flow.contributor)}
                </span>{" "}
                · {formatBasisPointsPercent(flow.contributorBps)}
              </span>
              <span>
                Threshold <span className="font-mono text-foreground">{formatFlowUsdc(flow.threshold)}</span>
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
