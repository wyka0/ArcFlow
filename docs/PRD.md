# AgentPay — Product Requirements Document

**Event:** Arc Microgrants
**BUIDL:** #2 — AgentPay
**Sprint:** 3 — Persistent Payment Ledger + Daily Spend Accounting
**Status:** Confirmed payments persist across reloads and drive daily spend accounting. Read/write-free with respect to the blockchain: no signing, no transfers.

---

## 1. Summary

AgentPay is a small autonomous-agent payment application that demonstrates an AI agent
buying services with **USDC on Arc** under a **programmable spending policy**.

The product proves one specific claim:

> An agent can be given real spending power without being given unlimited spending power.

## 2. Core architectural principle

> **The agent decides whether a service is useful. The policy engine decides whether the agent is allowed to pay.**

No LLM output, prompt, or arbitrary agent logic may call a payment function directly.
Every payment must pass through the policy engine, which is deterministic, auditable, and
independent of the agent.

## 3. Problem

Autonomous agents increasingly need to purchase resources (data, compute, reports, APIs).
Giving an agent unrestricted access to a wallet is unacceptable. There is no simple,
inspectable layer that answers: *"is this specific payment within the rules the operator set?"*

## 4. Goals

1. Demonstrate a complete purchase lifecycle: task → service selection → cost → policy check → payment → tracking → result.
2. Keep the spend decision fully separated from the usefulness decision.
3. Keep the interface honest: no fabricated balances, balances, hashes, or confirmations.
4. Be structurally ready for real Arc mainnet integration without a rewrite.

## 5. Non-goals (Sprint 0)

- No real payment execution or signing.
- No LLM integration.
- No external service marketplace integration.
- No persistence layer or authentication.
- No wallet connection (placeholder only).

## 6. Users

| User | Need |
| --- | --- |
| Operator / owner | Set hard spending limits and see what the agent did. |
| Agent (software) | Discover services, request a purchase, receive the result. |
| Reviewer / judge | Inspect that policy enforcement is real and not cosmetic. |

## 7. Purchase lifecycle

1. Agent receives a task.
2. Agent selects an available service it judges useful.
3. Service cost is determined from the service registry.
4. Policy engine evaluates the purchase against the spending policy.
5. If allowed, a payment is requested/executed on Arc.
6. The transaction is tracked.
7. The purchased service result is returned.

Steps 5–6 are represented by typed interfaces only in Sprint 0.

## 8. Domain models

All models are strongly typed in `types/` and use explicit string unions rather than
arbitrary strings.

### Agent
`id`, `name`, `description`, `walletAddress` (`string | null`), `balance`
(`TokenAmount | null`), `status` (`"active" | "paused"`).

`null` wallet/balance means *not connected*. The UI renders `Not connected` / `—`.

### SpendingPolicy
`id`, `agentId`, `maxPerTransaction`, `dailyLimit`, `currency` (`"USDC"`),
`allowedCategories` (`ServiceCategory[]`).

Example: max 1.00 USDC per transaction, 5.00 USDC daily, categories `research`, `data`, `ai`.

### Service
`id`, `name`, `category` (`"research" | "data" | "ai"`), `price`, `currency` (`"USDC"`),
`active`.

Three local demo services ship: Market Data ($0.10), Research Report ($0.25), AI Summary ($0.05).

### Payment
`id`, `agentId`, `serviceId`, `amount`, `currency`, `status`, optional `transactionHash`,
`createdAt`.

Status union: `"pending" | "approved" | "submitted" | "confirmed" | "failed"`.

## 9. Policy engine rules

`lib/agent/policy.ts` returns `{ allowed: true }` or `{ allowed: false, violations[] }`
with typed violation codes:

| Code | Meaning |
| --- | --- |
| `SERVICE_INACTIVE` | Service is not active. |
| `CATEGORY_NOT_ALLOWED` | Service category outside the allowed list. |
| `CURRENCY_MISMATCH` | Service currency differs from the policy currency. |
| `EXCEEDS_MAX_PER_TRANSACTION` | Amount above the per-transaction maximum. |
| `EXCEEDS_DAILY_LIMIT` | Amount would exceed today's remaining daily budget. |

Daily spend is computed from payments with settled statuses (`approved`, `submitted`,
`confirmed`) created on the current calendar day.

## 10. Data honesty requirements

- No fake blockchain data.
- No fake transaction hashes.
- No fake Arc confirmations.
- No hardcoded wallet balances presented as real.
- A failed balance read is never rendered as `0 USDC`; it is `Balance unavailable`.
- Demo/local data is labeled as such in the UI (badges and footnotes).
- Missing live data renders as `Not connected` or `—`.
- Live values are labeled `LIVE`; demo values are labeled `DEMO`.

## 11. Screens (Sprint 1)

Single dashboard route (`/`):

- **Header** — brand, compact network indicator, and the wallet connection entry point.
- **Hero** — "Give your AI agent spending power." / "Autonomous USDC payments with programmable spending policies."
- **Agent card** — Research Agent, status, connected wallet (shortened), and live USDC balance.
- **Spending policy card** — $1.00 max / tx, $5.00 daily limit, 3 approved categories (demo config).
- **Services panel** — the three demo services with prices.
- **Payments panel** — empty state: "Your agent has not made any payments yet."

## 11a. Arc network configuration

Centralised in `lib/arc/network.ts`. Verified against the official documentation
(`docs.arc.io/arc/references/connect-to-arc`, `.../contract-addresses`) on 2026-09-21:

