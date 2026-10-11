// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcFlow
 * @notice Non-custodial programmable USDC workflow executor for Arc mainnet.
 * @dev A single contract manages multiple flows. Each flow splits incoming USDC
 *      between a treasury and contributor address according to configured basis points.
 *      Only the flow owner can activate/pause/execute their flow.
 */
contract ArcFlow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    // Constants
    // ============================================================
    uint16 public constant BASIS_POINTS_DENOMINATOR = 10000;

    // ============================================================
    // State
    // ============================================================
    IERC20 public immutable usdc;

    struct Flow {
        address owner;
        address treasury;
        address contributor;
        uint16 treasuryBps;
        uint16 contributorBps;
        uint256 threshold;
        bool active;
    }

    Flow[] public flows;

    // ============================================================
    // Errors
    // ============================================================
    error InvalidRecipient(address recipient);
    error InvalidThreshold(uint256 threshold);
    error InvalidSplit(uint16 totalBps);
    error IdenticalRecipients(address recipient);
    error FlowNotFound(uint256 flowId);
    error NotFlowOwner(address caller, address owner);
    error FlowInactive(uint256 flowId);
    error AmountBelowThreshold(uint256 amount, uint256 threshold);
    error TransferFailed(string reason);
    error InsufficientAllowance(uint256 required, uint256 available);
    error InsufficientBalance(uint256 required, uint256 available);

    // ============================================================
    // Events
    // ============================================================
    event FlowCreated(
        uint256 indexed flowId,
        address indexed owner,
        address treasury,
        address contributor,
        uint256 threshold,
        uint16 treasuryBps,
        uint16 contributorBps
    );

    event FlowStatusChanged(
        uint256 indexed flowId,
        bool active
    );

    event FlowExecuted(
        uint256 indexed flowId,
        address indexed owner,
        uint256 amount,
        uint256 treasuryAmount,
        uint256 contributorAmount
    );

    // ============================================================
    // Constructor
    // ============================================================
    constructor(address _usdc) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidRecipient(address(0));
        usdc = IERC20(_usdc);
    }

    // ============================================================
    // Flow Creation
    // ============================================================
    /**
     * @notice Creates a new USDC split flow.
     * @param treasury Recipient for treasury portion.
     * @param contributor Recipient for contributor portion.
     * @param threshold Minimum USDC amount (6 decimals) required to execute.
     * @param treasuryBps Treasury allocation in basis points (10000 = 100%).
     * @param contributorBps Contributor allocation in basis points (10000 = 100%).
     * @return flowId The monotonically increasing flow identifier.
     */
    function createFlow(
        address treasury,
        address contributor,
        uint256 threshold,
        uint16 treasuryBps,
        uint16 contributorBps
    ) external returns (uint256 flowId) {
        if (treasury == address(0)) revert InvalidRecipient(treasury);
        if (contributor == address(0)) revert InvalidRecipient(contributor);
        if (treasury == contributor) revert IdenticalRecipients(treasury);
        if (threshold == 0) revert InvalidThreshold(threshold);

        uint16 totalBps = treasuryBps + contributorBps;
        if (totalBps != BASIS_POINTS_DENOMINATOR) revert InvalidSplit(totalBps);

        flowId = flows.length;
        flows.push(Flow({
            owner: msg.sender,
            treasury: treasury,
            contributor: contributor,
            treasuryBps: treasuryBps,
            contributorBps: contributorBps,
            threshold: threshold,
            active: false // Starts inactive; owner must explicitly activate
        }));

        emit FlowCreated(flowId, msg.sender, treasury, contributor, threshold, treasuryBps, contributorBps);
    }

    // ============================================================
    // Flow Status Management
    // ============================================================
    /**
     * @notice Activates a flow for execution.
     * @param flowId The flow to activate.
     */
    function activateFlow(uint256 flowId) external {
        _requireFlowOwner(flowId);
        Flow storage flow = flows[flowId];
        if (flow.active) return; // Idempotent
        flow.active = true;
        emit FlowStatusChanged(flowId, true);
    }

    /**
     * @notice Pauses a flow, preventing further execution.
     * @param flowId The flow to pause.
     */
    function pauseFlow(uint256 flowId) external {
        _requireFlowOwner(flowId);
        Flow storage flow = flows[flowId];
        if (!flow.active) return; // Idempotent
        flow.active = false;
        emit FlowStatusChanged(flowId, false);
    }

    // ============================================================
    // Execution
    // ============================================================
    /**
     * @notice Executes a USDC split for the specified flow.
     * @dev Pulls `amount` USDC from the caller (must be flow owner),
     *      splits according to configured basis points, and transfers to recipients.
     * @param flowId The flow to execute.
     * @param amount USDC amount in base units (6 decimals).
     */
    function executeSplit(uint256 flowId, uint256 amount) external nonReentrant {
        _requireFlowOwner(flowId);
        Flow storage flow = flows[flowId];

        if (!flow.active) revert FlowInactive(flowId);
        if (amount < flow.threshold) revert AmountBelowThreshold(amount, flow.threshold);

        // Check allowance
        uint256 allowance = usdc.allowance(flow.owner, address(this));
        if (allowance < amount) revert InsufficientAllowance(amount, allowance);

        // Check balance
        uint256 balance = usdc.balanceOf(flow.owner);
        if (balance < amount) revert InsufficientBalance(amount, balance);

        // Calculate split: treasury gets the calculated amount, contributor gets the remainder
        // This ensures no dust is left in the contract
        uint256 treasuryAmount = (amount * flow.treasuryBps) / BASIS_POINTS_DENOMINATOR;
        uint256 contributorAmount = amount - treasuryAmount;

        // Pull USDC from owner
        usdc.safeTransferFrom(flow.owner, address(this), amount);

        // Distribute to recipients
        if (treasuryAmount > 0) {
            usdc.safeTransfer(flow.treasury, treasuryAmount);
        }

        if (contributorAmount > 0) {
            usdc.safeTransfer(flow.contributor, contributorAmount);
        }

        emit FlowExecuted(flowId, flow.owner, amount, treasuryAmount, contributorAmount);
    }

    // ============================================================
    // View Functions
    // ============================================================
    function getFlow(uint256 flowId) external view returns (Flow memory) {
        if (flowId >= flows.length) revert FlowNotFound(flowId);
        return flows[flowId];
    }

    function getFlowCount() external view returns (uint256) {
        return flows.length;
    }

    function getFlowsByOwner(address owner) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < flows.length; i++) {
            if (flows[i].owner == owner) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < flows.length; i++) {
            if (flows[i].owner == owner) {
                result[idx] = i;
                idx++;
            }
        }
        return result;
    }

    // ============================================================
    // Internal
    // ============================================================
    function _requireFlowOwner(uint256 flowId) internal view {
        if (flowId >= flows.length) revert FlowNotFound(flowId);
        if (flows[flowId].owner != msg.sender) revert NotFlowOwner(msg.sender, flows[flowId].owner);
    }

    // ============================================================
    // Rescue (for accidental token sends)
    // ============================================================
    function rescueERC20(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (token == usdc) revert TransferFailed("Cannot rescue USDC via rescueERC20");
        token.safeTransfer(to, amount);
    }
}