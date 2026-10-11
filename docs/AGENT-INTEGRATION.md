# AgentPay External Agent Integration

## Overview

AgentPay is a **payment infrastructure** for autonomous USDC payments on Arc with programmable spending policies. It is **not an AI agent platform** — it provides the payment rail that external AI agents can use.

This document describes how an **external AI agent** (your agent, running in your infrastructure) can integrate with AgentPay to:
1. Register itself with AgentPay
2. Authenticate via API key
3. Request services programmatically
4. Receive payment requirements
5. Wait for human wallet approval
6. Monitor payment status
7. Retrieve verified service results

---

## What AgentPay Does

| Capability | Status |
|------------|--------|
| USDC payments on Arc (chain 5042) | ✅ Real |
| Server-enforced spending policies | ✅ Real |
| Trusted ledger verification (independent Arc RPC check) | ✅ Real |
| Human wallet approval (EIP-191 personal_sign) | ✅ Real |
| Service fulfillment after verified payment | ✅ Real |

## What AgentPay Does NOT Do

| Capability | Status |
|------------|--------|
| Host or run AI agents | ❌ Not provided |
| Provide AI models or LLM access | ❌ Not provided |
| Autonomous wallet signing | ❌ Never — human approval required |
| Hold agent private keys | ❌ Never |
| Replace your agent's decision logic | ❌ Your agent decides what to request |

---

## Architecture

```
EXTERNAL AI AGENT (your infrastructure)
        |
        | HTTPS + Bearer API Key
        v
AGENTPAY API (https://agentpay-self.vercel.app)
        |
        | Server validates agent, checks policy, creates payment intent
        v
PAYMENT INTENT (immutable: amount, recipient, chain, expiry)
        |
        | Human reviews in AgentPay web UI
        v
HUMAN WALLET (explicit EIP-191 approval + USDC transfer)
        |
        | Transaction submitted to Arc
        v
TRUSTED VERIFICATION (server independently checks Arc RPC)
        |
        v
SERVICE FULFILLMENT (server runs adapter, returns result)
        |
        v
SERVICE RESULT (available via API)
        |
        v
EXTERNAL AI AGENT (retrieves result)
```

---

## Quick Start

### 1. Register an Agent

Via the AgentPay web UI (`/app`):
1. Connect your wallet (this becomes the **owner wallet**)
2. Go to **Agent Registry** section
3. Click **Create Agent**
4. Enter name and description
5. **SAVE THE API KEY IMMEDIATELY** — it cannot be recovered

Or via API:
```bash
curl -X POST https://agentpay-self.vercel.app/api/agents/register \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"name":"My Research Agent","description":"Autonomous market research"}'
```

Response:
```json
{
  "ok": true,
  "agent": {
    "id": "agent_abc123",
    "name": "My Research Agent",
    "description": "Autonomous market research",
    "status": "active",
    "ownerWalletAddress": "0x...",
    "createdAt": "2026-09-24T12:00:00.000Z"
  },
  "apiKey": "ap_abcdef123456..."
}
```

> ⚠️ **The raw `apiKey` is returned ONLY during registration. Save it now — it cannot be recovered.**

---

## Authentication

All agent API requests require the `Authorization` header:

```
Authorization: Bearer ap_abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

- The API key is hashed server-side (SHA-256 with domain separation)
- The raw key is never stored or logged
- Agent identity is derived from the key — **never trust `agentId` from request body**

---

## API Reference

### Create Service Request

```
POST /api/agent/v1/requests
Authorization: Bearer <api-key>
Idempotency-Key: <optional-client-key>
Content-Type: application/json

