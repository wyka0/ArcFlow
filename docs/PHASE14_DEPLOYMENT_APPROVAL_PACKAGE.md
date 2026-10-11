# Phase 14 — ArcFlow V2 Deployment Approval Package

> **RESOLUTION UPDATE (Phase 15):** The critical finding in §3.1 (RC2
> deployment script does not compile) has been **REPAIRED** in Phase 15:
> `run()`'s closing brace restored, undefined `chainId` replaced with
> `EXPECTED_CHAIN_ID`, and a mandatory compile gate
> (`scripts/compile-deploy-script.mjs`) now compiles the real script in an
> isolated workspace. Frozen as `arcflow-v2-rc3`. All other Phase 14
> findings and gates below remain accurate and in force; gate G2 now PASSES
> on RC3. This document is retained as the historical evidence base.

**Status:** PREPARATION AND EVIDENCE ONLY — **THIS DOCUMENT IS NOT A DEPLOYMENT AUTHORIZATION**

**Prepared:** 2026-10-11 (Phase 14, read-only review)
**Release reviewed:** `arcflow-v2-rc2`
**Verdict of this package:** `BLOCKED — RELEASE/VALIDATION MISMATCH` (see §11 and §3.1)

No deployment, transaction, signature, broadcast, or configuration change was
performed while preparing this package. All evidence below was gathered with
read-only inspection and non-broadcasting validation commands.

---

## 1. Release identity and verification evidence

| Item | Expected | Verified value | Method | Result |
|---|---|---|---|---|
| Repository root | `C:\arcflow` | `C:/arcflow` | `git rev-parse --show-toplevel` | ✅ |
| Branch | master | `master` | `git branch --show-current` | ✅ |
| HEAD | `91bc12f40577fe02c095f83aad3776cc59fa0212` | same | `git rev-parse HEAD` | ✅ |
| Working tree at review start | clean | clean | `git status --short` | ✅ |
| `arcflow-v2-rc2` object type | annotated tag | `tag` | `git cat-file -t arcflow-v2-rc2` | ✅ |
| `arcflow-v2-rc2` target | `91bc12f4…` | `91bc12f40577fe02c095f83aad3776cc59fa0212` | `git rev-parse arcflow-v2-rc2^{}` | ✅ |
| `arcflow-v2-rc2` message | RC2 message | `ArcFlow V2 release candidate 2 — fail-closed chain guard; deployment not authorized` | `git tag -l --format='%(contents:subject)'` | ✅ |
| `arcflow-v2-rc1` target (must be unchanged) | `b959a1e1…` | `b959a1e11b38d1cedfaf6cf32bfa23bcdbf6493d` | `git rev-parse arcflow-v2-rc1^{}` | ✅ |
| `contracts/ArcFlowV2.sol` source hash | `19704419cf76201127f92dc75257c540aca83862` | same | `git hash-object contracts/ArcFlowV2.sol` | ✅ |
| Compiler settings | solc 0.8.24, optimizer on, 200 runs, via_ir | same | `foundry.toml` + `forge config` | ✅ |
| Arc mainnet chain ID | `5042` | `EXPECTED_CHAIN_ID = 5042` in script | source inspection | ✅ |
| Arc USDC proxy | `0x3600000000000000000000000000000000000000` | matches `.env.local` value (boolean check) | name-only parse, no value printed | ✅ |
| V1 deployment (unchanged) | `0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2` | unchanged in `.env.local` (`NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS`) | key-only check | ✅ |
| `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` | unset | unset (preflight check 6: fail-closed correctly) | `scripts/preflight.mjs` | ✅ |

---

## 2. Required environment variables — presence only, values never read or printed

Required for deployment (operator sets these locally; never commit them):

