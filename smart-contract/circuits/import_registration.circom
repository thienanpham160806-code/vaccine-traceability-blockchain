pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template MerkleInclusion(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal cur[levels + 1];
    component hashers[levels];

    cur[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== cur[i] * (1 - pathIndices[i]) + pathElements[i] * pathIndices[i];
        hashers[i].inputs[1] <== pathElements[i] * (1 - pathIndices[i]) + cur[i] * pathIndices[i];
        cur[i + 1] <== hashers[i].out;
    }

    root === cur[levels];
}

template ImportRegistration(levels) {
    // Private import document fields.
    signal input docId;
    signal input importerLicense;
    signal input manufacturerId;
    signal input batchHashField;
    signal input documentExpiryDate;
    signal input salt;

    // Private Merkle membership witness.
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Public signals. Keep this order aligned with ProductRegistry.
    signal input importDocCommitment;
    signal input registeredBatchHashField;
    signal input vaccineExpiryDate;
    signal input currentDate;
    signal input approvedImportRoot;

    component commitmentHasher = Poseidon(6);
    commitmentHasher.inputs[0] <== docId;
    commitmentHasher.inputs[1] <== importerLicense;
    commitmentHasher.inputs[2] <== manufacturerId;
    commitmentHasher.inputs[3] <== batchHashField;
    commitmentHasher.inputs[4] <== documentExpiryDate;
    commitmentHasher.inputs[5] <== salt;

    importDocCommitment === commitmentHasher.out;
    registeredBatchHashField === batchHashField;

    component docStillValid = GreaterEqThan(32);
    docStillValid.in[0] <== documentExpiryDate;
    docStillValid.in[1] <== currentDate;
    docStillValid.out === 1;

    component vaccineStillValid = GreaterEqThan(32);
    vaccineStillValid.in[0] <== vaccineExpiryDate;
    vaccineStillValid.in[1] <== currentDate;
    vaccineStillValid.out === 1;

    component membership = MerkleInclusion(levels);
    membership.leaf <== importDocCommitment;
    membership.root <== approvedImportRoot;
    for (var i = 0; i < levels; i++) {
        membership.pathElements[i] <== pathElements[i];
        membership.pathIndices[i] <== pathIndices[i];
    }
}

component main { public [importDocCommitment, registeredBatchHashField, vaccineExpiryDate, currentDate, approvedImportRoot] } = ImportRegistration(8);
