// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IImportZKPVerifier.sol";

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
        RECALLED,
        DISPENSED,
        DECOMMISSIONED
    }

    struct Product {
        bytes32 serialID;
        bytes32 batchHash;
        bytes32 metadataHash;
        bytes32 importDocHash;
        uint256 importDocCommitment;
        uint256 approvedImportRoot;
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
    IImportZKPVerifier public importVerifier;
    uint256 public approvedImportRoot;
    address public transferLedger;

    mapping(bytes32 => Product) private products;
    // batchToSerials removed: use off-chain Merkle tree instead (gas optimization per spec)
    mapping(bytes32 => bool) public recalledBatches;
    mapping(bytes32 => bytes32) public batchRecallReasons;

    // Lot management
    mapping(bytes32 => bytes32) public lotAggregationRoots; // lotIdHash => aggregationRoot
    mapping(bytes32 => bytes32) public lotMetadataHashes;      // lotIdHash => metadataHash
    mapping(bytes32 => bool) public lotExists;                // lotIdHash => exists
    mapping(bytes32 => bool) public lotRecalled;              // lotIdHash => recalled
    mapping(bytes32 => bytes32[]) private lotToSubLots;        // parentLotIdHash => subLotIdHash[]
    mapping(bytes32 => bytes32) public subLotParent;           // subLotIdHash => parentLotIdHash

    // Unit decommission tracking
    mapping(bytes32 => bytes32) public unitLotId;              // unitIdHash => lotIdHash
    mapping(bytes32 => bool) public unitDecommissioned;        // unitIdHash => decommissioned

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
    event ImportVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event ApprovedImportRootUpdated(uint256 indexed oldRoot, uint256 indexed newRoot);

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

    event ProductUnflagged(
        bytes32 indexed serialID,
        address indexed clearedBy
    );

    // Lot management events
    event LotCommissioned(
        bytes32 indexed lotIdHash,
        bytes32 indexed aggregationRoot,
        bytes32 metadataHash,
        address indexed manufacturer,
        uint256 timestamp
    );

    event LotDisaggregated(
        bytes32 indexed parentLotIdHash,
        bytes32 indexed subLotIdHash,
        bytes32 subLotRoot,
        address indexed toActor,
        uint256 timestamp
    );

    event UnitDecommissioned(
        bytes32 indexed unitIdHash,
        bytes32 indexed lotIdHash,
        address indexed dispensedBy,
        bytes32 eventType,
        uint256 timestamp
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

    function _isRecalled(bytes32 serialID) internal view returns (bool) {
        Product storage p = products[serialID];
        return p.status == Status.RECALLED || recalledBatches[p.batchHash];
    }

    function setTransferLedger(address newTransferLedger) external onlyAdmin {
        require(newTransferLedger != address(0), "Invalid transfer ledger");

        address oldLedger = transferLedger;
        transferLedger = newTransferLedger;

        emit TransferLedgerUpdated(oldLedger, newTransferLedger);
    }

    function setImportVerifier(address newImportVerifier) external onlyAdmin {
        require(newImportVerifier != address(0), "Invalid import verifier");

        address oldVerifier = address(importVerifier);
        importVerifier = IImportZKPVerifier(newImportVerifier);

        emit ImportVerifierUpdated(oldVerifier, newImportVerifier);
    }

    function setApprovedImportRoot(uint256 newApprovedImportRoot) external onlyAdmin {
        require(newApprovedImportRoot != 0, "Invalid import root");

        uint256 oldRoot = approvedImportRoot;
        approvedImportRoot = newApprovedImportRoot;

        emit ApprovedImportRootUpdated(oldRoot, newApprovedImportRoot);
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
            importDocCommitment: 0,
            approvedImportRoot: 0,
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

        // batchToSerials removed: use off-chain Merkle tree instead
        emit ProductRegistered(
            serialID,
            batchHash,
            msg.sender,
            isImporter,
            proofVerified,
            Status.VERIFIED
        );
    }

    function registerImportedProductZK(
        bytes32 serialID,
        bytes32 batchHash,
        bytes32 metadataHash,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external onlyManufacturerOrImporter {
        require(serialID != bytes32(0), "Invalid serial");
        require(batchHash != bytes32(0), "Invalid batch");
        require(metadataHash != bytes32(0), "Invalid metadata");
        require(!products[serialID].exists, "Duplicate serial");
        require(!recalledBatches[batchHash], "Batch recalled");
        require(address(importVerifier) != address(0), "Missing import verifier");
        require(approvedImportRoot != 0, "Missing import root");
        require(accessControl.hasRole(IMPORTER_ROLE, msg.sender), "Not importer");

        uint256 importDocCommitment = input[0];
        uint256 batchHashField = input[1];
        uint256 vaccineExpiryDate = input[2];
        uint256 currentDate = input[3];
        uint256 proofApprovedRoot = input[4];

        require(importDocCommitment != 0, "Invalid import doc commitment");
        require(batchHashField == uint256(batchHash), "Batch mismatch");
        require(vaccineExpiryDate >= currentDate, "Vaccine expired");
        require(proofApprovedRoot == approvedImportRoot, "Import root mismatch");
        require(importVerifier.verifyProof(a, b, c, input), "Invalid import ZKP");

        products[serialID] = Product({
            serialID: serialID,
            batchHash: batchHash,
            metadataHash: metadataHash,
            importDocHash: bytes32(importDocCommitment),
            importDocCommitment: importDocCommitment,
            approvedImportRoot: proofApprovedRoot,
            origin: msg.sender,
            currentOwner: msg.sender,
            status: Status.VERIFIED,
            previousStatus: Status.REGISTERED,
            isImported: true,
            zkpVerified: true,
            riskLevel: RISK_NONE,
            flagReason: bytes32(0),
            registeredAt: block.timestamp,
            exists: true
        });

        // batchToSerials removed: use off-chain Merkle tree instead
        emit ProductRegistered(
            serialID,
            batchHash,
            msg.sender,
            true,
            true,
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

        recalledBatches[batchHash] = true;
        batchRecallReasons[batchHash] = reasonHash;

        emit BatchRecalled(batchHash, reasonHash, 0); // Count tracked off-chain
    }

    function unflagProduct(bytes32 serialID) external onlyRecallAuthority {
        require(products[serialID].exists, "Product not found");

        Product storage p = products[serialID];
        require(p.status == Status.FLAGGED, "Not flagged");
        require(!recalledBatches[p.batchHash], "Batch recalled");

        p.status = p.previousStatus;
        p.riskLevel = RISK_NONE;
        p.flagReason = bytes32(0);

        emit ProductUnflagged(serialID, msg.sender);
    }

    function markInTransit(bytes32 serialID) external onlyTransferLedger {
        require(products[serialID].exists, "Product not found");

        Product storage product = products[serialID];

        require(!_isRecalled(serialID), "Product recalled");
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

        require(!_isRecalled(serialID), "Product recalled");

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
        if (recalledBatches[products[serialID].batchHash]) return Status.RECALLED;
        return products[serialID].status;
    }

    function getCurrentOwner(bytes32 serialID) external view returns (address) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].currentOwner;
    }

    function getProduct(bytes32 serialID) external view returns (Product memory) {
        require(products[serialID].exists, "Product not found");
        Product memory p = products[serialID];
        if (recalledBatches[p.batchHash]) {
            p.status = Status.RECALLED;
            p.riskLevel = RISK_CRITICAL;
            p.flagReason = batchRecallReasons[p.batchHash];
        }
        return p;
    }

    function getBatchSerials(
        bytes32 batchHash
    ) external view returns (bytes32[] memory) {
        require(batchHash != bytes32(0), "Invalid batch");
        return new bytes32[](0); // Deprecated: use off-chain Merkle tree
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
        return 0; // Deprecated: use off-chain Merkle tree for count
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
            0 // Deprecated: use off-chain Merkle tree for count
        );
    }

    function productExists(bytes32 serialID) external view returns (bool) {
        return products[serialID].exists;
    }

    function getRiskLevel(bytes32 serialID) external view returns (uint8) {
        require(products[serialID].exists, "Product not found");
        Product memory p = products[serialID];
        if (recalledBatches[p.batchHash]) {
            return RISK_CRITICAL;
        }
        return p.riskLevel;
    }

    function getFlagReason(bytes32 serialID) external view returns (bytes32) {
        require(products[serialID].exists, "Product not found");
        Product memory p = products[serialID];
        if (recalledBatches[p.batchHash]) {
            return batchRecallReasons[p.batchHash];
        }
        return p.flagReason;
    }

    function isZkpVerified(bytes32 serialID) external view returns (bool) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].zkpVerified;
    }

    function isImportedProduct(bytes32 serialID) external view returns (bool) {
        require(products[serialID].exists, "Product not found");
        return products[serialID].isImported;
    }

    // ============================================
    // LOT MANAGEMENT FUNCTIONS (Merkle Tree based)
    // ============================================

    function commissionLot(
        bytes32 lotIdHash,
        bytes32 aggregationRoot,
        bytes32 metadataHash,
        bytes calldata zkpProof
    ) external onlyManufacturerOrImporter {
        require(lotIdHash != bytes32(0), "Invalid lot ID");
        require(aggregationRoot != bytes32(0), "Invalid aggregation root");
        require(metadataHash != bytes32(0), "Invalid metadata");
        require(!lotExists[lotIdHash], "Lot already exists");
        require(!lotRecalled[lotIdHash], "Lot recalled");

        // Verify ZKP proof (mock verifier for MVP)
        require(_verifyLotProof(lotIdHash, aggregationRoot, zkpProof), "Invalid proof");

        lotAggregationRoots[lotIdHash] = aggregationRoot;
        lotMetadataHashes[lotIdHash] = metadataHash;
        lotExists[lotIdHash] = true;

        emit LotCommissioned(
            lotIdHash,
            aggregationRoot,
            metadataHash,
            msg.sender,
            block.timestamp
        );
    }

    function decommission(
        bytes32 unitIdHash,
        bytes32[] calldata merkleProof,
        bytes32 lotIdHash,
        bytes32 eventType
    ) external onlyManufacturerOrImporter {
        require(unitIdHash != bytes32(0), "Invalid unit ID");
        require(lotIdHash != bytes32(0), "Invalid lot ID");
        require(lotExists[lotIdHash], "Lot not found");
        require(!lotRecalled[lotIdHash], "Lot recalled");
        require(!unitDecommissioned[unitIdHash], "Unit already decommissioned");

        bytes32 aggregationRoot = lotAggregationRoots[lotIdHash];
        require(aggregationRoot != bytes32(0), "No aggregation root for lot");

        // Verify Merkle proof against the lot's aggregation root
        bool isValidProof = MerkleProof.verify(
            merkleProof,
            aggregationRoot,
            unitIdHash
        );
        require(isValidProof, "Invalid Merkle proof");

        unitDecommissioned[unitIdHash] = true;
        unitLotId[unitIdHash] = lotIdHash;

        emit UnitDecommissioned(
            unitIdHash,
            lotIdHash,
            msg.sender,
            eventType,
            block.timestamp
        );
    }

    function disaggregate(
        bytes32 parentLotIdHash,
        bytes32 subLotIdHash,
        bytes32 subLotRoot,
        address toActor
    ) external onlyManufacturerOrImporter {
        require(parentLotIdHash != bytes32(0), "Invalid parent lot");
        require(subLotIdHash != bytes32(0), "Invalid sub-lot");
        require(subLotRoot != bytes32(0), "Invalid sub-lot root");
        require(toActor != address(0), "Invalid actor");
        require(lotExists[parentLotIdHash], "Parent lot not found");
        require(!lotExists[subLotIdHash], "Sub-lot already exists");
        require(!lotRecalled[parentLotIdHash], "Parent lot recalled");

        lotAggregationRoots[subLotIdHash] = subLotRoot;
        lotMetadataHashes[subLotIdHash] = lotMetadataHashes[parentLotIdHash];
        lotExists[subLotIdHash] = true;
        lotToSubLots[parentLotIdHash].push(subLotIdHash);
        subLotParent[subLotIdHash] = parentLotIdHash;

        emit LotDisaggregated(
            parentLotIdHash,
            subLotIdHash,
            subLotRoot,
            toActor,
            block.timestamp
        );
    }

    // ============================================
    // VIEW FUNCTIONS FOR LOT MANAGEMENT
    // ============================================

    function getLotAggregationRoot(bytes32 lotIdHash) external view returns (bytes32) {
        require(lotExists[lotIdHash], "Lot not found");
        return lotAggregationRoots[lotIdHash];
    }

    function getLotMetadataHash(bytes32 lotIdHash) external view returns (bytes32) {
        require(lotExists[lotIdHash], "Lot not found");
        return lotMetadataHashes[lotIdHash];
    }

    function isLotExists(bytes32 lotIdHash) external view returns (bool) {
        return lotExists[lotIdHash];
    }

    function isLotRecalled(bytes32 lotIdHash) external view returns (bool) {
        return lotRecalled[lotIdHash];
    }

    function isUnitDecommissioned(bytes32 unitIdHash) external view returns (bool) {
        return unitDecommissioned[unitIdHash];
    }

    function getUnitLotId(bytes32 unitIdHash) external view returns (bytes32) {
        require(unitDecommissioned[unitIdHash], "Unit not decommissioned");
        return unitLotId[unitIdHash];
    }

    function getSubLots(bytes32 parentLotIdHash) external view returns (bytes32[] memory) {
        require(lotExists[parentLotIdHash], "Lot not found");
        return lotToSubLots[parentLotIdHash];
    }

    function getSubLotCount(bytes32 parentLotIdHash) external view returns (uint256) {
        require(lotExists[parentLotIdHash], "Lot not found");
        return lotToSubLots[parentLotIdHash].length;
    }

    function recallLot(bytes32 lotIdHash, bytes32 reasonHash) external onlyRecallAuthority {
        require(lotIdHash != bytes32(0), "Invalid lot");
        require(lotExists[lotIdHash], "Lot not found");
        require(!lotRecalled[lotIdHash], "Lot already recalled");

        lotRecalled[lotIdHash] = true;

        emit BatchRecalled(lotIdHash, reasonHash, 0);
    }

    // Mock ZKP verifier for lot commissioning (MVP)
    function _verifyLotProof(
        bytes32 lotIdHash,
        bytes32 aggregationRoot,
        bytes calldata zkpProof
    ) internal pure returns (bool) {
        return lotIdHash != bytes32(0) && aggregationRoot != bytes32(0) && zkpProof.length > 0;
    }
}
