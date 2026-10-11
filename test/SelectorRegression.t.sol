// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcFlowV2} from "../contracts/ArcFlowV2.sol";
import {ERC20Mock} from "./ERC20Mock.sol";

/**
 * @title SelectorRegression
 * @notice Phase 10.8 Blocker 1: derives the canonical selector for
 *         executeSplitWithDualAuth from its canonical ABI signature and proves
 *         the deployed/dispatched contract binds to exactly that selector.
 *
 * Canonical signature (14 params):
 *   executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)
 * Canonical selector: 0x6d200078
 *
 * The value 0x00e10fab (cited in the Phase 10.6 brief) matches no derivable
 * signature (310 variants brute-forced), no deployed bytecode, and no git
 * history. It is treated as an incorrect earlier expectation, not a target.
 */
contract SelectorRegression is Test {
    ArcFlowV2 internal arcFlow;
    ERC20Mock internal usdc;

    /// @notice Canonical function signature (whitespace-free, ABI-canonical).
    string internal constant CANONICAL_SIG =
        "executeSplitWithDualAuth(uint256,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)";

    /// @notice Selector computed independently via viem/TS (Phase 10.8 audit).
    bytes4 internal constant EXPECTED_SELECTOR = 0x6d200078;

    /// @notice The unexplainable expectation from the Phase 10.6 brief.
    bytes4 internal constant PHASE106_EXPECTED = 0x00e10fab;

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC");
        arcFlow = new ArcFlowV2(address(usdc));
    }

    function test_CanonicalSelector_DerivedFromSignature() public pure {
        bytes4 derived = bytes4(keccak256(bytes(CANONICAL_SIG)));
        assertEq(derived, EXPECTED_SELECTOR, "canonical signature must derive 0x6d200078");
    }

    function test_Phase106Expectation_IsNotTheCanonicalSelector() public pure {
        bytes4 derived = bytes4(keccak256(bytes(CANONICAL_SIG)));
        assertTrue(derived != PHASE106_EXPECTED, "0x00e10fab must NOT equal the canonical selector");
    }

    function test_ExecuteSplitWithDualAuth_DispatchedAtCanonicalSelector() public {
        // ABI-encode dummy args for the 14-param function.
        bytes memory args = abi.encode(
            uint256(0),             // flowId (nonexistent -> FlowNotFound)
            uint256(1),             // amount
            uint256(0),             // flowValidAfter
            uint256(1),             // flowValidBefore
            bytes32(0),             // flowNonce
            uint8(27),              // flowV
            bytes32(0),             // flowR
            bytes32(0),             // flowS
            uint256(0),             // usdcValidAfter
            uint256(1),             // usdcValidBefore
            bytes32(0),             // usdcNonce
            uint8(27),              // usdcV
            bytes32(0),             // usdcR
            bytes32(0)              // usdcS
        );

        (bool ok, bytes memory ret) = address(arcFlow).call(abi.encodePacked(EXPECTED_SELECTOR, args));

        // The selector must dispatch to executeSplitWithDualAuth: the call enters
        // the function and reverts with the custom error FlowNotFound(uint256),
        // never with an empty "unknown selector" revert.
        assertFalse(ok, "dummy call must revert (flowId 0 does not exist)");
        assertTrue(ret.length == 36, "revert data must be FlowNotFound(uint256): 4-byte selector + uint256");
        assertEq(bytes4(ret), ArcFlowV2.FlowNotFound.selector, "must be FlowNotFound from inside the function");
    }

    function test_Phase106Selector_IsNotBoundByContract() public {
        bytes memory args = abi.encode(
            uint256(0), uint256(1), uint256(0), uint256(1), bytes32(0), uint8(27), bytes32(0), bytes32(0),
            uint256(0), uint256(1), bytes32(0), uint8(27), bytes32(0), bytes32(0)
        );

        (, bytes memory ret) = address(arcFlow).call(abi.encodePacked(PHASE106_EXPECTED, args));

        // Unknown selector on a contract without fallback -> empty revert data.
        assertEq(ret.length, 0, "0x00e10fab must NOT dispatch to any function (empty revert expected)");
    }

    function test_CompiledArtifactSelector_MatchesFrontendABI() public {
        // The compiled artifact is checked off-chain (scripts-audit); here we pin
        // the dispatch binding as the on-chain equivalent of that check.
        bytes memory args = abi.encode(
            uint256(0), uint256(1), uint256(0), uint256(1), bytes32(0), uint8(27), bytes32(0), bytes32(0),
            uint256(0), uint256(1), bytes32(0), uint8(27), bytes32(0), bytes32(0)
        );
        (bool ok, bytes memory ret) = address(arcFlow).call(abi.encodePacked(EXPECTED_SELECTOR, args));
        assertFalse(ok);
        assertEq(bytes4(ret), ArcFlowV2.FlowNotFound.selector);
        assertTrue(ret.length > 4, "dispatched function produced typed revert data");
    }
}
