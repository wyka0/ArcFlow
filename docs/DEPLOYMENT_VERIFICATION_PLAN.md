# ArcFlow V2 — Operational Verification Plan (Phase 10.9)

**Status:** Pre-deployment checklist. NO step in this document may be executed
without explicit, written approval. Deployment remains BLOCKED until every
checklist item passes and the Arc-native system-transfer behavior is verified
on a real Arc node (not an anvil fork).

---

## 1. Pre-deployment source and toolchain checks

- [ ] Confirm `contracts/ArcFlowV2.sol` HEAD hash matches the reviewed source:
      `git hash-object contracts/ArcFlowV2.sol` — record the hash.
- [ ] Confirm `lib/openzeppelin-contracts` submodule is at the audited commit
      (`git submodule status` — pin the commit in the review record).
- [ ] Confirm `foundry.toml` settings:
      `solc_version = "0.8.24"`, `optimizer = true`, `optimizer_runs = 200`,
      `via_ir = true`.
- [ ] Confirm `forge build` compiles cleanly (zero errors, only known warnings).
- [ ] Confirm `forge test` runs **97 tests, 0 failures** across 7 suites
      (34 V1 + 45 V2 + 5 selector + 3 diag + 1 bruteforce + 1 diag + 8 fork).

## 2. Deployment command (requires explicit approval)

The deployment script now includes a **fail-closed chain-ID guard**: it reverts
with `WrongChainId(5042, actual)` if the RPC chain ID is not 5042. This check
executes before any environment-variable read, broadcast, or contract creation.
The old warning-only behavior has been replaced.

