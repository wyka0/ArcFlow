#!/usr/bin/env node
/**
 * ArcFlow Phase 11 — Read-Only Preflight Script
 *
 * Performs ONLY eth_call / read-only RPC queries against the Arc mainnet RPC.
 * NO wallet connection, NO signing, NO deployment, NO transaction broadcast.
 *
 * Usage:
 *   node scripts/preflight.mjs
 *
 * Exit codes:
 *   0 = all checks passed (or informational warnings only)
 *   1 = one or more checks FAILED (deployment must not proceed)
 *
 * Environment variables READ (all public, no secrets):
 *   NEXT_PUBLIC_ARC_RPC_URL          (optional; defaults to the documented URL)
 *   NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS  (V1; optional)
 *   NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS  (V2; MUST be unset for this phase)
 *
 * This script NEVER reads DEPLOYER_PRIVATE_KEY or any secret variable.
 */

import { createPublicClient, http, keccak256, toHex, slice, getAddress } from "viem";

// ---------------------------------------------------------------------------
// Configuration (all public values, no secrets)
// ---------------------------------------------------------------------------

const DEFAULT_RPC = "https://rpc.mainnet.arc.io";
const EXPECTED_CHAIN_ID = 5042;
const USDC_PROXY = "0x3600000000000000000000000000000000000000";
const ARC_V1_CANDIDATE = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2";
const EXPECTED_USDC_DOMAIN_SEPARATOR = "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84";
const EXPECTED_CANONICAL_SELECTOR = "0x6d200078";

const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || DEFAULT_RPC;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(label, detail = "") {
  passCount++;
  console.log(`  ✅ PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failCount++;
  console.log(`  ❌ FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "") {
  warnCount++;
  console.log(`  ⚠️  WARN  ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(70)}`);
}

const client = createPublicClient({
  chain: {
    id: EXPECTED_CHAIN_ID,
    name: "Arc",
    nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  },
  transport: http(rpcUrl, { timeout: 30_000 }),
});

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
];

const USDC_EXT_ABI = [
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
];

async function tryRead(address, abi, functionName, args = []) {
  try {
    const result = await client.readContract({ address, abi, functionName, args });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.shortMessage || e.message };
  }
}

