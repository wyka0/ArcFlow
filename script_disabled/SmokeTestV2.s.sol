// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ArcFlowV2} from "../contracts/ArcFlowV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUSDC is IERC20 {
    function nonces(address owner) external view returns (uint256);
}

error WrongChainId(uint256 expected, uint256 actual);
error SmokeTargetNotConfigured();
error SmokeTargetForbidden(address target);
error SmokeTargetHasNoCode(address target);

contract SmokeTestV2 is Script {
    // === Fail-closed configuration (Phase 19.7) ============================
    // The smoke target MUST be supplied explicitly via the SMOKE_TEST_V2_ADDRESS
    // environment variable. There is deliberately NO default address.
    // The known predecessor deployment (initial-commit WIP source, broadcast
    // 2026-10-06) is permanently rejected as a target.
    uint256 public constant EXPECTED_CHAIN_ID = 5042;
    address public constant FORBIDDEN_PREDECESSOR = 0xf0c80Fdd22F8612DD7A877f6dA82Ab5097D63A66;

    // Test addresses
    address constant DEPLOYER = 0x299Ce4113abF88F4997737184aa8A7a3D58AC15C;
    address constant TREASURY = 0x1111111111111111111111111111111111111111;
    address constant CONTRIBUTOR = 0x2222222222222222222222222222222222222222;
    address constant USDC = 0x3600000000000000000000000000000000000000;

    // Test parameters
    uint256 constant TEST_AMOUNT = 10_000; // 0.01 USDC (6 decimals)
    uint256 constant THRESHOLD = 10_000;   // 0.01 USDC
    uint16 constant TREASURY_BPS = 8000;   // 80%
    uint16 constant CONTRIBUTOR_BPS = 2000; // 20%

    // EIP-712 (matching contract's EXECUTE_TYPEHASH)
    bytes32 constant EXECUTE_TYPEHASH = keccak256(
        "ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    function run() external returns (uint256 flowId) {
        // === Fail-closed guards (Phase 19.7) — every check precedes any
        // state-changing operation (vm.startBroadcast is further below). ===

        // 1. Chain guard: revert immediately when off Arc mainnet.
        _verifyChainId();

        // 2. Smoke target: MUST be explicitly supplied via SMOKE_TEST_V2_ADDRESS.
        //    Missing, malformed, predecessor, or code-less targets revert here.
        address smokeTarget = _resolveSmokeTarget(vm.envOr("SMOKE_TEST_V2_ADDRESS", string("")));

        // Read configuration from environment variables
        string memory arcRpcUrl = vm.envString("ARC_RPC_URL");
        string memory deployerPrivateKey = vm.envString("DEPLOYER_PRIVATE_KEY");

        if (bytes(arcRpcUrl).length == 0) {
            revert("ERROR: ARC_RPC_URL environment variable not set");
        }

        if (bytes(deployerPrivateKey).length == 0) {
            revert("ERROR: DEPLOYER_PRIVATE_KEY environment variable not set");
        }

        // Start broadcast as deployer
        vm.startBroadcast(vm.parseUint(deployerPrivateKey));

        // Get contract instances
        ArcFlowV2 arcFlow = ArcFlowV2(smokeTarget);
        IUSDC usdc = IUSDC(USDC);

        // Verify owner has enough USDC
        assert(usdc.balanceOf(DEPLOYER) >= TEST_AMOUNT);

        // Create test flow
        flowId = arcFlow.createFlow(TREASURY, CONTRIBUTOR, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        // Activate flow
        arcFlow.activateFlow(flowId);

        // Generate authorization parameters
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 3600; // 1 hour
        bytes32 flowNonce = keccak256(abi.encode("test-flow-nonce", flowId, validAfter));

        // Generate ArcFlow signature (matching contract's _hashFlowAuthorization - NO domain separator)
        console2.log("=== GENERATING ARCFLOW SIGNATURE (contract-compatible) ===");
        bytes32 flowDigest = _hashFlowAuthorizationContractStyle(flowId, TEST_AMOUNT, validAfter, validBefore, flowNonce);
        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signDigest(flowDigest);

        // Get USDC nonce for EIP-3009
        uint256 usdcNonce = usdc.nonces(DEPLOYER);
        console2.log("USDC nonce:", usdcNonce);

        // Try multiple USDC domain configurations
        console2.log("=== TRYING USDC DOMAIN: name=FiatTokenV2, version=2, chainId=1 (Ethereum mainnet) ===");
        bytes32 usdcDigest = _hashUSDCAuthorization(
            DEPLOYER,
            smokeTarget,
            TEST_AMOUNT,
            0, // validAfter = 0 (immediate)
            type(uint256).max, // validBefore = max
            bytes32(usdcNonce),
            "FiatTokenV2", // name
            "2",           // version
            1              // chainId = Ethereum mainnet (original deployment)
        );
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signDigest(usdcDigest);

        // Execute dual-auth
        console2.log("=== EXECUTING DUAL-AUTH TRANSACTION ===");
        arcFlow.executeSplitWithDualAuth(
            flowId,
            TEST_AMOUNT,
            validAfter,
            validBefore,
            flowNonce,
            flowV, flowR, flowS,
            0, // usdc validAfter
            type(uint256).max, // usdc validBefore
            bytes32(usdcNonce),
            usdcV, usdcR, usdcS
        );

        console2.log("Execution successful!");

        // Stop broadcast
        vm.stopBroadcast();
    }

    // Match contract's _hashFlowAuthorization EXACTLY (NO domain separator)
    function _hashFlowAuthorizationContractStyle(
        uint256 flowId,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            EXECUTE_TYPEHASH,
            flowId,
            amount,
            validAfter,
            validBefore,
            nonce
        ));
    }

    // === Fail-closed target validation (Phase 19.7) ========================
    // Public so test/SmokeTargetValidation.t.sol can exercise the REAL
    // validation logic (no mirrored harness).

    function _verifyChainId() internal view {
        uint256 actual = block.chainid;
        if (actual != EXPECTED_CHAIN_ID) {
            revert WrongChainId(EXPECTED_CHAIN_ID, actual);
        }
    }

    /// @notice Resolves the smoke target from an explicitly supplied value.
    ///         There is no default: a missing value reverts immediately.
    ///         Malformed values are rejected by vm.parseAddress.
    function _resolveSmokeTarget(string memory raw) public returns (address) {
        if (bytes(raw).length == 0) {
            revert SmokeTargetNotConfigured();
        }
        address target = vm.parseAddress(raw);
        _validateTarget(target);
        return target;
    }

    /// @notice Rejects the prohibited predecessor and code-less targets,
    ///         then enforces the chain guard. Call order matters: the
    ///         predecessor check fires even before the code/chain checks.
    function _validateTarget(address target) public view {
        if (target == FORBIDDEN_PREDECESSOR) {
            revert SmokeTargetForbidden(target);
        }
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(target)
        }
        if (codeSize == 0) {
            revert SmokeTargetHasNoCode(target);
        }
        _verifyChainId();
    }

    // USDC EIP-3009 with configurable domain
    function _hashUSDCAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        string memory name,
        string memory version,
        uint256 domainChainId
    ) internal pure returns (bytes32) {
        bytes32 typeHash = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
        
        bytes32 structHash = keccak256(abi.encode(
            typeHash,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            domainChainId,
            USDC
        ));

        return keccak256(abi.encode(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
    }

    function _signDigest(bytes32 digest) internal view returns (uint8, bytes32, bytes32) {
        string memory privateKeyStr = vm.envString("DEPLOYER_PRIVATE_KEY");
        uint256 privateKey = vm.parseUint(privateKeyStr);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return (v, r, s);
    }
}