```sh
# Required environment (set once, NOT committed):
#   ARC_RPC_URL=https://rpc.mainnet.arc.io
#   DEPLOYER_PRIVATE_KEY=<deployer EOA key — never committed>
#   ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Dry run (no broadcast):
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol \
  --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY

# Actual deployment (BROADCAST — requires approval):
foundry_bin/forge.exe script script_disabled/DeployArcFlowV2.s.sol \
  --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

**Constructor parameter:** `ArcFlowV2(0x3600000000000000000000000000000000000000)`
(the verified Arc USDC proxy).

**Chain guard**: The script reverts with `WrongChainId(5042, actual)` if the
RPC is not connected to Arc mainnet. `test/ChainGuard.t.sol` (6 tests)
verifies the guard *logic* through a mirrored harness; the *actual* script
file is validated by the mandatory compile gate:

```sh
node scripts/compile-deploy-script.mjs   # or: npm run compile:deploy-script
```

`forge build` / `forge test` do NOT compile `script_disabled/` (scan dirs are
`src`/`test`/`script`), so this gate is the only automated proof that the real
deployment script compiles. It runs offline (temp config, temp out/cache,
no RPC, no script execution) and requires exit 0 before any deployment
approval. Introduced in Phase 15 after the RC2 script was found to fail
compilation (see `docs/PHASE14_DEPLOYMENT_APPROVAL_PACKAGE.md` §3.1).

## 3. Post-deployment verification

> **Address provenance (Phase 19.8):** the deployed address used for every
> check in this section MUST come from the **actual deployment receipt**
> (`eth_getTransactionReceipt` of the deployment transaction). Simulation
> output (e.g., the Phase 19.2 dry run's predicted CREATE address) is NOT a
> deployment address and MUST NOT be configured or tested against.

### 3a. Bytecode integrity
- [ ] Record deployed runtime bytecode:
      `cast code <DEPLOYED_ADDRESS> --rpc-url $ARC_RPC_URL`
- [ ] Compare with locally compiled artifact:
      `foundry_bin/forge.exe inspect ArcFlowV2 deployedBytecode` (or extract
      `deployedBytecode` from `out/ArcFlowV2.sol/ArcFlowV2.json`).
- [ ] Bytecode must match byte-for-byte (or differ only in immutables section
      if the constructor patches them).

### 3b. Selector dispatch
- [ ] `cast call <DEPLOYED_ADDRESS> "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)"`
      with dummy args → must revert `FlowNotFound(uint256)` (proves dispatch).
- [ ] `cast sig "executeSplitWithDualAuth(...)"` must equal `0x6d200078`.

### 3c. Constructor state
- [ ] `cast call <DEPLOYED_ADDRESS> "usdc()"` → `0x3600000000000000000000000000000000000000`
- [ ] `cast call <DEPLOYED_ADDRESS> "owner()"` → deployer address
- [ ] `cast call <DEPLOYED_ADDRESS> "getFlowCount()"` → `0`
- [ ] `cast call <DEPLOYED_ADDRESS> "BASIS_POINTS_DENOMINATOR()"` → `10000`

### 3d. Immutables and domain
- [ ] Verify chain ID is 5042: `cast chain-id --rpc-url $ARC_RPC_URL`
- [ ] Verify the USDC proxy `DOMAIN_SEPARATOR()` returns
      `0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84`
      (the value baked into ArcFlowV2's `_verifyUSDCAuthorization`).
      If it has changed, the USDC_DOMAIN_SEPARATOR constant in ArcFlowV2 must
      be updated and the contract redeployed.

## 4. Read-only function verification (no state change)

- [ ] `cast call <DEPLOYED_ADDRESS> "getFlow(uint256)" 0` → reverts `FlowNotFound` (no flows exist)
- [ ] `cast call <DEPLOYED_ADDRESS> "getFlowsByOwner(address)" <any-addr>` → `[]`
- [ ] Verify `TransferWithAuthorization` still bound on the USDC proxy:
      `cast call 0x3600...0000 "DOMAIN_SEPARATOR()"` (as above)
- [ ] Verify `safeTransfer` is NOT callable on the USDC proxy (must revert empty),
      confirming the Phase 10.9 IUSDC fix was necessary and correct.

## 5. Smoke test (minimal risk, NOT a test transfer)

Arc's USDC is the **native gas token**: `balanceOf(x) == eth_getBalance(x) / 1e12`,
and all token movements execute through the native system contract
(`0x1800…0000`) using 18-decimal protocol amounts. Anvil forks CANNOT execute
the system opcodes — smoke testing **requires a real Arc node**.

### 5a. Authorization-layer smoke (safe, no fund movement)
- [ ] Have the deployer (or a designated test EOA) create a flow with
      `threshold = 1` (1 base unit), `treasuryBps = 10000`, `contributorBps = 0`.
- [ ] Activate the flow.
- [ ] Construct `executeSplitWithDualAuth` with dual signatures and
      `usdcValidAfter = 0`, `usdcValidBefore = now + 5 minutes`.
- [ ] **Do NOT broadcast.** Instead, `eth_call` the transaction (read-only):
      the call must NOT revert with an authorization error. It will revert
      with a balance/transfer error if the signer has insufficient USDC —
      that confirms the authorization layer accepted the signatures.
- [ ] If `eth_call` reverts with `InvalidAuthorization` or
      `AuthorizationNotYetValid`/`AuthorizationExpired`, the deployment is
      MISCONFIGURED — do not proceed.

### 5b. Native-transfer smoke (requires real Arc node, minimal risk)
- [ ] Ensure the flow owner has at least the threshold amount in USDC
      (check `cast call 0x3600...0000 "balanceOf(address)" <owner>`).
- [ ] Broadcast a single `executeSplitWithDualAuth` with amount = 1 base unit
      (1 micro-USDC ≈ $0.000001) and `usdcValidAfter = 0`.
- [ ] Verify the `FlowExecuted` event on-chain.
- [ ] Verify treasury received the expected split.
- [ ] Verify `getFlowCount()` still returns the expected count.
- [ ] Verify the ArcFlowV2 contract's USDC balance remains 0 (no dust).

### 5c. Maximum-risk boundary (only after 5a and 5b pass)
- [ ] Test with `usdcValidAfter = block.timestamp` (should revert
      `AuthorizationNotYetValid` from ArcFlowV2, confirming the strict check).
- [ ] Test replay: resubmit the same transaction — must revert (USDC nonce
      single-use).

## 6. Rollback / disable procedure

If any verification step fails after deployment:
1. **Flows are safe**: no funds are held by ArcFlowV2 (all distributed in the
   same transaction; the contract balance is always 0 after execution).
2. **Pause all flows**: each flow owner calls `pauseFlow(flowId)` — this
   prevents further execution. There is no global pause; per-flow pausing is
   the only mechanism.
3. **Frontend disable**: set `NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS` to `"0x"`
   (or remove it) — the frontend will refuse to interact.
4. **Do NOT use `rescueERC20`** for USDC — it is explicitly blocked
   (`if (address(token) == address(usdc)) revert`). This prevents the owner
   from draining in-flight authorizations.
5. **Deployment is immutable** (no proxy, no upgrade mechanism). If the
   contract is fundamentally broken, deploy a corrected version at a new
   address and migrate flows (create new + activate new).

## 7. Known limitations to carry into deployment review

1. **Native system-transfer**: token movements execute through
   `0x1800…0000` (Arc protocol-level). Verified by opcode trace but NOT
   executable in any local test environment. The authorization layer (both
   EIP-712 signatures, domain, typehash, field order, validity windows) IS
   verified against the real deployed USDC contract via read-only fork.
2. **`usdcValidAfter` strictness**: real USDC requires
   `block.timestamp > usdcValidAfter` (strict `>`). The frontend MUST send
   `usdcValidAfter = 0` (or a value strictly below execution time).
   ArcFlowV2's `_verifyUSDCAuthorization` now mirrors this exactly.
3. **`safeTransfer`/`safeTransferFrom` absence**: the real Arc USDC does not
   implement these (Phase 10.9 probe: unbound selectors). The IUSDC interface
   was fixed to inherit IERC20 so SafeERC20 wraps `transfer`/`transferFrom`.
4. **ArcFlow signature replay**: the flow nonce is signed but not tracked
   on-chain. Replay safety is enforced by the USDC nonce (single-use per
   authorizer): one USDC signature enables at most one transfer. A captured
   ArcFlow signature alone cannot move funds.
5. **No upgrade mechanism**: the contract is immutable (no proxy). Bugs
   require redeployment at a new address.
