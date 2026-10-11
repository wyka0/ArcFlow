"use client";

import { useState, useCallback, useMemo } from "react";
import type { ChangeEvent } from "react";

import { Card, CardBody, CardHeader } from "@/components/card";
import { DemoBadge } from "@/components/demo-badge";
import { useAgentExecution } from "@/components/agent-execution-provider";
import { formatMoney } from "@/lib/money";
import { listActiveServices, getService } from "@/lib/services/registry";
import type { Service } from "@/types";
import type { ServiceRequest, ServiceResult } from "@/types/service-request";
import type { AgentExecutionState } from "@/lib/agent/execution";
import { PipelineVisualization } from "@/components/pipeline-visualization";

const PRIMARY_BTN =
  "border-2 border-foreground bg-foreground px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BTN =
  "border border-foreground/40 px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground";
const SUCCESS_BTN =
  "border-2 border-success bg-success px-5 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-success-foreground transition-colors hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50";

interface ServiceInputField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  options?: string[];
}

const SERVICE_INPUTS: Record<string, ServiceInputField[]> = {
  "market-data": [
    { name: "symbol", label: "Symbol", type: "text", required: true },
    { name: "timeframe", label: "Timeframe", type: "select", required: false, options: ["1m", "5m", "15m", "1h", "4h", "1d"] },
  ],
  "research-report": [
    { name: "topic", label: "Topic", type: "text", required: true },
    { name: "depth", label: "Depth", type: "select", required: false, options: ["summary", "detailed"] },
  ],
  "ai-summary": [
    { name: "text", label: "Text", type: "textarea", required: true },
    { name: "maxLength", label: "Max Length", type: "text", required: false },
  ],
};

