# ArcFlow V2 — Operator Deployment Checklist (Phase 12)

**Purpose**: Step-by-step checklist for the operator authorized to deploy
ArcFlowV2 to Arc mainnet and run the real-node smoke test. Each step must be
checked off in order. **Do not skip any step.**

**Prerequisites**: This checklist assumes the release candidate has been
independently reviewed and approved. See `DEPLOYMENT_VERIFICATION_PLAN.md`
for the full technical verification plan and `SMOKE_TEST_PLAN.md` for the
smoke-test design rationale.

---

## A. Operator wallet and gas prerequisites

- [ ] **A1.** Operator has a dedicated deployment EOA (not a multisig, not a
       hardware wallet shared with other duties) with its private key secured
       according to the operator's key-management policy.
- [ ] **A2.** The deployment EOA has sufficient native USDC on Arc mainnet for:
       deployment gas (~0.01 USDC estimated) + smoke-test amount (2 USDC)
       + buffer (5 USDC). Total recommended: **≥ 10 USDC**.
       Check: `cast balance <EOA> --rpc-url https://rpc.mainnet.arc.io`
       (result is in 18-dec wei; divide by 1e12 for USDC equivalent)
- [ ] **A3.** The deployment EOA has **zero contract code** on Arc mainnet
       (EIP-7702-delegated accounts will fail signature verification on the
       USDC contract — Phase 10.8 discovery).
       Check: `cast code <EOA> --rpc-url https://rpc.mainnet.arc.io`
       (must return `0x`)
- [ ] **A4.** The deployment EOA is NOT the same key used for any other
       production duty (isolated for this deployment).

---

## B. Pre-deployment source verification

- [ ] **B1.** Confirm the release commit:
       `git rev-parse HEAD` → record the hash. Expected: the commit containing
       this checklist and the Phase 10.9 contract changes.
- [ ] **B2.** Confirm source file hash:
       `git hash-object contracts/ArcFlowV2.sol` → record. The reviewed hash is
       the one in this commit's working tree.
- [ ] **B3.** Confirm OZ dependency revision:
       `git submodule status lib/forge-std` and check
       `lib/openzeppelin-contracts/package.json` version = `5.6.1`.
- [ ] **B4.** Confirm compiler settings in `foundry.toml`:
       `solc_version = "0.8.24"`, `optimizer = true`, `optimizer_runs = 200`,
       `via_ir = true`.
- [ ] **B5.** Confirm clean compile:
       `foundry_bin/forge.exe build` → zero errors.
- [ ] **B6.** Confirm all tests pass:
       `foundry_bin/forge.exe test` → 103 tests, 0 failures.
       `npm test` → 449 tests, 0 failures.
- [ ] **B7.** Confirm preflight passes:
       `node scripts/preflight.mjs` → 0 failures.
- [ ] **B8.** DEPLOYMENT-SCRIPT COMPILE GATE (MANDATORY — RC3 and later):
       `node scripts/compile-deploy-script.mjs` (or
       `npm run compile:deploy-script`) → exit 0, "COMPILE GATE PASSED".
       Standard `forge build`/`forge test` do NOT compile
       `script_disabled/DeployArcFlowV2.s.sol`; this gate compiles the real
       deployment script with solc 0.8.24 / optimizer 200 / via_ir in an
       isolated temp workspace and verifies the fresh artifact metadata.
       Deployment approval must not proceed if this gate fails.
- [ ] **B9.** Record the expected deployed bytecode hash:
       Extract from `out/ArcFlowV2.sol/ArcFlowV2.json`:
       `deployedBytecode.object` — record the keccak-256 hash for
       post-deployment comparison.

---

## C. Deployment (REQUIRES EXPLICIT APPROVAL)

- [ ] **C1.** Set environment variables (NOT committed):
       ```
       ARC_RPC_URL=https://rpc.mainnet.arc.io
       DEPLOYER_PRIVATE_KEY=<deployment EOA private key>
       ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
       ```
- [ ] **C2.** Dry-run (no broadcast):
       ```
       foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol --rpc-url %ARC_RPC_URL%
       ```
       Confirm output shows: chain ID 5042, USDC address, no errors.
       NOTE: The script now REVERTS with `WrongChainId(5042, actual)` if the
       chain ID is not 5042 — this is the fail-closed guard, not a warning.
- [ ] **C3.** **APPROVAL GATE** — Obtain written approval from the project
       owner before proceeding. Record the approver name and date.
- [ ] **C4.** Broadcast:
       ```
       foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol --rpc-url %ARC_RPC_URL% --broadcast
       ```
- [ ] **C5.** Record the deployed address from the output.
- [ ] **C6.** Record the transaction hash and confirm it is confirmed:
       `cast receipt <TX_HASH> --rpc-url %ARC_RPC_URL%`

---

## D. Post-deployment verification

- [ ] **D1.** Runtime bytecode matches:
       `cast code <DEPLOYED> --rpc-url %ARC_RPC_URL%`
       Compare with the locally compiled `deployedBytecode` from B9.
