# ArcFlow V2 — Minimal Smoke-Test Plan (Phase 11)

**Status:** Design only. This document describes a test that MUST receive
explicit, written approval before any step involving a live transaction is
executed. No deployment, signing, broadcasting, or fund movement has occurred.

---

## 0. Historical artifact notice (Phase 19.8)

`script_disabled/SmokeTestV2.s.sol` is a Phase 11-era working artifact and is
**superseded by this plan**. Do not execute it:

- Its USDC signature block (name `FiatTokenV2`, version `2`, chainId `1`) is an
  **obsolete experiment** that reconstructs the WRONG domain separator
  (`0x1ad5…47da`), which can never verify against the real Arc USDC
  (`0x9405…df84`). Signatures for any real smoke test MUST follow §2b below.
- Since Phase 19.7 it is fail-closed: it refuses to run unless
  `SMOKE_TEST_V2_ADDRESS` is explicitly set, and it permanently rejects the
  predecessor deployment `0xf0c80Fdd22F8612DD7A877f6dA82Ab5097D63A66`
  (`test/SmokeTargetValidation.t.sol` covers unset / malformed / predecessor /
  no-code / wrong-chain cases). It has no default address.
- The operator-facing process is **this plan** (§8 template), not the disabled
  script.

---

## 1. Prerequisites (must ALL be true before the smoke test)

| # | Check | How to verify |
|---|-------|---------------|
| P1 | A new ArcFlowV2 is deployed at a reviewed address — the address MUST be taken from the **actual deployment receipt** (`eth_getTransactionReceipt` of the deployment tx), never from simulation output (a simulated address such as `0x0AC8…12bA` is a predicted CREATE location, not a deployment) — and independently verified per checklist §D (D1–D7) | Phase 10.9 §2–3 of `DEPLOYMENT_VERIFICATION_PLAN.md`; checklist §D |
| P2 | The deployed bytecode matches local compilation | Phase 10.9 §3a |
| P3 | `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` is set to the new deployment | `node scripts/preflight.mjs` (§6 must now show "configured") |
| P4 | The preflight script passes with 0 failures | `node scripts/preflight.mjs` (§1–§7) |
| P5 | A test EOA exists with: (a) zero contract code on Arc, (b) ≥ 2 USDC balance, (c) ≥ enough ARC for gas | `cast balance <EOA> --rpc-url` and `cast call 0x3600…0000 "balanceOf(address)" <EOA>` |
| P6 | The test EOA's private key is held by the operator running the test (NEVER committed or shared) | Operator attestation |

**Why a code-free EOA is required:** Arc mainnet has EIP-7702-delegated
accounts (Phase 10.8 discovery). If the test EOA has any contract code, the
real USDC will route through the ERC-1271 `isValidSignature` path instead of
ecrecover, causing signature verification to fail for a different reason.

---

## 2. Signatures required

The smoke test exercises `executeSplitWithDualAuth` (selector `0x6d200078`),
which requires TWO independent EIP-712 signatures from the flow owner:

### 2a. ArcFlow EIP-712 authorization

```
Domain:   EIP712Domain(
            name:     "ArcFlow",
            version:  "1",
            chainId:  5042,
            verifyingContract: <DEPLOYED_V2_ADDRESS>
          )
Type:     ExecuteWithAuthorization(
            uint256 flowId,
            uint256 amount,
            uint256 validAfter,
            uint256 validBefore,
            bytes32 nonce
          )
Signer:   flow.owner (the test EOA)
```

**Digest verification**: The ArcFlowV2 contract recomputes this digest from
calldata and recovers the signer via `ECDSA.tryRecover`. The recovered address
must equal `flow.owner`. The digest is built as:
`keccak256(0x1901 ‖ domainSeparator ‖ keccak256(abi.encode(typehash, params)))`
where `domainSeparator = keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256("ArcFlow"), keccak256("1"), 5042, deployedAddress))`.

### 2b. Arc USDC EIP-3009 transferWithAuthorization

```
Domain:   EIP712Domain(
            name:     "USDC",
            version:  "2",
            chainId:  5042,
            verifyingContract: 0x3600000000000000000000000000000000000000
          )
Type:     TransferWithAuthorization(
            address from,        // = flow.owner (test EOA)
            address to,          // = ArcFlowV2 contract
            uint256 value,       // = amount (6-decimal base units)
            uint256 validAfter,  // MUST be 0 (real USDC: strict >)
            uint256 validBefore, // = block.timestamp + N minutes
            bytes32 nonce        // single-use, caller-chosen
          )
Signer:   flow.owner (the test EOA)
```