| Variable | Purpose | Secret? | Shell (Process/User/Machine) | `.env.local` |
|---|---|---|---|---|
| `ARC_RPC_URL` | RPC endpoint for `forge script --rpc-url` | no | ABSENT (all scopes) | PRESENT; equals `https://rpc.mainnet.arc.io` (boolean match: True) |
| `ARC_USDC_ADDRESS` | USDC proxy passed to constructor | no | ABSENT (all scopes) | PRESENT; equals `0x3600…0000` proxy (boolean match: True) |
| `DEPLOYER_PRIVATE_KEY` | Deployer EOA key (becomes contract owner) | **YES** | ABSENT (all scopes) | PRESENT, non-empty (value never read, never printed) |

**Status: BLOCKED for this agent session — READY for a local operator.**
The variables are not exported in this session's shell, so the deployment
command cannot be run from here (which is also not permitted in Phase 14).
They exist in `.env.local` (gitignored) and both non-secret values were
verified to match the expected Arc mainnet constants via boolean comparison
only. **No secret value was ever accessed, printed, length-measured, or
written anywhere.**

### Safe local verification instructions (operator)

```powershell
# Presence check only — never print the value:
foreach ($n in 'ARC_RPC_URL','ARC_USDC_ADDRESS','DEPLOYER_PRIVATE_KEY') {
  $v = [Environment]::GetEnvironmentVariable($n)
  "{0}: {1}" -f $n, $(if ([string]::IsNullOrEmpty($v)) {'ABSENT'} else {'PRESENT'})
}

# Non-secret value match (prints only True/False, never the value):
$usdc = [Environment]::GetEnvironmentVariable('ARC_USDC_ADDRESS')
"USDC matches verified proxy: " + ($usdc.Trim().ToLower() -eq '0x3600000000000000000000000000000000000000')

# DEPLOYER_PRIVATE_KEY: check presence ONLY. Never echo, log, or redirect it.
```

**Important (forge behavior):** Foundry auto-loads `.env` from the project
root — **not** `.env.local`. There is no plain `.env` in this repository.
The operator must **export the three variables in the deployment shell**
before running any command. Do not rely on `--env-file`: the installed
Forge 1.8.5 does not provide that option (verified in Phase 17 against
`forge script --help`, `forge --help`, and `cast --help`). Do not copy
secrets into a new committed file. Do not paste the private key into chat,
tickets, or logs. See `docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md` §5 for
verified PowerShell examples that set values without printing them.

---

## 3. Deployment script review — `script_disabled/DeployArcFlowV2.s.sol`

Reviewed at commit `91bc12f4` (RC2). Findings per source inspection plus a
sandbox compile (see §3.1 for how it was done without executing the script).

| # | Requirement | Finding |
|---|---|---|
| 3.1 | Chain guard executes before env reads and `vm.startBroadcast()` | ✅ `_verifyChainId()` is the first statement of `run()` (line 16); env reads start line 19; `vm.startBroadcast(...)` line 50 |
| 3.2 | Script expects chain ID `5042` | ✅ `uint256 public constant EXPECTED_CHAIN_ID = 5042;` |
| 3.3 | Wrong chain reverts, no fallback | ✅ `revert WrongChainId(EXPECTED_CHAIN_ID, actual);` — warning-only behavior removed in RC2; no alternate `run()` path exists |
| 3.4 | Constructor receives intended Arc USDC proxy | ✅ `new ArcFlowV2(usdcAddress)` where `usdcAddress = vm.parseAddress(vm.envString("ARC_USDC_ADDRESS"))`; `.env.local` value verified equal to the verified proxy (boolean match) |
| 3.5 | Deployer/owner behavior understood | ✅ `constructor(address _usdc) Ownable(msg.sender)` — the EOA behind `DEPLOYER_PRIVATE_KEY` becomes contract owner (Ownable v5) |
| 3.6 | Existing USDC validation present | ✅ env var required non-empty + `vm.parseAddress`; post-deploy `usdc()` equality assert; note: no on-chain pre-check that the env value equals the verified proxy — operator must pass `0x3600…0000` (post-deploy assert would catch a wrong value only after deployment) |
| 3.7 | Post-deployment checks present | ✅ `extcodesize(arcFlowV2) == 0 → assert(false)`; `address(arcFlowV2.usdc()) != usdcAddress → assert(false)` |
| 3.8 | No automatic frontend V2 address configuration | ✅ script only *prints* the instruction `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS=<address>`; it never writes env files |
| 3.9 | Unverified address `0xf0c80Fdd…` not used | ✅ absent from the script |
| 3.10 | **The script compiles** | ❌ **FAIL — see §3.1** |

