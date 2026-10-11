# Sprint 9 — Authentication & Ownership Enforcement

## 1. Threat model

AgentPay's existing payment flow is already designed to be safe from a
custodial-key perspective: the wallet always signs on the client, the
trusted server ledger verifies the on-chain receipt, and the policy
engine gates spending. Sprint 9 adds the missing **identity and
ownership** layer so that:

- A request to the API is always attributable to a single authenticated
  wallet (or explicitly anonymous for the legacy demo flow).
- A resource created by one wallet cannot be read, fulfilled, or
  verified by another wallet.
- Authentication uses a server-issued, single-use challenge that the
  wallet signs — connecting a wallet alone is **not** authentication.
- No private key, seed phrase, or server-side signing is introduced.
- Logout is a server-side operation; deleting a browser value is not
  sufficient.

The non-goals (out of scope) are: rate limiting, full CSRF token
infrastructure, audit logging, and any production-rate abuse controls.
Those belong to Sprint 10.

## 2. Authentication flow

1. **Connect wallet** — the user connects an EIP-1193 wallet (existing
   `lib/wallet/*` code).
2. **Request challenge** — the client calls
   `POST /api/auth/challenge` with `{ walletAddress }`. The server
   creates a random 16-byte challenge id, a 32-byte random nonce, a
   5-minute expiry, binds them to the wallet, and embeds them in a
   human-readable EIP-191 message.
3. **Sign message** — the wallet signs the exact message returned in
   step 2. The wallet UI shows:
   > Sign in to AgentPay
   > This signature proves wallet ownership for authentication.
   > It does NOT authorize a blockchain transaction.
   > It does NOT transfer funds.
4. **Verify signature** — the client calls
   `POST /api/auth/verify` with `{ walletAddress, challengeId, signature }`.
   The server consumes the challenge (single-use), recovers the signer
   with `viem.verifyMessage`, and on success creates a server-side
   session and returns a sanitised session view.
5. **Session cookie** — the server sets a `Set-Cookie: agentpay_session=<id>`
   header. The cookie is `HttpOnly`, `SameSite=Lax`, and has a 12-hour
   `Max-Age`. `Secure` is added in production.
6. **Authenticated requests** — every protected route reads the cookie
   via `requireAuthenticatedSession(request)` and resolves the session
   through `getAuthSessionRepository()`. The browser never holds
   authority.

## 3. Challenge / nonce lifecycle

| Stage | Invariant |
| --- | --- |
| Created | `id` is `crypto.randomBytes(16).toString("hex")`; `nonce` is `crypto.randomBytes(32).toString("hex")` |
| Bound to | the normalised wallet address + caller-supplied origin |
| TTL | 5 minutes from `issuedAt` |
| Use count | exactly 1 (`store.consume` always deletes first) |
| Predictability | none — never derived from `Date.now()`, `Math.random()`, wallet, or counter |
| Storage | in-process `Map`; never persisted to PostgreSQL (acceptable because a restart forces re-auth) |

## 4. Session lifecycle