{
  "serviceId": "market-data",
  "input": {
    "symbol": "BTC",
    "timeframe": "24h"
  }
}
```

**Response (201):**
```json
{
  "ok": true,
  "requestId": "req_abc123",
  "status": "payment_required",
  "payment": {
    "intentId": "intent_xyz789",
    "amount": { "amount": 0.10, "currency": "USDC" },
    "currency": "USDC",
    "recipient": "0xD682a75B581AA237b5A60aDaefD263Ded0065140",
    "chainId": 5042,
    "tokenAddress": "0x...",
    "expiresAt": "2026-09-24T12:05:00.000Z"
  },
  "spending": {
    "currency": "USDC",
    "dailyLimit": 5.0,
    "spentToday": 0.0,
    "remainingToday": 5.0,
    "zone": "utc"
  }
}
```

**The agent CANNOT control:** recipient, amount, chain, token, owner wallet, spending totals. These are determined by the service and policy.

### Get Request Status

```
GET /api/agent/v1/requests/:id
Authorization: Bearer <api-key>
```

**Response (200):**
```json
{
  "ok": true,
  "requestId": "req_abc123",
  "status": "payment_confirmed",
  "serviceId": "market-data",
  "serviceName": "Market Data",
  "createdAt": "2026-09-24T12:00:00.000Z",
  "updatedAt": "2026-09-24T12:02:00.000Z",
  "payment": {
    "intentId": "intent_xyz789",
    "trustedPaymentId": "tpay_abc123",
    "txHash": "0x..."
  }
}
```

**Status values:** `payment_required` → `payment_pending` → `payment_confirmed` → `fulfillment_pending` → `fulfilled` / `failed`

### Get Service Result

```
GET /api/agent/v1/requests/:id/result
Authorization: Bearer <api-key>
```

**Response (200) — when ready:**
```json
{
  "ok": true,
  "status": "READY",
  "requestId": "req_abc123",
  "result": {
    "id": "result_abc123",
    "requestId": "req_abc123",
    "serviceId": "market-data",
    "status": "fulfilled",
    "output": {
      "symbol": "BTC",
      "price": "65000.00",
      "change24h": "2.50",
      "volume24h": "1000000000",
      "timestamp": "2026-09-24T12:05:00.000Z",
      "source": "demo",
      "provider": "demo"
    },
    "trustedPaymentId": "tpay_abc123",
    "fulfilledAt": "2026-09-24T12:05:00.000Z"
  }
}
```

**Response (200) — not ready:**
```json
{
  "ok": true,
  "status": "NOT_READY",
  "requestId": "req_abc123",
  "serviceRequestStatus": "payment_confirmed"
}
```

---

## Idempotency

Include an `Idempotency-Key` header to safely retry requests:

```
Idempotency-Key: my-client-request-123
```

- Scoped to `agentId + idempotencyKey`
- Returns the original request if duplicate key is used
- Different agents cannot reuse each other's keys

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `AGENT_UNAUTHORIZED` | 401 | Missing/invalid API key |
| `AGENT_FORBIDDEN` | 403 | Agent disabled or accessing another agent's request |
| `SERVICE_NOT_FOUND` | 404 | Service ID doesn't exist |
| `SERVICE_INACTIVE` | 422 | Service is disabled |
| `INVALID_SERVICE_INPUT` | 422 | Input validation failed |
| `POLICY_BLOCKED` | 422 | Spending policy rejected (with `violations` array) |
| `IDEMPOTENCY_CONFLICT` | 409 | Different request with same idempotency key |
| `PAYMENT_INTENT_EXPIRED` | 410 | Payment intent expired before approval |
| `LEDGER_UNAVAILABLE` | 503 | Trusted ledger unreachable (fail closed) |
| `RATE_LIMITED` | 429 | Too many requests (see `Retry-After` header) |

---

## Rate Limits

| Policy | Max/Minute |
|--------|------------|
| `AGENT_REGISTER` | 5 |
| `AGENT_REQUEST` | 30 |
| `AGENT_STATUS` | 60 |
| `AGENT_RESULT` | 60 |

Rate limited by authenticated agent identity (not IP).

---

## Available Services (Demo)

| Service ID | Category | Price | Input Parameters |
|------------|----------|-------|------------------|
| `market-data` | data | $0.10 USDC | `symbol` (required), `timeframe` (optional) |
| `research-report` | research | $0.25 USDC | `topic` (required), `depth` (optional: "summary"\|"detailed") |
| `ai-summary` | ai | $0.05 USDC | `text` (required), `maxLength` (optional) |

> **Note:** Services currently return **demo fixture data** (`source: "demo"`). Live CoinGecko integration exists but requires `MARKET_DATA_PROVIDER=coingecko` environment variable.

---

## Security Model

### What the Agent Controls
- Which service to request
- Service input parameters
- Idempotency key
- When to poll for results

### What the Agent CANNOT Control
- Payment recipient (server-configured per service)
- Payment amount (server-configured per service)
- Chain (always Arc mainnet, chain 5042)
- Token (always USDC)
- Owner wallet (derived from human session at registration)
- Spending limits (server-enforced policy)
- Trusted ledger verification (server-only)

### Human Approval Required
Every payment requires **explicit human wallet approval** via the AgentPay web UI. The agent receives a `payment_required` status with the payment intent details. The human owner must:
1. Log into AgentPay web UI
2. See pending agent payment
3. Click **Approve Payment**
4. Confirm in their wallet (EIP-191 `personal_sign`)

The agent **cannot** bypass this step.

---

## TypeScript SDK

```bash
npm install @agentpay/sdk
```

```typescript
import { AgentPayClient } from "@agentpay/sdk";

const agent = new AgentPayClient({
  baseUrl: "https://agentpay-self.vercel.app",
  apiKey: process.env.AGENTPAY_API_KEY!,
});

// Create request
const request = await agent.createRequest({
  serviceId: "market-data",
  input: { symbol: "BTC", timeframe: "24h" },
  idempotencyKey: "my-unique-key",
});

if (!request.ok) throw new Error(request.error.message);

console.log("Payment required:", request.payment);

// Wait for human approval + fulfillment
const result = await agent.waitForResult(request.requestId, {
  intervalMs: 10000,
  timeoutMs: 300000,
});

if (result.ok && result.result) {
  console.log("Service output:", result.result.output);
}
```

The SDK is in `lib/agent/sdk.ts` and has **zero wallet/private key dependencies**.

---

## Example: Research Agent

See `examples/research-agent/index.ts` for a complete working example.

```bash
cd examples/research-agent
AGENTPAY_BASE_URL=https://agentpay-self.vercel.app \
AGENTPAY_API_KEY=ap_your_key_here \
npx tsx index.ts
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Production | PostgreSQL connection string for durable agent registry and trusted ledger |
| `AGENTPAY_API_KEY` | Client | Your agent's API key (from registration) |
| `AGENTPAY_BASE_URL` | Client | AgentPay API base URL (e.g. `https://agentpay-self.vercel.app`) |

---

## Limitations & Future Work

### Current Limitations
1. **Demo service adapters only** — Services return fixture data. Live providers require additional configuration.
2. **In-memory repositories by default** — Production requires `DATABASE_URL` for durable agent registry and service requests.
3. **No webhook notifications** — Agent must poll for status/result.
4. **Single owner wallet per agent** — Multi-owner not supported.
5. **No agent-to-agent payments** — Only human wallet can approve payments.

### Planned Enhancements
- Webhook callbacks for payment confirmation
- Live service provider integrations
- Agent-managed policy updates (with human approval)
- Multi-tenant agent isolation
- Agent analytics dashboard

---

## Support

For integration questions, see the AgentPay GitHub repository or open an issue.

**Remember:** AgentPay is payment infrastructure. Your agent provides the intelligence. AgentPay provides the verified, policy-gated payment rail.