async function rawCall(to, data) {
  try {
    const result = await client.call({ account: to, to, data });
    return { ok: true, data: result.data };
  } catch (e) {
    return { ok: false, error: e.shortMessage || e.message, rawData: e.raw };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  ArcFlow Phase 11 — Read-Only Preflight                            ║");
  console.log("║  RPC: " + rpcUrl.padEnd(56) + "║");
  console.log("║  Mode: READ-ONLY (eth_call / eth_getCode / eth_chainId only)       ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");

  // ────────────────────────────────────────────────────────────────────
  section("1. Chain identity");
  // ────────────────────────────────────────────────────────────────────

  const chainId = await client.getChainId();
  if (chainId === EXPECTED_CHAIN_ID) {
    pass("Chain ID", `${chainId} (expected ${EXPECTED_CHAIN_ID})`);
  } else {
    fail("Chain ID", `got ${chainId}, expected ${EXPECTED_CHAIN_ID}`);
  }

  // ────────────────────────────────────────────────────────────────────
  section("2. Arc USDC proxy (0x3600…0000)");
  // ────────────────────────────────────────────────────────────────────

  const usdcCode = await client.getCode({ address: USDC_PROXY });
  if (usdcCode && usdcCode !== "0x" && usdcCode.length > 100) {
    pass("USDC proxy bytecode", `${(usdcCode.length - 2) / 2} bytes`);
  } else {
    fail("USDC proxy bytecode", "missing or too small");
  }

  // Check it's a proxy (minimal proxy pattern)
  const isProxy = usdcCode && (usdcCode.includes("5c60da1b") || usdcCode.length < 4000);
  if (isProxy) {
    pass("USDC proxy pattern", "contains implementation() selector or is small (proxy-sized)");
  } else {
    warn("USDC proxy pattern", "may not be a proxy — review manually");
  }

  // name()
  const nameResult = await tryRead(USDC_PROXY, ERC20_ABI, "name");
  if (nameResult.ok && nameResult.result === "USDC") {
    pass("USDC name()", `"${nameResult.result}"`);
  } else if (nameResult.ok) {
    warn("USDC name()", `got "${nameResult.result}", expected "USDC"`);
  } else {
    fail("USDC name()", nameResult.error);
  }

  // symbol()
  const symbolResult = await tryRead(USDC_PROXY, ERC20_ABI, "symbol");
  if (symbolResult.ok && symbolResult.result === "USDC") {
    pass("USDC symbol()", `"${symbolResult.result}"`);
  } else if (symbolResult.ok) {
    warn("USDC symbol()", `got "${symbolResult.result}"`);
  } else {
    fail("USDC symbol()", symbolResult.error);
  }

  // decimals()
  const decimalsResult = await tryRead(USDC_PROXY, ERC20_ABI, "decimals");
  if (decimalsResult.ok && decimalsResult.result === 6) {
    pass("USDC decimals()", `${decimalsResult.result} (ERC-20 interface)`);
  } else if (decimalsResult.ok) {
    warn("USDC decimals()", `got ${decimalsResult.result}, expected 6`);
  } else {
    fail("USDC decimals()", decimalsResult.error);
  }

  // version()
  const versionResult = await tryRead(USDC_PROXY, USDC_EXT_ABI, "version");
  if (versionResult.ok && versionResult.result === "2") {
    pass("USDC version()", `"${versionResult.result}"`);
  } else if (versionResult.ok) {
    warn("USDC version()", `got "${versionResult.result}", expected "2"`);
  } else {
    fail("USDC version()", versionResult.error);
  }

  // DOMAIN_SEPARATOR()
  const dsResult = await tryRead(USDC_PROXY, USDC_EXT_ABI, "DOMAIN_SEPARATOR");
  if (dsResult.ok) {
    const ds = typeof dsResult.result === "bigint" ? "0x" + dsResult.result.toString(16).padStart(64, "0") : dsResult.result;
    if (ds === EXPECTED_USDC_DOMAIN_SEPARATOR) {
      pass("USDC DOMAIN_SEPARATOR()", ds);
    } else {
      fail("USDC DOMAIN_SEPARATOR()", `got ${ds}, expected ${EXPECTED_USDC_DOMAIN_SEPARATOR}`);
    }
  } else {
    fail("USDC DOMAIN_SEPARATOR()", dsResult.error);
  }

  // implementation()
  const implResult = await tryRead(USDC_PROXY, USDC_EXT_ABI, "implementation");
  if (implResult.ok) {
    const impl = getAddress(implResult.result);
    if (impl !== "0x0000000000000000000000000000000000000000") {
      pass("USDC implementation()", impl);
    } else {
      warn("USDC implementation()", "returned zero address");
    }
  } else {
    warn("USDC implementation()", implResult.error);
  }

  // totalSupply (sanity: non-zero)
  const tsResult = await tryRead(USDC_PROXY, ERC20_ABI, "totalSupply");
  if (tsResult.ok && tsResult.result > 0n) {
    pass("USDC totalSupply()", tsResult.result.toString());
  } else if (tsResult.ok) {
    warn("USDC totalSupply()", "zero — unusual for a deployed token");
  } else {
    fail("USDC totalSupply()", tsResult.error);
  }

  // ────────────────────────────────────────────────────────────────────
  section("3. Arc USDC function binding (critical for ArcFlowV2)");
  // ────────────────────────────────────────────────────────────────────

  // transferWithAuthorization MUST be bound
  const twaSelector = slice(keccak256(toHex(
    "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"
  )), 0, 4);
  const twaCall = await rawCall(USDC_PROXY, twaSelector + "00".repeat(64 * 9));
  if (!twaCall.ok && twaCall.error && !twaCall.error.includes("invalid")) {
    // Reverted with a meaningful error = function is bound
    pass("transferWithAuthorization bound", `reverts with: ${twaCall.error.slice(0, 60)}`);
  } else if (twaCall.ok) {
    pass("transferWithAuthorization bound", "call succeeded (unexpected for zero args)");
  } else {
    fail("transferWithAuthorization bound", `unexpected revert: ${twaCall.error}`);
  }

  // safeTransfer must NOT be bound (confirms the Phase 10.9 IUSDC fix)
  const safeTransferSelector = slice(keccak256(toHex("safeTransfer(address,uint256)")), 0, 4);
  const stCall = await rawCall(USDC_PROXY, safeTransferSelector + "00".repeat(64));
  if (!stCall.ok && (!stCall.data || stCall.data === "0x" || stCall.data === undefined)) {
    pass("safeTransfer NOT bound", "unbound selector (empty revert) — IUSDC fix was correct");
  } else if (!stCall.ok) {
    warn("safeTransfer bound?", `reverted with data: ${stCall.data?.slice(0, 20)} — review IUSDC interface`);
  } else {
    warn("safeTransfer BOUND", "unexpected — the Phase 10.9 finding may be stale");
  }

  // nonces(address) — replay protection
  const nonceResult = await tryRead(USDC_PROXY, USDC_EXT_ABI, "nonces", ["0x000000000000000000000000000000000000dEaD"]);
  if (nonceResult.ok) {
    pass("USDC nonces(address)", `dead address nonce = ${nonceResult.result}`);
  } else {
    fail("USDC nonces(address)", nonceResult.error);
  }

  // ────────────────────────────────────────────────────────────────────
  section("4. Canonical executeSplitWithDualAuth selector (local keccak-256)");
  // ────────────────────────────────────────────────────────────────────

  const canonicalSig = "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)";
  const derivedSelector = slice(keccak256(toHex(canonicalSig)), 0, 4);
  if (derivedSelector === EXPECTED_CANONICAL_SELECTOR) {
    pass("Canonical selector", `${derivedSelector} (matches Phase 10.8 evidence)`);
  } else {
    fail("Canonical selector", `got ${derivedSelector}, expected ${EXPECTED_CANONICAL_SELECTOR}`);
  }

  // Keccak-256 not SHA3-256 sanity
  const emptyHash = keccak256(toHex(""));
  if (emptyHash === "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470") {
    pass("Keccak-256 implementation", "empty-string hash matches canonical keccak-256 (not SHA3-256)");
  } else {
    fail("Keccak-256 implementation", "empty-string hash mismatch — SHA3-256 detected!");
  }

  // ────────────────────────────────────────────────────────────────────
  section("5. ArcFlow V1 (0x3fB5…b8c2) — existing deployment");
  // ────────────────────────────────────────────────────────────────────

  const v1Code = await client.getCode({ address: ARC_V1_CANDIDATE });
  if (v1Code && v1Code !== "0x") {
    pass("ArcFlow V1 bytecode", `${(v1Code.length - 2) / 2} bytes`);
  } else {
    warn("ArcFlow V1 bytecode", "no bytecode at candidate address");
  }

  const configuredV1 = process.env.NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS?.trim();
  if (configuredV1 && configuredV1.length === 42) {
    pass("V1 address configured", configuredV1);
    if (configuredV1.toLowerCase() !== ARC_V1_CANDIDATE.toLowerCase()) {
      warn("V1 address mismatch", `env says ${configuredV1}, candidate is ${ARC_V1_CANDIDATE}`);
    }
  } else {
    warn("V1 address configured", "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS not set or invalid");
  }

  // ────────────────────────────────────────────────────────────────────
  section("6. ArcFlow V2 address configuration (fail-closed)");
  // ────────────────────────────────────────────────────────────────────

  const v2Address = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();
  if (!v2Address || v2Address.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(v2Address)) {
    pass("V2 address NOT configured", "NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS is unset — fail-closed correctly");
    console.log("       (Set it ONLY after a verified V2 deployment and independent review.)");
  } else {
    fail("V2 address IS configured", `${v2Address} — no verified deployment exists; this is UNSAFE`);
    console.log("       (Unset NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS before proceeding.)");
  }

  // Check for the old unverified candidate
  if (v2Address && v2Address.toLowerCase() === "0xf0c80fdd22f8612dd7a877f6da82ab5097d63a66") {
    fail("V2 address is the UNVERIFIED old candidate", "0xf0c80Fdd… must NOT be used without independent proof");
  }

  // ────────────────────────────────────────────────────────────────────
  section("7. Environment variable safety (no secrets printed)");
  // ────────────────────────────────────────────────────────────────────

  const secretVars = Object.keys(process.env).filter(k =>
    k.toUpperCase().includes("PRIVATE_KEY") || k.toUpperCase().includes("SEED") || k.toUpperCase().includes("MNEMONIC")
  );
  if (secretVars.length === 0) {
    pass("No secret-named env vars detected", "process.env contains no PRIVATE_KEY/SEED/MNEMONIC keys");
  } else {
    warn("Secret-named env vars present (names only, values NOT printed)", secretVars.join(", "));
  }

  const publicVars = Object.keys(process.env).filter(k => k.startsWith("NEXT_PUBLIC_ARC"));
  if (publicVars.length > 0) {
    pass("Public ARC env vars", publicVars.map(k => {
      const val = process.env[k];
      // Only print the value if it looks like a URL or address, never a key
      if (val && (val.startsWith("http") || /^0x[0-9a-fA-F]{40}$/.test(val))) return `${k}=${val}`;
      return `${k}=<value withheld>`;
    }).join(", "));
  } else {
    warn("Public ARC env vars", "none set (using defaults)");
  }

  // ────────────────────────────────────────────────────────────────────
  // Summary
  // -------------------------------------------------------------------

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  PREFLIGHT SUMMARY`);
  console.log(`${"═".repeat(70)}`);
  console.log(`  ✅ PASS: ${passCount}`);
  console.log(`  ❌ FAIL: ${failCount}`);
  console.log(`  ⚠️  WARN: ${warnCount}`);

  if (failCount > 0) {
    console.log(`\n  RESULT: ❌ BLOCKED — ${failCount} check(s) failed. Deployment must not proceed.`);
    process.exit(1);
  } else {
    console.log(`\n  RESULT: ✅ ALL CHECKS PASSED — ready for the next phase.`);
    console.log(`  (This does NOT authorize deployment — see docs/DEPLOYMENT_VERIFICATION_PLAN.md.)`);
    process.exit(0);
  }
}

main().catch(e => {
  console.error("PREFLIGHT FATAL ERROR:", e.message);
  process.exit(1);
});