export function ServiceRequestPanel() {
  const { state, execute, canExecute, cancel, reset } = useAgentExecution();
  const services = listActiveServices();

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestCreated, setRequestCreated] = useState(false);
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(null);
  const [serviceResult, setServiceResult] = useState<ServiceResult | null>(null);
  const [resultStatus, setResultStatus] = useState<"idle" | "fetching" | "ready" | "not_ready" | "error">("idle");

  const selectedService = selectedServiceId ? getService(selectedServiceId) ?? null : null;
  const inputFields = useMemo(
    () => (selectedServiceId ? SERVICE_INPUTS[selectedServiceId] ?? [] : []),
    [selectedServiceId],
  );

  const handleInputChange = useCallback((name: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleServiceSelect = useCallback((serviceId: string) => {
    setSelectedServiceId(serviceId);
    setInputValues({});
    setError(null);
    setRequestCreated(false);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedServiceId(null);
    setError(null);
  }, []);

  const handleRequest = useCallback(async () => {
    if (!selectedService) return;

    const missingRequired = inputFields
      .filter((f) => f.required)
      .filter((f) => !inputValues[f.name]?.trim());

    if (missingRequired.length > 0) {
      setError(`Missing required fields: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/services/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "agent_research_01",
          serviceId: selectedServiceId,
          input: inputValues,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error?.message ?? "Failed to create service request");
        return;
      }

      setServiceRequest(data.request as ServiceRequest);
      setRequestCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedService, inputFields, inputValues, selectedServiceId]);

  const handleExecute = useCallback(async () => {
    if (!serviceRequest) return;
    await execute(serviceRequest.serviceId);
  }, [execute, serviceRequest]);

  const handleFulfill = useCallback(async () => {
    if (!serviceRequest) return;

    setResultStatus("fetching");
    setError(null);

    try {
      const response = await fetch(`/api/services/requests/${serviceRequest.id}/fulfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error?.message ?? "Failed to fulfill request");
        setResultStatus("error");
        return;
      }

      // Fetch the result from the new result endpoint
      const resultResponse = await fetch(`/api/services/requests/${serviceRequest.id}/result`);
      const resultData = await resultResponse.json();

      if (resultData.ok) {
        if (resultData.status === "READY" && resultData.result) {
          setServiceResult(resultData.result as ServiceResult);
          setResultStatus("ready");
        } else {
          setResultStatus("not_ready");
        }
      } else {
        setResultStatus("error");
      }

      // Also refresh the request state
      const refreshed = await fetch(`/api/services/requests/${serviceRequest.id}`);
      const refreshedData = await refreshed.json();
      if (refreshedData.ok) {
        setServiceRequest(refreshedData.request as ServiceRequest);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fulfill request");
      setResultStatus("error");
    }
  }, [serviceRequest]);

  // Phase 1: Service selection
  if (!requestCreated) {
    return (
      <Card variant="primary">
        <CardHeader action={<DemoBadge label="LOCAL DEMO" />} label="service.request" meta="007" />
        <CardBody className="p-0">
          {selectedService ? (
            <ServiceInputForm
              service={selectedService}
              inputFields={inputFields}
              inputValues={inputValues}
              error={error}
              isSubmitting={isSubmitting}
              onInputChange={handleInputChange}
              onRequest={handleRequest}
              onBack={handleBack}
            />
          ) : (
            <ServiceList services={services} onSelect={handleServiceSelect} />
          )}
        </CardBody>
      </Card>
    );
  }

  // Phase 2: Request created, awaiting execution
  if (
    requestCreated &&
    serviceRequest &&
    (state.phase === "idle" || state.phase === "intent_rejected" || state.phase === "failed")
  ) {
    return (
      <RequestCreatedCard
        serviceRequest={serviceRequest}
        state={state}
        error={error}
        canExecute={canExecute}
        isSubmitting={isSubmitting}
        onExecute={handleExecute}
        onCancel={cancel}
        onReset={reset}
      />
    );
  }

  // Phase 3: Execution in progress or completed
  return (
    <ExecutionCard
      serviceRequest={serviceRequest}
      serviceResult={serviceResult}
      resultStatus={resultStatus}
      setResultStatus={setResultStatus}
      state={state}
      isSubmitting={isSubmitting}
      onExecute={handleExecute}
      onFulfill={handleFulfill}
      onCancel={cancel}
      onReset={reset}
    />
  );
}

// ============== SUB-COMPONENTS ==============

function ServiceList({ services, onSelect }: { services: readonly Service[]; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4 p-5 lg:p-6">
      <p className="text-sm font-bold uppercase">SELECT A SERVICE</p>
      <ul className="flex flex-col gap-3">
        {services.map((service, index) => (
          <li
            key={service.id}
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 py-4 ${
              index < services.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold uppercase">{service.name}</p>
              <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {service.category}
              </p>
              <p className="mt-2 text-xs text-muted-foreground/80 max-w-xs truncate">
                {service.description}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="shrink-0 font-mono text-lg" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(service.price, service.currency)}
              </span>
              <button
                className="border-2 border-foreground bg-foreground px-4 py-2 text-[9px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => onSelect(service.id)}
                type="button"
              >
                Select
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceInputForm({
  service,
  inputFields,
  inputValues,
  error,
  isSubmitting,
  onInputChange,
  onRequest,
  onBack,
}: {
  service: Service;
  inputFields: ServiceInputField[];
  inputValues: Record<string, string>;
  error: string | null;
  isSubmitting: boolean;
  onInputChange: (name: string, value: string) => void;
  onRequest: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-5 lg:p-6">
      <div className="border-2 border-foreground p-5">
        <p className="text-sm font-bold uppercase">{service.name}</p>
        <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {service.category} · {formatMoney(service.price, service.currency)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">{service.description}</p>
      </div>

      <div className="flex flex-col gap-4">
        {inputFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
              {field.label} {field.required && <span className="text-accent">*</span>}
            </label>
            <InputField
              field={field}
              value={inputValues[field.name] ?? ""}
              onChange={(v) => onInputChange(field.name, v)}
            />
          </div>
        ))}

        {error && (
          <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <button className={PRIMARY_BTN} disabled={isSubmitting} onClick={onRequest} type="button">
            {isSubmitting ? "Creating…" : "Create Request"}
          </button>
          <button className={SECONDARY_BTN} onClick={onBack} type="button">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({
  field,
  value,
  onChange,
}: {
  field: ServiceInputField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "select") {
    return (
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className="border-2 border-foreground bg-background px-4 py-3 text-[10px] font-mono uppercase text-foreground"
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        className="border-2 border-foreground bg-background px-4 py-3 text-[10px] font-mono uppercase text-foreground resize-y min-h-[100px]"
        rows={5}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className="border-2 border-foreground bg-background px-4 py-3 text-[10px] font-mono uppercase text-foreground"
    />
  );
}

function RequestCreatedCard({
  serviceRequest,
  state,
  error,
  canExecute,
  isSubmitting,
  onExecute,
  onCancel,
  onReset,
}: {
  serviceRequest: ServiceRequest;
  state: AgentExecutionState;
  error: string | null;
  canExecute: boolean;
  isSubmitting: boolean;
  onExecute: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const isFailed = state.phase === "failed";
  const recipient = serviceRequest.paymentIntentId ?? serviceRequest.id;

  return (
    <Card variant="primary">
      <CardHeader
        action={<DemoBadge label="LOCAL DEMO" />}
        label="service.request"
        meta="007"
      />
      <CardBody className="p-0">
        <div className="flex flex-col gap-5 p-5 lg:p-6">
          <div className="border-2 border-foreground p-5">
            <p className="text-sm font-bold uppercase">SERVICE REQUEST CREATED</p>
            <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {isFailed ? "Execution failed." : "Payment intent created. Awaiting wallet execution."}
            </p>
          </div>

          <PipelineVisualization currentPhase={state.phase} compact />

          <dl className="grid gap-0 border-2 border-foreground sm:grid-cols-2">
            <Row label="Service" value={serviceRequest.serviceName} />
            <Row label="Status" value={serviceRequest.status} tone={isFailed ? "bad" : "ok"} />
            <Row label="Request ID" value={serviceRequest.id} mono title={serviceRequest.id} />
            <Row label="Intent ID" value={recipient} mono title={recipient} />
            <Row label="Created" value={new Date(serviceRequest.createdAt).toLocaleString()} />
            <Row
              label="Tx Hash"
              value={serviceRequest.txHash ?? "—"}
              mono
              title={serviceRequest.txHash ?? undefined}
            />
          </dl>

          {error && (
            <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            {canExecute ? (
              <>
                <button className={PRIMARY_BTN} disabled={isSubmitting} onClick={onExecute} type="button">
                  Execute Payment
                </button>
                <button className={SECONDARY_BTN} onClick={onCancel} type="button">
                  Cancel
                </button>
              </>
            ) : (
              <button className={SECONDARY_BTN} onClick={onReset} type="button">
                Start Over
              </button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ExecutionCard({
  serviceRequest,
  serviceResult,
  resultStatus,
  setResultStatus,
  state,
  isSubmitting,
  onExecute,
  onFulfill,
  onCancel,
  onReset,
}: {
  serviceRequest: ServiceRequest | null;
  serviceResult: ServiceResult | null;
  resultStatus: "idle" | "fetching" | "ready" | "not_ready" | "error";
  setResultStatus: (status: "idle" | "fetching" | "ready" | "not_ready" | "error") => void;
  state: AgentExecutionState;
  isSubmitting: boolean;
  onExecute: () => void;
  onFulfill: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const executionPhase = state.phase;
  const isExecuting = ["requesting_intent", "awaiting_signature", "submitted", "verification_pending"].includes(executionPhase);
  const isCompleted = ["confirmed", "failed"].includes(executionPhase);
  const isFulfilled = serviceRequest?.status === "fulfilled";

  const subline = getExecutionSubline(executionPhase, isFulfilled);

  return (
    <Card variant="primary">
      <CardHeader
        action={<DemoBadge label="LOCAL DEMO" />}
        label="agent.execution"
        meta="008"
      />
      <CardBody className="p-0">
        <div className="flex flex-col gap-5 p-5 lg:p-6 animate-panel-slide-in">
          <div className="border-2 border-foreground p-5">
            <p className="text-sm font-bold uppercase">{executionPhase.replace(/_/g, " ").toUpperCase()}</p>
            <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{subline}</p>
          </div>

          <PipelineVisualization currentPhase={executionPhase} />

          <dl className="grid gap-0 border-2 border-foreground sm:grid-cols-2">
            <Row label="Service" value={serviceRequest?.serviceName ?? "—"} />
            <Row label="Status" value={serviceRequest?.status ?? executionPhase} tone={isFulfilled ? "ok" : executionPhase === "failed" ? "bad" : undefined} />
            <Row label="Request ID" value={serviceRequest?.id ?? "—"} mono />
            <Row
              label="Tx Hash"
              value={state.transactionHash ? `${state.transactionHash.slice(0, 16)}…` : "—"}
              mono
            />
            <Row label="Trusted Payment" value={serviceRequest?.trustedPaymentId ?? "—"} mono />
            <Row label="Fulfilled At" value={serviceRequest?.fulfilledAt ? new Date(serviceRequest.fulfilledAt).toLocaleString() : "—"} />
          </dl>

          {/* FULFILLMENT RUNNING STATE */}
          {resultStatus === "fetching" && (
            <FulfillmentRunningState />
          )}

          {resultStatus === "not_ready" && (
            <div className="border-2 border-foreground p-5 animate-panel-slide-in">
              <p className="text-sm font-bold uppercase">RESULT NOT READY</p>
              <p className="mt-1 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                Fulfillment completed but result is not yet available.
              </p>
            </div>
          )}

          {resultStatus === "error" && (
            <div className="border-2 border-accent p-5 animate-panel-slide-in">
              <p className="text-sm font-bold uppercase">RESULT FETCH FAILED</p>
              <p className="mt-1 text-[10px] tracking-[0.15em] text-accent uppercase">
                Could not retrieve service result.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button className={SECONDARY_BTN} onClick={() => setResultStatus("fetching")} type="button">
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* SERVICE RESULT PANEL - THE KEY IMPROVEMENT */}
          {serviceResult && resultStatus === "ready" && (
            <ServiceResultDisplay result={serviceResult} />
          )}

          {state.failureReason && (
            <div className="border-2 border-accent p-4 animate-panel-slide-in">
              <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Reason</p>
              <p className="mt-1.5 text-xs leading-relaxed">{state.failureReason}</p>
            </div>
          )}

          {state.error && (
            <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
              {state.error}
            </p>
          )}

          <ExecutionActions
            executionPhase={executionPhase}
            isExecuting={isExecuting}
            isCompleted={isCompleted}
            isFulfilled={isFulfilled}
            isSubmitting={isSubmitting}
            onExecute={onExecute}
            onFulfill={onFulfill}
            onCancel={onCancel}
            onReset={onReset}
          />
        </div>
      </CardBody>
    </Card>
  );
}

/* NEW: Fulfillment running state with animation */
function FulfillmentRunningState() {
  const steps = [
    { id: "agentpay", label: "AGENTPAY", subtitle: "Payment verified", phase: "payment_confirmed" },
    { id: "coingecko", label: "COINGECKO", subtitle: "Fetching data", phase: "fetching" },
    { id: "result", label: "RESULT", subtitle: "Data returned", phase: "ready" },
  ];

  return (
    <div className="border-2 border-foreground p-5 animate-panel-slide-in">
      <p className="text-sm font-bold uppercase mb-5">SERVICE EXECUTION</p>
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-4">
            <div className="flex flex-col items-center shrink-0">
              <span className="status-dot size-3 bg-border transition-all duration-300" />
              {index < steps.length - 1 && (
                <div className="mt-1 w-px h-10 bg-gradient-to-b from-border/50 to-transparent" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[10px] tracking-[0.15em] font-mono uppercase text-muted-foreground">
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground/70">{step.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="animate-spin size-5 border-2 border-accent/30 border-t-accent rounded-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutionActions({
  executionPhase,
  isExecuting,
  isCompleted,
  isFulfilled,
  isSubmitting,
  onExecute,
  onFulfill,
  onCancel,
  onReset,
}: {
  executionPhase: string;
  isExecuting: boolean;
  isCompleted: boolean;
  isFulfilled: boolean;
  isSubmitting: boolean;
  onExecute: () => void;
  onFulfill: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  if (executionPhase === "intent_approved" && !isExecuting && !isCompleted) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button className={PRIMARY_BTN} disabled={isSubmitting} onClick={onExecute} type="button">
          {isSubmitting ? "Executing…" : "Confirm & Execute"}
        </button>
        <button className={SECONDARY_BTN} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    );
  }

  if (executionPhase === "confirmed" && !isFulfilled) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button className={SUCCESS_BTN} disabled={isSubmitting} onClick={onFulfill} type="button">
          Fulfill Service
        </button>
        <button className={SECONDARY_BTN} onClick={onReset} type="button">
          Done
        </button>
      </div>
    );
  }

  if (executionPhase === "confirmed" && isFulfilled) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button className={SECONDARY_BTN} onClick={onReset} type="button">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
      <button className={SECONDARY_BTN} onClick={onReset} type="button">
        Reset
      </button>
    </div>
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
      <dt className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
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

/* MAJOR IMPROVEMENT: Rich ServiceResultDisplay with market-data specific fields */
function ServiceResultDisplay({ result }: { result: ServiceResult }) {
  const isMarketData = result.serviceId === "market-data";
  const output = result.output as Record<string, unknown> | null;
  const provider = isMarketData && output?.provider ? String(output.provider) : "unknown";
  const source = isMarketData && output?.source ? String(output.source) : "unknown";
  const timestamp = output?.timestamp ? String(output.timestamp) : result.fulfilledAt;
  
  // Market data specific fields
  const symbol = isMarketData && output?.symbol ? String(output.symbol) : "—";
  const price = isMarketData && output?.price ? String(output.price) : "—";
  const change24h = isMarketData && output?.change24h ? String(output.change24h) : "—";
  const volume24h = isMarketData && output?.volume24h ? String(output.volume24h) : "—";

  return (
    <div className="border-2 border-success bg-success/2 p-6 animate-result-reveal" role="status" aria-live="polite">
      {/* Header with status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pb-4 border-b-2 border-success">
        <div>
          <p className="text-sm font-bold uppercase text-success">SERVICE RESULT</p>
          <p className="mt-0.5 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {isMarketData ? "MARKET DATA" : result.serviceId.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 border-2 border-success bg-success px-3 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-success-foreground">
            <span className="status-dot status-dot-success size-1.5" /> READY
          </span>
          {isMarketData && provider !== "unknown" && (
            <span className="inline-flex items-center gap-1.5 border border-info/50 bg-info/10 px-3 py-1 text-[9px] font-bold tracking-[0.2em] uppercase text-info">
              {provider.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Market Data - Large Price Display */}
      {isMarketData && (
        <div className="mb-6">
          <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2">{symbol}</p>
          <p className="text-4xl sm:text-5xl font-bold font-mono tracking-tight text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            ${parseFloat(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold tracking-[0.15em] uppercase font-mono ${
              change24h.startsWith("-") 
                ? "border-destructive/50 bg-destructive/10 text-destructive" 
                : "border-success/50 bg-success/10 text-success"
            }`}>
              {change24h.startsWith("-") ? "" : "+"}{change24h}%
            </span>
            <span className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase font-mono">
              24H CHANGE
            </span>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <dl className="grid gap-0 border-2 border-border sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {isMarketData && (
          <>
            <DetailRow label="24H VOLUME" value={volume24h === "—" ? "—" : `$${parseFloat(volume24h).toLocaleString()}`} />
            <DetailRow label="SOURCE" value={source.toUpperCase()} />
            <DetailRow label="PROVIDER" value={provider.toUpperCase()} />
          </>
        )}
        <DetailRow label="UPDATED" value={new Date(timestamp).toLocaleString()} />
        <DetailRow label="TRUSTED PAYMENT" value={result.trustedPaymentId} mono />
        <DetailRow label="RESULT ID" value={result.id} mono />
        <DetailRow label="STATUS" value={result.status.toUpperCase()} tone="ok" />
      </dl>

      {/* Raw output for debugging */}
      {output && (
        <details className="mt-5 border-2 border-border">
          <summary className="p-4 cursor-pointer flex items-center gap-2 select-none">
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Raw Output</span>
            <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="p-4 border-t border-border bg-background">
            <pre className="text-[9px] font-mono whitespace-pre-wrap break-words text-muted-foreground/80">
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono = false, tone }: { label: string; value: string; mono?: boolean; tone?: "ok" }) {
  return (
    <div className="border-b border-border p-4 last:border-b-0 sm:odd:border-r-2 sm:odd:border-r-border">
      <dt className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
      <dd className={`mt-1.5 text-sm ${mono ? "font-mono" : ""} ${tone === "ok" ? "text-success" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function getExecutionSubline(phase: string, fulfilled: boolean): string {
  if (fulfilled) return "Service fulfilled. Result returned.";
  switch (phase) {
    case "requesting_intent":
      return "Requesting payment intent from server…";
    case "intent_approved":
      return "Policy approved. Awaiting wallet confirmation.";
    case "awaiting_signature":
      return "Waiting for wallet confirmation…";
    case "submitted":
      return "Transaction submitted. Waiting for Arc confirmation…";
    case "verification_pending":
      return "Verifying transaction on Arc…";
    case "confirmed":
      return "Payment verified. Service can now be fulfilled.";
    case "failed":
      return "Execution failed.";
    default:
      return "Awaiting action.";
  }
}