### 3.1 CRITICAL FINDING — the RC2 deployment script does not compile

`forge build` and `forge test` never compile `script_disabled/` because the
Foundry scan directories are `src = "contracts"`, `test = "test"`,
`script = "script"`. This review compiled the file in a sandbox (read-only
compile; `out`/`cache` redirected to a temp directory outside the repo; the
script was **never executed** — no RPC, no simulation, no broadcast):

```
Error (2314): Expected '(' but got identifier
  --> script_disabled/DeployArcFlowV2.s.sol:92:14:
   |
92 |     function _verifyChainId() internal view {
```

Two defects, both introduced by the Phase 13.1 edit:

1. **Missing closing brace for `run()`** — the edit that inserted
   `_verifyChainId()` consumed `run()`'s closing `    }` (the old text
   `    }\n}` was replaced by the new function), so the function declaration
   at line 92 lands inside the still-open `run()` body → parser error 2314.
2. **Undefined identifier `chainId` at line 63** —
   `console.log("Chain ID:", chainId);` still references the local variable
   whose declaration (`uint256 chainId = vm.getChainId();`) was removed when
   the guard was rewritten. Verified there is no `chainId` symbol in
   `forge-std/Script.sol` or anywhere in the file. This error is masked by
   error 1 and would surface after fixing the brace.

**Consequences:**

- The documented deployment command (§5) fails at compile time, before any
  chain connection. This is *fail-safe* (nothing can deploy from this file
  as-is) but the release candidate is **not deployable as tagged**.
- The Phase 13.1 validation (forge build exit 0) was true but **vacuous** for
  this file — a validation blind spot, now documented.
- `out/DeployArcFlowV2.s.sol/DeployArcFlowV2.json` exists (LastWriteTime
  2026-10-10 09:24) — a **stale artifact** from a pre-RC2 compile. `out/` is
  gitignored. Operators must not treat this stale artifact as the RC2 build
  output.

**Required remediation (future phase, NOT performed here):** (a) restore
`run()`'s closing brace; (b) replace `chainId` with `EXPECTED_CHAIN_ID` at
line 63; (c) add a real compile gate that includes the deployment script
(e.g., a preflight step that compiles `script_disabled/` via an explicit
config, or relocating the script into a compiled directory with the
"disabled" property enforced differently); (d) re-run full validation and cut
an RC3 tag. The fix is a 2-line change plus tooling, but it changes the
release, so it must go through review — it is deliberately **not** applied in
Phase 14, which forbids editing the script and the frozen release.

### 3.2 Honest scope of the chain-guard tests

`test/ChainGuard.t.sol` (6 tests) exercises a **mirrored harness**
(`ChainGuardHarness`), not the actual deployment script. The harness
duplicates `_verifyChainId()`'s logic (constant 5042, `block.chainid`
comparison, `WrongChainId(expected, actual)` revert) because Script contracts
cannot be unit-tested directly (they require env vars and a broadcast
context). The tests prove the *logic* is correct; they do **not** prove the
script file itself compiles or that `run()` calls the guard first. Given
§3.1, this distinction is material: the harness compiles and passes while the
script it mirrors does not compile at all.

### 3.3 Directory contents note

`script_disabled/` contains 11 script files: the V2 deployment script, the
V1 deployment script, `SmokeTestV2.s.sol`, and 8 typehash/selector
investigation scripts from earlier phases. Only `DeployArcFlowV2.s.sol` is
the deployment entry point. All other files in `script_disabled/` compiled
clean in the sandbox build (the only error was §3.1).

---

## 4. Pre-deployment gates and explicit stop conditions

