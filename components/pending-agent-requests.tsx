"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth, useInjectedSignMessage } from "@/components/auth-provider";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";
import { formatMoney } from "@/lib/money";
import { sendUsdcTransfer } from "@/lib/wallet/payment";
import { getActiveArcNetwork } from "@/lib/arc/network";
import { getInjectedProvider } from "@/lib/wallet/client";
import { verifyTrustedTransaction } from "@/lib/payments/client";
import { PipelineVisualization } from "@/components/pipeline-visualization";
import type { ServiceRequest } from "@/types/service-request";
import type { Currency } from "@/types/money";
import type { EvmAddress } from "@/types/money";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY =
  "border border-foreground/40 px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const SUCCESS_BTN =
  "border-2 border-success bg-success px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-success-foreground transition-colors hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60";
const STATUS_BADGE =
  "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase";

const MODAL_OVERLAY =
  "fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 isolation-isolate";
const MODAL_BOX =
  "w-full max-w-[640px] max-h-[calc(100vh-32px)] bg-[#F2F1EA] border-2 border-foreground p-6 isolation-isolate z-[100] relative animate-scale-fade overflow-y-auto [background-image:radial-gradient(circle,#c9c7bc_1px,transparent_1px)] [background-size:22px_22px]";
const MODAL_TITLE =
  "text-sm font-bold tracking-[0.2em] uppercase text-foreground mb-3";
const MODAL_TEXT =
  "text-[10px] tracking-[0.15em] text-muted-foreground uppercase mb-4";
const MODAL_REQUEST =
  "border-2 border-foreground p-4 mb-6 bg-white";
const MODAL_ACTIONS =
  "flex items-center gap-2 justify-end mt-6 pt-4 border-t-2 border-foreground";
const MODAL_BUTTON_PRIMARY =
  "border-2 border-foreground bg-foreground px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const MODAL_BUTTON_SECONDARY =
  "border border-foreground/40 px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

interface PendingAgentRequest {
  id: string;
  agentName: string;
  serviceName: string;
  serviceCategory: string;
  amount: number;
  currency: Currency;
  status: ServiceRequest["status"];
  intentId: string | null;
  createdAt: string;
  ownerWalletAddress: string;
}

interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  request: PendingAgentRequest | null;
}