| Stage | Invariant |
| --- | --- |
| Created | on successful verify; id is `sess_<24 random bytes hex>` |
| Persisted | `agentpay_auth_sessions` (PostgreSQL) or in-memory `Map` |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200` (12h), `Secure` in production |
| Lookup | `findById` is the only path; `findByWallet` returns the most recent active session for diagnostics |
| Revocation | `POST /api/auth/logout` calls `repo.revoke(id)`; the server-set cookie is cleared on the response |
| Expiry | `findById` and `findByWallet` both filter `expires_at > now()` at the SQL layer; in-memory `findById` also evicts expired sessions lazily |
| Sanitised view | the browser only sees `{ walletAddress, createdAt, expiresAt }`; the session id is never returned |

## 5. Cookie configuration

```ts
{
  maxAge: 12 * 60 * 60,    // 12 hours
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: true             // in production only
}
```

`SameSite=Lax` plus same-origin application routes provides sufficient
CSRF defense for the current architecture. The session cookie is bound
to the wallet's server-side session; it cannot be used cross-site
because the attacker cannot observe the cookie or produce a valid
session id. No additional CSRF tokens are required for this sprint.

## 6. Ownership model

Every protected resource carries an `ownerWalletAddress` field:

| Resource | Field | Default | Effect |
| --- | --- | --- | --- |
| `PaymentIntent` | `ownerWalletAddress: EvmAddress \| null` | `null` for the demo flow; set to the session wallet for authenticated requests | only the owner can verify the intent |
| `TrustedPayment` | `ownerWalletAddress: EvmAddress \| null` | inherited from the verified intent | only the owner can read the payment in history |
| `ServiceRequest` | `ownerWalletAddress: EvmAddress \| null` | `null` for the demo flow; set to the session wallet for authenticated requests | only the owner can read, fulfill, or retrieve the result |

Anonymous resources (legacy demo flow) are still readable by any
caller, but the **result** endpoint requires authentication for
everyone to keep private outputs out of the public surface.

## 7. Protected endpoints

| Endpoint | Auth | Ownership | Notes |
| --- | --- | --- | --- |
| `POST /api/auth/challenge` | public | n/a | 400 on malformed wallet, 400 on missing origin |
| `POST /api/auth/verify` | public | n/a | 401 on any verification failure |
| `GET /api/auth/session` | optional | n/a | returns sanitised session or `{authenticated:false}` |
| `POST /api/auth/logout` | optional | n/a | always succeeds; clears cookie |
| `POST /api/payments/intents` | optional | attaches owner when authenticated | legacy demo flow still works |
| `POST /api/payments/verify` | optional | **required** when intent has an owner | 401 if unauthenticated, 403 if mismatched |
| `GET /api/payments/history` | **required** | filtered to owner | always user-scoped |
| `POST /api/services/requests` | optional | attaches owner when authenticated | legacy demo flow still works |
| `GET /api/services/requests/[id]` | optional | enforced when owner set | 403 for cross-user reads |
| `POST /api/services/requests/[id]/fulfill` | optional | enforced when owner set | 403 for cross-user fulfillment |
| `GET /api/services/requests/[id]/result` | **required** | enforced; 404 (not 403) for cross-user to avoid leaking existence | always user-scoped |
| `GET /api/health` | public | n/a | unchanged |
| `GET /api/services/*` registry listings | public | n/a | public metadata only |

## 8. Public endpoints

- `GET /api/health`
- `GET /api/auth/session` (no auth required; returns sanitised view)
- `GET /api/auth/challenge` (no auth required to *request*; required to *use*)
- `POST /api/auth/verify` (no auth required to *attempt*; required to *succeed*)
- `POST /api/auth/logout` (no auth required; always succeeds)
- Public service catalog metadata served via the registry (no HTTP endpoint at this time)

## 9. Payment authorization

The verify step is wrapped, not replaced. After the existing
`verifyUsdcPayment` produces a verified receipt, the server also
checks:

- The intent exists and is not already consumed.
- The intent is not expired.
- The intent's `ownerWalletAddress` (if any) matches the session
  wallet (if any).

The on-chain checks are unchanged; authentication is an additional
authorization boundary on top, not a replacement.

## 10. Service authorization

`POST /api/services/requests` accepts any caller; the resulting
`ServiceRequest.ownerWalletAddress` is set from the session if present.
`GET /api/services/requests/[id]` enforces ownership for owned
resources (403 on mismatch). `POST /api/services/requests/[id]/fulfill`
and `GET /api/services/requests/[id]/result` both require either an
authenticated matching session or, for the result endpoint, an
authenticated session (collapsing cross-user to 404 to prevent
existence leaks).

## 11. Replay protection

- **Auth**: every challenge is single-use (`store.consume` deletes
  before checking). The signature is verified against the exact message
  that was issued; the message embeds the challenge id, nonce, and
  expiry.
- **Payment**: the existing `tx_hash` UNIQUE constraint in PostgreSQL and
  the `findByTxHash` short-circuit in the in-memory repository both
  block transaction-hash replay. The intent is also `consumeIntent`'d
  after verification.

## 12. Logout

`POST /api/auth/logout` reads the session id from the request cookie,
calls `repo.revoke(id)`, and emits a `Set-Cookie` header that
immediately expires the cookie. There is no client-side "logout" — a
session is only dead when the server says so.

## 13. Test coverage

| Suite | Tests | Covers |
| --- | --- | --- |
| `tests/auth.test.ts` | 44 | nonce randomness, message builder, address validation, challenge store TTL/single-use/wallet binding, signature verification (good/empty/malformed/wrong-signer), session repository (create/find/revoke/expire/findByWallet), cookie helpers, session id uniqueness, sanitisation, ownership helpers |
| `tests/auth-routes.test.ts` | 14 | challenge HTTP flow, verify HTTP flow with real signatures, session HTTP flow, logout HTTP flow, replay rejection, cross-user session isolation |
| `tests/ownership-routes.test.ts` | 8 | unauthenticated history → 401, cross-user service request → 403, cross-user fulfillment → 403, cross-user result → 404, anonymous legacy flow still works, intent ownership binding |
| `tests/architecture.test.ts` (new) | 6 | no browser code imports auth module, only API routes consume auth, no private keys in auth code, no browser storage, cookies HttpOnly + SameSite=Lax, nonces use `crypto.randomBytes` |

## 14. Known production blockers (Sprint 10 and beyond)

- **Rate limiting** on `POST /api/auth/challenge` and
  `POST /api/auth/verify` to slow brute-force and signature replay.
- **CSRF tokens** for state-changing endpoints if the app is ever
  embedded in a third-party iframe or if cookies are relaxed from
  `SameSite=Lax` to `None`.
- **Audit log** for authentication events (success, failure, logout,
  expired session, revoked session) without leaking credentials.
- **Cookie rotation** on privilege changes (currently a long-lived
  cookie is issued on sign-in and only revoked on explicit logout).
- **Session limit** per wallet (currently multiple sessions can
  coexist).
- **Production cookie domain scoping** for multi-subdomain deployments.
- **Database migration** to add `agentpay_auth_sessions` table when
  `DATABASE_URL` is set in production.

## 15. Files added

```
app/api/auth/challenge/route.ts
app/api/auth/logout/route.ts
app/api/auth/session/route.ts
app/api/auth/verify/route.ts
lib/auth/challenge-store.ts
lib/auth/challenge.ts
lib/auth/cookie.ts
lib/auth/factory.ts
lib/auth/index.ts
lib/auth/nonce.ts
lib/auth/ownership.ts
lib/auth/repository-memory.ts
lib/auth/repository-postgres.ts
lib/auth/repository.ts
lib/auth/session.ts
lib/auth/verify.ts
tests/auth-routes.test.ts
tests/auth.test.ts
tests/ownership-routes.test.ts
docs/review/Sprint-9-Authentication-Ownership.md
```

## 16. Files modified

```
types/index.ts                                  # re-exported service-request types
types/service-request.ts                        # added ownerWalletAddress
types/trusted-payment.ts                        # added ownerWalletAddress to PaymentIntent + TrustedPayment
lib/payments/server/postgres.ts                 # added owner_wallet_address column + INSERT
lib/payments/server/repository.ts               # normalised ownerWalletAddress in reads/writes
lib/payments/server/service.ts                  # createPaymentIntent + verifyTrustedPayment now take ownerWalletAddress
lib/services/service.ts                         # createServiceRequest now takes ownerWalletAddress
app/api/payments/history/route.ts               # auth required, owner-filtered
app/api/payments/intents/route.ts               # attaches owner from session
app/api/payments/verify/route.ts                # passes authenticated wallet to verifyTrustedPayment
app/api/services/requests/route.ts              # attaches owner from session
app/api/services/requests/[id]/route.ts         # ownership-aware GET
app/api/services/requests/[id]/fulfill/route.ts # ownership-aware POST
app/api/services/requests/[id]/result/route.ts  # auth required + ownership check
tests/architecture.test.ts                      # added 6 new auth-architecture assertions
tests/service-fulfillment.test.ts               # added ownerWalletAddress to all createServiceRequest calls
tests/service-request-ui.test.ts                # added ownerWalletAddress to fixture
tests/trusted-repository.test.ts                # added ownerWalletAddress to fixtures
tests/trusted-accounting.test.ts                # added ownerWalletAddress to fixture
```

## 17. Distinguishing the three concerns

| Concern | Owned by | Failure mode |
| --- | --- | --- |
| **Authentication** | `lib/auth/*` + `app/api/auth/*` | missing/invalid session → 401 |
| **Authorization (ownership)** | `lib/auth/ownership.ts` + the resource type's `ownerWalletAddress` | owner mismatch → 403 (or 404 for sensitive endpoints) |
| **On-chain payment verification** | `lib/payments/server/verify.ts` | bad receipt / wrong chain / wrong recipient / wrong amount → 422 |

These are layered. A request must pass all three to mutate state:
1. Authentication must succeed (the caller has a session).
2. Authorization must succeed (the caller owns the resource).
3. On-chain verification must succeed (the transaction is real and
   matches the server-side intent).