| Gate | Requirement | Status |
|---|---|---|
| G1 | Release identity verified (§1) | ✅ PASS (RC2 as tagged) |
| G2 | Deployment script compiles | ❌ **FAIL — RC2 blocked, requires RC3 (§3.1)** |
| G3 | Environment ready and verified locally | ⚠️ BLOCKED for this session; verified-in-`.env.local`; operator must export in the deployment shell |
| G4 | Dry-run compile + simulation (`forge script` **without** `--broadcast`) against `https://rpc.mainnet.arc.io` | ⏸ not executed (requires G2 fixed; Phase 14 forbids executing the script) |
| G5 | **Explicit written human approval** for the broadcast | ⏸ not requested, not granted |
| G6 | Smoke test (real-node native USDC movement) | ⏸ separate gate — see §8 |

**Stop conditions — abort immediately, do not proceed, preserve evidence:**

- Any release-identity check in §1 fails or the working tree is dirty with
  unexplained changes.
- The dry-run output shows a chain ID other than `5042` (the in-script guard
  must also revert `WrongChainId(5042, actual)` — if it does *not* revert,
  stop and investigate before any broadcast).
- The dry-run constructor argument is not `0x3600…0000`.
- Any output that would print or expose `DEPLOYER_PRIVATE_KEY`.
- The deployer address does not match the approved operator address, or its
  gas balance is below the dry-run estimate.
- Compiler settings of the build artifact differ from solc 0.8.24 /
  optimizer 200 / via_ir.
- Any unapproved person or process requests the private key.

---

## 5. Proposed deployment command — **NOT EXECUTED**

> **This command has NOT been executed in Phase 14 and must not be executed
> until G2, G3, G4 and G5 all pass. As of RC2 it fails at compile time
> (§3.1); running it today would abort harmlessly at compilation, but it is
> listed here solely for human review of the intended procedure.**

```sh
# Dry run (no broadcast) — requires G2 fixed and G3 exported:
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol \
  --rpc-url https://rpc.mainnet.arc.io

# Actual deployment (BROADCAST — requires G5 written approval):
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --broadcast
```

**No `--private-key` on the command line (corrected in Phase 18):** the
script reads `DEPLOYER_PRIVATE_KEY` itself (via `vm.envString` →
`vm.startBroadcast`), so Forge never needs the key as a CLI flag — and
omitting it keeps the key out of shell history and process listings.

