# ArcFlow

**Non-custodial, dual-authorized USDC payment workflows on Arc mainnet.**

ArcFlow lets an AI agent (or any requester) trigger a USDC payment that is split
between a treasury and a contributor **only** when two independent cryptographic
authorizations are presented: an ArcFlow workflow signature (what to pay, how
much, when) and a USDC EIP-3009 `transferWithAuthorization` signature (the token
movement itself). Both signatures are verified on-chain in a single atomic
transaction that pulls and distributes funds — the contract never holds a
balance outside the split it executes.

> **Status: release candidate RC3 is frozen and has NOT been deployed as that
> release.** Deployment requires operator funding, an explicit written
> authorization, and post-deployment verification — see
> [`docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md`](docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md).
> This software is **not production-ready** and must not be used for real
> payments until those gates pass.

---

## What it does

- **Flows.** Anyone can create a flow: a treasury address, a contributor
  address, a minimum amount, and a treasury/contributor split in basis points.
- **Dual-authorized execution.** `executeSplitWithDualAuth(...)` verifies
  two EIP-712 signatures — an ArcFlow workflow authorization (flow id, amount,
  validity window, nonce) and a USDC EIP-3009 authorization (from → contract,
  amount, window, nonce) — then **atomically** pulls USDC from the flow owner
  and distributes the split. The contract holds funds only for the instant it
  takes to execute; there is no dust and no custody.
- **Strict validity windows and replay protection.** Authorization windows
  mirror real USDC's strict inequalities (`block.timestamp > validAfter`), and
  every USDC nonce is single-use on-chain; replaying a used authorization
  reverts.

**Intended users:** protocol/ops engineers evaluating or integrating ArcFlow,
and auditors reviewing the contract. This is a developer release candidate —
there is no hosted product UI in this repository beyond the example Next.js
application that exercises the V1 payment-request workflow the contracts
integrate with.

## The dual-authorization design

`executeSplitWithDualAuth` (selector `0x6d200078`) requires, in order:

1. An **ArcFlow EIP-712** authorization over
   `ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)`
   in the domain `("ArcFlow", "1", 5042, <ArcFlowV2 address>)`, signed by the
   flow owner.
2. A **USDC EIP-3009** `TransferWithAuthorization` signature over the verified
   Arc USDC domain (`DOMAIN_SEPARATOR() =
   0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`,
   reconstructed from name `"USDC"`, version `"2"`, chainId `5042`,
   verifyingContract `0x3600…0000`), signed by the flow owner.

Only then does it call `usdc.transferWithAuthorization` (pull owner → contract)
and immediately split treasury/contributor via SafeERC20-wrapped transfers.
Both signature checks and the transfer happen inside one non-reentrant call:
**atomic execution, no intermediate custody.**

On Arc, USDC **is** the native gas token (`balanceOf(x) == eth_getBalance(x)/1e12`),
so the same balance pays for gas and transfers.

## Repository layout

```
contracts/            ArcFlowV2.sol (RC3) and the V1 ArcFlow.sol
lib/                  Vendored dependencies at pinned versions:
                        openzeppelin-contracts/ (5.x), forge-std/
lib/arcflow/          TypeScript authorization library (EIP-712 builders,
                      digest verification, V2 gating)
app/, components/,    Next.js (App Router) application that exercises the
types/                V1 payment-request workflow the contracts integrate with
test/                 Foundry tests (contract, fork, selector, guard suites)
tests/                Vitest suite for the application and authorization layer
script_disabled/      Operational scripts kept out of the default build:
                      DeployArcFlowV2.s.sol (fail-closed chain guard),
                      the hardened (fail-closed) SmokeTestV2.s.sol, and the
                      V1 deployment script
scripts/              preflight.mjs (17 read-only checks) and
                      compile-deploy-script.mjs (mandatory compile gate)
docs/                 Operator checklist, verification plan, smoke-test plan,
                      and the phase-by-phase governance trail
examples/             AgentPay SDK usage example
```

## Prerequisites

- **Node.js ≥ 20** and npm
- **Foundry** (`forge`, `cast`) — install per the official guide:
  https://book.getfoundry.sh/getting-started/installation (Windows: prebuilt
  release binaries or WSL). This repository does **not** ship Foundry binaries;
  if you keep a local `foundry_bin/` directory, `scripts/compile-deploy-script.mjs`
  will prefer it via `foundry_bin/` or the `FOUNDRY_BIN` environment variable,
  otherwise it uses `forge` from your `PATH`.
