// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArcFlow} from "../contracts/ArcFlow.sol";

contract DeployArcFlow is Script {
    function run() external returns (ArcFlow arcFlow) {
        // Read configuration from environment variables
        string memory arcRpcUrl = vm.envString("ARC_RPC_URL");
        string memory deployerPrivateKey = vm.envString("DEPLOYER_PRIVATE_KEY");
        string memory usdcAddressStr = vm.envString("ARC_USDC_ADDRESS");

        // Validate required environment variables
        if (bytes(arcRpcUrl).length == 0) {
            console.log("ERROR: ARC_RPC_URL environment variable not set");
            console.log("Usage: forge script script/DeployArcFlow.s.sol --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast");
            assert(false);
        }

        if (bytes(deployerPrivateKey).length == 0) {
            console.log("ERROR: DEPLOYER_PRIVATE_KEY environment variable not set");
            console.log("Usage: forge script script/DeployArcFlow.s.sol --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast");
            assert(false);
        }

        if (bytes(usdcAddressStr).length == 0) {
            console.log("ERROR: ARC_USDC_ADDRESS environment variable not set");
            console.log("Expected: 0x3600000000000000000000000000000000000000");
            assert(false);
        }

        // Parse USDC address
        address usdcAddress = vm.parseAddress(usdcAddressStr);

        // Verify we're on Arc mainnet (chain ID 5042)
        uint256 chainId = vm.getChainId();
        if (chainId != 5042) {
            console.log("WARNING: Not on Arc mainnet (chain ID 5042)");
            console.log("Current chain ID:", chainId);
        }

        console.log("Deploying ArcFlow to Arc Mainnet");
        console.log("Chain ID:", chainId);
        console.log("USDC Address:", usdcAddressStr);

        // Start broadcast
        vm.startBroadcast(vm.parseUint(deployerPrivateKey));

        // Deploy ArcFlow
        arcFlow = new ArcFlow(usdcAddress);

        // Stop broadcast
        vm.stopBroadcast();

        // Print deployment info
        console.log("============================================");
        console.log("ArcFlow Deployed Successfully");
        console.log("============================================");
        console.log("Contract Address:", address(arcFlow));
        console.log("Chain ID:", chainId);
        console.log("USDC Address:", usdcAddressStr);
        console.log("Explorer: https://explorer.arc.io/address/", address(arcFlow));

        // Verify contract code is deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(arcFlow)
        }
        if (codeSize == 0) {
            assert(false);
        }
        console.log("Contract code verified (size:", codeSize, "bytes)");

        // Verify USDC is correctly set
        if (address(arcFlow.usdc()) != usdcAddress) {
            assert(false);
        }
        console.log("USDC contract correctly configured in ArcFlow");

        console.log("============================================");
        console.log("Next steps:");
        console.log("1. Save the contract address:", address(arcFlow));
        console.log("2. Add to frontend configuration");
        console.log("3. Test with a small amount on mainnet");
        console.log("============================================");
    }
}