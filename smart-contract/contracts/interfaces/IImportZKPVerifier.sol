// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IImportZKPVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external view returns (bool);
}
