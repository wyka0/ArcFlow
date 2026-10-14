"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, CheckCircle, AlertCircle, Loader2, History } from "lucide-react";
import { formatAddress } from "@/types";
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

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/payments/history", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) {
            setError("Sign in to view your payment history.");
          } else {
            const err = await res.json().catch(() => ({}));
            setError(err.error?.message ?? "Failed to load payment history.");
          }
          return;
        }
        const json = await res.json();
        if (json.ok) {
          setData(json);
        } else {
          setError(json.error?.message ?? "Failed to load payment history.");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, []);

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
    return (
      <div className="mx-auto w-full max-w-5xl p-4 pb-16 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your payment history and flow executions</p>
        </div>
        <Card variant="primary" className="border-destructive">
          <CardBody className="p-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="size-5" />
              <span className="font-medium">Unable to load activity</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
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
            <Empty>
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
        <span>Build rules. Move money automatically. On Arc.</span>
      </footer>
    </div>
  );
}