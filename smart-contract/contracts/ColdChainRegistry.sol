// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ColdChainRegistry
 * @dev Anchors environmental readings (temperature, humidity) for vaccine lots.
 *      Mock ZKP verifier for MVP - production should use real Groth16/Plonk verifier.
 */
contract ColdChainRegistry {

    enum ComplianceFlag {
        COMPLIANT,       // 0: All readings within range
        EXCURSION,       // 1: Some readings outside range (handled)
        BREACH           // 2: Critical breach, vaccine compromised
    }

    struct EnvLeg {
        bytes32 lotIdHash;
        uint8 legId;
        bytes32 merkleRoot;
        uint256 windowStart;
        uint256 windowEnd;
        ComplianceFlag complianceFlag;
        bool exists;
    }

    // Storage
    mapping(bytes32 => mapping(uint8 => EnvLeg)) private envLegs; // lotIdHash => legId => EnvLeg
    mapping(bytes32 => uint8) private legCount;                    // lotIdHash => total legs
    mapping(bytes32 => ComplianceFlag) private lotComplianceFlags;  // aggregated flag per lot

    // Events
    event EnvAnchored(
        bytes32 indexed lotIdHash,
        uint8 indexed legId,
        bytes32 merkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        ComplianceFlag complianceFlag,
        uint256 timestamp
    );

    event LegSealed(
        bytes32 indexed lotIdHash,
        uint8 indexed legId,
        ComplianceFlag finalFlag,
        uint256 timestamp
    );

    /**
     * @dev Anchor environmental data for a lot leg.
     *      Mock ZKP verification for MVP.
     */
    function anchorEnv(
        bytes32 lotIdHash,
        uint8 legId,
        bytes32 envMerkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        ComplianceFlag complianceFlag,
        bytes calldata zkProof
    ) external {
        require(lotIdHash != bytes32(0), "Invalid lot ID");
        require(envMerkleRoot != bytes32(0), "Invalid Merkle root");
        require(windowEnd > windowStart, "Invalid window");
        require(!envLegs[lotIdHash][legId].exists, "Leg already anchored");

        // Mock ZKP verification for MVP
        require(_verifyColdChainProof(envMerkleRoot, zkProof), "Invalid ZK proof");

        envLegs[lotIdHash][legId] = EnvLeg({
            lotIdHash: lotIdHash,
            legId: legId,
            merkleRoot: envMerkleRoot,
            windowStart: windowStart,
            windowEnd: windowEnd,
            complianceFlag: complianceFlag,
            exists: true
        });

        legCount[lotIdHash]++;

        // Update aggregated compliance flag
        _updateLotCompliance(lotIdHash, complianceFlag);

        emit EnvAnchored(
            lotIdHash,
            legId,
            envMerkleRoot,
            windowStart,
            windowEnd,
            complianceFlag,
            block.timestamp
        );
    }

    /**
     * @dev Seal a leg after readings are complete.
     */
    function sealLeg(bytes32 lotIdHash, uint8 legId, ComplianceFlag finalFlag) external {
        require(envLegs[lotIdHash][legId].exists, "Leg not found");
        require(block.timestamp >= envLegs[lotIdHash][legId].windowEnd, "Window not closed");

        envLegs[lotIdHash][legId].complianceFlag = finalFlag;
        _updateLotCompliance(lotIdHash, finalFlag);

        emit LegSealed(lotIdHash, legId, finalFlag, block.timestamp);
    }

    /**
     * @dev Verify a reading against the leg's Merkle root.
     */
    function verifyReading(
        bytes32 lotIdHash,
        uint8 legId,
        bytes32 readingHash,
        bytes32[] calldata merkleProof
    ) external view returns (bool) {
        require(envLegs[lotIdHash][legId].exists, "Leg not found");

        bytes32 merkleRoot = envLegs[lotIdHash][legId].merkleRoot;
        return MerkleProof.verify(merkleProof, merkleRoot, readingHash);
    }

    // View functions
    function getLeg(
        bytes32 lotIdHash,
        uint8 legId
    ) external view returns (
        bytes32 lotId,
        uint8 leg,
        bytes32 merkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        ComplianceFlag complianceFlag,
        bool exists
    ) {
        EnvLeg memory leg_ = envLegs[lotIdHash][legId];
        return (
            leg_.lotIdHash,
            leg_.legId,
            leg_.merkleRoot,
            leg_.windowStart,
            leg_.windowEnd,
            leg_.complianceFlag,
            leg_.exists
        );
    }

    function getLegCount(bytes32 lotIdHash) external view returns (uint8) {
        return legCount[lotIdHash];
    }

    function getLotComplianceFlag(bytes32 lotIdHash) external view returns (ComplianceFlag) {
        return lotComplianceFlags[lotIdHash];
    }

    function isLegWithinWindow(bytes32 lotIdHash, uint8 legId) external view returns (bool) {
        EnvLeg memory leg_ = envLegs[lotIdHash][legId];
        return block.timestamp >= leg_.windowStart && block.timestamp <= leg_.windowEnd;
    }

    // Mock ZKP verifier for cold-chain compliance (MVP)
    // In production, replace with real Groth16/Plonk verifier
    function _verifyColdChainProof(
        bytes32,
        bytes calldata
    ) internal pure returns (bool) {
        return true; // MVP: accept all proofs
    }

    // Update aggregated compliance flag for a lot
    function _updateLotCompliance(bytes32 lotIdHash, ComplianceFlag newFlag) internal {
        ComplianceFlag current = lotComplianceFlags[lotIdHash];
        
        // BREACH > EXCURSION > COMPLIANT
        if (uint8(newFlag) > uint8(current)) {
            lotComplianceFlags[lotIdHash] = newFlag;
        }
    }
}
