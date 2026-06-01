// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IImportZKPVerifier.sol";

/**
 * @dev Demo verifier with the same calldata shape as a snarkjs Groth16 verifier.
 *
 * The real deployment path is:
 * 1. compile circuits/import_registration.circom
 * 2. run Groth16 trusted setup
 * 3. export Verifier.sol with snarkjs
 * 4. deploy Verifier.sol and point ProductRegistry.importVerifier to it
 *
 * This contract exists so the importer registration flow can be exercised before
 * the proving key and generated Solidity verifier are committed.
 */
contract DemoImportZKPVerifier is IImportZKPVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external pure returns (bool) {
        bool hasProofMaterial = a[0] != 0 && b[0][0] != 0 && c[0] != 0;
        bool hasPublicSignals =
            input[0] != 0 &&
            input[1] != 0 &&
            input[2] != 0 &&
            input[3] != 0 &&
            input[4] != 0;

        return hasProofMaterial && hasPublicSignals && input[2] >= input[3];
    }
}
