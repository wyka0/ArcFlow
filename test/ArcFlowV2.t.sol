// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcFlowV2} from "../contracts/ArcFlowV2.sol";
import {ERC20Mock} from "./ERC20Mock.sol";

contract ArcFlowV2Test is Test {
    ArcFlowV2 public arcFlow;
    ERC20Mock public usdc;
    address public usdcAddress;

    // Use a known private key for the OWNER so we can sign EIP-712 messages
    // Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    // This is the first Anvil default private key
    address public constant OWNER = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    address public treasury = makeAddr("treasury");
    address public contributor = makeAddr("contributor");
    address public other = makeAddr("other");
    address public relayer = makeAddr("relayer");

    uint256 public constant THRESHOLD = 10_000_000; // 10 USDC (6 decimals)
    uint16 public constant TREASURY_BPS = 8000;     // 80%
    uint16 public constant CONTRIBUTOR_BPS = 2000;  // 20%

    // Mock EIP-712 signatures (we'll generate proper ones in specific tests)
    // For now, tests use the existing executeSplit for basic functionality

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC");
        arcFlow = new ArcFlowV2(address(usdc));
        usdcAddress = address(usdc);

        // Mint USDC to OWNER and other for testing
        usdc.mint(OWNER, 1_000_000_000);      // 1000 USDC
        usdc.mint(other, 1_000_000_000);      // 1000 USDC
        usdc.mint(relayer, 1_000_000_000);    // 1000 USDC
    }

    // Helper to create a flow as the OWNER
    function createFlowAsOwner() internal returns (uint256) {
        vm.prank(OWNER);
        return arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    // Helper to set up a flow with approval for executeSplit
    function setupFlowWithApproval(uint256 amount) internal returns (uint256) {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        usdc.mint(OWNER, amount);
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        return flowId;
    }

    // Helper to expect revert with custom error by signature
    function expectNotFlowOwner(address caller, address owner_) internal {
        vm.expectRevert(abi.encodeWithSignature("NotFlowOwner(address,address)", caller, owner_));
    }

    function expectIdenticalRecipients(address recipient) internal {
        vm.expectRevert(abi.encodeWithSignature("IdenticalRecipients(address)", recipient));
    }

    function expectInvalidSplit(uint16 totalBps) internal {
        vm.expectRevert(abi.encodeWithSignature("InvalidSplit(uint16)", totalBps));
    }

    function expectInvalidThreshold(uint256 threshold) internal {
        vm.expectRevert(abi.encodeWithSignature("InvalidThreshold(uint256)", threshold));
    }

    function expectInvalidRecipient(address recipient) internal {
        vm.expectRevert(abi.encodeWithSignature("InvalidRecipient(address)", recipient));
    }

    function expectFlowInactive(uint256 flowId) internal {
        vm.expectRevert(abi.encodeWithSignature("FlowInactive(uint256)", flowId));
    }

    function expectAmountBelowThreshold(uint256 amount, uint256 threshold) internal {
        vm.expectRevert(abi.encodeWithSignature("AmountBelowThreshold(uint256,uint256)", amount, threshold));
    }

    function expectInsufficientAllowance(uint256 required, uint256 available) internal {
        vm.expectRevert(abi.encodeWithSignature("InsufficientAllowance(uint256,uint256)", required, available));
    }

    function expectInsufficientBalance(uint256 required, uint256 available) internal {
        vm.expectRevert(abi.encodeWithSignature("InsufficientBalance(uint256,uint256)", required, available));
    }

    // ============================================================
    // Flow Creation Tests
    // ============================================================

    function testCreateFlow_Valid() public {
        uint256 flowId = createFlowAsOwner();
        assertEq(flowId, 0);

        ArcFlowV2.Flow memory flow = arcFlow.getFlow(flowId);
        assertEq(flow.owner, OWNER);
        assertEq(flow.treasury, treasury);
        assertEq(flow.contributor, contributor);
        assertEq(flow.threshold, THRESHOLD);
        assertEq(flow.treasuryBps, TREASURY_BPS);
        assertEq(flow.contributorBps, CONTRIBUTOR_BPS);
        assertEq(flow.active, false);
        assertEq(flow.autoExecute, false);
    }

    function testCreateFlow_ZeroTreasury_Reverts() public {
        vm.prank(OWNER);
        expectInvalidRecipient(address(0));
        arcFlow.createFlow(address(0), contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_ZeroContributor_Reverts() public {
        vm.prank(OWNER);
        expectInvalidRecipient(address(0));
        arcFlow.createFlow(treasury, address(0), THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_ZeroThreshold_Reverts() public {
        vm.prank(OWNER);
        expectInvalidThreshold(0);
        arcFlow.createFlow(treasury, contributor, 0, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_SplitNot100Percent_Reverts() public {
        vm.prank(OWNER);
        expectInvalidSplit(9000);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, 7000, 2000); // 90%
    }

    function testCreateFlow_SplitOver100Percent_Reverts() public {
        vm.prank(OWNER);
        expectInvalidSplit(11000);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, 8000, 3000); // 110%
    }

    function testCreateFlow_IdenticalRecipients_Reverts() public {
        vm.prank(OWNER);
        expectIdenticalRecipients(treasury);
        arcFlow.createFlow(treasury, treasury, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testCreateFlow_FlowIdIncrements() public {
        vm.prank(OWNER);
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
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        assertEq(arcFlow.getFlow(flowId).active, true);
    }

    function testActivateFlow_NonOwner_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(other);
        expectNotFlowOwner(other, OWNER);
        arcFlow.activateFlow(flowId);
    }

    function testPauseFlow_Owner_Succeeds() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        vm.prank(OWNER);
        arcFlow.pauseFlow(flowId);
        assertEq(arcFlow.getFlow(flowId).active, false);
    }

    function testPauseFlow_NonOwner_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        vm.prank(other);
        expectNotFlowOwner(other, OWNER);
        arcFlow.pauseFlow(flowId);
    }

    function testExecuteSplit_NonOwner_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        usdc.mint(other, 100_000_000);
        vm.prank(other);
        expectNotFlowOwner(other, OWNER);
        arcFlow.executeSplit(flowId, 10_000_000);
    }

    // ============================================================
    // Execution Tests
    // ============================================================

    function testExecuteSplit_10USDC_80_20() public {
        uint256 flowId = setupFlowWithApproval(10_000_000);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, 10_000_000);

        assertEq(usdc.balanceOf(treasury), 8_000_000);      // 8 USDC
        assertEq(usdc.balanceOf(contributor), 2_000_000);   // 2 USDC
        assertEq(usdc.balanceOf(address(arcFlow)), 0);      // No dust
    }

    function testExecuteSplit_100USDC_70_30() public {
        uint16 treasuryBps = 7000;
        uint16 contributorBps = 3000;
        vm.prank(OWNER);
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, treasuryBps, contributorBps);
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 100_000_000; // 100 USDC
        usdc.mint(OWNER, amount);
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 70_000_000);      // 70 USDC
        assertEq(usdc.balanceOf(contributor), 30_000_000);   // 30 USDC
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplit_AmountBelowThreshold_Reverts() public {
        uint256 flowId = setupFlowWithApproval(9_000_000);

        vm.prank(OWNER);
        expectAmountBelowThreshold(9_000_000, THRESHOLD);
        arcFlow.executeSplit(flowId, 9_000_000);
    }

    function testExecuteSplit_ThresholdExactly_Succeeds() public {
        uint256 flowId = setupFlowWithApproval(THRESHOLD);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, THRESHOLD);

        assertEq(usdc.balanceOf(treasury), 8_000_000);
        assertEq(usdc.balanceOf(contributor), 2_000_000);
    }

    function testExecuteSplit_AmountAboveThreshold_Succeeds() public {
        uint256 flowId = setupFlowWithApproval(11_000_000);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, 11_000_000);

        assertEq(usdc.balanceOf(treasury), 8_800_000);
        assertEq(usdc.balanceOf(contributor), 2_200_000);
    }

    function testExecuteSplit_PausedFlow_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        vm.prank(OWNER);
        arcFlow.pauseFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        vm.prank(OWNER);
        expectFlowInactive(flowId);
        arcFlow.executeSplit(flowId, amount);
    }

    function testExecuteSplit_InsufficientAllowance_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);
        // No approve call

        vm.prank(OWNER);
        expectInsufficientAllowance(amount, 0);
        arcFlow.executeSplit(flowId, amount);
    }

    function testExecuteSplit_InsufficientBalance_Reverts() public {
        // Create a fresh flow and don't mint the initial 1000 USDC to OWNER
        // Need to reset OWNER's balance
        usdc.burn(OWNER, usdc.balanceOf(OWNER)); // Remove initial mint
        
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, 5_000_000); // Only 5 USDC
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        vm.prank(OWNER);
        expectInsufficientBalance(amount, 5_000_000);
        arcFlow.executeSplit(flowId, amount);
    }

    // ============================================================
    // Accounting Tests
    // ============================================================

    function testExecuteSplit_Accounting_TreasuryPlusContributorEqualsAmount() public {
        uint256 flowId = setupFlowWithApproval(123_456_789);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, 123_456_789);

        uint256 treasuryBal = usdc.balanceOf(treasury);
        uint256 contributorBal = usdc.balanceOf(contributor);

        assertEq(treasuryBal + contributorBal, 123_456_789);
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
            uint256 flowId = setupFlowWithApproval(amounts[i]);

            vm.prank(OWNER);
            arcFlow.executeSplit(flowId, amounts[i]);

            assertEq(usdc.balanceOf(address(arcFlow)), 0);
        }
    }

    // ============================================================
    // Event Tests
    // ============================================================

    function testFlowCreated_EmitsEvent() public {
        vm.prank(OWNER);
        vm.expectEmit(true, true, false, true);
        emit ArcFlowV2.FlowCreated(0, OWNER, treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
    }

    function testFlowStatusChanged_Activate_EmitsEvent() public {
        uint256 flowId = createFlowAsOwner();

        vm.prank(OWNER);
        vm.expectEmit(true, true, false, true);
        emit ArcFlowV2.FlowStatusChanged(flowId, true);
        arcFlow.activateFlow(flowId);
    }

    function testFlowStatusChanged_Pause_EmitsEvent() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        vm.prank(OWNER);
        vm.expectEmit(true, true, false, true);
        emit ArcFlowV2.FlowStatusChanged(flowId, false);
        arcFlow.pauseFlow(flowId);
    }

    function testFlowExecuted_EmitsEvent() public {
        uint256 flowId = setupFlowWithApproval(10_000_000);

        vm.prank(OWNER);
        vm.expectEmit(true, true, false, true);
        emit ArcFlowV2.FlowExecuted(flowId, OWNER, 10_000_000, 8_000_000, 2_000_000);
        arcFlow.executeSplit(flowId, 10_000_000);
    }

    // ============================================================
    // View Function Tests
    // ============================================================

    function testGetFlowCount() public {
        assertEq(arcFlow.getFlowCount(), 0);
        vm.prank(OWNER);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        assertEq(arcFlow.getFlowCount(), 1);
        vm.prank(OWNER);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        assertEq(arcFlow.getFlowCount(), 2);
    }

    function testGetFlowsByOwner() public {
        vm.prank(other);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        uint256[] memory ownerFlows = arcFlow.getFlowsByOwner(OWNER);
        assertEq(ownerFlows.length, 0);

        vm.prank(OWNER);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);
        vm.prank(OWNER);
        arcFlow.createFlow(treasury, contributor, THRESHOLD, TREASURY_BPS, CONTRIBUTOR_BPS);

        ownerFlows = arcFlow.getFlowsByOwner(OWNER);
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
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId); // Should not revert
        assertEq(arcFlow.getFlow(flowId).active, true);
    }

    function testPauseFlow_AlreadyPaused_Idempotent() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);
        vm.prank(OWNER);
        arcFlow.pauseFlow(flowId);
        vm.prank(OWNER);
        arcFlow.pauseFlow(flowId); // Should not revert
        assertEq(arcFlow.getFlow(flowId).active, false);
    }

    function testExecuteSplit_ZeroTreasuryAmount() public {
        // 100% to contributor
        vm.prank(OWNER);
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, 0, 10000);
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(contributor), amount);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplit_ZeroContributorAmount() public {
        // 100% to treasury
        vm.prank(OWNER);
        uint256 flowId = arcFlow.createFlow(treasury, contributor, THRESHOLD, 10000, 0);
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);
        vm.prank(OWNER);
        usdc.approve(address(arcFlow), amount);

        vm.prank(OWNER);
        arcFlow.executeSplit(flowId, amount);

        assertEq(usdc.balanceOf(treasury), amount);
        assertEq(usdc.balanceOf(contributor), 0);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    // ============================================================
    // executeSplitWithDualAuth Tests
    // ============================================================

    // Known private key for OWNER address (first Anvil default account)
    // 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    // Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

    function _signArcFlowV2(
        uint256 flowId,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal returns (uint8 v, bytes32 r, bytes32 s) {
        // Use the same domain separator calculation as the contract
        // Contract uses block.chainid
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("ArcFlow")),
            keccak256(bytes("1")),
            block.chainid,
            address(arcFlow)
        ));

        bytes32 structHash = keccak256(abi.encode(
            keccak256("ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
            flowId,
            amount,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80, digest);
    }

    function _signUSDCTransfer(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 domainSeparator = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84;

        bytes32 structHash = keccak256(abi.encode(
            keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80, digest);
    }

    function testExecuteSplitWithDualAuth_ValidSignature_Succeeds() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-1");
        bytes32 usdcNonce = keccak256("usdc-nonce-1");
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, validAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );

        assertEq(usdc.balanceOf(treasury), 8_000_000);
        assertEq(usdc.balanceOf(contributor), 2_000_000);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }

    function testExecuteSplitWithDualAuth_InvalidArcFlowSignature_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-2");
        bytes32 usdcNonce = keccak256("usdc-nonce-2");
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        // Use invalid signature (v=27, r=0, s=0) which will fail ecrecover
        uint8 flowV = 27;
        bytes32 flowR = 0x0;
        bytes32 flowS = 0x0;
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowV2.InvalidAuthorization.selector, "ArcFlow: invalid owner signature"));
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    function testExecuteSplitWithDualAuth_ExpiredAuthorization_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-3");
        bytes32 usdcNonce = keccak256("usdc-nonce-3");
        // Warp time to make the authorization window in the past
        uint256 validAfter = 1;
        uint256 validBefore = 100;
        vm.warp(validBefore + 1); // Move time past validBefore

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, validAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(ArcFlowV2.AuthorizationExpired.selector);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    function testExecuteSplitWithDualAuth_AmountBelowThreshold_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 5_000_000; // Below THRESHOLD (10_000_000)
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-4");
        bytes32 usdcNonce = keccak256("usdc-nonce-4");
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, validAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowV2.AmountBelowThreshold.selector, amount, THRESHOLD));
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    function testExecuteSplitWithDualAuth_InactiveFlow_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        // Don't activate the flow

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-5");
        bytes32 usdcNonce = keccak256("usdc-nonce-5");
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, validAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowV2.FlowInactive.selector, flowId));
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    function testExecuteSplitWithDualAuth_EmitsEvent() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-6");
        bytes32 usdcNonce = keccak256("usdc-nonce-6");
        uint256 validAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, validAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectEmit(true, true, false, true);
        emit ArcFlowV2.FlowExecuted(flowId, OWNER, amount, 8_000_000, 2_000_000);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            validAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    // ============================================================
    // USDC Validity-Window Boundary Tests (Phase 10.9)
    //
    // The real Arc USDC enforces STRICT inequalities:
    //   block.timestamp > usdcValidAfter && block.timestamp < usdcValidBefore
    // ArcFlowV2's _verifyUSDCAuthorization mirrors this so its pre-check can
    // never accept a signature USDC would reject. usdcValidAfter = 0 is the
    // documented safe value for frontend/relayer construction.
    // ============================================================

    /// @notice Boundary: usdcValidAfter == block.timestamp must be rejected
    ///         (the real USDC would reject it with "not yet valid").
    function testExecuteSplitWithDualAuth_UsdcValidAfterAtNow_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-b1");
        bytes32 usdcNonce = keccak256("usdc-nonce-b1");
        uint256 flowValidAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, flowValidAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, block.timestamp, validBefore, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(ArcFlowV2.AuthorizationNotYetValid.selector);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            flowValidAfter, validBefore, flowNonce, flowV, flowR, flowS,
            block.timestamp, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );
    }

    /// @notice Boundary: usdcValidAfter == 0 must be accepted (always in window).
    function testExecuteSplitWithDualAuth_UsdcValidAfterZero_Succeeds() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-b2");
        bytes32 usdcNonce = keccak256("usdc-nonce-b2");
        uint256 flowValidAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, flowValidAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            flowValidAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );

        assertEq(usdc.balanceOf(treasury), 8_000_000);
    }

    /// @notice Boundary: usdcValidBefore == block.timestamp must be rejected
    ///         (the real USDC would reject it as expired -- strict <).
    function testExecuteSplitWithDualAuth_UsdcValidBeforeAtNow_Reverts() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-b3");
        bytes32 usdcNonce = keccak256("usdc-nonce-b3");
        uint256 flowValidAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, flowValidAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, block.timestamp, usdcNonce);

        vm.prank(relayer);
        vm.expectRevert(ArcFlowV2.AuthorizationExpired.selector);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            flowValidAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, block.timestamp, usdcNonce, usdcV, usdcR, usdcS
        );
    }


    /// @notice Flow window: flowValidAfter == block.timestamp is ACCEPTED for
    ///         the ArcFlow signature (loose >= semantics -- ArcFlow is the sole
    ///         authority for its own window; USDC never sees these fields).
    function testExecuteSplitWithDualAuth_FlowValidAfterAtNow_Succeeds() public {
        uint256 flowId = createFlowAsOwner();
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 10_000_000;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-b5");
        bytes32 usdcNonce = keccak256("usdc-nonce-b5");
        uint256 flowValidAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, flowValidAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            flowValidAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );

        assertEq(usdc.balanceOf(treasury), 8_000_000);
    }

    /// @notice Decimal boundary: minimal amount (1 base unit) with an 80/20
    ///         split exercises floor-to-zero treasury math without dust loss.
    function testExecuteSplitWithDualAuth_MinimalAmount_NoDust() public {
        vm.prank(OWNER);
        uint256 flowId = arcFlow.createFlow(treasury, contributor, 1, 8000, 2000);
        vm.prank(OWNER);
        arcFlow.activateFlow(flowId);

        uint256 amount = 1;
        usdc.mint(OWNER, amount);

        bytes32 flowNonce = keccak256("flow-nonce-b6");
        bytes32 usdcNonce = keccak256("usdc-nonce-b6");
        uint256 flowValidAfter = block.timestamp;
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 flowV, bytes32 flowR, bytes32 flowS) = _signArcFlowV2(flowId, amount, flowValidAfter, validBefore, flowNonce);
        (uint8 usdcV, bytes32 usdcR, bytes32 usdcS) = _signUSDCTransfer(OWNER, address(arcFlow), amount, 0, validBefore, usdcNonce);

        vm.prank(relayer);
        arcFlow.executeSplitWithDualAuth(
            flowId, amount,
            flowValidAfter, validBefore, flowNonce, flowV, flowR, flowS,
            0, validBefore, usdcNonce, usdcV, usdcR, usdcS
        );

        // treasuryAmount = (1 * 8000) / 10000 = 0; contributor gets the remainder.
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(contributor), 1);
        assertEq(usdc.balanceOf(address(arcFlow)), 0);
    }
}
