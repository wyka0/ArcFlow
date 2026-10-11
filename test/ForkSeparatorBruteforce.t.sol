// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/**
 * @title ForkSeparatorBruteforce
 * @notice Empirically discovers which EIP-712 digest construction the REAL Arc
 *         USDC proxy accepts, by trying every plausible separator candidate
 *         (computed shapes + every 32-byte value stored in proxy storage).
 *         Signatures from an UNFUNDED signer: acceptance = balance-class
 *         revert; rejection = "FiatTokenV2: invalid signature".
 */
contract ForkSeparatorBruteforce is Test {
    address internal constant USDC_PROXY = 0x3600000000000000000000000000000000000000;
    bytes32 internal constant TWA_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    uint256 internal constant SIGNER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    bytes32 internal constant IMPL_DS = 0xe58c76ff0a6a9bb5cbd1715ee99556cffa2f54fbb00049d288f6c6f9a3794fd6;

    function setUp() public {
        vm.selectFork(vm.createFork("https://rpc.mainnet.arc.io"));
    }

    function _digest(bytes32 ds, address from, address to, uint256 value, uint256 va, uint256 vb, bytes32 nonce)
        internal pure returns (bytes32)
    {
        bytes32 sh = keccak256(abi.encode(TWA_TYPEHASH, from, to, value, va, vb, nonce));
        return keccak256(abi.encodePacked(hex"1901", ds, sh));
    }

    function _digestRawStruct(address from, address to, uint256 value, uint256 va, uint256 vb, bytes32 nonce)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(TWA_TYPEHASH, from, to, value, va, vb, nonce));
    }

    function _isSigClass(bytes memory ret) internal pure returns (bool) {
        if (ret.length == 0) return true;
        return _contains(ret, "ignature") || _contains(ret, "uthoriz") || _contains(ret, "ermit");
    }

    function _contains(bytes memory h, string memory n) internal pure returns (bool) {
        bytes memory b = bytes(n);
        if (h.length < b.length) return false;
        for (uint256 i = 0; i <= h.length - b.length; i++) {
            bool m = true;
            for (uint256 j = 0; j < b.length; j++) if (h[i + j] != b[j]) { m = false; break; }
            if (m) return true;
        }
        return false;
    }

    /// @notice Tries one candidate. Returns true if signature was ACCEPTED
    ///         (revert is NOT signature-class).
    function _probe(bytes32 ds, bytes32 nonce) internal returns (bool accepted, bytes memory ret) {
        address signer = vm.addr(SIGNER_PK);
        uint256 va = 0;
        uint256 vb = block.timestamp + 1 hours;
        bytes32 d = _digest(ds, signer, address(this), 1_000_000, va, vb, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, d);
        (, ret) = USDC_PROXY.call(abi.encodeWithSignature(
            "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
            signer, address(this), uint256(1_000_000), va, vb, nonce, v, r, s));
        accepted = !_isSigClass(ret);
    }

    /// @notice Raw struct-hash (no domain) probe.
    function _probeRaw(bytes32 nonce) internal returns (bool accepted, bytes memory ret) {
        address signer = vm.addr(SIGNER_PK);
        uint256 va = 0;
        uint256 vb = block.timestamp + 1 hours;
        bytes32 d = _digestRawStruct(signer, address(this), 1_000_000, va, vb, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, d);
        (, ret) = USDC_PROXY.call(abi.encodeWithSignature(
            "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
            signer, address(this), uint256(1_000_000), va, vb, nonce, v, r, s));
        accepted = !_isSigClass(ret);
    }

    function testFork_Bruteforce_FindAcceptedSeparator() public {
        bytes32 DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        bytes32 DOMAIN_TYPEHASH_NOVC = keccak256("EIP712Domain(string name,string version,uint256 chainId)");
        bytes32 DOMAIN_TYPEHASH_NV = keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");

        string[4] memory names = ["USDC", "USD Coin", "FiatTokenV2", ""];
        string[2] memory versions = ["2", "1"];

        // Collect computed candidates
        bytes32[] memory cands = new bytes32[](64);
        uint256 n = 0;
        for (uint256 ni = 0; ni < 4; ni++) {
            for (uint256 vi = 0; vi < 2; vi++) {
                cands[n++] = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(names[ni])), keccak256(bytes(versions[vi])), uint256(5042), USDC_PROXY));
                cands[n++] = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(names[ni])), keccak256(bytes(versions[vi])), uint256(5042), address(0xC6AD664ac6679F4Ce74e10E91449C93Ec1ae3cA6)));
                cands[n++] = keccak256(abi.encode(DOMAIN_TYPEHASH_NOVC, keccak256(bytes(names[ni])), keccak256(bytes(versions[vi])), uint256(5042)));
                cands[n++] = keccak256(abi.encode(DOMAIN_TYPEHASH_NV, uint256(5042), USDC_PROXY));
            }
        }
        // Known constants
        cands[n++] = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84;
        cands[n++] = IMPL_DS;

        // Storage scan: every unique non-zero word in proxy slots 0..300
        for (uint256 slot = 0; slot < 300 && n < 64; slot++) {
            bytes32 val = vm.load(USDC_PROXY, bytes32(slot));
            if (val == bytes32(0)) continue;
            bool dup = false;
            for (uint256 k = 0; k < n; k++) if (cands[k] == val) { dup = true; break; }
            if (!dup) cands[n++] = val;
        }

        bool anyAccepted = false;
        for (uint256 i = 0; i < n; i++) {
            bytes32 nonce = keccak256(abi.encode("brute", i));
            (bool accepted, bytes memory ret) = _probe(cands[i], nonce);
            if (accepted) {
                anyAccepted = true;
                emit log_named_uint("ACCEPTED candidate index", i);
                emit log_named_bytes32("ACCEPTED separator", cands[i]);
                emit log_named_bytes("revert data", ret);
            }
        }

        // Raw struct-hash (no domain) probe
        {
            bytes32 nonce = keccak256("brute-raw");
            (bool accepted, bytes memory ret) = _probeRaw(nonce);
            if (accepted) {
                anyAccepted = true;
                emit log_string("ACCEPTED: RAW STRUCT HASH (no domain separator)");
                emit log_named_bytes("revert data", ret);
            }
        }

        // Do NOT hard-fail here; emit findings so the report documents reality.
        if (!anyAccepted) {
            emit log_string("NO candidate separator accepted by real contract (all 'FiatTokenV2: invalid signature')");
        }
        assertTrue(true, "diagnostic always passes; findings in logs");
    }
}
