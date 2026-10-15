import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLOW,
  validateFlow,
  validateStep,
  type Flow,
  type FlowCondition,
} from "@/types/flow";

const VALID_RECIPIENT_A = "0xAbC1234567890aBcD1234567890abcD123456789" as const;
const VALID_RECIPIENT_B = "0xDef4567890abcdef4567890abcdef4567890abcd" as const;

/**
 * A fully valid flow — every field passes `validateFlow`.
 */
const VALID_FLOW: Partial<Flow> = {
  name: "Revenue Split",
  trigger: { type: "PAYMENT_RECEIVED" },
  condition: { operator: "GTE", amount: "10.00" },
  actions: [
    { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 80 },
    { type: "TRANSFER", recipient: VALID_RECIPIENT_B, percentage: 20 },
  ],
};

describe("validateStep — per-step filtering", () => {
  describe("trigger step", () => {
    it("passes with a valid trigger even when action recipients are placeholders", () => {
      // DEFAULT_FLOW has: name="", trigger valid, condition valid, actions with "0x" recipients
      const errors = validateStep(DEFAULT_FLOW, "trigger");
      expect(errors).toHaveLength(0);
    });

    it("passes with a valid trigger even when the flow name is empty", () => {
      const flow = { ...DEFAULT_FLOW, name: "" };
      const errors = validateStep(flow, "trigger");
      expect(errors).toHaveLength(0);
    });

    it("blocks when the trigger is missing", () => {
      const flow = { ...DEFAULT_FLOW, trigger: undefined };
      const errors = validateStep(flow, "trigger");
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("trigger");
    });
  });

  describe("condition step", () => {
    it("passes when trigger and condition are valid, even if actions are incomplete", () => {
      const errors = validateStep(DEFAULT_FLOW, "condition");
      expect(errors).toHaveLength(0);
    });

    it("blocks when the condition amount is invalid", () => {
      const flow = { ...DEFAULT_FLOW, condition: { operator: "GTE" as const, amount: "" } };
      const errors = validateStep(flow, "condition");
      expect(errors.some(e => e.field === "condition.amount")).toBe(true);
    });

    it("blocks when the condition operator is missing", () => {
      const flow = { ...DEFAULT_FLOW, condition: { amount: "10.00" } } as Partial<Flow>;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - intentionally missing operator for test
      const errors = validateStep(flow, "condition");
      expect(errors.some(e => e.field === "condition.operator")).toBe(true);
    });
  });

  describe("action step", () => {
    it("passes when trigger, condition, and actions are all valid", () => {
      const errors = validateStep(VALID_FLOW, "action");
      if (errors.length > 0) {
        console.log("ACTION STEP ERRORS:", JSON.stringify(errors, null, 2));
        console.log("VALID_FLOW actions:", JSON.stringify(VALID_FLOW.actions, null, 2));
      }
      expect(errors).toHaveLength(0);
    });

    it("blocks when action recipients are placeholders", () => {
      // DEFAULT_FLOW has recipient: "0x" which is not a valid EVM address
      const errors = validateStep(DEFAULT_FLOW, "action");
      expect(errors.some(e => e.field.startsWith("actions"))).toBe(true);
    });

    it("blocks when total percentage does not equal 100", () => {
      const flow: Partial<Flow> = {
        ...VALID_FLOW,
        actions: [
          { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 60 },
          { type: "TRANSFER", recipient: VALID_RECIPIENT_B, percentage: 30 },
        ],
      };
      const errors = validateStep(flow, "action");
      expect(errors.some(e => e.field === "actions" && e.message.includes("100%"))).toBe(true);
    });

    it("does NOT block on missing flow name (name is deployment-only)", () => {
      const flow = { ...VALID_FLOW, name: "" };
      const errors = validateStep(flow, "action");
      if (errors.length > 0) console.log("ACTION NAME ERRORS:", JSON.stringify(errors, null, 2));
      expect(errors).toHaveLength(0);
    });
  });

  describe("unknown step", () => {
    it("returns all errors (fail-safe for unrecognized step)", () => {
      const errors = validateStep(DEFAULT_FLOW, "unknown-step");
      // Should not filter anything — returns all errors from validateFlow
      expect(errors).toEqual(validateFlow(DEFAULT_FLOW));
    });
  });
});

describe("validateFlow — full-flow validation (deployment gate)", () => {
  it("catches missing name", () => {
    const flow = { ...VALID_FLOW, name: "" };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.field === "name")).toBe(true);
  });

  it("passes for a fully valid flow", () => {
    const errors = validateFlow(VALID_FLOW);
    expect(errors).toHaveLength(0);
  });

  it("catches invalid recipients", () => {
    const errors = validateFlow(DEFAULT_FLOW);
    expect(errors.some(e => e.field.startsWith("actions["))).toBe(true);
  });

  it("still catches all issues that validateStep per-step filtering might miss", () => {
    // A flow that passes per-step validation might still fail full validation
    const flow = { ...VALID_FLOW, name: "" }; // per-step passes, full fails
    expect(validateStep(flow, "action")).toHaveLength(0);
    expect(validateFlow(flow).some(e => e.field === "name")).toBe(true);
  });
});
