import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function readDirectory(relativeDir: string): Array<{ path: string; source: string }> {
  const dir = join(ROOT, relativeDir);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => ({ path: `${relativeDir}/${name}`, source: readFileSync(join(dir, name), "utf8") }));
}

function readTree(...relativeDirs: string[]): Array<{ path: string; source: string }> {
  return relativeDirs.flatMap((relativeDir) => {
    const entries = readdirSync(join(ROOT, relativeDir), { withFileTypes: true });
    const files: Array<{ path: string; source: string }> = [];
    for (const entry of entries) {
      const childPath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...readTree(childPath));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push({ path: childPath, source: readFileSync(join(ROOT, childPath), "utf8") });
      }
    }
    return files;
  });
}

describe("security boundary — the agent cannot reach the wallet", () => {
  it("keeps eth_sendTransaction in exactly one module", () => {
    const sources = [
      ...readDirectory("lib/wallet"),
      ...readDirectory("lib/arc"),
      ...readDirectory("lib/agent"),
      ...readDirectory("lib/payments"),
      ...readDirectory("components"),
    ];

    const senders = sources.filter((file) => file.source.includes("eth_sendTransaction"));
    expect(senders.map((file) => file.path)).toEqual(["lib/wallet/payment.ts"]);
  });

  it("does not let the agent or decision layers import the wallet sender", () => {
    const agentSources = [...readDirectory("lib/agent"), ...readDirectory("lib/payments")];

    for (const file of agentSources) {
      expect(file.source).not.toContain("@/lib/wallet/payment");
      expect(file.source).not.toContain("eth_sendTransaction");
    }
  });

  it("keeps the policy engine free of wallet and network imports", () => {
    const policy = read("lib/agent/policy.ts");
    expect(policy).not.toContain("@/lib/wallet");
    expect(policy).not.toContain("viem");
    expect(policy).not.toContain("eth_");
  });

  it("only sends a payment from the confirmation layer", () => {
    const senders = readDirectory("components").filter((file) =>
      file.source.includes("@/lib/wallet/payment"),
    );
    expect(senders.map((file) => file.path).sort()).toEqual([
      "components/agent-execution-provider.tsx",
      "components/payment-flow-provider.tsx",
      "components/pending-agent-requests.tsx",
    ].sort());
  });

  it("does not let the services panel call the wallet sender", () => {
    const panel = read("components/services-panel.tsx");
    expect(panel).not.toContain("@/lib/wallet/payment");
    expect(panel).not.toContain("eth_sendTransaction");
    expect(panel).toContain("requestPayment");
  });

  it("does not hardcode an explorer URL in a component", () => {
    for (const file of readDirectory("components")) {
      expect(file.source).not.toContain("explorer.arc.io");
      expect(file.source).not.toContain("arcscan");
    }
  });

  it("does not hardcode the USDC address in a component", () => {
    for (const file of readDirectory("components")) {
      expect(file.source).not.toContain("0x3600000000000000000000000000000000000000");
    }
  });
});