**Digest verification**: ArcFlowV2's `_verifyUSDCAuthorization` pre-checks the
window (strict inequalities mirroring real USDC) and recovers the signer.
Then `usdc.transferWithAuthorization` re-verifies independently inside the
real USDC contract. Both must pass. The preimage was verified byte-for-byte
via opcode trace in Phase 10.8:
`keccak256(0x1901 ‖ 0x9405…df84 ‖ keccak256(abi.encode(0x7c7c…2267, from, to, value, validAfter, validBefore, nonce)))`

**Domain fields independently verified (Phase 19.8, computed):** the §2b
fields — name `"USDC"`, version `"2"`, chainId `5042`, verifyingContract
`0x3600…0000` — reproduce the live `DOMAIN_SEPARATOR()`
`0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84` exactly.
Do not substitute variants: `"FiatTokenV2"`/`chainId 1` (the disabled script's
legacy block) and even `"USD Coin"` produce different separators and will
always fail signature verification. The authoritative constant remains the
on-chain `DOMAIN_SEPARATOR()` read.

### 2c. Why two signatures?

The ArcFlow signature authorizes the *business logic* (which flow, what
amount). The USDC signature authorizes the *token movement* (pull from owner
to the contract). Neither alone is sufficient: ArcFlowV2 requires both before
calling `usdc.transferWithAuthorization`, and the real USDC independently
verifies its own signature.

---

## 3. Fund flow

### 3a. Source of funds

The test EOA must already hold USDC on Arc. Since Arc's USDC is the native
gas token, `balanceOf(EOA) = eth_getBalance(EOA) / 1e12`. The operator must
acquire a small amount of USDC on Arc mainnet by any legitimate means
(bridge, DEX, faucet, or transfer from an existing holder). The test EOA
must also hold ARC (the native gas token for transaction fees) — but since
Arc's gas token IS USDC, a single balance covers both.

**Minimum required**: 2 USDC (2,000,000 base units) — 1 for the transfer,
1 as margin for gas and rounding.

### 3b. Destination of funds

| Step | From | To | Amount | Mechanism |
|------|------|----|--------|-----------|
| 1. Pull | test EOA (flow.owner) | ArcFlowV2 contract | amount (6-dec) | `usdc.transferWithAuthorization` → native system transfer `0x1800…0000` |
| 2a. Treasury split | ArcFlowV2 contract | treasury address | `amount × treasuryBps / 10000` | `usdc.transfer` (SafeERC20-wrapped) |
| 2b. Contributor split | ArcFlowV2 contract | contributor address | `amount - treasuryAmount` | `usdc.transfer` (SafeERC20-wrapped) |

For the smoke test: `treasuryBps = 10000`, `contributorBps = 0` → all funds go
to a test-controlled treasury address. The contributor receives 0 (skip).

**Net effect on the test EOA**: loses exactly `amount` USDC.
**Net effect on treasury**: gains exactly `amount` USDC.
**Net effect on ArcFlowV2**: 0 (no dust — everything distributed atomically).

### 3c. Decimal mapping (6 → 18)

| Layer | Units | Example (1 USDC) |
|-------|-------|-------------------|
| Frontend / user input | 6-decimal string `"1.00"` → `1000000n` base units | `1000000` |
| ArcFlowV2 `amount` param | 6-decimal uint256 | `1000000` |
| `usdc.transferWithAuthorization` value | 6-decimal uint256 (ERC-20 interface) | `1000000` |
| Real USDC internal native transfer | 18-decimal native amount | `1000000 × 1e12 = 1e18` |
| `balanceOf` return | 6-decimal uint256 | `1000000` |
| `eth_getBalance` | 18-decimal wei | `1e18` |

The 1e12 conversion is **entirely inside the real USDC contract**. ArcFlowV2
never handles 18-decimal values. The smoke test should verify:
- Before: `balanceOf(EOA) = X`, `eth_getBalance(EOA) = X × 1e12`
- After: `balanceOf(EOA) = X - 1`, `balanceOf(treasury) = +1`
- ArcFlowV2 `balanceOf(contract) = 0` (no dust)

