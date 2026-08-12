// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IColdChainVerifier {
    function verifyProof(
        bytes32 lotIdHash,
        bytes32 legId,
        bytes32 envMerkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        bool complianceFlag,
        bytes calldata zkProof
    ) external view returns (bool);
}
