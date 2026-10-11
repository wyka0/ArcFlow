// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ERC20Mock
 * @notice Mock ERC20 with EIP-3009 transferWithAuthorization support for testing
 */
contract ERC20Mock is ERC20 {
    // EIP-3009 Domain Separator (mainnet Arc USDC verified)
    bytes32 public constant DOMAIN_SEPARATOR = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84;

    // Standard EIP-3009 TransferWithAuthorization typehash
    bytes32 public constant TRANSFER_TYPEHASH = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267;

    // Nonce tracking for EIP-3009
    mapping(address => uint256) public nonces;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    // SafeERC20 compatible functions
    function safeTransfer(address to, uint256 value) external returns (bool) {
        return transfer(to, value);
    }

    function safeTransferFrom(address from, address to, uint256 value) external returns (bool) {
        return transferFrom(from, to, value);
    }

    // EIP-3009 transferWithAuthorization
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
    ) external returns (bool) {
        // Verify deadlines
        if (block.timestamp < validAfter || block.timestamp > validBefore) {
            revert("Authorization expired");
        }

        // Compute EIP-712 digest
        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            structHash
        ));

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != from) {
            revert("Invalid signature");
        }

        // Check nonce replay protection
        if (authorizationState[from][nonce]) {
            revert("Nonce already used");
        }

        // Update nonce and authorization state
        nonces[from] = nonces[from] + 1;
        authorizationState[from][nonce] = true;

        // Execute transfer
        _transfer(from, to, value);

        return true;
    }
}