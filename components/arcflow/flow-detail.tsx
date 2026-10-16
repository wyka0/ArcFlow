"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { custom, type PublicClient } from "viem";

import { Card, CardBody } from "@/components/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/arcflow/notice";
import { useWallet } from "@/components/wallet-provider";
import { createArcReadClient } from "@/lib/arc/client";
import { isArcFlowConfigured, resolveArcFlowContractAddress } from "@/lib/arcflow/contract";
import { readFlow, type ContractFlow } from "@/lib/arcflow/interactions";
import {
  formatBasisPointsPercent,
  formatFlowUsdc,
  flowStatusLabel,
  parseFlowId,
} from "@/lib/arcflow/flow-format";

/**
 * Phase 25 — read-only detail view for a single on-chain V1 flow (`getFlow`).
 * No transaction actions are offered.
 */
type DetailState =
  | { kind: "invalid-id" }
  | { kind: "config-missing" }
  | { kind: "loading" }
  | { kind: "not-found"; message: string }
  | { kind: "error"; message: string }
  | { kind: "loaded"; flowId: bigint; flow: ContractFlow };

export function FlowDetail({ flowId: rawId }: { flowId: string }) {
  const { network, providerRef } = useWallet();
  const configured = isArcFlowConfigured(network);
  const contractAddress = resolveArcFlowContractAddress(network);
  const parsed = useMemo(() => parseFlowId(rawId), [rawId]);
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (parsed === null) {
      setState({ kind: "invalid-id" });
      return;
    }
    if (!configured) {
      setState({ kind: "config-missing" });
      return;
    }

    // Build the read client inside the callback (never read a ref during render).
    const provider = providerRef.current;
    const client: PublicClient = provider
      ? createArcReadClient(network, custom({ request: (args) => provider.request(args) }))
      : createArcReadClient(network);

    setState({ kind: "loading" });
    const result = await readFlow(parsed, client, network);
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        setState({ kind: "not-found", message: result.message });
        return;
      }
      if (result.reason === "NOT_CONFIGURED") {
        setState({ kind: "config-missing" });
        return;
      }
      setState({ kind: "error", message: result.message });
      return;
    }
    setState({ kind: "loaded", flowId: parsed, flow: result.flow });
  }, [parsed, configured, network, providerRef]);

  useEffect(() => {
    // Fetch on mount / when the flow id or wallet context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      <div className="mb-6">
        <Link href="/app/flows" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All flows
        </Link>
      </div>

      <Card>
        <CardBody className="p-5 lg:p-6">
          {state.kind === "invalid-id" && (
            <Notice tone="destructive" title="Invalid flow ID">
              “{rawId}” is not a valid flow ID. Flow IDs are non-negative integers.
            </Notice>
          )}

          {state.kind === "config-missing" && (
            <Notice tone="info" title="On-chain flow unavailable">
              The ArcFlow contract address is not configured in this deployment, so this flow cannot
              be read from the chain.
            </Notice>
          )}

          {state.kind === "loading" && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading flow from Arc…
            </div>
          )}

          {state.kind === "not-found" && (
            <Notice tone="warning" title="Flow not found">
              {state.message}
            </Notice>
          )}

          {state.kind === "error" && (
            <div>
              <Notice tone="destructive" title="Could not read flow">
                {state.message}
              </Notice>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {state.kind === "loaded" && (
            <FlowDetailView flowId={state.flowId} flow={state.flow} contractAddress={contractAddress} explorerUrl={network.explorerUrl} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FlowDetailView({
  flowId,
  flow,
  contractAddress,
  explorerUrl,
}: {
  flowId: bigint;
  flow: ContractFlow;
  contractAddress: `0x${string}` | null;
  explorerUrl: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">
          Flow #{flowId.toString()}
        </h1>
        <Badge variant={flow.active ? "accent" : "outline"}>{flowStatusLabel(flow.active)}</Badge>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Flow ID" value={flowId.toString()} mono />
        <Field label="Status" value={flowStatusLabel(flow.active)} />
        <Field label="Owner" value={flow.owner} mono />
        <Field
          label="Threshold"
          value={formatFlowUsdc(flow.threshold)}
          hint="Minimum amount required to execute (6-decimal USDC)"
        />
        <Field
          label="Treasury"
          value={flow.treasury}
          mono
          hint={formatBasisPointsPercent(flow.treasuryBps)}
        />
        <Field
          label="Contributor"
          value={flow.contributor}
          mono
          hint={formatBasisPointsPercent(flow.contributorBps)}
        />
      </dl>

      {contractAddress && (
        <p className="text-xs text-muted-foreground">
          Contract:{" "}
          <a
            href={`${explorerUrl}/address/${contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline"
          >
            {contractAddress}
          </a>
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
