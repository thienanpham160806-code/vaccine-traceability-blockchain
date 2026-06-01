import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import config from '../config/env';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';

const SNARK_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const MERKLE_DEPTH = 8;

export type ImportDocumentFields = {
  docId: string;
  importerLicense: string;
  manufacturerId: string;
  batchNo: string;
  documentExpiryDate: string;
  salt: string;
  regulatorCertificateId: string;
};

export type Groth16Calldata = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  input: [string, string, string, string, string];
  mode: 'groth16' | 'demo';
};

type ApprovedDocRecord = {
  commitment: string;
  fields: ImportDocumentFields;
  approvedBy: string;
  approvedAt: number;
  regulatorCertificateId: string;
};

function normalizePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function toFieldFromString(value: string): bigint {
  return BigInt(ethers.keccak256(ethers.toUtf8Bytes(value.trim()))) % SNARK_FIELD;
}

function toFieldFromBytes32(value: string): bigint {
  return BigInt(value) % SNARK_FIELD;
}

function dateToField(value: string): bigint {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return BigInt(date.toISOString().slice(0, 10).replace(/-/g, ''));
}

function todayField(): bigint {
  return dateToField(new Date().toISOString().slice(0, 10));
}

function toBytes32(value: bigint): string {
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function asDecimal(value: bigint): string {
  return value.toString(10);
}

class ImportZkpService {
  private poseidon: any | null = null;

  getSnarkField(): bigint {
    return SNARK_FIELD;
  }

  batchNoToField(batchNo: string): bigint {
    return toFieldFromString(batchNo);
  }

  batchNoToBytes32(batchNo: string): string {
    return toBytes32(this.batchNoToField(batchNo));
  }

  async hash(values: bigint[]): Promise<bigint> {
    const poseidon = await this.getPoseidon();
    const raw = poseidon(values.map((value) => value.toString()));
    return BigInt(poseidon.F.toString(raw));
  }

  async getPoseidon() {
    if (this.poseidon) return this.poseidon;

    try {
      // Dynamic require keeps TypeScript builds working when optional ZKP deps are installed later.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const circomlibjs = require('circomlibjs');
      this.poseidon = await circomlibjs.buildPoseidon();
      return this.poseidon;
    } catch (error) {
      Logger.error('circomlibjs is required for importer ZKP commitments', error);
      throw new Error('ZKP Poseidon hasher is not available. Run npm install in backend.');
    }
  }

  async computeImportDocCommitment(fields: ImportDocumentFields, batchHash: string): Promise<bigint> {
    return this.hash([
      toFieldFromString(fields.docId),
      toFieldFromString(fields.importerLicense),
      toFieldFromString(fields.manufacturerId),
      toFieldFromBytes32(batchHash),
      dateToField(fields.documentExpiryDate),
      toFieldFromString(fields.salt),
    ]);
  }

  async approveDocuments(
    docs: ImportDocumentFields[],
    approvedBy = 'demo-regulator'
  ): Promise<{ root: string; records: ApprovedDocRecord[] }> {
    const now = Date.now();
    const records: ApprovedDocRecord[] = [];

    for (const fields of docs) {
      const batchHash = this.batchNoToBytes32(fields.batchNo);
      const commitment = await this.computeImportDocCommitment(fields, batchHash);
      records.push({
        commitment: asDecimal(commitment),
        fields,
        approvedBy,
        approvedAt: now,
        regulatorCertificateId: fields.regulatorCertificateId,
      });
    }

    const tree = await this.buildMerkleTree(records.map((record) => BigInt(record.commitment)));
    const root = asDecimal(tree.root);

    await db.ref('import-zkp').set({
      root,
      depth: MERKLE_DEPTH,
      records,
      updatedAt: now,
      approvedBy,
    });

    return { root, records };
  }

  async getApprovedState(): Promise<{ root: string; records: ApprovedDocRecord[] }> {
    const snapshot = await db.ref('import-zkp').once('value');
    const state = snapshot.val();
    return {
      root: state?.root || '0',
      records: Array.isArray(state?.records) ? state.records : [],
    };
  }

  async buildMerkleTree(leaves: bigint[]): Promise<{ root: bigint; layers: bigint[][] }> {
    let layer = [...leaves];
    const zero = BigInt(0);
    const layers = [layer];

    for (let level = 0; level < MERKLE_DEPTH; level++) {
      const next: bigint[] = [];
      const width = Math.max(1, Math.ceil(layer.length / 2));

      for (let i = 0; i < width; i++) {
        const left = layer[i * 2] ?? zero;
        const right = layer[i * 2 + 1] ?? zero;
        next.push(await this.hash([left, right]));
      }

      layer = next;
      layers.push(layer);
    }

    return { root: layers[layers.length - 1][0] ?? zero, layers };
  }

  async buildMerkleWitness(commitment: bigint, records: ApprovedDocRecord[]) {
    const leaves = records.map((record) => BigInt(record.commitment));
    const index = leaves.findIndex((leaf) => leaf === commitment);

    if (index < 0) {
      throw new Error('Import document is not in the approved regulator list');
    }

    const tree = await this.buildMerkleTree(leaves);
    const pathElements: string[] = [];
    const pathIndices: string[] = [];
    let cursor = index;

    for (let level = 0; level < MERKLE_DEPTH; level++) {
      const siblingIndex = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
      pathElements.push(asDecimal(tree.layers[level][siblingIndex] ?? BigInt(0)));
      pathIndices.push(String(cursor % 2));
      cursor = Math.floor(cursor / 2);
    }

    return { root: tree.root, pathElements, pathIndices };
  }

  async generateRegistrationProof(params: {
    importDocument: ImportDocumentFields;
    batchHash: string;
    vaccineExpiryDate: string;
  }): Promise<{
    commitment: string;
    approvedRoot: string;
    batchHashField: string;
    vaccineExpiryDateField: string;
    currentDateField: string;
    proof: Groth16Calldata;
  }> {
    const commitment = await this.computeImportDocCommitment(params.importDocument, params.batchHash);
    const approvedState = await this.getApprovedState();
    const witness = await this.buildMerkleWitness(commitment, approvedState.records);

    if (asDecimal(witness.root) !== approvedState.root) {
      throw new Error('Approved import root is out of sync with approved documents');
    }

    const batchHashField = toFieldFromBytes32(params.batchHash);
    const vaccineExpiryDateField = dateToField(params.vaccineExpiryDate);
    const currentDateField = todayField();
    const documentExpiryDateField = dateToField(params.importDocument.documentExpiryDate);

    if (documentExpiryDateField < currentDateField) {
      throw new Error('Import document has expired');
    }

    if (vaccineExpiryDateField < currentDateField) {
      throw new Error('Vaccine has expired');
    }

    const input = {
      docId: asDecimal(toFieldFromString(params.importDocument.docId)),
      importerLicense: asDecimal(toFieldFromString(params.importDocument.importerLicense)),
      manufacturerId: asDecimal(toFieldFromString(params.importDocument.manufacturerId)),
      batchHashField: asDecimal(batchHashField),
      documentExpiryDate: asDecimal(documentExpiryDateField),
      salt: asDecimal(toFieldFromString(params.importDocument.salt)),
      pathElements: witness.pathElements,
      pathIndices: witness.pathIndices,
      importDocCommitment: asDecimal(commitment),
      registeredBatchHashField: asDecimal(batchHashField),
      vaccineExpiryDate: asDecimal(vaccineExpiryDateField),
      currentDate: asDecimal(currentDateField),
      approvedImportRoot: approvedState.root,
    };

    const proof = await this.tryGenerateGroth16(input);

    return {
      commitment: asDecimal(commitment),
      approvedRoot: approvedState.root,
      batchHashField: asDecimal(batchHashField),
      vaccineExpiryDateField: asDecimal(vaccineExpiryDateField),
      currentDateField: asDecimal(currentDateField),
      proof,
    };
  }

  private async tryGenerateGroth16(input: Record<string, unknown>): Promise<Groth16Calldata> {
    const wasmPath = normalizePath(config.importZkpWasmPath);
    const zkeyPath = normalizePath(config.importZkpZkeyPath);

    if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const snarkjs = require('snarkjs');
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const argv = JSON.parse(`[${calldata}]`);

        return {
          a: [String(argv[0][0]), String(argv[0][1])],
          b: [
            [String(argv[1][0][0]), String(argv[1][0][1])],
            [String(argv[1][1][0]), String(argv[1][1][1])],
          ],
          c: [String(argv[2][0]), String(argv[2][1])],
          input: argv[3].map(String) as [string, string, string, string, string],
          mode: 'groth16',
        };
      } catch (error) {
        Logger.warn('Groth16 proof generation failed; falling back to demo verifier calldata', error);
      }
    }

    const publicInput = [
      String(input.importDocCommitment),
      String(input.registeredBatchHashField),
      String(input.vaccineExpiryDate),
      String(input.currentDate),
      String(input.approvedImportRoot),
    ] as [string, string, string, string, string];

    return {
      a: [publicInput[0], '1'],
      b: [
        [publicInput[1], publicInput[2]],
        [publicInput[3], '1'],
      ],
      c: [publicInput[4], '1'],
      input: publicInput,
      mode: 'demo',
    };
  }
}

export const importZkpService = new ImportZkpService();
export default importZkpService;