**Environment loading (corrected in Phase 18):** Forge 1.8.5 auto-loads
`./.env` (absent in this repository) and does **not** support `--env-file`
(verified against the installed toolchain's help in Phase 17). Export the
variables in the deployment shell instead — see
`docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md` §5 for verified PowerShell
examples that never print, hash, or log values.

---

## 6. Expected constructor arguments and verification

| Argument | Value | Source |
|---|---|---|
| `_usdc` | `0x3600000000000000000000000000000000000000` (Arc USDC proxy) | `ARC_USDC_ADDRESS` env var → `vm.parseAddress` → `new ArcFlowV2(usdcAddress)` |

No other constructor arguments exist. No init params are set post-construction
(owner is derived from `msg.sender`).

Verification of the constructor argument, in order:

1. **Dry run:** `forge script` (no `--broadcast`) prints
   `USDC Address: 0x3600000000000000000000000000000000000000` and the chain ID
   `5042`; the in-script guard must not revert.
2. **Broadcast record:** the deployment transaction's `input` data must end in
   the 32-byte padded proxy address
   `0000…0000` + `3600000000000000000000000000000000000000`
   (inspect via explorer or `cast tx <hash> input`).
3. **Post-deploy state:** `cast call <V2> "usdc()"` must return the proxy;
   `cast call <V2> "owner()"` must return the approved deployer EOA.

---

## 7. Post-deployment verification requirements (must ALL pass before §8)

Record in this document's successor (deployment record) **before anything else**:

- [ ] **D1.** Deployed contract address and deployment transaction hash (from
      the broadcast receipt / explorer).
- [ ] **D2.** Chain ID is `5042`:
      `cast chain-id --rpc-url https://rpc.mainnet.arc.io`
- [ ] **D3.** Deployed bytecode exists and matches the expected RC3 build:
      `cast code-size <V2>` > 0, and `cast code <V2>` matches (or its
      `keccak256` matches) the `deployedBytecode` of the verified build
      artifact produced with solc 0.8.24 / optimizer 200 / via_ir. Also
      complete source verification on the block explorer if available.
- [ ] **D4.** `cast call <V2> "usdc()"` returns
      `0x3600000000000000000000000000000000000000` and
      `cast call <V2> "owner()"` returns the approved operator EOA.
- [ ] **D5.** Expected function selector present:
      `executeSplitWithDualAuth(...)` → `0x6d200078` (canonical 14-parameter
      signature; verified in `test/SelectorRegression.t.sol` and against
      deployed bytecode probes in earlier phases). Cross-check the deployed
      bytecode contains this selector.
- [ ] **D6.** Read-only checks from `docs/OPERATOR_CHECKLIST.md` §D:
      USDC `DOMAIN_SEPARATOR()` still
      `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`;
      V1 contract `0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2` untouched.
- [ ] **D7.** `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` **remains unset**
      until every check above passes. Only then may the operator configure it
      (its own deliberate act, outside this package's scope).
- [ ] **D8.** Verify the Arc native USDC transfer model on the real node via
      the recorded smoke-test receipt in §8 — until then, native USDC
      movement compatibility remains **UNVERIFIED ON A REAL NODE** (the
      anvil `0x1800…0000` system-contract emulation limitation documented in
      `docs/SMOKE_TEST_PLAN.md`).

---

## 8. Separate approval gate — real-node native USDC movement smoke test

The smoke test (`docs/SMOKE_TEST_PLAN.md`) executes a **real mainnet
transaction** (`executeSplitWithDualAuth` on a minimal flow with
operator-controlled amounts) and therefore:

- consumes real gas from the operator wallet, and
- moves real USDC between operator-controlled addresses.

**It is a separate, explicit approval gate — deployment approval does NOT
cover it.** Requirements:

1. Deployment verification §7 fully passed (D1–D7) and V2 address configured.
2. A distinct, written, human approval for the smoke-test transaction,
   including the exact flow parameters, amount caps, and the approving
   person's identity.
3. The transaction is executed per `docs/SMOKE_TEST_PLAN.md` with the
   documented pre-checks (code-free signer EOA, balance thresholds, nonce
   capture) and post-checks (receipt, balances, decimal mapping, replay
   rejection).
4. Expected outcome includes proving the Arc native USDC
   system-transfer path (`balanceOf == native/1e12` mapping through the
   `0x1800…0000` system contract) — the only remaining item that no fork or
   local emulation could verify.

**No smoke-test command is included here**; execution is out of scope for
this package and for Phase 14.

---

## 9. Rollback / stop procedure (immutable contract — read carefully)

The deployed ArcFlowV2 contract is **immutable**: there is no upgrade path,
no proxy, no migration function, and no way to "roll back" deployed code.
Statements like "revert the deployment" are impossible on-chain. The
realistic containment options, in escalating order:

1. **Do not configure the frontend.** With
   `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` unset, no UI path can reach the
   contract. The contract is inert unless someone calls it directly. This is
   the primary stop control and is fully reversible.
2. **Do not create or activate flows.** `createFlow` is permissionless, but
   nothing can move funds until an active flow exists *and* signed dual
   authorizations are presented. With no flows, the contract cannot move
   user funds.
3. **Pause flows.** `pauseFlow(flowId)` (flow owner) deactivates any created
   flow; `toggleAutoExecute(flowId, false)` disables sign-to-auto-execute.
4. **Ownership containment.** `transferOwnership(...)` moves owner powers to
   a cold/multisig-controlled address, or `renounceOwnership()` permanently
   disables the owner-only `rescueERC20` escape hatch (irreversible — decide
   deliberately; prefer transferring to a controlled key over renouncing).
5. **Stuck-token recovery.** The contract only holds USDC transiently
   (pull → split within one transaction, §10 of the contract's design), but
   if tokens are ever sent directly to the contract address, `rescueERC20`
   (onlyOwner) recovers them. This is the only owner recovery function.
6. **Communicate and record.** If a defect is found post-deployment: freeze
   all activity (items 1–3), record the contract address as **DEPRECATED**
   in operations documentation, deploy a corrected contract only through the
   full gate process again (new release candidate, new approval), and leave
   the defective contract unconfigured and unused forever.

---

## 10. Validation results for this phase (all non-transactional)

| Command | Exit code | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | 0 errors, 87 warnings (pre-existing `no-unused-vars`, unchanged from RC1/RC2) |
| `npm test` | 0 | 449/449 pass (31 files) |
| `npm run build` | 0 | compiled successfully |
| `foundry_bin\forge.exe build` | 0 | pass — **note: does not compile `script_disabled/` (see §3.1)** |
| `foundry_bin\forge.exe test` | 0 | 103 pass / 0 fail (8 suites) |
| `node scripts/preflight.mjs` | 0 | 17 pass / 0 fail / 3 expected warnings (V1 env not in shell context; `POLYCLAW_PRIVATE_KEY` *name* detected with value withheld; no public ARC env vars in shell) |
| Sandbox compile of `script_disabled/` (temp config, out/cache outside repo) | 1 | **FAILS — §3.1** (the only compile error in the project; all other sources compile clean) |

All exit codes captured via `cmd /v:on /c` to bypass the known PowerShell
stderr artifact. No command produced a transaction, signature, or broadcast.

---

## 11. Final go/no-go table

| # | Evidence item | Result | Unresolved risk |
|---|---|---|---|
| 1 | Release identity (§1) | ✅ PASS | none |
| 2 | Chain guard design & placement (§3.1–3.3 items 3.1–3.3) | ✅ PASS by inspection | none |
| 3 | USDC constructor argument & owner behavior (§3.4–3.6) | ✅ PASS | env value is operator-supplied at run time |
| 4 | Deployment script compiles (§3.10) | ❌ **FAIL** | RC2 cannot deploy; the guarded file aborts at compile time (fail-safe but blocking) |
| 5 | Chain-guard test scope (§3.2) | ⚠️ HONEST LIMITATION | tests cover a mirrored harness, not the script file |
| 6 | Environment readiness (§2) | ⚠️ BLOCKED here / ready locally | values must be exported in the operator's deployment shell; forge does not auto-load `.env.local` |
| 7 | Dry-run simulation (G4) | ⏸ NOT RUN | requires G2 fix; forbidden in Phase 14 |
| 8 | Human deployment approval (G5) | ⏸ NOT REQUESTED | — |
| 9 | Native Arc USDC movement on real node (§8) | ⏸ UNVERIFIED | only verifiable via the post-deployment smoke test |
| 10 | Rollback posture (§9) | ✅ documented | contract immutable; containment relies on non-configuration and flow-level pause |

### Overall verdict: **`BLOCKED — RELEASE/VALIDATION MISMATCH`**

The frozen RC2 tag matches its expected commit and source hash, and the full
standard validation suite passes — but the deployment script inside RC2 does
not compile (§3.1), a defect invisible to the standard suite because
`script_disabled/` is outside the compiled directories. The release as tagged
is therefore not deployable, and the package cannot honestly reach
`READY FOR EXPLICIT DEPLOYMENT APPROVAL`.

**Required path forward (future phase, requires its own review):**
apply the 2-line script fix (restore `run()`'s brace; use
`EXPECTED_CHAIN_ID` at line 63), add a compile gate that includes the
deployment script, re-run the complete validation suite, and cut
`arcflow-v2-rc3`. Only an RC3 (or later) whose script compiles and whose
dry-run simulation passes may be presented for explicit deployment approval.

*A readiness verdict is not authorization. Nothing in this package deploys,
broadcasts, signs, or configures anything.*
