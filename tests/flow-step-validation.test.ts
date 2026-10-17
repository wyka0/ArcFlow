import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLOW,
  validateFlow,
  validateStep,
  type Flow,
  type FlowCondition,
} from "@/types/flow";

const VALID_RECIPIENT_A = "0xAbC1234567890aBcD1234567890abcD123456789" as const;
/** Same address as VALID_RECIPIENT_A, all lowercase (case-insensitivity test input). */
const VALID_RECIPIENT_A_LOWER = "0xabc1234567890abcd1234567890abcd123456789" as const;
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

describe("flow name validation (Phase 44)", () => {
  it("permits progress when the name is valid and all other fields are valid", () => {
    const errors = validateFlow(VALID_FLOW);
    expect(errors.some(e => e.field === "name")).toBe(false);
    expect(errors).toHaveLength(0);
  });

  it("rejects an empty name", () => {
    const errors = validateFlow({ ...VALID_FLOW, name: "" });
    expect(errors.some(e => e.field === "name" && e.message.length > 0)).toBe(true);
  });

  it("rejects whitespace-only names", () => {
    for (const name of ["   ", "\t", "\n", " \t\n "]) {
      const errors = validateFlow({ ...VALID_FLOW, name });
      expect(errors.some(e => e.field === "name")).toBe(true);
    }
  });

  it("rejects a flow with no name property (fail-safe)", () => {
    const flow = { ...VALID_FLOW } as Partial<Flow>;
    delete (flow as { name?: string }).name;
    const errors = validateFlow(flow);
    expect(errors.some(e => e.field === "name")).toBe(true);
  });

  it("permits progress after correcting a name error, preserving all other settings", () => {
    const broken = { ...VALID_FLOW, name: "   " };
    expect(validateFlow(broken).some(e => e.field === "name")).toBe(true);
    // The user fixes only the name; every other field is untouched.
    const fixed = { ...broken, name: "Revenue Split" };
    expect(validateFlow(fixed)).toHaveLength(0);
  });

  it("name is deployment-only: per-step progression ignores it, but the single review gate (validateFlow) enforces it", () => {
    // STEP_FIELD_PREFIXES intentionally excludes "name" from step progression.
    // Both review entry points (desktop footer "Review" and mobile
    // "Review & Deploy") share `validateAll` -> `validateFlow` as their gate,
    // so neither can bypass the required name.
    const flow = { ...VALID_FLOW, name: "" };
    expect(validateStep(flow, "action")).toHaveLength(0); // progression not blocked
    expect(validateFlow(flow).some(e => e.field === "name")).toBe(true); // review gate blocks
  });
});

describe("recipient count validation (Phase 42)", () => {
  it("accepts exactly two recipients", () => {
    const errors = validateFlow(VALID_FLOW);
    expect(errors.some(e => e.message.includes("exactly 2"))).toBe(false);
    expect(errors).toHaveLength(0);
  });

  it("rejects a single recipient", () => {
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [{ type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 100 }],
    };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.message.includes("exactly 2 recipients"))).toBe(true);
    // The lone recipient is valid and totals 100%, so the count rule is the
    // only failure — nothing was silently discarded or re-balanced.
    expect(errors.filter(e => e.field === "actions")).toHaveLength(1);
  });

  it("rejects three recipients", () => {
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 60 },
        { type: "TRANSFER", recipient: VALID_RECIPIENT_B, percentage: 25 },
        { type: "TRANSFER", recipient: "0x9999999999999999999999999999999999999999", percentage: 15 },
      ],
    };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.message.includes("exactly 2 recipients"))).toBe(true);
    // Addresses and percentage total (100%) are fine — only the count fails.
    expect(errors.filter(e => e.field === "actions")).toHaveLength(1);
  });

  it("keeps address and percentage-total validation intact alongside the count rule", () => {
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [
        { type: "TRANSFER", recipient: "0x", percentage: 60 },
        { type: "TRANSFER", recipient: VALID_RECIPIENT_B, percentage: 30 },
      ],
    };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.field.startsWith("actions[") && e.message.includes("EVM address"))).toBe(true);
    expect(errors.some(e => e.field === "actions" && e.message.includes("100%"))).toBe(true);
    expect(errors.some(e => e.message.includes("exactly 2"))).toBe(false);
  });
});

