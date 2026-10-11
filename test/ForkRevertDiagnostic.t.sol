// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/**
 * @title ForkRevertDiagnostic
 * @notice Dumps RAW revert data from the real Arc USDC proxy for a
 *         transferWithAuthorization attempt, so classification is grounded
 *         in actual bytes rather than assumptions.
 */
contract ForkRevertDiagnostic is Test {
    address internal constant USDC_PROXY = 0x3600000000000000000000000000000000000000;
    bytes32 internal constant FRONTEND_DS = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84;
    bytes32 internal constant TWA_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    uint256 internal constant SIGNER_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function setUp() public {
        vm.selectFork(vm.createFork("https://rpc.mainnet.arc.io"));
    }

    function _digest(bytes32 ds, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal pure returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(TWA_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        return keccak256(abi.encodePacked(hex"1901", ds, structHash));
    }

    function testFork_Diag_RawRevertData_ValidSig_UnfundedSigner() public {
        address signer = vm.addr(SIGNER_PK);
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("diag-valid");

        bytes32 digest = _digest(FRONTEND_DS, signer, address(this), 1_000_000, validAfter, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);

        (bool ok, bytes memory ret) = USDC_PROXY.call(
            abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                signer, address(this), uint256(1_000_000), validAfter, validBefore, nonce, v, r, s
            )
        );

        emit log_named_uint("call ok (1=yes)", ok ? 1 : 0);
        emit log_named_uint("revert data length", ret.length);
        emit log_named_bytes("revert data", ret);
        if (ret.length >= 4) {
            emit log_named_bytes32("revert selector guess", bytes4(ret));
        }
    }

    function testFork_Diag_RawRevertData_GarbageSig() public {
        address signer = vm.addr(SIGNER_PK);
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("diag-garbage");

        (, bytes memory ret) = USDC_PROXY.call(
            abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                signer, address(this), uint256(1_000_000), validAfter, validBefore, nonce, uint8(27), bytes32(uint256(1)), bytes32(uint256(2))
            )
        );

        emit log_named_uint("call ok (always 0)", 0);
        emit log_named_uint("revert data length", ret.length);
        emit log_named_bytes("revert data", ret);
    }

    function testFork_Diag_Paused_And_Basics() public {
        (, bytes memory pausedRet) = USDC_PROXY.staticcall(abi.encodeWithSignature("paused()"));
        if (pausedRet.length >= 32) emit log_named_uint("paused", abi.decode(pausedRet, (bool)) ? 1 : 0);

        (, bytes memory implRet) = USDC_PROXY.staticcall(abi.encodeWithSignature("implementation()"));
        if (implRet.length >= 32) {
            address impl = abi.decode(implRet, (address));
            emit log_named_address("implementation()", impl);
        }

        // Try calling the implementation DIRECTLY (bypassing proxy) with the same digest
        // built over the impl-context separator 0xe58c...
        address signer = vm.addr(SIGNER_PK);
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("diag-impl-direct");
        bytes32 implDs = 0xe58c76ff0a6a9bb5cbd1715ee99556cffa2f54fbb00049d288f6c6f9a3794fd6;
        bytes32 digest = _digest(implDs, signer, address(this), 1_000_000, validAfter, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, digest);

        (, bytes memory implCode) = USDC_PROXY.staticcall(abi.encodeWithSignature("implementation()"));
        address implAddr = abi.decode(implCode, (address));
        (bool ok2, bytes memory ret2) = implAddr.call(
            abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                signer, address(this), uint256(1_000_000), validAfter, validBefore, nonce, v, r, s
            )
        );
        emit log_named_uint("impl-direct call ok (1=yes)", ok2 ? 1 : 0);
        emit log_named_uint("impl-direct revert length", ret2.length);
        emit log_named_bytes("impl-direct revert data", ret2);
    }
}