| Parameter | Mainnet | Testnet |
| --- | --- | --- |
| Chain id | `5042` | `5042002` |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` | same |
| USDC ERC-20 decimals | `6` | `6` |
| Native gas USDC decimals | `18` | `18` |

Arc uses USDC as the native gas token (18 decimals). The optional ERC-20 interface
uses 6 decimals and shares the same balance, so the UI shows a single USDC balance
read through the ERC-20 interface.

## 11b. Wallet connection (read-only)

- Detects an injected EIP-1193 wallet; shows `Wallet not detected` when absent.
- Connection requests accounts only — never a signature or transaction.
- Displays the address shortened (`0x1234…abcd`) and supports local disconnect.
- Detects the active chain and shows `Wrong Network` without switching silently.
- An explicit `Switch to Arc` button is the only path that calls
  `wallet_switchEthereumChain` / `wallet_addEthereumChain`.

## 11c. Balance states

The session exposes distinct states rather than one generic loader:
`Not connected`, `Connecting`, `Connected`, `Reading balance`, `Balance available`,
`Balance unavailable`, `Wrong Network`, `Wallet not detected`.

## 12. Milestones

| Sprint | Scope |
| --- | --- |
| 0 | Foundation: types, policy engine, decision layer, Arc interfaces, dashboard. |
| 1 | Read-only Arc integration: wallet connection, chain detection, live USDC balance. |
| 2A | Policy-gated, human-confirmed USDC payment: gate → confirmation → wallet send → Arc receipt. |
| 2B | Autonomous spending within policy bounds (no per-payment click). |
| 3 | Persistent confirmed ledger + confirmed-only daily spend accounting (browser-local). |
| 4 | Trusted server-side ledger, audit trail, rate limiting, key management. |

## 12a. Persistence architecture (Sprint 3)

```
components → providers → payment store → payment repository → storage
```

| Module | Responsibility |
| --- | --- |
| `lib/payments/storage.ts` | The only module that touches `localStorage`; `KeyValueStorage` + in-memory fallback. |
| `lib/payments/repository.ts` | `PaymentHistoryRepository` — owns persistence, validates on read and write. |
| `lib/payments/records.ts` | What counts as a persistable record; store↔record mappers. |
| `lib/payments/store.ts` | Pure reducer; `payment/hydrated` restores; `selectConfirmedPayments` derives history. |
| `lib/agent/policy.ts` | `sumConfirmedToday` / `buildSpendingSummary` — the single daily accounting calculation. |
| `lib/time.ts` | Centralised local-day boundaries. |

## 12b. What may be persisted (Sprint 3)

A record enters the ledger only if **all** hold:

- `status === "confirmed"`
- a real 32-byte transaction hash exists
- `chainId` is a supported Arc network (Arc Mainnet is the production target)

Never persisted: fake or demo payments, pending/submitted requests, blocked or cancelled requests,
payments without a hash. Malformed or corrupted stored data is discarded safely and never crashes
the app.

## 12c. Daily spend accounting (Sprint 3)

- `spentToday` counts **confirmed** payments only; pending/failed/blocked payments never count.
- `remainingToday = max(dailyLimit - spentToday, 0)`.
- Day boundaries use the runtime's **local** timezone; a day runs 00:00:00–23:59:59.999 local.
- The policy gate consumes the persisted confirmed ledger, so `EXCEEDS_DAILY_LIMIT` reflects real
  on-chain history, not an in-memory copy.

## 12d. Security limitation — browser-local persistence

> **Browser-local persistence is not a trusted security boundary.** It provides continuity across
> reloads for the demo, but it cannot independently enforce spending limits against a malicious
> client. Anyone with access to the browser can edit or delete the stored ledger.
>
> Browser storage must not be treated as secure autonomous spending control. Autonomous execution
> requires a trusted server/agent execution boundary, which is planned for Sprint 4.
>
> Clearing browser-local records does **not** reverse, cancel, or delete any on-chain transaction.

## 12a. Payment security boundary (Sprint 2A)

```
Agent → Decision → Policy Engine → Approved PaymentRequest → Human Confirmation → Wallet
```

- `lib/payments/gate.ts` is the only producer of an approved `PaymentRequest`; it reuses
  `lib/agent/policy.ts` and adds recipient resolution.
- `lib/wallet/payment.ts` is the only module that calls `eth_sendTransaction`, and it exposes a
  payment-shaped `sendUsdcTransfer` — never a generic sender.
- The agent/policy layers do not import the sender; an architecture test enforces this.
- A blocked gate renders no confirmation action and never contacts the wallet.
- A transaction is only `submitted` when the wallet returns a real hash, and only `confirmed`
  when the Arc receipt reports `status === "success"`.

## 12b. Payment recipients (Sprint 2A)

Recipients are explicit configuration (`NEXT_PUBLIC_AGENTPAY_<SERVICE>_RECIPIENT`), validated as
EVM addresses. AgentPay never invents a recipient, never uses the zero address, and never uses the
connected user's own address. Unconfigured recipients block the flow with
`Payment recipient not configured`. Configured addresses are labeled as demo/test recipients.

## 13. Success criteria (Sprint 0 + 1)

- Lint, typecheck, unit tests, and production build pass.
- All domain models exist with explicit status unions.
- Policy engine is deterministic, pure, and covered by typed inputs/outputs.
- Payment modules expose interfaces and never fabricate activity.
- Wallet connection reads a real Arc USDC balance, or reports it unavailable.
- Dashboard is responsive and clearly distinguishes demo data from live data.

## 14. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Agent bypasses policy | Payment gateway accepts only policy-validated requests (enforced by design in later sprints). |
| Stale prices vs. charged amount | Re-evaluate policy immediately before submission. |
| Demo data mistaken for live | Explicit demo badges and empty-state messaging; nulls for unknown values. |
| Key exposure | Server-side signing only; never bundle keys in the client. |
