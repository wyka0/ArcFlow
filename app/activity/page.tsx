"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, History, LogIn } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Card, CardBody } from "@/components/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyAction, EmptyDescription, EmptyIcon, EmptyTitle } from "@/components/ui/empty";

interface TrustedPayment {
  id: string;
  txHash: string;
  chainId: number;
  tokenAddress: string;
  agentId: string;
  serviceId: string;
  serviceName: string;
  sender: string;
  recipient: string;
  amount: { amount: number; currency: string };
  currency: string;
  amountBaseUnits: string;
  status: "confirmed";
  blockNumber: string;
  confirmedAt: string;
  createdAt: string;
  ownerWalletAddress: string | null;
  intentId: string | null;
}

interface SpendingSummary {
  currency: string;
  dailyLimit: number;
  spentToday: number;
  remainingToday: number;
  zone: string;
}

interface ActivityData {
  records: TrustedPayment[];
  spending: SpendingSummary;
  persistence: { kind: string; durable: boolean; label: string; note: string };
}

type ActivityError =
  | { kind: "unauthenticated"; message: string }
  | { kind: "api"; message: string };

export default function ActivityPage() {
  const auth = useAuth();
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ActivityError | null>(null);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/history", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError({ kind: "unauthenticated", message: "Sign in to view your payment history." });
        } else {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { error?: { message?: string } })?.error?.message ??
            "Failed to load payment history.";
          setError({ kind: "api", message: msg });
        }
        return;
      }
      const json = await res.json();
      if (json.ok) {
        setData(json);
      } else {
        setError({
          kind: "api",
          message: json.error?.message ?? "Failed to load payment history.",
        });
      }
    } catch {
      setError({ kind: "api", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchActivity();
  }, [fetchActivity, auth.status]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your payment history and flow executions</p>
        </div>
        <Card>
          <CardBody className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-accent" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error) {
    const isUnauth = error.kind === "unauthenticated";
    return (
      <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your payment history and flow executions</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <div className="flex items-center gap-3">
              {isUnauth ? (
                <LogIn className="size-5 text-accent" />
              ) : (
                <AlertCircle className="size-5 text-destructive" />
              )}
              <span className={`font-medium ${isUnauth ? "text-foreground" : "text-destructive"}`}>
                {isUnauth ? "Sign in required" : "Unable to load activity"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
            <div className="mt-4 flex items-center gap-3">
              {isUnauth ? (
                <p className="text-xs text-muted-foreground">
                  Connect your wallet in the header, then click &ldquo;Sign In&rdquo; to
                  authenticate with your wallet.
                </p>
              ) : (
                <Button variant="outline" onClick={() => void fetchActivity()}>
                  Try again
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const records = data?.records ?? [];
  const spending = data?.spending;

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your payment history and flow executions</p>
      </div>

      {/* Spending summary */}
      {spending && (
        <Card className="mb-6">
          <CardBody className="p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Daily Limit</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {spending.spentToday.toFixed(2)} / {spending.dailyLimit.toFixed(2)} {spending.currency}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {spending.remainingToday.toFixed(2)} remaining
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Per Transaction</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {spending.dailyLimit.toFixed(2)} {spending.currency}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zone</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {spending.zone.toUpperCase()}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Payment history */}
      <Card>
        <CardBody className="p-5 lg:p-6">
          {records.length === 0 ? (
            // Phase 49B.11.12 — compact, content-proportional empty state: the
            // dashed panel sits evenly inset inside the parent card without the
            // oversized default vertical padding.
            <Empty compact>
              <EmptyIcon>
                <History className="size-6" />
              </EmptyIcon>
              <EmptyTitle>No payment activity yet</EmptyTitle>
              <EmptyDescription>
                Your confirmed payments will appear here once you start using flows.
              </EmptyDescription>
              <EmptyAction>
                <Link href="/app/flows/new">
                  <Button>
                    Create your first flow
                  </Button>
                </Link>
              </EmptyAction>
            </Empty>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {records.length} payment{records.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Service</th>
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recipient</th>
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(record.confirmedAt).toLocaleDateString()} {new Date(record.confirmedAt).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-sm text-foreground">{record.serviceName}</td>
                        <td className="p-3 text-sm font-mono text-foreground">
                          {record.amount.amount.toFixed(2)} {record.currency}
                        </td>
                        <td className="p-3 text-sm font-mono text-muted-foreground">
                          {record.recipient.slice(0, 6)}...{record.recipient.slice(-4)}
                        </td>
                        <td className="p-3">
                          <Badge variant="success">Confirmed</Badge>
                        </td>
                        <td className="p-3">
                          <a
                            href={`https://explorer.arc.io/tx/${record.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-accent hover:underline truncate block max-w-xs"
                          >
                            {record.txHash.slice(0, 10)}...
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <footer className="mt-8 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
        <span className="font-medium text-foreground">ArcFlow</span>
        <span>Build rules. Split money on demand. On Arc.</span>
      </footer>
    </div>
  );
}