function RejectModal({ isOpen, onClose, onConfirm, isLoading, request }: RejectModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const focusableElementsSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const trapFocus = useCallback((event: KeyboardEvent) => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(focusableElementsSelector);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.setAttribute('inert', 'true');
    }

    setTimeout(() => {
      const cancelButton = modalRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      cancelButton?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (mainContent) {
        mainContent.removeAttribute('inert');
      }
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose, trapFocus]);

  if (!isOpen || !request) return null;

  const modalContent = (
    <div className={MODAL_OVERLAY} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reject-modal-title" aria-describedby="reject-modal-desc">
      <div ref={modalRef} className={MODAL_BOX} onClick={(e) => e.stopPropagation()}>
        <h2 id="reject-modal-title" className={MODAL_TITLE}>CONFIRM REJECTION</h2>
        <p id="reject-modal-desc" className={MODAL_TEXT}>
          REJECT THIS PAYMENT REQUEST?
        </p>
        <p className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase mb-4 leading-relaxed">
          This will permanently reject this payment request. No USDC will be transferred and the requested service will not be fulfilled.
        </p>
        <div className={MODAL_REQUEST}>
          <p className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase mb-2">REQUEST</p>
          <div className="space-y-1">
            <p className="font-mono text-sm text-accent overflow-wrap-anywhere">{request.serviceName}</p>
            <p className="font-mono text-sm text-accent">{formatMoney(request.amount, request.currency)}</p>
          </div>
        </div>
        <div className={MODAL_ACTIONS}>
          <button
            className={MODAL_BUTTON_SECONDARY}
            disabled={isLoading}
            onClick={onClose}
            type="button"
          >
            CANCEL
          </button>
          <button
            className={MODAL_BUTTON_PRIMARY}
            disabled={isLoading}
            onClick={onConfirm}
            type="button"
          >
            REJECT PAYMENT
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export function PendingAgentRequests() {
  const auth = useAuth();
  const wallet = useWallet();
  const injected = useInjectedSignMessage(auth.session?.walletAddress ?? undefined);
  const [pendingRequests, setPendingRequests] = useState<PendingAgentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingAgentRequest | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/v1/pending", {
        method: "GET",
        headers: { "content-type": "application/json" },
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          if (mountedRef.current) {
            setPendingRequests([]);
            setLoading(false);
          }
          return;
        }
        throw new Error(data?.error?.message ?? "Failed to load pending requests");
      }
      if (data.ok && mountedRef.current) {
        setPendingRequests(data.requests);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load pending requests");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Use setTimeout to avoid synchronous setState in effect
    setTimeout(() => {
      if (mountedRef.current) {
        fetchPending();
      }
    }, 0);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPending]);

  const handleApprove = useCallback(async (request: PendingAgentRequest) => {
    if (!request.intentId) return;
    setError(null);
    try {
      if (demoMode) {
        const response = await fetch("/api/agent/v1/demo/complete-payment", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ requestId: request.id }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error?.message ?? "Failed to complete demo payment");
      } else {
        const intentResponse = await fetch(`/api/agent/v1/requests/${request.id}/intent`, {
          method: "GET",
          headers: { "content-type": "application/json" },
          credentials: "include",
        });
        const intentData = await intentResponse.json();
        if (!intentData.ok) throw new Error(intentData.error?.message ?? "Failed to fetch payment intent");

        const intent = intentData.intent;

        const { connection, network, session } = wallet;
        const provider = getInjectedProvider();
        if (connection !== "connected" || !provider) {
          throw new Error("Connect a wallet before approving a payment.");
        }
        if (intent.chainId !== network.chainId) {
          throw new Error(`Switch your wallet to ${network.label} (chain ${network.chainId}) before approving.`);
        }

        const paymentRequest = {
          id: intent.id,
          agentId: request.id,
          serviceId: request.id,
          recipient: intent.recipient,
          amount: { amount: intent.amount.amount, currency: intent.currency },
          currency: intent.currency,
        };

        const sent = await sendUsdcTransfer({
          provider: provider!,
          network: getActiveArcNetwork(),
          request: paymentRequest,
          from: session.wallet.address as EvmAddress,
        });

        if (!sent.ok) throw new Error(sent.error.message);

        const verifyResult = await verifyTrustedTransaction({
          intentId: intent.id,
          txHash: sent.transactionHash,
        });
        if (!verifyResult.ok) throw new Error(verifyResult.code === "ALREADY_RECORDED"
          ? "Transaction already recorded"
          : verifyResult.message);

        const fulfillResponse = await fetch(`/api/services/requests/${request.id}/fulfill`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
        });
        const fulfillData = await fulfillResponse.json();
        if (!fulfillData.ok) throw new Error(fulfillData.error?.message ?? "Failed to verify payment");

        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve payment");
      return;
    }
    fetchPending();
  }, [demoMode, fetchPending, wallet]);

  const handleReject = useCallback((request: PendingAgentRequest) => {
    setRejectTarget(request);
    setRejectModalOpen(true);
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const rejectedId = rejectTarget.id;
    setRejectLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/services/requests/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Payment request rejected by owner." }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message ?? "Failed to reject payment request");
      setError(null);
      setPendingRequests((current) => current.filter((req) => req.id !== rejectedId));
      fetchPending();
      setRejectLoading(false);
      setRejectModalOpen(false);
      setRejectTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject payment request");
      setRejectLoading(false);
    }
  }, [fetchPending, rejectTarget]);

  const handleRejectCancel = useCallback(() => {
    setRejectModalOpen(false);
    setRejectTarget(null);
  }, []);

  const handleFulfill = useCallback(async (request: PendingAgentRequest) => {
    if (!request.intentId) return;
    setError(null);
    try {
      const response = await fetch(`/api/services/requests/${request.id}/fulfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message ?? "Failed to fulfill service request");
      setError(null);
      fetchPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fulfill service request");
    }
  }, [fetchPending]);

  const handleDemoModeToggle = () => {
    setDemoMode((prev) => !prev);
  };

  return (
    <>
      <section id="main-content" className="border-2 border-foreground bg-background/80 p-6 lg:p-8">
        <div className="flex flex-col items-center gap-5 text-center mb-8">
          <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            Pending Agent Requests
          </span>
          <p className="text-sm text-foreground max-w-md">
            Review and approve payment requests from your registered external agents.
            Each request requires explicit human wallet approval.
          </p>
          <label className="flex flex-col items-start gap-2 text-sm text-foreground cursor-pointer">
            <div className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={handleDemoModeToggle}
                className="border-2 border-foreground bg-background px-2 py-1 text-[10px] font-mono uppercase"
              />
              <span className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                Demo Mode (simulate payment without real transaction)
              </span>
            </div>
            <span className="text-[9px] tracking-[0.1em] text-muted-foreground/70 uppercase font-mono ml-4">
              LOCAL DEMO — simulate the payment → fulfillment lifecycle without an on-chain transaction.
            </span>
          </label>
        </div>

        {error && (
          <div className="mb-6 border-2 border-accent bg-accent/5 p-5 animate-panel-slide-in">
            <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
              {error}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Loading pending requests…
            </span>
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="text-center py-12 animate-fade-up">
            <div className="inline-flex items-center justify-center w-16 h-16 border-2 border-border mb-4">
              <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              No pending agent requests.
            </p>
          </div>
        ) : (
          <div className="border-2 border-foreground animate-fade-up">
            <div className="border-b-2 border-foreground px-5 py-3 lg:px-6 lg:py-4">
              <p className="text-sm font-bold uppercase">Pending Approvals</p>
            </div>
            <ul className="divide-y divide-border">
              {pendingRequests.map((req) => (
                <PendingRequestCard
                  key={req.id}
                  request={req}
                  loading={loading}
                  auth={auth}
                  wallet={wallet}
                  injected={injected}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onFulfill={handleFulfill}
                  demoMode={demoMode}
                />
              ))}
            </ul>
          </div>
        )}
      </section>
      <RejectModal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        onConfirm={handleRejectConfirm}
        isLoading={rejectLoading}
        request={rejectTarget}
      />
    </>
  );
}

function PendingRequestCard({
  request,
  loading,
  auth,
  wallet,
  injected,
  onApprove,
  onReject,
  onFulfill,
  demoMode,
}: {
  request: PendingAgentRequest;
  loading: boolean;
  auth: ReturnType<typeof useAuth>;
  wallet: ReturnType<typeof useWallet>;
  injected: ReturnType<typeof useInjectedSignMessage>;
  onApprove: (req: PendingAgentRequest) => void;
  onReject: (req: PendingAgentRequest) => void;
  onFulfill: (req: PendingAgentRequest) => void;
  demoMode: boolean;
}) {
  const isPaymentRequired = request.status === "payment_required";
  const isPaymentPending = request.status === "payment_pending";
  const isPaymentConfirmed = request.status === "payment_confirmed";
  const isFulfilled = request.status === "fulfilled";
  const isRejected = request.status === "rejected";

  const getStatusBadge = () => {
    switch (request.status) {
      case "payment_required":
      case "payment_pending":
        return (
          <span className={`${STATUS_BADGE} border-accent bg-accent/5 text-accent`}>
            {request.status.replace(/_/g, " ").toUpperCase()}
          </span>
        );
      case "payment_confirmed":
        return (
          <span className={`${STATUS_BADGE} border-success bg-success/5 text-success`}>
            PAYMENT CONFIRMED
          </span>
        );
      case "fulfilled":
        return (
          <span className={`${STATUS_BADGE} border-success bg-success text-success-foreground`}>
            FULFILLED
          </span>
        );
      case "rejected":
        return (
          <span className={`${STATUS_BADGE} border-destructive bg-destructive/5 text-destructive`}>
            REJECTED
          </span>
        );
      case "failed":
        return (
          <span className={`${STATUS_BADGE} border-destructive bg-destructive/5 text-destructive`}>
            FAILED
          </span>
        );
      default:
        return (
          <span className={`${STATUS_BADGE} border-border text-muted-foreground`}>
            {request.status.replace(/_/g, " ").toUpperCase()}
          </span>
        );
    }
  };

  const getActionButtons = () => {
    if (auth.status === "authenticated") {
      if (isPaymentRequired || isPaymentPending) {
        return (
          <div className="flex items-center gap-2">
            <button
              className={SUCCESS_BTN}
              disabled={loading}
              onClick={() => onApprove(request)}
              type="button"
            >
              Approve Payment
            </button>
            <button
              className={SECONDARY}
              disabled={loading}
              onClick={() => onReject(request)}
              type="button"
            >
              Reject Payment
            </button>
          </div>
        );
      }
      if (isPaymentConfirmed) {
        return (
          <div className="flex items-center gap-2">
            <button
              className={SUCCESS_BTN}
              disabled={loading}
              onClick={() => onFulfill(request)}
              type="button"
            >
              Fulfill Service
            </button>
          </div>
        );
      }
      if (isFulfilled || isRejected || request.status === "failed") {
        return (
          <span className={SECONDARY} style={{ cursor: "default" }}>
            {isFulfilled ? "Fulfilled" : isRejected ? "Rejected" : "Failed"}
          </span>
        );
      }
    }
    return (
      <div className="flex items-center gap-2">
        <button
          className={PRIMARY}
          disabled={!injected}
          onClick={async () => {
            if (auth.session?.walletAddress && injected) {
              try {
                await auth.signIn({ walletAddress: auth.session.walletAddress, signMessage: injected });
                await auth.refresh();
              } catch {
                // Error handled in auth context
              }
            }
          }}
          type="button"
        >
          Sign In to Approve
        </button>
        <button
          className={SECONDARY}
          disabled={!injected}
          onClick={async () => {
            if (auth.session?.walletAddress && injected) {
              try {
                await auth.signIn({ walletAddress: auth.session.walletAddress, signMessage: injected });
                await auth.refresh();
              } catch {
                // Error handled in auth context
              }
            }
          }}
          type="button"
        >
          Sign In to Reject
        </button>
      </div>
    );
  };

  // Payment Confirmed - Large Card with Pipeline Visualization
  if (isPaymentConfirmed) {
    return (
      <li className="bg-success/2 border-t border-success/50 animate-panel-slide-in" style={{ borderTopWidth: '2px' }}>
        <div className="p-5 lg:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 border-2 border-success bg-success text-success-foreground">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold uppercase text-success">PAYMENT CONFIRMED</p>
                <p className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">VERIFIED ON ARC</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-lg text-accent" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(request.amount, request.currency)}
              </span>
            </div>
          </div>

          {/* Pipeline Visualization */}
          <PipelineVisualization currentPhase="confirmed" showLabels={true} compact={false} />

          {/* Details Grid */}
          <dl className="mt-5 grid gap-0 border-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
            <DetailRow label="SERVICE" value={request.serviceName} />
            <DetailRow label="REQUEST" value={request.serviceCategory.toUpperCase()} />
            <DetailRow label="AMOUNT" value={formatMoney(request.amount, request.currency)} />
            <DetailRow label="ARC TRANSACTION" value={request.intentId ?? "—"} mono />
          </dl>

          {/* Fulfill Button */}
          <div className="mt-5 flex items-center gap-3 border-t border-border pt-5">
            {auth.status === "authenticated" ? (
              <button
                className={SUCCESS_BTN}
                disabled={loading}
                onClick={() => onFulfill(request)}
                type="button"
              >
                Fulfill Service
              </button>
            ) : (
              <button
                className={PRIMARY}
                disabled={!injected}
                onClick={async () => {
                  if (auth.session?.walletAddress && injected) {
                    try {
                      await auth.signIn({ walletAddress: auth.session.walletAddress, signMessage: injected });
                      await auth.refresh();
                    } catch {
                      // Error handled in auth context
                    }
                  }
                }}
                type="button"
              >
                Sign In to Fulfill
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  // Standard pending request card
  return (
    <li className="p-5 lg:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-up">
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold uppercase">{request.agentName}</p>
          {getStatusBadge()}
        </div>
        <p className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {request.serviceName}
        </p>
        <p className="text-[9px] font-mono text-muted-foreground">
          ID: {request.id} · Intent: {request.intentId ?? "—"} · Created: {new Date(request.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:ml-4 shrink-0">
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-lg text-accent" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(request.amount, request.currency)}
          </span>
          <span className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
            Owner: {shortenAddress(request.ownerWalletAddress)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {getActionButtons()}
        </div>
      </div>
    </li>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-border p-4 last:border-b-0 sm:odd:border-r-2 sm:odd:border-r-foreground">
      <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
      <dd className={`mt-1.5 text-sm ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}