- An Arc mainnet RPC endpoint (default `https://rpc.mainnet.arc.io`)

## Setup

```sh
npm ci                 # installs exact dependency versions (package-lock.json)
cp .env.example .env.local   # then fill in your own values; never commit them
```

`forge-std` and OpenZeppelin are vendored under `lib/` at pinned versions — no
submodule initialization is required.

## Build, test, verify

```sh
forge build                            # compile contracts + test suite
forge test                             # 112 tests (contract, fork, selector, guard suites)
npm test                               # Vitest: application + authorization layer (449 tests)
npm run compile:deploy-script          # MANDATORY gate: compiles the real deployment
                                       #   script in an isolated workspace (solc 0.8.24,
                                       #   optimizer 200 runs, via_ir) — set FOUNDRY_BIN
                                       #   to your forge executable if it is not on PATH
node scripts/preflight.mjs             # 17 read-only checks against the live Arc RPC
```

The chain-guard regression tests, the selector regression suite
(`0x6d200078`), and the smoke-target validation suite run entirely offline.
Fork tests skip gracefully when no fork environment is available.

## Documentation

- [`docs/OPERATOR_CHECKLIST.md`](docs/OPERATOR_CHECKLIST.md) — the operator's
  end-to-end deployment procedure (environment, compile gate, dry run,
  broadcast, post-deployment verification D1–D8, frontend configuration)
- [`docs/DEPLOYMENT_VERIFICATION_PLAN.md`](docs/DEPLOYMENT_VERIFICATION_PLAN.md) —
  the technical verification plan behind the checklist
- [`docs/SMOKE_TEST_PLAN.md`](docs/SMOKE_TEST_PLAN.md) — the minimal
  real-mainnet smoke test and its separate approval gate
- [`docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md`](docs/PHASE18_FINAL_DEPLOYMENT_DECISION.md) —
  the consolidated go/no-go decision package
- [`docs/PHASE14_DEPLOYMENT_APPROVAL_PACKAGE.md`](docs/PHASE14_DEPLOYMENT_APPROVAL_PACKAGE.md) —
  the historical evidence trail (including the repaired RC2 compile finding)

## Current status

| Area | State |
|---|---|
| Contract source | **Frozen** at RC3 (tag `arcflow-v2-rc3`); immutable once deployed |
| Tests | 112 Foundry + 449 Vitest, all passing |
| Deployment script | Repaired and compile-gated; fail-closed on wrong chain |
| Deployment | **Not performed as RC3** — pending operator funding, dry-run review, and explicit written authorization |
| Native USDC movement (`transferWithAuthorization` via Arc's system transfer) | **Awaiting real-mainnet verification** — cannot be proven by fork/local emulation; covered by the separately-approved smoke test |

### Deprecated predecessor — do not configure or use

A pre-release ArcFlowV2 was broadcast on 2026-10-06 from uncommitted
working-tree code and is live at
`0xf0c80Fdd22F8612DD7A877f6dA82Ab5097D63A66`. It is **deprecated**: its
bytecode does not match RC3, it has no flows, and it must **never** be
configured as `NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS` or used as a smoke
target (the smoke script rejects it fail-closed). Any future deployment lands
at a **new** address that must be taken from the actual deployment receipt and
independently verified (checklist §D) before any configuration or testing —
simulation-predicted addresses are not deployments.

## Security notes

- The contract is **immutable**: there is no upgrade path, proxy, or rollback.
  Containment options are documented in the checklist and decision package.
- Private keys are never committed. Supply them only via masked interactive
  entry, a keystore, or a hardware wallet — never on a recorded command line.
- No claim is made that this software is production-ready. Evaluate the
  contract, read the governance trail, and complete the verification gates
  before trusting it with real funds.

## License

Released under the [MIT License](LICENSE) — Copyright (c) 2026 wyka0.

Third-party code retains its own licenses: vendored OpenZeppelin Contracts
(`lib/openzeppelin-contracts`, MIT) and forge-std (`lib/forge-std`,
MIT OR Apache-2.0) keep their upstream license files, and the npm dependencies
carry their own standard open-source licenses. The project license does not
override any third-party license.
