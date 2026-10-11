# Phase 18 — ArcFlow V2 Final Deployment Decision Package

**Status:** DECISION PREPARATION — **THIS DOCUMENT IS NOT A DEPLOYMENT AUTHORIZATION**

**Prepared:** 2026-10-11 (Phase 18; documentation and read-only verification only)
**Release:** `arcflow-v2-rc3` — commit `9c5526d31d68663437270e2b8075788aaaf4d43f`
**Supersedes:** `docs/PHASE14_DEPLOYMENT_APPROVAL_PACKAGE.md` (retained as historical
evidence; its §3.1 blocker was repaired in Phase 15 and its `--env-file` guidance
was corrected in Phase 18)

No deployment, simulation, signing, broadcast, or fund movement occurred while
preparing this package. Nothing in this package proves a successful mainnet
deployment — only the post-deployment checks in §8 can do that.

---

## 1. Release identity and tag evidence

| Item | Value | Evidence |
|---|---|---|
| Branch | `master` | `git branch --show-current` |
| RC3 commit | `9c5526d31d68663437270e2b8075788aaaf4d43f` | `git rev-parse HEAD` |
| `arcflow-v2-rc3` | annotated tag → `9c5526d3…` (same as HEAD) | `git cat-file -t` / `git rev-parse arcflow-v2-rc3^{}` |
| `arcflow-v2-rc2` | unchanged → `91bc12f40577fe02c095f83aad3776cc59fa0212` | `git rev-parse arcflow-v2-rc2^{}` |
| `arcflow-v2-rc1` | unchanged → `b959a1e11b38d1cedfaf6cf32bfa23bcdbf6493d` | `git rev-parse arcflow-v2-rc1^{}` |
| `contracts/ArcFlowV2.sol` hash | `19704419cf76201127f92dc75257c540aca83862` (unchanged since RC1) | `git hash-object` |
| Deployment script | repaired and compile-gated in Phase 15 (RC3) | `test`/gate evidence below |
| V1 deployment | `0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2` — untouched | `.env.local` key-only check + Phase 16 live reads |
| `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` | **unset** (fail-closed) | preflight check 6 |

## 2. Test and compile-gate status

| Check | Status |
|---|---|
| `npm test` (Vitest 5.0.1, 449 tests) | ✅ 449/449 in all recent runs (Phase 17: 4/4 bounded diagnostic runs incl. serial mode; Phases 13–16: consistent). **Disclosure:** one exit-1 in Phase 16 was never explained — its output was discarded at capture time, so the original cause is **unknowable retrospectively**. No failure has reproduced since. Labeled hypothesis (unproven): transient worker/teardown issue |
| `foundry_bin\forge.exe test` | ✅ 103 pass / 0 fail (8 suites, incl. 6 chain-guard harness tests + 5 selector-regression tests) |
| `npm run compile:deploy-script` | ✅ exit 0 — compiles the **actual** `script_disabled/DeployArcFlowV2.s.sol` with solc 0.8.24 / optimizer 200 / via_ir in an isolated temp workspace; fresh artifact metadata verified each run |
| `forge build` (standard) | ✅ pass — note: does **not** compile `script_disabled/` (the dedicated gate above exists for that reason) |
| Chain-guard test scope | ⚠️ honest limitation: the 6 harness tests prove the guard **logic**; only the compile gate proves the **script file** |

**Precision requirement:** passing tests, a clean compile of the deployment
script, and a static review of simulation behavior establish that the release
is *well-formed and non-executed*. They do **not** prove a successful mainnet
deployment, correct live behavior, or native USDC movement.

## 3. Live Arc RPC verification (Phase 16 evidence — not re-checked in Phase 18)

The following were verified live on `https://rpc.mainnet.arc.io` during
**Phase 16** (read-only `eth_chainId`, `eth_blockNumber`, `eth_getCode`,
`eth_call` via cast 1.8.5). They are cited here as prior evidence, not new
checks:

- `eth_chainId` → `0x13b2` (5042, exact match)
- `eth_blockNumber` → advancing across calls (live chain)
- `eth_getCode` USDC proxy `0x3600…0000` → non-empty (3,598 hex chars)
- `eth_getCode` V1 `0x3fB50a…` → non-empty (7,662 hex chars)
- V1 `getFlowCount()` → `1`; V1 `owner()` → `0x299Ce4113abF88F4997737184aa8A7a3D58AC15C`
- USDC `DOMAIN_SEPARATOR()` → `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84` (matches expected)

## 4. Forge 1.8.5 dry-run behavior (Phase 17 static review — **not** an executed dry run)

Established from the installed toolchain's help text (`forge script --help`,
688 lines, captured) and source inspection — **`forge script` was never
executed, not even without `--broadcast`**:

