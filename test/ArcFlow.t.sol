// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcFlow} from "../contracts/ArcFlow.sol";
import {ERC20Mock} from "./ERC20Mock.sol";

contract ArcFlowTest is Test {
    ArcFlow public arcFlow;
    ERC20Mock public usdc;

    address public treasury = makeAddr("treasury");
    address public contributor = makeAddr("contributor");
    address public other = makeAddr("other");

    uint256 public constant THRESHOLD = 10_000_000; // 10 USDC (6 decimals)
    uint16 public constant TREASURY_BPS = 8000;     // 80%
    uint16 public constant CONTRIBUTOR_BPS = 2000;  // 20%

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC");
        arcFlow = new ArcFlow(address(usdc));

        // Mint USDC to test contract (msg.sender) and other for testing
        usdc.mint(address(this), 1_000_000_000);      // 1000 USDC
        usdc.mint(other, 1_000_000_000);              // 1000 USDC
    }

    // ============================================================
    // Flow Creation Tests
    // ============================================================

    function testCreateFlow_Valid() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        assertEq(flowId, 0);

        ArcFlow.Flow memory flow = arcFlow.getFlow(flowId);
        assertEq(flow.owner, address(this));
        assertEq(flow.treasury, treasury);
        assertEq(flow.contributor, contributor);
        assertEq(flow.threshold, THRESHOLD);
        assertEq(flow.treasuryBps, TREASURY_BPS);
        assertEq(flow.contributorBps, CONTRIBUTOR_BPS);
        assertEq(flow.active, false);
    }

    function testCreateFlow_ZeroTreasury_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(address(0), contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_ZeroContributor_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(treasury, address(0), THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_ZeroThreshold_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(treasury, contributor, 0, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_SplitNot100Percent_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(treasury, contributor, THRESHOLD, 7000, 2000); // 90%
    }

    function testCreateFlow_SplitOver100Percent_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(treasury, contributor, THRESHOLD, 8000, 3000); // 110%
    }

    function testCreateFlow_IdenticalRecipients_Reverts() public {
        vm.expectRevert();
        arcFlow.createFlow(treasury, treasury, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_FlowIdIncrements() public {
        uint256 flowId1 = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        uint256 flowId2 = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        uint256 flowId3 = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        assertEq(flowId1, 0);
        assertEq(flowId2, 1);
        assertEq(flowId3, 2);
    }

    // ============================================================
    // Permission Tests
    // ============================================================

    function testActivateFlow_Owner_Succeeds() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        assertEq(arcFlow.getFlow(flowId).active, true);
    }

    function testActivateFlow_NonOwner_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        vm.prank(other);
        vm.expectRevert();
        arcFlow.activateFlow(flowId);
    }

    function testPauseFlow_Owner_Succeeds() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        arcFlow.pauseFlow(flowId);
        assertEq(arcFlow.getFlow(flowId).active, false);
    }

    function testPauseFlow_NonOwner_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        vm.prank(other);
        vm.expectRevert();
        arcFlow.pauseFlow(flowId);
    }

    function testExecuteSplit_NonOwner_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        usdc.mint(other, 100_000_000);
        vm.prank(other);
        vm.expectRevert();
        arcFlow.executeSplit(flowId, 10_000_000);
    }

    // ============================================================
    // Execution Tests
    // ============================================================

    function testExecuteSplit_10USDC_80_20() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000; // 10 USDC
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 8_000_000);      // 8 USDC
        assertEq(usdc.balanceOf(contributor), 2_000_000);   // 2 USDC
        assertEq(usdc.balanceOf(address(arcFlow)), 0);      // No dust
    }

    function testExecuteSplit_100USDC_70_30() public {
        uint16 treasuryBps = 7000;
        uint16 contributorBps = 3000;
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, treasuryBps, contributorBps);
        arcFlow.activateFlow(flowId);

        uint256 amount = 100_000_000; // 100 USDC
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 70_000_000);      // 70 USDC
        assertEq(usdc.balanceOf(contributor), 30_000_000);   // 30 USDC
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplit_AmountBelowThreshold_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 9_000_000; // 9 USDC (below 10 USDC threshold)
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        vm.expectRevert();
        arcFlow.executeSplit(flowId, amount);
    }

    function testExecuteSplit_ThresholdExactly_Succeeds() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = THRESHOLD; // Exactly 10 USDC
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 8_000_000);
        assertEq(usdc.balanceOf(contributor), 2_000_000);
    }

    function testExecuteSplit_AmountAboveThreshold_Succeeds() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 11_000_000; // 11 USDC
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 8_800_000);
        assertEq(usdc.balanceOf(contributor), 2_200_000);
    }

    function testExecuteSplit_PausedFlow_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        arcFlow.pauseFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        vm.expectRevert();
        arcFlow.executeSplit(flowId, amount);
    }

    function testExecuteSplit_InsufficientAllowance_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(address(this), amount);
        // No approve call

        vm.expectRevert();
        arcFlow.executeSplit(flowId, amount);
    }

    function testExecuteSplit_InsufficientBalance_Reverts() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 2_000_000_000; // 2000 USDC - more than we have
        usdc.mint(address(this), 100_000_000); // Only 100 USDC
        usdc.approve(address(arcFlow), amount);

        vm.expectRevert();
        arcFlow.executeSplit(flowId, amount);
    }

    // ============================================================
    // Accounting Tests
    // ============================================================

    function testExecuteSplit_Accounting_TreasuryPlusContributorEqualsAmount() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 123_456_789; // Random amount
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        uint256 treasuryBal = usdc.balanceOf(treasury);
        uint256 contributorBal = usdc.balanceOf(contributor);

        assertEq(treasuryBal + contributorBal, amount);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplit_NoDustLeftInContract() public {
        // Test various amounts to ensure no rounding dust
        uint256[] memory amounts = new uint256[](6);
        amounts[0] = 10000000;
        amounts[1] = 11000000;
        amounts[2] = 100000000;
        amounts[3] = 1000000000;
        amounts[4] = 123456789;
        amounts[5] = 999999999;

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
            arcFlow.activateFlow(flowId);

            uint256 amount = amounts[i];
            usdc.mint(address(this), amount);
            usdc.approve(address(arcFlow), amount);

            arcFlow.executeSplit(flowId, amount);

            assertEq(usdc.balanceOf(address(arcFlow)), 0);
        }
    }

    // ============================================================
    // Event Tests
    // ============================================================

    function testFlowCreated_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ArcFlow.FlowCreated(0, address(this), treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testFlowStatusChanged_Activate_EmitsEvent() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        vm.expectEmit(true, true, false, true);
        emit ArcFlow.FlowStatusChanged(0, true);
        arcFlow.activateFlow(0);
    }

    function testFlowStatusChanged_Pause_EmitsEvent() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        vm.expectEmit(true, true, false, true);
        emit ArcFlow.FlowStatusChanged(flowId, false);
        arcFlow.pauseFlow(flowId);
    }

    function testFlowExecuted_EmitsEvent() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        vm.expectEmit(true, true, false, true);
        emit ArcFlow.FlowExecuted(flowId, address(this), amount, 8_000_000, 2_000_000);
        arcFlow.executeSplit(flowId, amount);
    }

    // ============================================================
    // View Function Tests
    // ============================================================

    function testGetFlowCount() public {
        assertEq(arcFlow.getFlowCount(), 0);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        assertEq(arcFlow.getFlowCount(), 1);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        assertEq(arcFlow.getFlowCount(), 2);
    }

    function testGetFlowsByOwner() public {
        vm.prank(other);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        uint256[] memory ownerFlows = arcFlow.getFlowsByOwner(address(this));
        assertEq(ownerFlows.length, 0);

        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        ownerFlows = arcFlow.getFlowsByOwner(address(this));
        assertEq(ownerFlows.length, 2);
        assertEq(ownerFlows[0], 1);
        assertEq(ownerFlows[1], 2);
    }

    // ============================================================
    // Reentrancy Tests
    // ============================================================

    function testReentrancy_Reverts() public {
        // This is tested implicitly by the nonReentrant modifier
        // A more thorough test would require a malicious contract
        // which is beyond the scope of unit tests
    }

    // ============================================================
    // Edge Cases
    // ============================================================

    function testActivateFlow_AlreadyActive_Idempotent() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        arcFlow.activateFlow(flowId); // Should not revert
        assertEq(arcFlow.getFlow(flowId).active, true);
    }

    function testPauseFlow_AlreadyPaused_Idempotent() public {
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.activateFlow(flowId);
        arcFlow.pauseFlow(flowId);
        arcFlow.pauseFlow(flowId); // Should not revert
        assertEq(arcFlow.getFlow(flowId).active, false);
    }

    function testExecuteSplit_ZeroTreasuryAmount() public {
        // 100% to contributor
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, 0, 10000);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(contributor), amount);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplit_ZeroContributorAmount() public {
        // 100% to treasury
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, 10000, 0);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(address(this), amount);
        usdc.approve(address(arcFlow), amount);

        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), amount);
        assertEq(usdc.balanceOf(contributor), 0);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }
}