describe("persistence boundary — one owner of storage", () => {
  const STORAGE_MARKERS = ["localStorage", "sessionStorage", "indexedDB"];

  it("only touches browser storage inside the persistence layer", () => {
    const sources = [...readTree("lib"), ...readTree("components"), ...readTree("app")];
    const offenders = sources
      .filter((file) => STORAGE_MARKERS.some((marker) => file.source.includes(marker)))
      .map((file) => file.path)
      .sort();

    expect(offenders).toEqual(["lib/payments/storage.ts"]);
  });

  it("keeps the policy engine free of direct storage access", () => {
    const policy = read("lib/agent/policy.ts");
    for (const marker of STORAGE_MARKERS) {
      expect(policy).not.toContain(marker);
    }
  });

  it("does not read storage from UI components", () => {
    for (const file of readTree("components")) {
      for (const marker of STORAGE_MARKERS) {
        expect(file.source).not.toContain(marker);
      }
    }
  });

  it("exposes persistence through the repository, not the store", () => {
    const repository = read("lib/payments/repository.ts");
    expect(repository).toContain("PaymentHistoryRepository");
    expect(repository).toContain("createPaymentRepository");

    const store = read("lib/payments/store.ts");
    for (const marker of STORAGE_MARKERS) {
      expect(store).not.toContain(marker);
    }
    expect(store).not.toContain("@/lib/payments/storage");
  });

  it("keeps the transaction-hash definition in one place", () => {
    const owners = readTree("lib", "components", "app")
      .filter((file) => /0x\[0-9a-fA-F\]\{64\}/.test(file.source))
      .map((file) => file.path)
      .sort();

    expect(owners).toEqual(["lib/arc/payment.ts"]);
  });

  it("gates daily spend through the storage-agnostic accounting shape", () => {
    const gate = read("lib/payments/gate.ts");
    // The gate is the only place that turns a service into a payment request.
    expect(gate).toContain("buildSpendingSummary");
    // It must consume the abstract accounting shape, not the browser cache type,
    // so the same gate can be fed by the trusted server ledger.
    expect(gate).toContain("AccountingPayment");
    expect(gate).not.toContain("ConfirmedPayment");
    expect(gate).not.toContain("@/lib/payments/repository");
  });

  it("keeps the trusted ledger out of the browser", () => {
    // The API routes live under app/api/ (server-only) so they are allowed to
    // reach into the trusted ledger. Everything else in the browser tree must
    // not import it.
    const sources = [
      ...readTree("components"),
      ...readTree("app").filter((file) => !file.path.startsWith("app/api/")),
    ];
    const offenders = sources
      .filter((file) =>
        file.source.includes("@/lib/payments/server") ||
        file.source.includes("DATABASE_URL") ||
        /\bprocess\.env\b/.test(file.source),
      )
      .map((file) => file.path)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("only exposes the trusted ledger through app/api/", () => {
    const sources = readTree("app");
    const consumers = sources
      .filter((file) => file.source.includes("@/lib/payments/server"))
      .map((file) => file.path)
      .sort();
    expect(consumers).toEqual([
      "app/api/agent/v1/demo/complete-payment/route.ts",
      "app/api/agent/v1/requests/[id]/intent/route.ts",
      "app/api/agent/v1/requests/route.ts",
      "app/api/health/route.ts",
      "app/api/payments/history/route.ts",
      "app/api/payments/intents/route.ts",
      "app/api/payments/recover/route.ts",
      "app/api/payments/verify/route.ts",
      "app/api/services/requests/[id]/reconcile/route.ts",
    ]);
  });

  it("routes service requests through the trusted server, not the browser", () => {
    // Service request routes must delegate to the trusted server service layer.
    // The browser must never directly access the trusted ledger.
    const serviceRoutes = [
      "app/api/services/requests/route.ts",
      "app/api/services/requests/[id]/route.ts",
      "app/api/services/requests/[id]/fulfill/route.ts",
    ];
    for (const route of serviceRoutes) {
      const source = read(route);
      expect(source).toMatch(/@\/lib\/services\/service/);
    }

    // The browser (components) must not call /api/services/requests directly
    // with override fields. They must go through the typed providers.
    const components = readDirectory("components");
    for (const file of components) {
      // No hardcoded payment amount, recipient, or policy in any component
      expect(file.source).not.toMatch(/price:\s*\d/);
    }
  });

  it("keeps the trusted ledger types and the wallet sender out of each other's path", () => {
    const serverSources = readTree("lib/payments/server");
    for (const file of serverSources) {
      // The trusted ledger must be read-only with respect to Arc. No signing,
      // no wallet import, no key material.
      expect(file.source).not.toContain("eth_sendTransaction");
      expect(file.source).not.toContain("@/lib/wallet/payment");
      expect(file.source).not.toContain("privateKey");
    }
  });
});

describe("product UI audit — no internal dev/hackathon references in product UI", () => {
  // Product UI is the union of /app, /, components, and the auth-button
  // text. Documentation (docs/), code comments, tests, and internals are
  // explicitly allowed to retain sprint / hackathon references.
  const productUiSources = [
    ...readTree("components"),
    ...readDirectory("app").filter((f) => f.path.endsWith("page.tsx") || f.path.endsWith("layout.tsx")),
    ...readDirectory("app/app"),
    ...readDirectory("app/api/auth"),
  ];
  const forbidden = [
    "Sprint 0","Sprint 1","Sprint 2","Sprint 2A","Sprint 3","Sprint 4A",
    "Sprint 4B","Sprint 4C","Sprint 5","Sprint 6","Sprint 7","Sprint 8",
    "Sprint 8A","Sprint 8B","Sprint 8C","Sprint 8D","Sprint 9","Sprint 10",
    "ARC MICROGRANTS","BUIDL #2","MICROGRANTS","HACKATHON",
    "END-TO-END UI","DEV BUILD","IMPLEMENTATION COMPLETE",
  ];

  it("no product-UI source contains forbidden internal references", () => {
    for (const file of productUiSources) {
      for (const needle of forbidden) {
        expect(
          file.source,
          `${file.path} contains product-UI reference "${needle}"`,
        ).not.toContain(needle);
      }
    }
  });
});

describe("product UI audit — sequential wallet/auth UX", () => {
  it("AuthButton renders nothing when the wallet is disconnected", () => {
    const source = read("components/auth-button.tsx");
    // Pin the state machine: when the wallet is not connected, the
    // component must early-return null so Sign in never appears alongside
    // Connect Wallet.
    expect(source).toMatch(/if\s*\(\s*!walletConnected\s*\)\s*\{\s*return\s+null;\s*\}/);
  });

  it("AuthButton shows Sign in only when the wallet is connected", () => {
    const source = read("components/auth-button.tsx");
    // The Sign in button must live AFTER the disconnected early-return.
    // We look for the actual button label inside the JSX (not the doc
    // string), which is preceded by `{pending ? "Signing…" : "Sign in"}`.
    const buttonIdx = source.indexOf('pending ? "Signing…" : "Sign in"');
    const earlyReturnIdx = source.indexOf("if (!walletConnected)");
    expect(earlyReturnIdx).toBeGreaterThan(0);
    expect(buttonIdx).toBeGreaterThan(earlyReturnIdx);
  });

  it("AuthButton does not auto-sign — signMessage is only called inside the click handler", () => {
    const source = read("components/auth-button.tsx");
    // The auth flow must never run on mount. It must only be triggered by
    // an explicit onClick. Assert that the signIn call lives inside an
    // onClick handler.
    expect(source).toMatch(/onClick=\{?\(\) => void onSignIn\(\)\}?/);
    // There must be no useEffect that triggers signIn automatically.
    expect(source).not.toMatch(/useEffect\([^)]*signIn/);
  });

  it("AuthButton sign-in flow never requests a blockchain transaction", () => {
    const source = read("components/auth-button.tsx");
    // The signIn helper from the auth provider must be called — this
    // routes through the existing /api/auth/verify endpoint and never
    // touches a wallet signer that produces transactions.
    expect(source).toContain("auth.signIn");
    // No raw eth_* RPC call from this component.
    expect(source).not.toMatch(/eth_sendTransaction|eth_signTransaction|eth_signTypedData/);
  });
});

describe("authentication boundary — server-only auth, no private keys, no browser authority", () => {
  it("does not import server auth from any browser code", () => {
    // Components and non-api app routes must never reach the server-only
    // auth module. They may import the browser-safe `lib/auth/client` shim.
    const sources = [
      ...readTree("components"),
      ...readTree("app").filter((file) => !file.path.startsWith("app/api/")),
    ];
    const offenders = sources
      .filter(
        (file) =>
          // Match imports of the server module (not the client subpath).
          /from\s+["']@\/lib\/auth(["']|$)/.test(file.source) ||
          /from\s+["']@\/lib\/auth\/index/.test(file.source),
      )
      .map((file) => file.path)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("only API routes and the safe browser shim consume the auth module", () => {
    // Server-side `lib/auth/index` and `lib/auth/*` may only be reached from
    // API routes. The browser-facing `lib/auth/client` is allowed in both
    // API routes and components.
    const sources = readTree("app");
    const serverConsumers = sources
      .filter(
        (file) =>
          /from\s+["']@\/lib\/auth(["']|$)/.test(file.source) ||
          /from\s+["']@\/lib\/auth\/index/.test(file.source),
      )
      .map((file) => file.path)
      .sort();
    expect(serverConsumers).toEqual([
      "app/api/agent/v1/pending/route.ts",
      "app/api/agent/v1/requests/[id]/intent/route.ts",
      "app/api/auth/challenge/route.ts",
      "app/api/auth/logout/route.ts",
      "app/api/auth/session/route.ts",
      "app/api/auth/verify/route.ts",
      "app/api/health/route.ts",
      "app/api/payments/history/route.ts",
      "app/api/payments/intents/route.ts",
      "app/api/payments/recover/route.ts",
      "app/api/payments/verify/route.ts",
      "app/api/services/requests/[id]/fulfill/route.ts",
      "app/api/services/requests/[id]/reject/route.ts",
      "app/api/services/requests/[id]/result/route.ts",
      "app/api/services/requests/[id]/route.ts",
      "app/api/services/requests/route.ts",
    ]);
  });

  it("does not introduce server-side wallet signing or private keys", () => {
    const sources = [
      ...readTree("lib/auth"),
      ...readTree("app/api/auth"),
    ];
    for (const file of sources) {
      // No private keys, no seed phrases, no server eth_sendTransaction.
      expect(file.source).not.toContain("privateKey");
      expect(file.source).not.toContain("seed phrase");
      expect(file.source).not.toContain("eth_sendTransaction");
      expect(file.source).not.toContain("KMS");
    }
  });

  it("does not write authentication authority to browser storage", () => {
    const STORAGE_MARKERS = ["localStorage", "sessionStorage", "indexedDB"];
    const sources = [...readTree("lib/auth"), ...readTree("app/api/auth")];
    for (const file of sources) {
      for (const marker of STORAGE_MARKERS) {
        expect(file.source, `${file.path} unexpectedly references ${marker}`).not.toContain(marker);
      }
    }
  });

  it("keeps session cookies HttpOnly and SameSite=Lax", () => {
    const cookie = read("lib/auth/cookie.ts");
    expect(cookie).toContain("httpOnly: true");
    expect(cookie).toContain("sameSite: \"lax\"");
  });

  it("uses cryptographically random nonces (no Date.now or Math.random in nonce generation)", () => {
    const nonce = read("lib/auth/nonce.ts");
    expect(nonce).toContain("randomBytes");
    expect(nonce).not.toContain("Date.now");
    expect(nonce).not.toContain("Math.random");
  });

  it("has a single source of truth for the auth message body", () => {
    // The challenge store and the route handler must both consume the
    // canonical builder so the issued and verified text are guaranteed
    // identical. The message body MUST NOT be re-implemented in any other
    // module — a divergence would let an attacker sign a different message
    // than the one the server later verifies.
    const challenge = read("lib/auth/challenge.ts");
    const store = read("lib/auth/challenge-store.ts");
    const challengeRoute = read("app/api/auth/challenge/route.ts");
    const verifyRoute = read("app/api/auth/verify/route.ts");

    expect(challenge).toContain("export function buildAuthMessage");

    // The store and the route must import or call the canonical builder
    // (no inline body), and they must NOT contain the literal "Sign in to
    // AgentPay" string as that would indicate a parallel implementation.
    expect(store).not.toContain('"Sign in to AgentPay"');
    expect(challengeRoute).not.toContain('"Sign in to AgentPay"');
    expect(verifyRoute).not.toContain('"Sign in to AgentPay"');

    // The store uses the canonical builder.
    expect(store).toContain("buildAuthMessage");
  });
});

describe("Sprint 10 security boundary", () => {
  it("does not import the security module from any browser code", () => {
    const sources = [
      ...readTree("components"),
      ...readTree("app").filter((file) => !file.path.startsWith("app/api/")),
    ];
    const offenders = sources
      .filter((file) => /from\s+["']@\/lib\/security(["']|$)/.test(file.source))
      .map((file) => file.path)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("every API route that performs state changes goes through the security guard", () => {
    // POST routes under app/api/ must call either guardJsonRequest,
    // guardReadRequest, or guardAgentRequest (the only sanctioned entry
    // points). This guarantees rate limiting, body caps, and origin enforcement.
    const routes = [
      ...readTree("app/api/auth"),
      ...readTree("app/api/payments"),
      ...readTree("app/api/services"),
    ].filter((f) => f.path.endsWith("route.ts"));

    for (const route of routes) {
      const usesGuard = /guardJsonRequest|guardReadRequest|guardAgentRequest/.test(route.source);
      expect(usesGuard, `${route.path} does not use the security guard`).toBe(true);
    }
  });

  it("does not leak private key / seed phrase / KMS in the security module", () => {
    for (const file of readTree("lib/security")) {
      // Exclude comments and documentation strings — only code that would
      // actually execute and potentially access secrets.
      const codeOnly = file.source
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
        .replace(/\/\/.*$/gm, "") // line comments
        .replace(/`[\s\S]*?`/g, "") // template literals (doc strings)
        .replace(/"[^"]*"/g, ""); // string literals
      expect(codeOnly).not.toContain("privateKey");
      expect(codeOnly).not.toContain("seed phrase");
      expect(codeOnly).not.toContain("KMS");
      expect(codeOnly).not.toContain("eth_sendTransaction");
    }
  });

  it("does not log full request bodies or raw signatures", () => {
    for (const file of readTree("lib/security")) {
      expect(file.source).not.toMatch(/JSON\.stringify\(.*body/);
      expect(file.source).not.toMatch(/rawBody/);
    }
  });

  it("security headers include HSTS in production", () => {
    const headers = read("lib/security/headers.ts");
    expect(headers).toContain("Strict-Transport-Security");
    expect(headers).toContain("X-Content-Type-Options");
    expect(headers).toContain("Referrer-Policy");
    expect(headers).toContain("X-Frame-Options");
    expect(headers).toContain("Permissions-Policy");
    expect(headers).toContain("Content-Security-Policy");
  });

  it("production CSP does not use unsafe-eval", () => {
    const headers = read("lib/security/headers.ts");
    // The strict CSP branch (production) must not contain unsafe-eval.
    // The dev branch may — we look for the explicit comment.
    const prodCspMatch = headers.match(/const PROD_CSP = \[([^\]]+)\]/);
    expect(prodCspMatch).not.toBeNull();
    if (prodCspMatch) {
      expect(prodCspMatch[0]).not.toContain("unsafe-eval");
    }
  });

  it("rate limit policies are declared in one module", () => {
    const policies = read("lib/security/rate-limit.ts");
    expect(policies).toContain("AUTH_CHALLENGE");
    expect(policies).toContain("AUTH_VERIFY");
    expect(policies).toContain("PAYMENT_INTENT");
    expect(policies).toContain("PAYMENT_VERIFY");
    expect(policies).toContain("PAYMENT_HISTORY");
    expect(policies).toContain("SERVICE_REQUEST");
    expect(policies).toContain("SERVICE_FULFILL");
    expect(policies).toContain("SERVICE_RESULT");
    expect(policies).toContain("MARKET_DATA");
    expect(policies).toContain("AGENT_REGISTER");
    expect(policies).toContain("AGENT_REQUEST");
    expect(policies).toContain("AGENT_STATUS");
    expect(policies).toContain("AGENT_RESULT");
    expect(policies).toContain("AGENT_PENDING");
  });

  it("structured security events cover the documented event set", () => {
    const logger = read("lib/security/logger.ts");
    const required = [
      "AUTH_CHALLENGE_CREATED",
      "AUTH_VERIFY_SUCCESS",
      "AUTH_VERIFY_FAILURE",
      "AUTH_SESSION_CREATED",
      "AUTH_LOGOUT",
      "RATE_LIMITED",
      "PAYMENT_INTENT_REJECTED",
      "PAYMENT_VERIFY_REJECTED",
      "OWNERSHIP_REJECTED",
      "SERVICE_FULFILLMENT_REJECTED",
      "CONFIGURATION_ERROR",
      "EXTERNAL_PROVIDER_ERROR",
      "BODY_TOO_LARGE",
      "ORIGIN_REJECTED",
      "RECIPIENT_REJECTED",
      "AGENT_REGISTERED",
      "AGENT_SERVICE_REQUEST_CREATED",
      "AGENT_SERVICE_REQUEST_IDEMPOTENT",
      "DEMO_PAYMENT_COMPLETED",
    ];
    for (const kind of required) {
      expect(logger).toContain(kind);
    }
  });

  it("health endpoint does not include environment values in response", () => {
    const health = read("app/api/health/route.ts");
    // The diagnostic reads process.env for database selection metadata but only returns
    // sanitized fields (source name, presence, pooled status) — never values.
    // Allow the specific diagnostic usage pattern.
    const diagnosticPattern = /process\.env\.(POSTGRES_URL_NON_POOLING|DATABASE_URL_UNPOOLED|DATABASE_URL)/g;
    const diagnosticMatches = health.match(diagnosticPattern) || [];
    expect(diagnosticMatches.length).toBeGreaterThan(0);
    // Ensure no other process.env references that could leak values
    const otherEnvRefs = health.replace(diagnosticPattern, "").match(/process\.env\.[A-Z_]+/g) || [];
    expect(otherEnvRefs.length).toBe(0);
    // No env var values are written into the response.
    expect(health).not.toContain("getConfigSummary");
  });
});
