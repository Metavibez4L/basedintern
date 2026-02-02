// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/**
 * ERC-8004 Identity Registry (minimal).
 *
 * - ERC-721 + URIStorage for agent registration files
 * - Optional on-chain metadata via getMetadata/setMetadata
 * - Reserved metadataKey "agentWallet" controlled via EIP-712 signature (EOA) or ERC-1271 (contract wallet)
 */
contract ERC8004IdentityRegistry is ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    // keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)")
    bytes32 public constant AGENT_WALLET_SET_TYPEHASH =
        0x678b53cd718d595370ab070ebf48edfdcd834beac116bf23e625fc7f4d5b7d32;

    bytes32 private constant _AGENT_WALLET_KEY_HASH = keccak256(bytes("agentWallet"));

    uint256 private _nextAgentId = 1;

    mapping(uint256 agentId => mapping(bytes32 metadataKeyHash => bytes metadataValue)) private _metadata;
    mapping(uint256 agentId => address wallet) private _agentWallet;

    constructor() ERC721("ERC8004IdentityRegistry", "AGENT") EIP712("ERC8004IdentityRegistry", "1") {}

    function _isOwnerOrApproved(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || isApprovedForAll(owner, spender) || getApproved(tokenId) == spender);
    }

    function register() external returns (uint256 agentId) {
        MetadataEntry[] memory empty;
        return _register("", empty);
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        MetadataEntry[] memory empty;
        return _register(agentURI, empty);
    }

    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);

        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        _setAgentWalletInternal(agentId, msg.sender);

        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadataInternal(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }

        emit Registered(agentId, agentURI, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not owner/operator");
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        if (keccak256(bytes(metadataKey)) == _AGENT_WALLET_KEY_HASH) {
            return abi.encode(_agentWallet[agentId]);
        }
        return _metadata[agentId][keccak256(bytes(metadataKey))];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not owner/operator");
        _setMetadataInternal(agentId, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallet[agentId];
    }

    function unsetAgentWallet(uint256 agentId) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not owner/operator");
        _setAgentWalletInternal(agentId, address(0));
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not owner/operator");
        require(newWallet != address(0), "newWallet=0");
        require(block.timestamp <= deadline, "expired");

        address owner = ownerOf(agentId);

        bytes32 structHash = keccak256(abi.encode(AGENT_WALLET_SET_TYPEHASH, agentId, newWallet, owner, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);

        if (newWallet.code.length == 0) {
            address signer = ECDSA.recover(digest, signature);
            require(signer == newWallet, "bad sig");
        } else {
            bytes4 magic = IERC1271(newWallet).isValidSignature(digest, signature);
            require(magic == 0x1626ba7e, "bad 1271 sig");
        }

        _setAgentWalletInternal(agentId, newWallet);
    }

    function _register(string memory agentURI, MetadataEntry[] memory metadata) internal returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);

        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        _setAgentWalletInternal(agentId, msg.sender);

        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadataInternal(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }

        emit Registered(agentId, agentURI, msg.sender);
    }

    function _setMetadataInternal(uint256 agentId, string memory metadataKey, bytes memory metadataValue) internal {
        bytes32 keyHash = keccak256(bytes(metadataKey));
        require(keyHash != _AGENT_WALLET_KEY_HASH, "reserved key");

        _metadata[agentId][keyHash] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function _setAgentWalletInternal(uint256 agentId, address wallet) internal {
        _agentWallet[agentId] = wallet;
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(wallet));
    }

    // Clear agentWallet on transfers (excluding mint).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0) && to != from) {
            _setAgentWalletInternal(tokenId, address(0));
        }
    }
}