1. Without `--broadcast`, `forge script` only **simulates locally** (help labels plain invocation "simulate the script locally"; `--broadcast` = "Broadcasts the transactions").
2. `vm.startBroadcast()` does **not** broadcast by itself — transactions are "prepared during local script execution, before broadcasting" and submitted only in broadcast mode.
3. `--private-key <RAW_PRIVATE_KEY>` loads key material into the local process; the script does **not** need this flag (it reads `DEPLOYER_PRIVATE_KEY` itself via `vm.envString` → `vm.startBroadcast`).
4. The script's complete cheatcode surface is `vm.envString`, `vm.parseAddress`, `vm.parseUint`, `vm.startBroadcast`, `vm.stopBroadcast`; the only state operation is `new ArcFlowV2(usdcAddress)`; no `.call/.transfer/.send`; `vm.ffi` disabled; no other external mechanism.
5. **Correction carried into this package:** `--env-file` does **not exist** in Forge 1.8.5 (absent from `forge script --help`, `forge --help`, `cast --help`). Environment values must be **exported in the deployment shell**.

A *simulation* (if later approved) would still execute the script's `run()`
locally against live state — it is an execution step requiring its own
authorization, distinct from, and precedent to, any broadcast.

## 5. Environment preparation (no secret exposure)

Set the three variables in the **deployment shell** (PowerShell — verified
syntax for Windows PowerShell 5.1 and PowerShell 7+). Distinguish carefully:
*setting variables* is environment preparation, not deployment execution.

```powershell
# Public values (no secret) — plain assignment, prints nothing:
$env:ARC_RPC_URL      = "https://rpc.mainnet.arc.io"
$env:ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000"

# Secret — entered interactively and masked; the VALUE is never part of a
# command line, so it never lands in shell history or process listings:
$secure = Read-Host "DEPLOYER_PRIVATE_KEY" -AsSecureString
$env:DEPLOYER_PRIVATE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
```

Verify **presence/status only** (prints booleans; never values, lengths, or hashes):

```powershell
foreach ($n in 'ARC_RPC_URL','ARC_USDC_ADDRESS','DEPLOYER_PRIVATE_KEY') {
  "{0}: {1}" -f $n, $(if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($n))) {'MISSING'} else {'PRESENT'})
}
"RPC matches expected: " + ($env:ARC_RPC_URL.Trim() -eq 'https://rpc.mainnet.arc.io')
"USDC matches proxy:   " + ($env:ARC_USDC_ADDRESS.Trim().ToLower() -eq '0x3600000000000000000000000000000000000000')
# DEPLOYER_PRIVATE_KEY: presence check ONLY. Never print, hash, measure, or log it.
```

Rules:
- **Never** place `DEPLOYER_PRIVATE_KEY` on a command line (no `--private-key`,
  no `set DEPLOYER_PRIVATE_KEY=…` in cmd — both put the key in shell history;
  the `Read-Host -AsSecureString` path above avoids this). The script does not
  need it as a flag.
- Clean up after the session: `Remove-Item Env:DEPLOYER_PRIVATE_KEY`.
- `.env.local` is **not** auto-loaded by Forge (no plain `.env` exists; Forge
  auto-loads `./.env` only; `--env-file` is unavailable in 1.8.5). Do not copy
  secrets into a new committed file; do not paste the key into chat, tickets,
  or logs.

## 6. Proposed deployment command — **NOT EXECUTED — REQUIRES SEPARATE WRITTEN APPROVAL**

```sh
# Step 1 — dry run / simulation (NO broadcast; still an execution step, needs its own go-ahead):
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol --rpc-url https://rpc.mainnet.arc.io

# Step 2 — actual deployment (BROADCAST):
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol --rpc-url https://rpc.mainnet.arc.io --broadcast
```

Neither command has ever been executed. Step 2 additionally requires: gates §7
all green, the dry-run output reviewed, and **explicit written approval** from
an authorized human. Expected constructor argument: `ArcFlowV2(0x3600000000000000000000000000000000000000)`;
owner will be the EOA behind `DEPLOYER_PRIVATE_KEY` (exported in the shell,
never on the command line). The frontend address is **never** configured by
the script or any documented step until §8 passes.

## 7. Pre-deployment gates and stop conditions

| Gate | Requirement | Status |
|---|---|---|
| G1 | Release identity verified (§1) | ✅ PASS |
| G2 | Deployment script compiles (compile gate) | ✅ PASS (RC3) |
| G3 | Environment exported and status-verified in the deployment shell (§5) | ⏳ operator action |
| G4 | Dry-run simulation reviewed: chain ID 5042, USDC proxy printed, guard silent, no errors | ⏳ requires separate go-ahead |
| G5 | **Explicit written deployment approval** naming the approver, date, and command | ⏳ not requested, not granted |

