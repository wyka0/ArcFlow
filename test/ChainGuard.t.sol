// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

// Mirror the error and guard from the deployment script so the guard logic
// can be tested without executing the full deployment (which requires
// environment variables and a broadcast context).
error WrongChainId(uint256 expected, uint256 actual);

/**
 * @title ChainGuardTest
 * @notice Phase 13.1 — Tests the fail-closed chain-ID guard used by
 *         DeployArcFlowV2. The guard MUST revert when the chain ID is not
 *         Arc mainnet (5042) and MUST pass when it is.
 *
 * The guard function is copied from DeployArcFlowV2._verifyChainId().
 * A separate guard contract is used so the test does not depend on
 * vm.envString() or vm.startBroadcast().
 */
contract ChainGuardHarness {
    uint256 public constant EXPECTED_CHAIN_ID = 5042;

    function verifyChainId() external view {
        uint256 actual = block.chainid;
        if (actual != EXPECTED_CHAIN_ID) {
            revert WrongChainId(EXPECTED_CHAIN_ID, actual);
        }
    }
}

contract ChainGuardTest is Test {
    ChainGuardHarness internal guard;

    function setUp() public {
        guard = new ChainGuardHarness();
    }

    /// @notice On Arc mainnet (chain 5042), the guard must pass.
    function test_ChainGuard_PassesOnArcMainnet() public {
        vm.chainId(5042);
        // No revert expected
        guard.verifyChainId();
    }

    /// @notice On Ethereum mainnet (chain 1), the guard must revert.
    function test_ChainGuard_RevertsOnEthereum() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(WrongChainId.selector, 5042, 1));
        guard.verifyChainId();
    }

    /// @notice On a common test chain (31337), the guard must revert.
    function test_ChainGuard_RevertsOnAnvilDefault() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSelector(WrongChainId.selector, 5042, 31337));
        guard.verifyChainId();
    }

    /// @notice On a nearby-but-wrong chain (5041), the guard must revert.
    function test_ChainGuard_RevertsOnNearbyChain() public {
        vm.chainId(5041);
        vm.expectRevert(abi.encodeWithSelector(WrongChainId.selector, 5042, 5041));
        guard.verifyChainId();
    }

    /// @notice On a nearby-but-wrong chain (5043), the guard must revert.
    function test_ChainGuard_RevertsOnNearbyChainPlus() public {
        vm.chainId(5043);
        vm.expectRevert(abi.encodeWithSelector(WrongChainId.selector, 5042, 5043));
        guard.verifyChainId();
    }

    /// @notice The guard error must carry both expected and actual chain IDs.
    function test_ChainGuard_ErrorCarriesBothValues() public {
        vm.chainId(999);
        try guard.verifyChainId() {
            // Should not reach here
            assertTrue(false, "expected revert");
        } catch (bytes memory data) {
            // WrongChainId(uint256,uint256) selector
            bytes4 expectedSelector = bytes4(keccak256("WrongChainId(uint256,uint256)"));
            assertTrue(data.length >= 68, "error data must be at least 68 bytes (4 + 32 + 32)");
            assertTrue(bytes4(data) == expectedSelector, "error selector must match WrongChainId(uint256,uint256)");
            // Decode expected and actual from the error data (skip 4-byte selector)
            uint256 expected;
            uint256 actual;
            assembly {
                expected := mload(add(data, 36))
                actual := mload(add(data, 68))
            }
            assertEq(expected, 5042, "error must carry expected chain ID");
            assertEq(actual, 999, "error must carry actual chain ID");
        }
    }
}
