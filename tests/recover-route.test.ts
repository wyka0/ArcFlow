/**
 * Route-level tests for `POST /api/payments/recover` (Phase 51.2 — L3).
 *
 * Thin-route checks only: authentication, body validation, and the typed
 * ownership rejections. All rejections here happen before any chain access,
 * so no network client is exercised and the suite is fully hermetic. The
 * settlement and verification behaviour is covered by
 * `tests/recover-payment.test.ts` with an injected chain reader.
 */
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import { toUsdcBaseUnits } from "@/lib/arc/payment";
import type { EvmAddress, PaymentIntent, TrustedPayment } from "@/types";

const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";
const USDC = ARC_MAINNET.usdcAddress as EvmAddress;

const userA = privateKeyToAccount(`0x${"1".repeat(64)}` as `0x${string}`);
const userB = privateKeyToAccount(`0x${"2".repeat(64)}` as `0x${string}`);

type RecoverRouteModule = typeof import("@/app/api/payments/recover/route");
type AuthModule = typeof import("@/lib/auth");
type FactoryModule = typeof import("@/lib/payments/server/factory");

let recoverRoute: RecoverRouteModule;
let auth: AuthModule;
let factory: FactoryModule;

beforeEach(async () => {
  process.env[ENV_KEY] = "0xdddddddddddddddddddddddddddddddddddddddd";
  vi.resetModules();

  recoverRoute = await import("@/app/api/payments/recover/route");
  auth = await import("@/lib/auth");
  factory = await import("@/lib/payments/server/factory");

  auth.setChallengeStoreForTesting(auth.createInMemoryChallengeStore());
  auth.setAuthSessionRepositoryForTesting(auth.createInMemoryAuthSessionRepository());
  factory.setTrustedRepositoryForTesting(factory.createInMemoryTrustedRepository());
  const security = await import("@/lib/security");
  security.setRateLimitStoreForTesting(new security.InMemoryRateLimitStore());
  security.setSecurityLoggerSinkForTesting(() => {});
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

function jsonPost(body: unknown, cookieValue?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://app.agentpay.example",
  };
  if (cookieValue) headers["cookie"] = `${auth.SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request("https://app.agentpay.example/api/payments/recover", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function signIn(account: ReturnType<typeof privateKeyToAccount>): Promise<string> {
  const challengeModule = await import("@/app/api/auth/challenge/route");
  const verifyModule = await import("@/app/api/auth/verify/route");

  const challengeResp = await challengeModule.POST(
    jsonPost({ walletAddress: account.address }) as Request,
  );
  const challengeBody = await challengeResp.json();
  const signature = await account.signMessage({ message: challengeBody.challenge.message });
  const verifyResp = await verifyModule.POST(
    jsonPost(
      { walletAddress: account.address, challengeId: challengeBody.challenge.id, signature },
      undefined,
    ) as Request,
  );
  return (verifyResp.headers.get("set-cookie") ?? "").split(";")[0]?.split("=")[1] ?? "";
}

async function seedIntent(overrides: Partial<PaymentIntent> = {}): Promise<PaymentIntent> {
  const repo = await factory.getTrustedRepository();
  const now = new Date();
  const intent: PaymentIntent = {
    id: "pay_recover_route",
    agentId: "agent_test",
    serviceId: "test-service",
    serviceName: "Test Service",
    sender: null,
    recipient: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as EvmAddress,
    amount: { amount: 0.1, currency: "USDC" },
    amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
    currency: "USDC",
    chainId: ARC_MAINNET.chainId,
    tokenAddress: USDC,
    status: "pending",
    txHash: null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() - 3_600_000).toISOString(),
    ownerWalletAddress: userA.address,
    ...overrides,
  };
  await repo.createIntent(intent);
  return intent;
}

async function seedOwnerlessPayment(txHash: string): Promise<void> {
  const repo = await factory.getTrustedRepository();
  const payment: TrustedPayment = {
    id: "tpay_ownerless_route",
    txHash: txHash as `0x${string}`,
    chainId: ARC_MAINNET.chainId,
    tokenAddress: USDC,
    agentId: "agent_test",
    serviceId: "test-service",
    serviceName: "Test Service",
    sender: "0xcccccccccccccccccccccccccccccccccccccccc" as EvmAddress,
    recipient: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as EvmAddress,
    amount: { amount: 0.1, currency: "USDC" },
    currency: "USDC",
    amountBaseUnits: toUsdcBaseUnits(0.1).toString(),
    status: "confirmed",
    blockNumber: "1",
    confirmedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ownerWalletAddress: null,
    intentId: null,
  };
  await repo.insertPayment(payment);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(response: Response): Promise<{ status: number; body: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, body: (await response.json()) as any };
}

describe("POST /api/payments/recover", () => {
  it("requires authentication (401)", async () => {
    const { status, body } = await readJson(
      await recoverRoute.POST(
        jsonPost({ intentId: "pay_recover_route", txHash: `0x${"a".repeat(64)}` }),
      ),
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a malformed intentId with 400", async () => {
    const cookie = await signIn(userA);
    const { status, body } = await readJson(
      await recoverRoute.POST(
        jsonPost({ intentId: "not-an-intent", txHash: `0x${"a".repeat(64)}` }, cookie),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_INTENT_ID");
  });

  it("rejects a malformed txHash with 400", async () => {
    const cookie = await signIn(userA);
    const { status, body } = await readJson(
      await recoverRoute.POST(jsonPost({ intentId: "pay_recover_route", txHash: "0x1234" }, cookie)),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_TX_HASH");
  });

  it("rejects ownerless-intent recovery with 403 OWNER_REQUIRED and no record", async () => {
    const cookie = await signIn(userA);
    await seedIntent({ ownerWalletAddress: null });

    const { status, body } = await readJson(
      await recoverRoute.POST(
        jsonPost({ intentId: "pay_recover_route", txHash: `0x${"a".repeat(64)}` }, cookie),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("OWNER_REQUIRED");
    expect(body.record).toBeUndefined();
  });

  it("rejects cross-wallet recovery with 403", async () => {
    const cookie = await signIn(userB); // userB does not own the intent
    await seedIntent({ ownerWalletAddress: userA.address });

    const { status, body } = await readJson(
      await recoverRoute.POST(
        jsonPost({ intentId: "pay_recover_route", txHash: `0x${"a".repeat(64)}` }, cookie),
      ),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.record).toBeUndefined();
  });

  it("does not disclose an ownerless already-recorded payment (403, no record)", async () => {
    const cookie = await signIn(userA); // even the intent's rightful owner
    await seedIntent({ ownerWalletAddress: userA.address });
    const txHash = `0x${"a".repeat(64)}`;
    await seedOwnerlessPayment(txHash);

    const { status, body } = await readJson(
      await recoverRoute.POST(jsonPost({ intentId: "pay_recover_route", txHash }, cookie)),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.record).toBeUndefined();
  });
});