**Stop conditions — abort immediately, preserve evidence, do not "fix forward":**
any §1 identity check fails; dry-run shows a chain ID other than 5042 (or the
in-script guard fails to revert on a wrong chain); the dry-run constructor
argument is not `0x3600…0000`; any command prints or exposes
`DEPLOYER_PRIVATE_KEY`; the deployer address mismatches the approved operator
address or lacks gas; build settings deviate from solc 0.8.24 / optimizer 200 /
via_ir; any unapproved party requests the key.

## 8. Post-deployment verification requirements (all must pass before §10)

- [ ] **D1.** Record deployed address + deployment tx hash from the broadcast
      receipt. This receipt-derived address is the ONLY valid target for every
      subsequent check, frontend configuration, and smoke test — simulation
      output (e.g., a predicted CREATE address such as `0x0AC8…12bA`) is NOT a
      deployment address, and the predecessor `0xf0c80Fdd…` is permanently
      prohibited.
- [ ] **D2.** Chain ID is 5042 (`cast chain-id`).
- [ ] **D3.** Code exists and matches the expected RC3 build: `cast code-size` > 0;
      `cast code` (or its keccak-256) matches `deployedBytecode` from the RC3
      artifact (solc 0.8.24, optimizer 200, via_ir); explorer source verification if available.
- [ ] **D4.** `usdc()` == `0x3600000000000000000000000000000000000000`; `owner()` == approved deployer EOA.
- [ ] **D5.** Expected selector `0x6d200078` (`executeSplitWithDualAuth`, 14 params) present in deployed bytecode.
- [ ] **D6.** Documented read-only checks (checklist §D): USDC `DOMAIN_SEPARATOR()` unchanged; V1 untouched.
- [ ] **D7.** `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` remains **unset** until D1–D6 all pass.
- [ ] **D8.** Native USDC movement compatibility — only verifiable via §9.

## 9. Separate approval gate — real-node USDC movement smoke test

The smoke test (`docs/SMOKE_TEST_PLAN.md`) is a **real mainnet transaction**
(`executeSplitWithDualAuth` on a minimal operator-controlled flow): it
consumes gas and moves real USDC. It requires its **own explicit written
approval** — deployment approval does **not** cover it — and is only possible
after §8/D1–D7 pass. It is the sole mechanism that can verify the Arc native
USDC system-transfer behavior (`0x1800…0000` path), which no fork or local
emulation could verify pre-deployment.

## 10. Immutable-contract limitations and containment

The deployed contract is **immutable**: no proxy, no upgrade path, no migration
function, no on-chain rollback. Statements of "rolling back" a deployment are
impossible. Containment options, in escalating order:

1. **Do not configure the frontend** — with `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` unset, no UI path reaches the contract (primary stop control; reversible).
2. **Create no flows** — funds cannot move without an active flow plus dual signatures.
3. **Pause flows** — `pauseFlow(flowId)` (flow owner); `toggleAutoExecute(flowId, false)`.
4. **Ownership containment** — `transferOwnership(...)` to a controlled cold key (preferred) or `renounceOwnership()` (irreversible; also permanently disables the `rescueERC20` recovery path — decide deliberately).
5. **Stuck-token recovery** — the contract holds USDC only transiently (pull → split in one tx); `rescueERC20` (onlyOwner) recovers tokens sent directly to the contract.
6. **Record deprecation** — if defective: freeze (1–3), mark the address DEPRECATED, deploy a fix only via a new release candidate and full gates.

## 11. Go / no-go table

| # | Item | Type | Status |
|---|---|---|---|
| 1 | Release identity & tags (§1) | completed evidence | ✅ PASS |
| 2 | Full test suites (§2) | completed evidence | ✅ PASS (one unexplained historical Vitest exit-1 disclosed) |
| 3 | Actual-script compile gate (§2) | completed evidence | ✅ PASS |
| 4 | Live RPC: chain 5042, USDC proxy, V1 intact (§3) | completed evidence (Phase 16) | ✅ PASS |
| 5 | Forge 1.8.5 simulation semantics (§4) | completed evidence (static review only) | ✅ established |
| 6 | Native Arc USDC movement on a real node | post-deployment only | ⏳ §9 gate |
| 7 | Environment exported in deployment shell (§5) | pending operator action | ⏳ |
| 8 | Dry-run simulation reviewed (§6 step 1) | pending operator action (needs own go-ahead) | ⏳ |
| 9 | Written deployment approval (§6 step 2) | pending human decision | ⏳ **this package's decision point** |
| 10 | Post-deployment checks D1–D7 (§8) | post-deployment | ⏳ |
| 11 | Smoke test approval + execution (§9) | post-deployment, separate gate | ⏳ |

**Decision framing:** items 1–5 are the completed evidence base. Items 7–9 are
the human decision path; item 9 is the explicit authorization this package
cannot grant. Items 10–11 only become meaningful after a successful deployment.

---

*This package prepares the decision; it does not grant deployment authorization.
No deployment, simulation, signing, broadcast, or configuration change occurred
in Phase 18.*
