// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    SmokeTestV2,
    WrongChainId,
    SmokeTargetNotConfigured,
    SmokeTargetForbidden,
    SmokeTargetHasNoCode
} from "../script_disabled/SmokeTestV2.s.sol";

/**
 * @title SmokeTargetValidationTest
 * @notice Phase 19.7 — Exercises the REAL fail-closed target validation of
 *         script_disabled/SmokeTestV2.s.sol (imported directly, not a mirror):
 *           - an unset target cannot silently fall back to any address;
 *           - the known predecessor deployment is rejected as a target;
 *           - code-less targets are rejected;
 *           - wrong-chain execution is rejected;
 *           - only an explicit, validated, coded target on chain 5042 passes.
 */
contract SmokeTargetStub {
    // Minimal contract that exists only to have code at its address.
}

contract SmokeTargetValidationTest is Test {
    SmokeTestV2 internal smoke;
    address internal codedTarget;
    address internal constant FORBIDDEN = 0xf0c80Fdd22F8612DD7A877f6dA82Ab5097D63A66;
    address internal constant NO_CODE = address(uint160(0xdeadbeef01));

    function setUp() public {
        smoke = new SmokeTestV2();
        codedTarget = address(new SmokeTargetStub());
        vm.chainId(5042); // Arc mainnet
    }

    function test_UnsetTarget_Reverts_NoSilentFallback() public {
        // An empty value must revert — there is no default address anywhere.
        vm.expectRevert(SmokeTargetNotConfigured.selector);
        smoke._resolveSmokeTarget("");
    }

    function test_PredecessorAddress_Rejected() public {
        // The known predecessor deployment must never be accepted.
        vm.expectRevert(abi.encodeWithSelector(SmokeTargetForbidden.selector, FORBIDDEN));
        smoke._resolveSmokeTarget(vm.toString(FORBIDDEN));
    }

    function test_PredecessorAddress_RejectedByValidator() public {
        vm.expectRevert(abi.encodeWithSelector(SmokeTargetForbidden.selector, FORBIDDEN));
        smoke._validateTarget(FORBIDDEN);
    }

    function test_NoCodeTarget_Rejected() public {
        vm.expectRevert(abi.encodeWithSelector(SmokeTargetHasNoCode.selector, NO_CODE));
        smoke._resolveSmokeTarget(vm.toString(NO_CODE));
    }

    function test_ValidCodedTarget_Passes() public {
        address resolved = smoke._resolveSmokeTarget(vm.toString(codedTarget));
        assertEq(resolved, codedTarget, "resolved target must equal the supplied address");
        // The validator alone accepts the same target on chain 5042.
        smoke._validateTarget(codedTarget);
    }

    function test_WrongChain_Reverts() public {
        vm.chainId(1); // Ethereum mainnet
        vm.expectRevert(abi.encodeWithSelector(WrongChainId.selector, 5042, 1));
        smoke._resolveSmokeTarget(vm.toString(codedTarget));
    }

    function test_MalformedTarget_Reverts() public {
        bool reverted = false;
        try smoke._resolveSmokeTarget("not-an-address") {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "malformed target must revert");
    }

    function test_ForbiddenConstant_MatchesDocumentedPredecessor() public {
        assertEq(
            smoke.FORBIDDEN_PREDECESSOR(),
            0xf0c80Fdd22F8612DD7A877f6dA82Ab5097D63A66,
            "denylist constant must match the reconciled predecessor address"
        );
    }

    function test_ExpectedChainId_IsArcMainnet() public {
        assertEq(smoke.EXPECTED_CHAIN_ID(), 5042, "chain expectation must be Arc mainnet");
    }
}