describe("threshold precision (Phase 42)", () => {
  const withAmount = (amount: string): Partial<Flow> => ({
    ...VALID_FLOW,
    condition: { operator: "GTE", amount },
  });

  it("accepts whole-dollar, two-decimal, and minimum-cent values", () => {
    for (const amount of ["1", "1.25", "0.01", "10.00"]) {
      const errors = validateFlow(withAmount(amount));
      expect(errors.some(e => e.field === "condition.amount")).toBe(false);
    }
  });

  it("rejects sub-cent and extra-decimal values without rounding", () => {
    for (const amount of ["0.001", "1.239"]) {
      const errors = validateFlow(withAmount(amount));
      // The precision message proves rejection was for the decimal rule —
      // a silently rounded value (e.g. 1.239 -> 1.24) would be accepted
      // and produce no error at all.
      expect(errors.some(e => e.field === "condition.amount" && e.message.includes("2 decimal places"))).toBe(true);
    }
  });

  it("rejects zero and negative thresholds", () => {
    for (const amount of ["0", "0.00", "-1", "-0.01"]) {
      const errors = validateFlow(withAmount(amount));
      expect(errors.some(e => e.field === "condition.amount" && e.message.includes("positive number"))).toBe(true);
    }
  });

  it("rejects empty, whitespace-only, and non-numeric thresholds", () => {
    for (const amount of ["", "   ", "abc"]) {
      const errors = validateFlow(withAmount(amount));
      expect(errors.some(e => e.field === "condition.amount")).toBe(true);
    }
  });
});

describe("distinct recipient addresses (Phase 49B.9.1)", () => {
  it("rejects identical addresses in identical casing", () => {
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 80 },
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 20 },
      ],
    };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.field === "actions" && e.message.includes("two different addresses"))).toBe(true);
  });

  it("rejects identical addresses differing only by letter casing", () => {
    // Same address as VALID_RECIPIENT_A, all lowercase: EVM addresses are
    // case-insensitive, so this must be treated as identical.
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 80 },
        { type: "TRANSFER", recipient: "0xabc1234567890abcd1234567890abcd123456789", percentage: 20 },
      ],
    };
    const errors = validateFlow(flow);
    expect(errors.some(e => e.field === "actions" && e.message.includes("two different addresses"))).toBe(true);
  });

  it("accepts two different valid addresses (no distinct-address error)", () => {
    const errors = validateFlow(VALID_FLOW);
    expect(errors.some(e => e.message.includes("two different addresses"))).toBe(false);
    expect(errors).toHaveLength(0);
  });

  it("placeholder drafts report address errors without a distinct-address error", () => {
    // DEFAULT_FLOW carries two "0x" placeholders: malformed, so the existing
    // address errors must remain and the distinctness rule must not fire.
    const errors = validateFlow(DEFAULT_FLOW);
    expect(errors.filter(e => e.message.includes("Valid EVM address required")).length).toBe(2);
    expect(errors.some(e => e.message.includes("two different addresses"))).toBe(false);
  });

  it("review/deployment progression is blocked for duplicate recipients (shared gate)", () => {
    const flow: Partial<Flow> = {
      ...VALID_FLOW,
      actions: [
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A, percentage: 80 },
        { type: "TRANSFER", recipient: VALID_RECIPIENT_A_LOWER, percentage: 20 },
      ],
    };
    // The action step owns "actions" errors, so both the desktop footer
    // "Review" and the mobile "Review & Deploy" paths (validateAll) block.
    expect(validateStep(flow, "action").some(e => e.message.includes("two different addresses"))).toBe(true);
    expect(validateFlow(flow).some(e => e.message.includes("two different addresses"))).toBe(true);
  });
});
