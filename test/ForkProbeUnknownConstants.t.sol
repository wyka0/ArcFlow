// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/**
 * @title ForkProbeUnknownConstants
 * @notice Probes the 13 non-standard PUSH32 constants extracted from the real
 *         implementation bytecode as candidate EIP-3009 domain separators.
 *         Acceptance criterion: valid signature over an UNFUNDED signer yields
 *         a NON-signature revert (balance-class); rejection yields
 *         "FiatTokenV2: invalid signature".
 */
contract ForkProbeUnknownConstants is Test {
    address internal constant USDC_PROXY = 0x3600000000000000000000000000000000000000;
    bytes32 internal constant TWA_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    uint256 internal constant SIGNER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    bytes32[13] internal candidates = [
        bytes32(0x46980fca912ef9bcdbd36877427b6b90e860769f604e89c0e67720cece530d20),
        bytes32(0xdb66dfa9c6b8f5226fe9aac7e51897ae8ee94ac31dc70bb6c9900b2574b707e6),
        bytes32(0xc67398012c111ce95ecb7429b933096c977380ee6c421175a71a4a4c6c88c06e),
        bytes32(0xffa4e6181777692565cf28528fc88fd1516ea86b56da075235fa575af6a4b855),
        bytes32(0xab8530f87dc9b59234c4623bf917212bb2536d647574c8e7e5da92c2ede0c9f8),
        bytes32(0xb80482a293ca2e013eda8683c9bd7fc8347cfdaeea5ede58cba46df502c2a604),
        bytes32(0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8),
        bytes32(0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5),
        bytes32(0x117e3210bb9aa7d9baff172026820255c6f6c30ba8999d1c2fd88e2848137c4e),
        bytes32(0xe475e580d85111348e40d8ca33cfdd74c30fe1655c2d8537a13abc10065ffa5a),
        bytes32(0xe94479a9f7e1952cc78f2d6baab678adc1b772d936c6583def489e524cb66692),
        bytes32(0xcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5),
        bytes32(0x7805862f689e2f13df9f062ff482ad3ad112aca9e0847911ed832e158c525b33)
    ];

    function setUp() public {
        vm.selectFork(vm.createFork("https://rpc.mainnet.arc.io"));
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

    function testFork_ProbeUnknownConstants_AsDomainSeparators() public {
        address signer = vm.addr(SIGNER_PK);
        uint256 value = 1_000_000;
        uint256 va = 0;
        uint256 vb = block.timestamp + 1 hours;
        bool anyAccepted = false;

        for (uint256 i = 0; i < 13; i++) {
            bytes32 nonce = keccak256(abi.encode("probe-unknown", i));
            bytes32 sh = keccak256(abi.encode(TWA_TYPEHASH, signer, address(this), value, va, vb, nonce));
            bytes32 digest = keccak256(abi.encodePacked(hex"1901", candidates[i], sh));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);
            (, bytes memory ret) = USDC_PROXY.call(abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                signer, address(this), value, va, vb, nonce, v, r, s));

            if (!_isSigClass(ret)) {
                anyAccepted = true;
                emit log_named_uint("ACCEPTED candidate index", i);
                emit log_named_bytes32("ACCEPTED separator", candidates[i]);
                emit log_named_bytes("revert data", ret);
            }
        }

        // Also probe: digest WITHOUT the 0x1901 prefix (raw ds||sh)
        for (uint256 i = 0; i < 13; i++) {
            bytes32 nonce = keccak256(abi.encode("probe-noprefix", i));
            bytes32 sh = keccak256(abi.encode(TWA_TYPEHASH, signer, address(this), value, va, vb, nonce));
            bytes32 digest = keccak256(abi.encodePacked(candidates[i], sh));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);
            (, bytes memory ret) = USDC_PROXY.call(abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                signer, address(this), value, va, vb, nonce, v, r, s));
            if (!_isSigClass(ret)) {
                anyAccepted = true;
                emit log_named_uint("ACCEPTED (no-prefix) index", i);
                emit log_named_bytes32("ACCEPTED separator", candidates[i]);
            }
        }

        if (!anyAccepted) emit log_string("All 13 constants rejected as separators (with and without 0x1901 prefix)");
    }
}
