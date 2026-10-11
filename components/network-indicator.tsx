"use client";

import { useWallet } from "@/components/wallet-provider";
import type { NetworkStatus } from "@/lib/wallet/session";

export function NetworkIndicator() {
  const { networkStatus, network } = useWallet();
  const label = network.label.toUpperCase();

  const { text, tone } = describe(networkStatus, label);
  const dotClass =
    tone === "live" ? "bg-accent" : tone === "warn" ? "animate-blink bg-accent" : "bg-muted-foreground";

  return (
    <span
      className="inline-flex items-center gap-1.5 border border-foreground/40 px-2 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase"
      title={
        networkStatus.kind === "wrong-network" && networkStatus.chainId
          ? `Wallet is on chain ${networkStatus.chainId}. AgentPay targets ${network.label} (${network.chainId}).`
          : undefined
      }
    >
      <span aria-hidden className={`size-1.5 ${dotClass}`} />
      {text}
    </span>
  );
}

function describe(
  status: NetworkStatus,
  label: string,
): { text: string; tone: "live" | "warn" | "idle" } {
  switch (status.kind) {
    case "on-network":
      return { text: `${label} CONNECTED`, tone: "live" };
    case "wrong-network":
      return { text: "WRONG NETWORK", tone: "warn" };
    case "rpc-unavailable":
      return { text: `${label} UNAVAILABLE`, tone: "idle" };
    case "no-wallet":
      return { text: "NO WALLET", tone: "idle" };
    default:
      return { text: `${label} OFFLINE`, tone: "idle" };
  }
}
