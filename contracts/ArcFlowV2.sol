// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "lib/openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "lib/openzeppelin-contracts/access/Ownable.sol";
import {ReentrancyGuard} from "lib/openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "lib/openzeppelin-contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ArcFlowV2
 * @notice Non-custodial programmable USDC workflow executor for Arc mainnet with EIP-3009 authorization support.
 * @dev A single contract manages multiple flows. Each flow splits incoming USDC
 *      between a treasury and contributor address according to configured basis points.
 *      Supports optional sign-to-auto-execute via EIP-3009 authorization.
 */

interface IUSDC is IERC20 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool);

    // NOTE: deliberately NO safeTransfer/safeTransferFrom declarations here.
    // The real Arc USDC does not implement them (Phase 10.9 read-only probe:
    // unbound selectors, empty revert). Declaring them would shadow the
    // SafeERC20 library attached below and emit direct external calls that
    // always revert on mainnet. With this interface inheriting IERC20, the
    // `using SafeERC20 for IERC20` attachment applies to `usdc` expressions,
    // so safeTransfer/safeTransferFrom correctly wrap `transfer`/`transferFrom`.

    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcFlowV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    // Constants
    // ============================================================
    uint16 public constant BASIS_POINTS_DENOMINATOR = 10000;

    // EIP-712 Type Hash
    bytes32 public constant EXECUTE_TYPEHASH = keccak256(
        "ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    // EIP-712 Domain Separator
    function getDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("ArcFlow")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ============================================================
    // State
    // ============================================================
    IUSDC public immutable usdc;

    struct Flow {
        address owner;
        address treasury;
        address contributor;
        uint16 treasuryBps;
        uint16 contributorBps;
        uint256 threshold;
        bool active;
        bool autoExecute;
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
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error InvalidAuthorization(string reason);

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

    event AutoExecuteToggled(
        uint256 indexed flowId,
        bool enabled
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
        usdc = IUSDC(_usdc);
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
        Flow memory newFlow = Flow({
            owner: msg.sender,
            treasury: treasury,
            contributor: contributor,
            treasuryBps: treasuryBps,
            contributorBps: contributorBps,
            threshold: threshold,
            active: false,
            autoExecute: false
        });
        flows.push(newFlow);

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

    /**
     * @notice Toggles auto-execute (sign-to-auto-execute) for a flow.
     * @param flowId The flow to toggle.
     */
    function toggleAutoExecute(uint256 flowId) external {
        _requireFlowOwner(flowId);
        Flow storage flow = flows[flowId];
        flow.autoExecute = !flow.autoExecute;
        emit AutoExecuteToggled(flowId, flow.autoExecute);
    }

    // ============================================================
    // Execution
    // ============================================================
    /**
     * @notice Executes a USDC split for the specified flow with dual EIP-712/EIP-3009 authorization.
     * @dev Relayer can call this function. Authorization comes from dual signatures.
     *      All amounts are in USDC base units (6 decimals) as exposed by the ERC-20
     *      interface. Arc's native USDC ledger tracks 18-decimal protocol balances;
     *      the 1e12 conversion is performed entirely inside the USDC contract
     *      (transferWithAuthorization of 1e7 base units executes a 1e19 native
     *      system transfer). This contract never handles 18-decimal values.
     * @param flowId The flow to execute.
     * @param amount USDC amount in base units (6 decimals).
     * @param flowValidAfter ArcFlow authorization valid after timestamp.
     * @param flowValidBefore ArcFlow authorization valid before timestamp.
     * @param flowNonce ArcFlow authorization nonce.
     * @param flowV ArcFlow EIP-712 signature v.
     * @param flowR ArcFlow EIP-712 signature r.
     * @param flowS ArcFlow EIP-712 signature s.
     * @param usdcValidAfter USDC EIP-3009 valid after timestamp. MUST be strictly
     *        below the execution timestamp — the real Arc USDC requires
     *        block.timestamp > validAfter (0 is always safe).
     * @param usdcValidBefore USDC EIP-3009 valid before timestamp. Must be strictly
     *        above the execution timestamp.
     * @param usdcNonce USDC EIP-3009 nonce (single-use; replay-gated by USDC).
     * @param usdcV USDC EIP-3009 signature v.
     * @param usdcR USDC EIP-3009 signature r.
     * @param usdcS USDC EIP-3009 signature s.
     */
    function executeSplitWithDualAuth(
        uint256 flowId,
        uint256 amount,
        uint256 flowValidAfter,
        uint256 flowValidBefore,
        bytes32 flowNonce,
        uint8 flowV,
        bytes32 flowR,
        bytes32 flowS,
        uint256 usdcValidAfter,
        uint256 usdcValidBefore,
        bytes32 usdcNonce,
        uint8 usdcV,
        bytes32 usdcR,
        bytes32 usdcS
    ) external nonReentrant {
        // NO owner check - relayer can call this function
        // Authorization comes from cryptographic signatures

        if (flowId >= flows.length) revert FlowNotFound(flowId);
        Flow storage flow = flows[flowId];
        if (!flow.active) revert FlowInactive(flowId);
        if (amount < flow.threshold) revert AmountBelowThreshold(amount, flow.threshold);

        // Validate deadlines
        if (block.timestamp < flowValidAfter || block.timestamp > flowValidBefore) {
            revert AuthorizationExpired();
        }

        // 1. Verify ArcFlow EIP-712 authorization
        _verifyArcFlowAuthorization(flow, flowId, amount, flowValidAfter, flowValidBefore, flowNonce, flowV, flowR, flowS);

        // 2. Verify USDC EIP-3009 authorization
        _verifyUSDCAuthorization(flow.owner, address(this), amount, usdcValidAfter, usdcValidBefore, usdcNonce, usdcV, usdcR, usdcS);

        // 3. ATOMIC: Pull USDC from owner → ArcFlowV2 via EIP-3009.
        // Real USDC reverts on failure (verified on-fork: auth-window and
        // balance errors are reverts, not false returns); the return check
        // additionally guards against non-standard silent-failure tokens.
        bool pulled = usdc.transferWithAuthorization(
            flow.owner,
            address(this),
            amount,
            usdcValidAfter,
            usdcValidBefore,
            usdcNonce,
            usdcV,
            usdcR,
            usdcS
        );
        if (!pulled) revert TransferFailed("USDC transferWithAuthorization returned false");

        // 4. Split & distribute
        uint256 treasuryAmount = (amount * flow.treasuryBps) / BASIS_POINTS_DENOMINATOR;
        uint256 contributorAmount = amount - treasuryAmount;

        if (treasuryAmount > 0) {
            SafeERC20.safeTransfer(IERC20(address(usdc)), flow.treasury, treasuryAmount);
        }

        if (contributorAmount > 0) {
            SafeERC20.safeTransfer(IERC20(address(usdc)), flow.contributor, contributorAmount);
        }

        emit FlowExecuted(flowId, flow.owner, amount, treasuryAmount, contributorAmount);
    }

    /**
     * @notice Executes a USDC split for the specified flow (manual execution).
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
        uint256 treasuryAmount = (amount * flow.treasuryBps) / BASIS_POINTS_DENOMINATOR;
        uint256 contributorAmount = amount - treasuryAmount;

        // Pull USDC from owner
        SafeERC20.safeTransferFrom(IERC20(address(usdc)), flow.owner, address(this), amount);

        // Distribute to recipients
        if (treasuryAmount > 0) {
            SafeERC20.safeTransfer(IERC20(address(usdc)), flow.treasury, treasuryAmount);
        }

        if (contributorAmount > 0) {
            SafeERC20.safeTransfer(IERC20(address(usdc)), flow.contributor, contributorAmount);
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

    function _verifyArcFlowAuthorization(
        Flow storage flow,
        uint256 flowId,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        // Verify deadlines
        if (block.timestamp < validAfter || block.timestamp > validBefore) {
            revert AuthorizationExpired();
        }

        // Verify ArcFlow EIP-712 signature
        bytes32 digest = _hashFlowAuthorization(flowId, amount, validAfter, validBefore, nonce);
        address recovered = _ecrecover(digest, v, r, s);
        if (recovered != flow.owner) {
            revert InvalidAuthorization("ArcFlow: invalid owner signature");
        }
    }

    function _ecrecover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
        // Use ECDSA.tryRecover which returns error instead of reverting
        (address recovered, ECDSA.RecoverError error, bytes32 errorArg) = ECDSA.tryRecover(digest, v, r, s);
        if (error != ECDSA.RecoverError.NoError) {
            return address(0);
        }
        return recovered;
    }

    function _hashFlowAuthorization(
        uint256 flowId,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (bytes32) {
        // Compute full EIP-712 digest: keccak256("\x19\x01" || domainSeparator || structHash)
        bytes32 structHash = keccak256(abi.encode(
            EXECUTE_TYPEHASH,
            flowId,
            amount,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 domainSeparator = getDomainSeparator();

        return keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
    }

    // EIP-712 Domain Separator for Arc USDC (verified on-chain)
    // keccak256(abi.encode(
    //   keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    //   keccak256("USDC"),
    //   keccak256("2"),
    //   5042,
    //   0x3600000000000000000000000000000000000000
    // ))
    bytes32 private constant USDC_DOMAIN_SEPARATOR = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84;

    // Standard EIP-3009 TransferWithAuthorization typehash
    // keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 private constant USDC_TRANSFER_TYPEHASH = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267;

    function _verifyUSDCAuthorization(
        address expectedFrom,
        address expectedTo,
        uint256 expectedValue,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        // Verify deadlines with STRICT inequalities mirroring the real Arc USDC
        // (Phase 10.8 on-fork evidence: validAfter == block.timestamp reverts
        // "FiatTokenV2: authorization is not yet valid"; Circle's EIP-3009 uses
        // block.timestamp > validAfter && block.timestamp < validBefore). Using
        // the loose >=/<= here would let this pre-check accept signatures that
        // USDC then rejects. usdcValidAfter = 0 is always safe.
        if (block.timestamp <= validAfter) {
            revert AuthorizationNotYetValid();
        }
        if (block.timestamp >= validBefore) {
            revert AuthorizationExpired();
        }

        // Compute EIP-712 digest for USDC transferWithAuthorization
        bytes32 structHash = keccak256(abi.encode(
            USDC_TRANSFER_TYPEHASH,
            expectedFrom,
            expectedTo,
            expectedValue,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            USDC_DOMAIN_SEPARATOR,
            structHash
        ));

        address recovered = _ecrecover(digest, v, r, s);
        if (recovered != expectedFrom) {
            revert InvalidAuthorization("USDC: invalid owner signature");
        }
    }

    // ============================================================
    // Rescue (for accidental token sends)
    // ============================================================
    function rescueERC20(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(usdc)) revert TransferFailed("Cannot rescue USDC via rescueERC20");
        token.safeTransfer(to, amount);
    }
}