---

## 4. Gas funding and nonce handling

### Gas (transaction fees)

On Arc, the gas token IS USDC (native). The test EOA's native balance serves
both as the USDC transfer source and the gas source. The transaction fee is
deducted from the native balance by the protocol. The smoke test should use a
modest `gasLimit` override if possible; otherwise, let the node estimate.

### Transaction nonces

- **EIP-155 transaction nonce**: managed by the signing library/wallet.
  Use `cast nonce <EOA>` or `eth_getTransactionCount` to check.
- **USDC EIP-3009 nonce**: caller-chosen `bytes32`. Must be unique per
  authorizer. Use `keccak256(abi.encodePacked("arcflow-smoke-", block.timestamp))`
  or a random value. After successful execution, the nonce is marked used
  (`authorizationState(owner, nonce) = true`). Replaying the same nonce
  reverts with `"FiatTokenV2: authorization is invalid or already used"`.
- **ArcFlow flowNonce**: included in the signed digest but NOT tracked
  on-chain. Replay safety is enforced by the USDC nonce.

### Replay protection analysis

| Replay scenario | Protection | Result |
|-----------------|-----------|--------|
| Same tx resubmitted | USDC nonce already used | Reverts: `"authorization is invalid or already used"` |
| Same ArcFlow sig, new USDC sig | ArcFlow sig covers (flowId, amount, window, nonce) — USDC sig must match same amount; attacker cannot produce a new USDC sig | Requires owner's key |
| Same USDC sig, different ArcFlow params | USDC sig covers (from, to, value, window, nonce) — value must match ArcFlow's amount param | ArcFlow digest mismatch → ArcFlow rejects |

**Conclusion**: replay-safe. One USDC signature = at most one fund movement.

---

## 5. Transaction receipt checks

After broadcasting `executeSplitWithDualAuth`:

