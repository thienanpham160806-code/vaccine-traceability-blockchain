// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IColdChainVerifier.sol";

/**
 * @dev Demo verifier with the same calling shape a real cold-chain compliance
 * ZKP verifier would have (a circuit proving "every reading in [min,max]C"
 * without revealing the individual readings).
 *
 * The real deployment path is:
 * 1. compile a cold-chain compliance circuit (predicate proof)
 * 2. run a Groth16 trusted setup
 * 3. export Verifier.sol with snarkjs
 * 4. deploy Verifier.sol and point ColdChainRegistry.verifier to it
 *
 * This contract exists so the anchorEnv flow can be exercised end-to-end
 * before the real circuit/verifier are committed. It only checks that the
 * call is structurally well-formed, matching the same "mock first" pattern
 * already used by DemoImportZKPVerifier for import registration.
 */
contract MockColdChainVerifier is IColdChainVerifier {
    function verifyProof(
        bytes32 lotIdHash,
        bytes32 legId,
        bytes32 envMerkleRoot,
        uint256 windowStart,
        uint256 windowEnd,
        bool,
        bytes calldata zkProof
    ) external pure returns (bool) {
        return
            lotIdHash != bytes32(0) &&
            legId != bytes32(0) &&
            envMerkleRoot != bytes32(0) &&
            windowEnd >= windowStart &&
            zkProof.length > 0;
    }
}
