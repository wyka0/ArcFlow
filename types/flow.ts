import type { Address } from "viem";

export type { Address };

export type FlowStatus = "DRAFT" | "ACTIVE" | "PAUSED";

export type TriggerType = "PAYMENT_RECEIVED";

export type ConditionOperator = "GTE";

export type ActionType = "TRANSFER";

export interface FlowTrigger {
  type: TriggerType;
}

export interface FlowCondition {
  operator: ConditionOperator;
  amount: string;
}

export interface FlowAction {
  type: ActionType;
  recipient: Address;
  percentage: number;
}

export interface Flow {
  id?: string;
  name: string;
  trigger: FlowTrigger;
  condition: FlowCondition;
  actions: FlowAction[];
  status: FlowStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowValidationError {
  field: string;
  message: string;
}

export function validateFlow(flow: Partial<Flow>): FlowValidationError[] {
  const errors: FlowValidationError[] = [];

  if (!flow.name?.trim()) {
    errors.push({ field: "name", message: "Flow name is required" });
  }

  if (!flow.trigger?.type) {
    errors.push({ field: "trigger", message: "Trigger is required" });
  }

  if (!flow.condition?.operator) {
    errors.push({ field: "condition.operator", message: "Condition operator is required" });
  }

  const amount = Number(flow.condition?.amount);
  if (!flow.condition?.amount || isNaN(amount) || amount <= 0) {
    errors.push({ field: "condition.amount", message: "Amount must be a positive number" });
  }

  if (!flow.actions?.length) {
    errors.push({ field: "actions", message: "At least one action is required" });
  } else {
    let totalPercentage = 0;
    flow.actions.forEach((action, index) => {
      if (!action.recipient || !isValidAddress(action.recipient)) {
        errors.push({ field: `actions[${index}].recipient`, message: "Valid EVM address required" });
      }
      if (typeof action.percentage !== "number" || action.percentage <= 0) {
        errors.push({ field: `actions[${index}].percentage`, message: "Percentage must be positive" });
      }
      totalPercentage += action.percentage;
    });

    if (totalPercentage !== 100) {
      errors.push({ field: "actions", message: `Total percentage must equal 100% (currently ${totalPercentage}%)` });
    }
  }

  return errors;
}

/**
 * Field prefixes that each wizard step is responsible for validating.
 * The `name` field is intentionally excluded from step progression — it is
 * only enforced by `validateFlow` at final review / deployment time.
 */
const STEP_FIELD_PREFIXES: Record<string, readonly string[]> = {
  trigger: ["trigger"],
  condition: ["trigger", "condition"],
  action: ["trigger", "condition", "actions"],
};

/**
 * Filter full-flow validation errors down to those that should block
 * progression at the given wizard step.
 *
 * Example: on the "trigger" step, errors about action recipients
 * ("actions[0].recipient") do not block Next — the user has not
 * reached that step yet.
 */
export function validateStep(
  flow: Partial<Flow>,
  step: string,
): FlowValidationError[] {
  const all = validateFlow(flow);
  // Fail-safe: for an unrecognized step, return ALL errors so progression
  // is blocked rather than silently allowed.
  const prefixes = STEP_FIELD_PREFIXES[step];
  if (!prefixes) return all;
  return all.filter((e) => prefixes.some((p) => e.field.startsWith(p)));
}

export function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function formatAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const DEFAULT_FLOW: Omit<Flow, "id"> = {
  name: "",
  trigger: { type: "PAYMENT_RECEIVED" },
  condition: { operator: "GTE", amount: "10.00" },
  actions: [
    { type: "TRANSFER", recipient: "0x" as Address, percentage: 80 },
    { type: "TRANSFER", recipient: "0x" as Address, percentage: 20 },
  ],
  status: "DRAFT",
};