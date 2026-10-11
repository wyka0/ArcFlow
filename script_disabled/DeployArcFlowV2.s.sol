// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcFlowV2} from "../contracts/ArcFlowV2.sol";

error WrongChainId(uint256 expected, uint256 actual);

contract DeployArcFlowV2 is Script {
    uint256 public constant EXPECTED_CHAIN_ID = 5042;

    function run() external returns (ArcFlowV2 arcFlowV2) {
        // Fail-closed chain guard: revert immediately if not on Arc mainnet.
        // This MUST be the first check — it prevents any deployment, broadcast,
        // or state change on the wrong chain.
        _verifyChainId();

        // Read configuration from environment variables
        string memory arcRpcUrl = vm.envString("ARC_RPC_URL");
        string memory deployerPrivateKey = vm.envString("DEPLOYER_PRIVATE_KEY");
        string memory usdcAddressStr = vm.envString("ARC_USDC_ADDRESS");

        // Validate required environment variables
        if (bytes(arcRpcUrl).length == 0) {
            console.log("ERROR: ARC_RPC_URL environment variable not set");
            console.log("Usage: forge script script_disabled/DeployArcFlowV2.s.sol --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast");
            assert(false);
        }

        if (bytes(deployerPrivateKey).length == 0) {
            console.log("ERROR: DEPLOYER_PRIVATE_KEY environment variable not set");
            console.log("Usage: forge script script_disabled/DeployArcFlowV2.s.sol --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast");
            assert(false);
        }

        if (bytes(usdcAddressStr).length == 0) {
            console.log("ERROR: ARC_USDC_ADDRESS environment variable not set");
            console.log("Expected: 0x3600000000000000000000000000000000000000");
            assert(false);
        }

        // Parse USDC address
        address usdcAddress = vm.parseAddress(usdcAddressStr);

        console.log("Deploying ArcFlowV2 to Arc Mainnet");
        console.log("Chain ID:", EXPECTED_CHAIN_ID);
        console.log("USDC Address:", usdcAddressStr);

        // Start broadcast
        vm.startBroadcast(vm.parseUint(deployerPrivateKey));

        // Deploy ArcFlowV2
        arcFlowV2 = new ArcFlowV2(usdcAddress);

        // Stop broadcast
        vm.stopBroadcast();

        // Print deployment info
        console.log("============================================");
        console.log("ArcFlowV2 Deployed Successfully");
        console.log("============================================");
        console.log("Contract Address:", address(arcFlowV2));
        console.log("Chain ID:", EXPECTED_CHAIN_ID);
        console.log("USDC Address:", usdcAddressStr);
        console.log("Explorer: https://explorer.arc.io/address/", address(arcFlowV2));

        // Verify contract code is deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(arcFlowV2)
        }
        if (codeSize == 0) {
            assert(false);
        }
        console.log("Contract code verified (size:", codeSize, "bytes)");

        // Verify USDC is correctly set
        if (address(arcFlowV2.usdc()) != usdcAddress) {
            assert(false);
        }
        console.log("USDC contract correctly configured in ArcFlowV2");

        console.log("============================================");
        console.log("Next steps:");
        console.log("1. Save the contract address:", address(arcFlowV2));
        console.log("2. Add to frontend: NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS=<address>");
        console.log("3. Test with a small amount on mainnet");
        console.log("============================================");
    }

    /// @notice Fail-closed chain-ID guard. Reverts if not on Arc mainnet (5042).
    ///         Called as the FIRST operation in run() to prevent any deployment
    ///         or broadcast on the wrong chain.
    function _verifyChainId() internal view {
        uint256 actual = block.chainid;
        if (actual != EXPECTED_CHAIN_ID) {
            revert WrongChainId(EXPECTED_CHAIN_ID, actual);
        }
    }
}