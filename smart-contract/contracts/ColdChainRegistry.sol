// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IColdChainVerifier.sol";

interface ISupplyChainAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IProductRegistryLots {
    function lotExists(bytes32 lotIdHash) external view returns (bool);
}

/**
 * @dev Holds cold-chain environmental compliance anchors (Merkle root of a
 * leg's temperature/humidity readings + a pass/fail compliance flag) per
 * lot per custody leg. Split out from ProductRegistry so the ZKP verifier
 * for this predicate can evolve independently (mock now, real circuit
 * later) without touching the core registry.
 *
 * anchorEnv is only callable by TransferLedger, mirroring the
 * onlyTransferLedger pattern already used by ProductRegistry for
 * recordEvent/disaggregate/decommissionUnit.
 */
contract ColdChainRegistry {
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);

    ISupplyChainAccessControl public accessControl;
    IProductRegistryLots public productRegistry;
    IColdChainVerifier public verifier;
    address public transferLedger;

    event EnvAnchored(
        bytes32 indexed lotIdHash,
        bytes32 indexed legId,
        bytes32 indexed envMerkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        bool complianceFlag,
        uint256 timestamp
    );

    event TransferLedgerUpdated(address indexed oldLedger, address indexed newLedger);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    constructor(address accessControlAddress, address productRegistryAddress) {
        require(accessControlAddress != address(0), "Invalid access control");
        require(productRegistryAddress != address(0), "Invalid product registry");

        accessControl = ISupplyChainAccessControl(accessControlAddress);
        productRegistry = IProductRegistryLots(productRegistryAddress);
    }

    modifier onlyAdmin() {
        require(accessControl.hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }

    modifier onlyTransferLedger() {
        require(msg.sender == transferLedger, "Not transfer ledger");
        _;
    }

    function setTransferLedger(address newLedger) external onlyAdmin {
        require(newLedger != address(0), "Invalid transfer ledger");

        address oldLedger = transferLedger;
        transferLedger = newLedger;

        emit TransferLedgerUpdated(oldLedger, newLedger);
    }

    function setVerifier(address newVerifier) external onlyAdmin {
        require(newVerifier != address(0), "Invalid verifier");

        address oldVerifier = address(verifier);
        verifier = IColdChainVerifier(newVerifier);

        emit VerifierUpdated(oldVerifier, newVerifier);
    }

    function anchorEnv(
        bytes32 lotIdHash,
        bytes32 legId,
        bytes32 envMerkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        bool complianceFlag,
        bytes calldata zkProof,
        uint256 timestamp
    ) external onlyTransferLedger {
        require(lotIdHash != bytes32(0), "Invalid lot id");
        require(legId != bytes32(0), "Invalid leg id");
        require(envMerkleRoot != bytes32(0), "Invalid env root");
        require(windowEnd >= windowStart, "Invalid window");
        require(productRegistry.lotExists(lotIdHash), "Lot not found");
        require(address(verifier) != address(0), "Missing verifier");
        require(
            verifier.verifyProof(
                lotIdHash,
                legId,
                envMerkleRoot,
                windowStart,
                windowEnd,
                complianceFlag,
                zkProof
            ),
            "Invalid proof"
        );

        emit EnvAnchored(
            lotIdHash,
            legId,
            envMerkleRoot,
            windowStart,
            windowEnd,
            complianceFlag,
            timestamp
        );
    }
}
