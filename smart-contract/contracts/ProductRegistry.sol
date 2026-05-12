// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISupplyChainAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract ProductRegistry {
    enum Status {
        REGISTERED,
        VERIFIED,
        IN_TRANSIT,
        DELIVERED,
        FLAGGED,
        RECALLED
    }

    struct Product {
        bytes32 serialID;
        bytes32 batchHash;
        bytes32 metadataHash;
        bytes32 importDocHash;
        address currentOwner;
        Status status;
        uint256 registeredAt;
        bool exists;
    }

    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant IMPORTER_ROLE = keccak256("IMPORTER_ROLE");
    bytes32 public constant RECALL_AUTHORITY_ROLE = keccak256("RECALL_AUTHORITY_ROLE");

    ISupplyChainAccessControl public accessControl;

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => bytes32[]) private batchToSerials;
    mapping(bytes32 => bool) public recalledBatches;

    event ProductRegistered(
        bytes32 indexed serialID,
        bytes32 indexed batchHash,
        address indexed owner,
        Status status
    );

    event BatchRecalled(
        bytes32 indexed batchHash,
        bytes32 indexed reasonHash,
        uint256 totalProducts
    );

    constructor(address accessControlAddress) {
        require(accessControlAddress != address(0), "Invalid access control");
        accessControl = ISupplyChainAccessControl(accessControlAddress);
    }

    modifier onlyManufacturerOrImporter() {
        bool isManufacturer = accessControl.hasRole(MANUFACTURER_ROLE, msg.sender);
        bool isImporter = accessControl.hasRole(IMPORTER_ROLE, msg.sender);

        require(isManufacturer || isImporter, "Not manufacturer or importer");
        _;
    }

    modifier onlyRecallAuthority() {
        require(
            accessControl.hasRole(RECALL_AUTHORITY_ROLE, msg.sender),
            "Not recall authority"
        );
        _;
    }

    function registerProduct(
        bytes32 serialID,
        bytes32 batchHash,
        bytes32 metadataHash,
        bytes32 importDocHash,
        bytes calldata zkpProof
    ) external onlyManufacturerOrImporter {
        require(serialID != bytes32(0), "Invalid serial");
        require(batchHash != bytes32(0), "Invalid batch");
        require(metadataHash != bytes32(0), "Invalid metadata");
        require(!products[serialID].exists, "Duplicate serial");
        require(!recalledBatches[batchHash], "Batch recalled");

        bool isImporter = accessControl.hasRole(IMPORTER_ROLE, msg.sender);

        if (isImporter) {
            require(importDocHash != bytes32(0), "Missing import doc");
            require(verifyProof(importDocHash, zkpProof), "Invalid proof");
        }

        products[serialID] = Product({
            serialID: serialID,
            batchHash: batchHash,
            metadataHash: metadataHash,
            importDocHash: importDocHash,
            currentOwner: msg.sender,
            status: Status.VERIFIED,
            registeredAt: block.timestamp,
            exists: true
        });

        batchToSerials[batchHash].push(serialID);

        emit ProductRegistered(serialID, batchHash, msg.sender, Status.VERIFIED);
    }

    function verifyProof(
        bytes32 importDocHash,
        bytes calldata zkpProof
    ) public pure returns (bool) {
        return importDocHash != bytes32(0) && zkpProof.length > 0;
    }

    function recallBatch(
        bytes32 batchHash,
        bytes32 reasonHash
    ) external onlyRecallAuthority {
        require(batchHash != bytes32(0), "Invalid batch");
        require(reasonHash != bytes32(0), "Invalid reason");

        bytes32[] storage serials = batchToSerials[batchHash];
        require(serials.length > 0, "Empty batch");

        recalledBatches[batchHash] = true;

        for (uint256 i = 0; i < serials.length; i++) {
            products[serials[i]].status = Status.RECALLED;
        }

        emit BatchRecalled(batchHash, reasonHash, serials.length);
    }

    function getStatus(bytes32 serialID) external view returns (Status) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].status;
    }

    function getCurrentOwner(bytes32 serialID) external view returns (address) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].currentOwner;
    }

    function getProduct(bytes32 serialID) external view returns (Product memory) {
        require(products[serialID].exists, "Product not found");
        return products[serialID];
    }

    function getBatchSerials(bytes32 batchHash) external view returns (bytes32[] memory) {
        return batchToSerials[batchHash];
    }

    function productExists(bytes32 serialID) external view returns (bool) {
        return products[serialID].exists;
    }
}