| # | Check | Expected |
|---|-------|----------|
| R1 | Transaction status | `status: 1` (success) |
| R2 | `FlowExecuted` event emitted | `flowId`, `owner`, `amount`, `treasuryAmount`, `contributorAmount` |
| R3 | `AuthorizationUsed` event on USDC | `authorizer = owner`, `nonce = <used nonce>` |
| R4 | `balanceOf(treasury)` | increased by `amount` (10000 bps → full amount) |
| R5 | `balanceOf(contributor)` | unchanged (0 bps) |
| R6 | `balanceOf(ArcFlowV2)` | `0` (no dust) |
| R7 | `balanceOf(owner)` | decreased by `amount` + gas |
| R8 | `getFlowCount()` | unchanged (execution doesn't create flows) |
| R9 | `getFlow(flowId).active` | still `true` (execution doesn't deactivate) |

---

## 6. Failure recovery

| Failure | Cause | Recovery |
|---------|-------|----------|
| `FlowNotFound` | flowId doesn't exist | Check `getFlowCount()`; recreate flow |
| `FlowInactive` | flow not activated | Call `activateFlow(flowId)` |
| `AmountBelowThreshold` | amount < flow.threshold | Use amount >= threshold |
| `AuthorizationNotYetValid` | `usdcValidAfter >= now` | Set `usdcValidAfter = 0` |
| `AuthorizationExpired` | `usdcValidBefore <= now` | Re-sign with future `validBefore` |
| `InvalidAuthorization` | wrong signature / digest mismatch | Verify domain fields, typehash, signer address |
| `ERC20: transfer amount exceeds balance` | owner has insufficient USDC | Fund the EOA |
| `OpcodeNotFound` (fork only) | anvil can't execute Arc system opcodes | Use a real Arc node RPC |
| USDC nonce already used | duplicate `nonce` value | Use a fresh random `bytes32` |

---

## 7. Why explicit approval is required

This smoke test moves real funds on Arc mainnet. Even at the smallest
practical amount (1 base unit = 0.000001 USDC ≈ $0.000001), it:

1. **Broadcasts a transaction** — an irreversible on-chain action.
2. **Exercises the native system transfer** — the ONLY component not yet
   verified against a real Arc node (Phase 10.8: anvil cannot emulate
   `0x1800…0000` system opcodes).
3. **Creates permanent on-chain state** — a flow and an execution record
   that cannot be undone.
4. **Spends gas** — the transaction fee is deducted from the test EOA's
   USDC balance.
5. **Validates the deployment** — if the smoke test reveals a bug, the
   deployed contract cannot be upgraded or deleted (immutable).

The risk is minimized by:
- Using 1 base unit (the smallest non-zero transfer)
- Using test-controlled addresses for owner, treasury, and contributor
- Using `usdcValidAfter = 0` and a tight `usdcValidBefore` (5-minute window)
- Running the authorization-layer `eth_call` pre-check FIRST (§5a of
  `DEPLOYMENT_VERIFICATION_PLAN.md`) to catch configuration errors
  without spending gas

But it cannot be reduced to zero without executing the transaction, and
the transaction cannot be undone. Hence: **explicit approval is required**.

---

## 8. Proposed smoke-test execution script (REVIEW ONLY — DO NOT RUN)

The script below is a **template** for the operator who runs the smoke test
after approval. It is intentionally incomplete (missing the private key and
deployed address) and CANNOT be executed as-is. It is included for review to
demonstrate that:
- It reads the private key from an environment variable (never hardcoded)
- It performs the `eth_call` pre-check BEFORE broadcasting
- It uses the minimum amount and a tight validity window
- It checks the receipt and balances after execution
- It fails loudly if any check is unexpected

**Private-key handling (Phase 18 §5 policy):** the template's
`--private-key $SMOKE_TEST_PRIVATE_KEY` pattern places the key on the command
line, where shell history and process listings can capture it. Before running
any broadcast step, the operator must either disable shell history for the
session, use a keystore/ledger signer, or inject the key via the masked
`Read-Host -AsSecureString` procedure — the key must never be typed into a
command line that is recorded, and never pasted into chat or the agent.

```
# PRECONDITIONS (set by operator):
#   SMOKE_TEST_PRIVATE_KEY  — test EOA private key (NOT committed)
#   V2_ADDRESS              — the newly deployed ArcFlowV2 address
#   TREASURY_ADDRESS        — test-controlled treasury (can equal test EOA)
#   ARC_RPC_URL             — https://rpc.mainnet.arc.io

# STEP 1: Preflight (read-only)
node scripts/preflight.mjs

# STEP 2: Verify test EOA has sufficient balance (read-only)
cast call 0x3600…0000 "balanceOf(address)" $TEST_EOA --rpc-url $ARC_RPC_URL
# Must be >= 2_000_000 (2 USDC)

# STEP 3: Create + activate flow (2 transactions, broadcast required)
cast send $V2_ADDRESS "createFlow(address,address,uint256,uint16,uint16)" \
  $TREASURY_ADDRESS $TREASURY_ADDRESS 1 10000 0 \
  --private-key $SMOKE_TEST_PRIVATE_KEY --rpc-url $ARC_RPC_URL
# → capture flowId from receipt (should be 0 for first flow)

cast send $V2_ADDRESS "activateFlow(uint256)" 0 \
  --private-key $SMOKE_TEST_PRIVATE_KEY --rpc-url $ARC_RPC_URL

# STEP 4: Authorization-layer eth_call pre-check (READ-ONLY, no broadcast)
# Construct dual-signed executeSplitWithDualAuth calldata off-chain,
# then eth_call it. Must NOT revert with an authorization error.
# (Script constructs the signatures using viem/accounts sign())
# Expected: reverts with a balance/transfer error if EOA has < 1 base unit,
#           OR succeeds in simulation if EOA has sufficient balance.

# STEP 5: Broadcast the actual transaction (REQUIRES APPROVAL)
cast send $V2_ADDRESS "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)" \
  0 1 0 <flowValidBefore> <flowNonce> <flowV> <flowR> <flowS> \
  0 <usdcValidBefore> <usdcNonce> <usdcV> <usdcR> <usdcS> \
  --private-key $SMOKE_TEST_PRIVATE_KEY --rpc-url $ARC_RPC_URL

# STEP 6: Post-execution checks (read-only)
cast receipt <TX_HASH> --rpc-url $ARC_RPC_URL
cast call 0x3600…0000 "balanceOf(address)" $TREASURY_ADDRESS --rpc-url $ARC_RPC_URL
cast call $V2_ADDRESS "balanceOf"  # → 0
```

The script MUST verify Step 4 (authorization accepted) BEFORE proceeding to
Step 5 (broadcast). If Step 4 reveals an authorization error, the operator
must debug the configuration before spending gas on a broadcast.