- [ ] **D2.** Constructor state:
       - `cast call <DEPLOYED> "usdc()"` → `0x3600000000000000000000000000000000000000`
       - `cast call <DEPLOYED> "owner()"` → deployment EOA
       - `cast call <DEPLOYED> "getFlowCount()"` → `0`
       - `cast call <DEPLOYED> "BASIS_POINTS_DENOMINATOR()"` → `10000`
- [ ] **D3.** Selector dispatch:
       - `cast call <DEPLOYED> "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)" 0 0 0 0 0x0000000000000000000000000000000000000000000000000000000000000000 27 0x0000000000000000000000000000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000000000000000000000000000 0 0 0x0000000000000000000000000000000000000000000000000000000000000000 27 0x0000000000000000000000000000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000000000000000000000000000`
       → must revert with a non-empty error (FlowNotFound) — proves dispatch.
- [ ] **D4.** USDC DOMAIN_SEPARATOR unchanged:
       `cast call 0x3600…0000 "DOMAIN_SEPARATOR()" --rpc-url %ARC_RPC_URL%`
       → `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`
       NOTE: The deployment script now reverts with `WrongChainId(5042, actual)`
       if the RPC chain ID is not 5042 (fail-closed guard, tested by
       `test/ChainGuard.t.sol`). This replaces the previous warning-only behavior.
- [ ] **D5.** USDC `safeTransfer` still unbound:
       `cast call 0x3600…0000 "safeTransfer(address,uint256)" <any> 0`
       → must revert with EMPTY data.
- [ ] **D6.** If ANY check in this section fails: **STOP**. Do not configure
       the frontend. Follow the rollback procedure in
       `DEPLOYMENT_VERIFICATION_PLAN.md` §6.

---

## E. Frontend V2 configuration (ONLY after D passes)

- [ ] **E1.** Set the frontend V2 address:
       `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS=<DEPLOYED_ADDRESS>`
       in the production environment (NOT committed to git).
- [ ] **E2.** Run `node scripts/preflight.mjs` — section 6 must now show the
       V2 address as configured AND section 4 must still pass.
- [ ] **E3.** Confirm `lib/arcflow/authorization/arcflow-eip712.ts`
       `getArcFlowV2EIP712Domain()` returns the correct verifying contract.
- [ ] **E4.** Confirm `buildArcFlowV2ExecuteTypedDataMessage()` no longer
       throws (it now resolves to the configured address).

---

## F. Smoke test (REQUIRES SEPARATE EXPLICIT APPROVAL)

See `docs/SMOKE_TEST_PLAN.md` for the full design. Summary:

- [ ] **F0.** Smoke target = the D1-verified deployment address recorded from
       the **actual deployment receipt**. Never the simulated address
       `0x0AC8…12bA` (a predicted CREATE location, not a deployment) and never
       the predecessor `0xf0c80Fdd…` (rejected fail-closed by
       `script_disabled/SmokeTestV2.s.sol` via `SMOKE_TEST_V2_ADDRESS`; the
       script itself is a disabled Phase 11 artifact with an obsolete USDC
       domain block — the cast-based process below and the plan govern).
- [ ] **F1.** Test EOA is code-free on Arc (check `cast code <EOA>` → `0x`)
- [ ] **F2.** Test EOA has ≥ 2 USDC (`cast call 0x3600…0000 "balanceOf(address)" <EOA>`)
- [ ] **F3.** Create a flow with `threshold = 1`, `treasuryBps = 10000`,
       `contributorBps = 0` (all funds to a test-controlled treasury).
- [ ] **F4.** Activate the flow.
- [ ] **F5.** Construct dual-signed `executeSplitWithDualAuth` with
       `amount = 1`, `usdcValidAfter = 0`, tight `usdcValidBefore`.
- [ ] **F6.** **eth_call pre-check** (read-only, no broadcast):
       must NOT revert with an authorization error. If it reverts with
       `InvalidAuthorization` or `AuthorizationNotYetValid`, STOP — debug.
- [ ] **F7.** **APPROVAL GATE** — Obtain separate written approval for the
       broadcast.
- [ ] **F8.** Broadcast with `amount = 1` (1 micro-USDC).
- [ ] **F9.** Verify receipt: `FlowExecuted` event, `AuthorizationUsed` event.
- [ ] **F10.** Verify treasury balance increased by exactly 1 base unit.
- [ ] **F11.** Verify ArcFlowV2 USDC balance = 0 (no dust).
- [ ] **F12.** Verify test EOA balance decreased by 1 base unit + gas.
- [ ] **F13.** Replay test: resubmit the same tx → must revert
       (USDC nonce single-use).

---

## G. Failure handling

If any step fails:
1. **STOP** — do not attempt to "fix it live".
2. If the deployment itself failed (C4): check gas, nonce, and USDC address;
   retry after diagnosis.
3. If post-deployment verification failed (D): do NOT configure the frontend.
   The contract exists but is not connected to any UI. No funds at risk.
4. If the smoke test failed (F): pause the flow (`pauseFlow`), do not
   proceed to production. Diagnose and redeploy if necessary.
5. ArcFlowV2 holds no funds between transactions (all distributed atomically;
   contract USDC balance is always 0 after execution). There is no treasury
   to drain.
6. The contract is immutable — no upgrade path. If fundamentally broken,
   deploy a corrected version at a new address.
