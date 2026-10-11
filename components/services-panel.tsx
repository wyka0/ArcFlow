"use client";

import { Card, CardBody, CardHeader } from "@/components/card";
import { DemoBadge } from "@/components/demo-badge";
import { usePaymentFlow } from "@/components/payment-flow-provider";
import { formatMoney } from "@/lib/money";
import { getRecipientEnvVarName } from "@/lib/payments/recipients";
import type { Service } from "@/types";

const SERVICE_CATEGORY_ACCENTS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  "market-data": {
    border: "border-info/50",
    bg: "bg-info/10",
    text: "text-info",
    dot: "bg-info",
  },
  "research-report": {
    border: "border-warning/50",
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
  },
  "ai-summary": {
    border: "border-accent/50",
    bg: "bg-accent/10",
    text: "text-accent",
    dot: "bg-accent",
  },
};

export function ServicesPanel({ services }: { services: readonly Service[] }) {
  const { requestPayment, gate, status } = usePaymentFlow();

  const blockedServiceId =
    gate.status === "blocked" && status === "blocked" ? gate.serviceId : undefined;

  return (
    <Card variant="primary">
      <CardHeader action={<DemoBadge label="LOCAL DEMO" />} label="service.registry" meta="003" />
      <CardBody className="p-0">
        <ul>
          {services.map((service, index) => {
            const isBlocked = blockedServiceId === service.id;
            const accents = SERVICE_CATEGORY_ACCENTS[service.category] || SERVICE_CATEGORY_ACCENTS["market-data"];
            return (
              <li
                className={`flex flex-col gap-4 px-5 py-5 ${
                  index < services.length - 1 ? "border-b border-border" : ""
                }`}
                key={service.id}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-lg font-bold uppercase">{service.name}</p>
                      <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase ${accents.border} ${accents.bg} ${accents.text}`}>
                        <span className={`status-dot size-1.5 ${accents.dot}`} />
                        {service.category.toUpperCase()}
                      </span>
                      {!service.active && (
                        <span className="border border-border px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground/80 max-w-md">{service.description}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span
                      className="shrink-0 font-mono text-2xl"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoney(service.price, service.currency)}
                    </span>
                    <span className="text-[9px] tracking-[0.15em] text-muted-foreground uppercase">PER REQUEST</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                  <button
                    className="border-2 border-foreground bg-foreground px-4 py-2 text-[9px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => requestPayment(service)}
                    type="button"
                    disabled={!service.active}
                  >
                    Request Payment
                  </button>
                  {isBlocked ? (
                    <span className="text-[9px] tracking-[0.15em] text-accent uppercase">
                      Blocked
                    </span>
                  ) : null}
                </div>

                {isBlocked ? <RecipientHint serviceId={service.id} /> : null}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-5 py-4 text-[10px] leading-relaxed text-muted-foreground uppercase">
          Local demo service definitions. Not real external services. Selecting a service builds a
          payment request only — it does not send a transaction.
        </p>
      </CardBody>
    </Card>
  );
}

function RecipientHint({ serviceId }: { serviceId: string }) {
  return (
    <p className="text-[9px] leading-relaxed tracking-[0.1em] text-muted-foreground uppercase pt-2 border-t border-border">
      Demo recipient env: {getRecipientEnvVarName(serviceId)}
    </p>
  );
}