/**
 * Sprint 10 — Request body hardening.
 *
 * Covers:
 *  - content-type enforcement
 *  - oversize body rejection (both declared and observed)
 *  - malformed JSON rejection
 *  - non-object body rejection
 *  - field length caps
 *  - tx hash validation
 *  - id validation
 */
import { describe, expect, it, vi } from "vitest";

// The dynamic import("@/lib/arc/payment") inside readTxHashField pulls the
// full viem module graph into this unit test. Mock it so the test exercises
// readTxHashField's accept/reject logic in isolation. The mock mirrors the
// canonical /^0x[0-9a-fA-F]{64}$/ pattern from lib/arc/payment.ts.
vi.mock("@/lib/arc/payment", () => ({
  isTransactionHash: (value: unknown): boolean =>
    typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value),
}));

import {
  readIdField,
  readJsonBody,
  readStringField,
  readTxHashField,
} from "@/lib/security/request-body";

function makeRequest(body: string | undefined, contentType: string | null, contentLength?: number): Request {
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  if (contentLength) headers["content-length"] = contentLength.toString();
  return new Request("https://app.agentpay.example/api/x", {
    method: "POST",
    headers,
    body: body ?? undefined,
  });
}

describe("security/request-body — readJsonBody", () => {
  it("rejects non-JSON content types with 415", async () => {
    const result = await readJsonBody(makeRequest("{}", "text/plain"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_CONTENT_TYPE");
      expect(result.status).toBe(415);
    }
  });

  it("accepts application/json; charset=utf-8", async () => {
    const result = await readJsonBody(makeRequest('{"a":1}', "application/json; charset=utf-8"));
    expect(result.ok).toBe(true);
  });

  it("rejects oversize body declared in content-length", async () => {
    const result = await readJsonBody(makeRequest("{}", "application/json", 1024 * 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BODY_TOO_LARGE");
      expect(result.status).toBe(413);
    }
  });

  it("rejects oversize body when content-length is missing", async () => {
    const huge = "x".repeat(1024 * 1024);
    const result = await readJsonBody(makeRequest(`{"a":"${huge}"}`, "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BODY_TOO_LARGE");
  });

  it("rejects empty body", async () => {
    const result = await readJsonBody(makeRequest("", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_BODY");
  });

  it("rejects malformed JSON", async () => {
    const result = await readJsonBody(makeRequest("{not json", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_JSON");
  });

  it("rejects null body as INVALID_JSON (backward compat)", async () => {
    const result = await readJsonBody(makeRequest("null", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_JSON");
  });

  it("rejects array body as INVALID_JSON", async () => {
    const result = await readJsonBody(makeRequest("[]", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_JSON");
  });

  it("accepts a valid JSON object", async () => {
    const result = await readJsonBody(makeRequest('{"a":1}', "application/json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toEqual({ a: 1 });
  });
});

describe("security/request-body — readStringField", () => {
  it("rejects missing field", () => {
    const result = readStringField({}, "x", 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FIELD");
  });
  it("rejects non-string field", () => {
    const result = readStringField({ x: 123 }, "x", 10);
    expect(result.ok).toBe(false);
  });
  it("rejects oversize field", () => {
    const result = readStringField({ x: "a".repeat(100) }, "x", 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FIELD_TOO_LARGE");
  });
  it("accepts string under cap", () => {
    const result = readStringField({ x: "ok" }, "x", 10);
    expect(result.ok).toBe(true);
  });
});

describe("security/request-body — readTxHashField", () => {
  it("rejects malformed hashes", async () => {
    const result = await readTxHashField({ h: "0xnotvalid" }, "h");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MALFORMED_TX_HASH");
  });
  it("accepts a well-formed 32-byte hash", async () => {
    const result = await readTxHashField({ h: "0x" + "a".repeat(64) }, "h");
    expect(result.ok).toBe(true);
  });
});

describe("security/request-body — readIdField", () => {
  it("rejects ids with illegal characters", () => {
    const result = readIdField({ id: "abc/def" }, "id");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MALFORMED_ID");
  });
  it("accepts hex ids", () => {
    const result = readIdField({ id: "abc_123-xyz" }, "id");
    expect(result.ok).toBe(true);
  });
});
