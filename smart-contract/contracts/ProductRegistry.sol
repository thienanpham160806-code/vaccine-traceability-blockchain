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
        address origin;
        address currentOwner;
        Status status;
        Status previousStatus;
        bool isImported;
        bool zkpVerified;
        uint8 riskLevel;
        bytes32 flagReason;
        uint256 registeredAt;
        bool exists;
    }

    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant IMPORTER_ROLE = keccak256("IMPORTER_ROLE");
    bytes32 public constant RECALL_AUTHORITY_ROLE = keccak256("RECALL_AUTHORITY_ROLE");

    uint8 public constant RISK_NONE = 0;
    uint8 public constant RISK_LOW = 1;
    uint8 public constant RISK_MEDIUM = 2;
    uint8 public constant RISK_HIGH = 3;
    uint8 public constant RISK_CRITICAL = 4;

    ISupplyChainAccessControl public accessControl;
    address public transferLedger;

    mapping(bytes32 => Product) private products;
    mapping(bytes32 => bytes32[]) private batchToSerials;
    mapping(bytes32 => bool) public recalledBatches;

    event ProductRegistered(
        bytes32 indexed serialID,
        bytes32 indexed batchHash,
        address indexed owner,
        bool isImported,
        bool zkpVerified,
        Status status
    );

    event BatchRecalled(
        bytes32 indexed batchHash,
        bytes32 indexed reasonHash,
        uint256 totalProducts
    );

    event BatchStatusChecked(
        bytes32 indexed batchHash,
        bool recalled,
        uint256 totalProducts
    );

    event TransferLedgerUpdated(address indexed oldLedger, address indexed newLedger);

    event ProductMarkedInTransit(
        bytes32 indexed serialID,
        address indexed currentOwner
    );

    event ProductTransferCompleted(
        bytes32 indexed serialID,
        address indexed oldOwner,
        address indexed newOwner
    );

    event ProductFlagged(
        bytes32 indexed serialID,
        uint8 riskLevel,
        bytes32 indexed reason
    );

    constructor(address accessControlAddress) {
        require(accessControlAddress != address(0), "Invalid access control");
        accessControl = ISupplyChainAccessControl(accessControlAddress);
    }

    modifier onlyAdmin() {
        require(
            accessControl.hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not admin"
        );
        _;
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

    modifier onlyTransferLedger() {
        require(msg.sender == transferLedger, "Not transfer ledger");
        _;
    }

    function setTransferLedger(address newTransferLedger) external onlyAdmin {
        require(newTransferLedger != address(0), "Invalid transfer ledger");

        address oldLedger = transferLedger;
        transferLedger = newTransferLedger;

        emit TransferLedgerUpdated(oldLedger, newTransferLedger);
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
        bool proofVerified = false;

        if (isImporter) {
            require(importDocHash != bytes32(0), "Missing import doc");
            require(verifyProof(importDocHash, zkpProof), "Invalid proof");
            proofVerified = true;
        }

        products[serialID] = Product({
            serialID: serialID,
            batchHash: batchHash,
            metadataHash: metadataHash,
            importDocHash: importDocHash,
            origin: msg.sender,
            currentOwner: msg.sender,
            status: Status.VERIFIED,
            previousStatus: Status.REGISTERED,
            isImported: isImporter,
            zkpVerified: proofVerified,
            riskLevel: RISK_NONE,
            flagReason: bytes32(0),
            registeredAt: block.timestamp,
            exists: true
        });

        batchToSerials[batchHash].push(serialID);

        emit ProductRegistered(
            serialID,
            batchHash,
            msg.sender,
            isImporter,
            proofVerified,
            Status.VERIFIED
        );
    }
    
    /**
 * @dev MVP mock ZKP verifier.
 *
 * In the current MVP, the contract only checks that:
 * - import document hash is not empty
 * - proof bytes are not empty
 *
 * This simulates an importer proving that an import document exists
 * without exposing the full document on-chain.
 *
 * In production, this function should be replaced with a real verifier
 * contract generated from a ZKP circuit, such as Groth16 or Plonk.
 */
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
        require(!recalledBatches[batchHash], "Batch already recalled");

        bytes32[] storage serials = batchToSerials[batchHash];
        require(serials.length > 0, "Empty batch");

        recalledBatches[batchHash] = true;

        for (uint256 i = 0; i < serials.length; i++) {
            Product storage product = products[serials[i]];

            product.previousStatus = product.status;
            product.status = Status.RECALLED;
            product.riskLevel = RISK_CRITICAL;
            product.flagReason = reasonHash;
        }

        emit BatchRecalled(batchHash, reasonHash, serials.length);
    }

    function markInTransit(bytes32 serialID) external onlyTransferLedger {
        require(products[serialID].exists, "Product not found");

        Product storage product = products[serialID];

        require(product.status != Status.RECALLED, "Product recalled");
        require(product.status != Status.FLAGGED, "Product flagged");
        require(
            product.status == Status.VERIFIED || product.status == Status.DELIVERED,
            "Invalid status"
        );

        product.previousStatus = product.status;
        product.status = Status.IN_TRANSIT;

        emit ProductMarkedInTransit(serialID, product.currentOwner);
    }

    event ProductTransferReverted(bytes32 indexed serialID, Status revertedTo);

    function revertTransit(bytes32 serialID) external onlyTransferLedger {
        require(products[serialID].exists, "Product not found");

        Product storage product = products[serialID];
        require(product.status == Status.IN_TRANSIT, "Not in transit");

        Status revertTo = product.previousStatus;
        product.status = revertTo;
        product.previousStatus = Status.IN_TRANSIT;

        emit ProductTransferReverted(serialID, revertTo);
    }

    function completeTransfer(
        bytes32 serialID,
        address newOwner
    ) external onlyTransferLedger {
        require(products[serialID].exists, "Product not found");
        require(newOwner != address(0), "Invalid owner");

        Product storage product = products[serialID];

        require(product.status == Status.IN_TRANSIT, "Not in transit");

        address oldOwner = product.currentOwner;

        product.currentOwner = newOwner;
        product.previousStatus = Status.IN_TRANSIT;
        product.status = Status.DELIVERED;

        emit ProductTransferCompleted(serialID, oldOwner, newOwner);
    }

    function flagProductFromLedger(
        bytes32 serialID,
        uint8 riskLevel,
        bytes32 reason
    ) external onlyTransferLedger {
        require(products[serialID].exists, "Product not found");
        require(reason != bytes32(0), "Invalid reason");
        require(riskLevel > RISK_NONE, "Invalid risk level");

        Product storage product = products[serialID];

        require(product.status != Status.RECALLED, "Product recalled");

        if (product.status != Status.FLAGGED) {
            product.previousStatus = product.status;
        }

        product.status = Status.FLAGGED;
        product.riskLevel = riskLevel;
        product.flagReason = reason;

        emit ProductFlagged(serialID, riskLevel, reason);
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

    function getBatchSerials(
        bytes32 batchHash
    ) external view returns (bytes32[] memory) {
        require(batchHash != bytes32(0), "Invalid batch");
        return batchToSerials[batchHash];
    }

    function isBatchRecalled(
        bytes32 batchHash
    ) external view returns (bool) {
        require(batchHash != bytes32(0), "Invalid batch");
        return recalledBatches[batchHash];
    }

    function getBatchSize(
        bytes32 batchHash
    ) external view returns (uint256) {
        require(batchHash != bytes32(0), "Invalid batch");
        return batchToSerials[batchHash].length;
    }

    function getBatchSummary(
        bytes32 batchHash
    )
        external
        view
        returns (
            bool recalled,
            uint256 totalProducts
        )
    {
        require(batchHash != bytes32(0), "Invalid batch");

        return (
            recalledBatches[batchHash],
            batchToSerials[batchHash].length
        );
    }

    function productExists(bytes32 serialID) external view returns (bool) {
        return products[serialID].exists;
    }

    function getRiskLevel(bytes32 serialID) external view returns (uint8) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].riskLevel;
    }

    function getFlagReason(bytes32 serialID) external view returns (bytes32) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].flagReason;
    }

    function isZkpVerified(bytes32 serialID) external view returns (bool) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].zkpVerified;
    }

    function isImportedProduct(bytes32 serialID) external view returns (bool) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].isImported;
    }
}