import type { ImportDocumentFields } from '../src/services/importZkp';
import { CryptoUtils } from '../src/utils/crypto';
import { Logger } from '../src/utils/logger';
import { Batch, Product, TransferRecord } from '../src/types';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

type DemoProductSpec = {
  serialId: string;
  batchId: string;
  productName: string;
  manufacturerName: string;
  manufacturerAddress: string;
  expiryDate: string;
  origin: 'MANUFACTURED' | 'IMPORTED';
  location: string;
  importDocument?: ImportDocumentFields;
};

let db: typeof import('../src/config/firebase').db;
let contractClient: typeof import('../src/contracts/client').contractClient;
let importZkpService: typeof import('../src/services/importZkp').importZkpService;

function logStep(message: string) {
  Logger.info(`[seed-demo] ${message}`);
}

function toBytes32(value: string): string {
  return CryptoUtils.isValidHash(value) ? value : CryptoUtils.keccak256(value);
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function locationHash(value: string) {
  return toBytes32(value);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)])
    ) as T;
  }

  return value;
}

async function registerDemoProduct(spec: DemoProductSpec) {
  logStep(`Checking on-chain product ${spec.serialId}`);

  const serialHash = toBytes32(spec.serialId);
  const exists = await contractClient.productExists(serialHash).catch(() => false);
  const batchHash = spec.origin === 'IMPORTED'
    ? importZkpService.batchNoToBytes32(spec.importDocument?.batchNo || spec.batchId)
    : toBytes32(spec.batchId);
  const metadataPayload = {
    serialId: spec.serialId,
    serialHash,
    batchId: spec.batchId,
    batchHash,
    productName: spec.productName,
    manufacturerName: spec.manufacturerName,
    manufacturerAddress: spec.manufacturerAddress,
    expiryDate: spec.expiryDate,
    origin: spec.origin,
    location: spec.location,
    createdAt: Date.now(),
  };
  const metadataHash = toBytes32(JSON.stringify(metadataPayload));
  let txHash = 'already-registered';
  let importDocCommitment: string | undefined;
  let approvedImportRoot: string | undefined;
  let importProofMode: string | undefined;

  const zkp = spec.origin === 'IMPORTED' && spec.importDocument
    ? await importZkpService.generateRegistrationProof({
      importDocument: spec.importDocument,
      batchHash,
      vaccineExpiryDate: spec.expiryDate,
    })
    : undefined;

  if (zkp) {
    importDocCommitment = zkp.commitment;
    approvedImportRoot = zkp.approvedRoot;
    importProofMode = zkp.proof.mode;
  }

  if (!exists) {
    if (zkp) {
      logStep(`Registering imported product ${spec.serialId} on-chain`);
      txHash = await contractClient.registerImportedProductZK(serialHash, batchHash, metadataHash, zkp.proof, 'IMPORTER');
    } else {
      logStep(`Registering domestic product ${spec.serialId} on-chain`);
      txHash = await contractClient.registerProduct(serialHash, batchHash, metadataHash, ZERO_BYTES32, '0x', 'MANUFACTURER');
    }
  } else {
    logStep(`Product ${spec.serialId} already exists on-chain, keeping existing registration`);
  }

  const currentOwner = spec.origin === 'IMPORTED'
    ? contractClient.getRoleAddress('IMPORTER')
    : contractClient.getRoleAddress('MANUFACTURER');
  const createdAt = Date.now();
  const batch: Batch = {
    id: spec.batchId,
    batchHash,
    batchQR: spec.batchId,
    metadataHash,
    productName: spec.productName,
    quantity: 1,
    manufacturerAddress: spec.manufacturerAddress,
    manufacturerName: spec.manufacturerName,
    expiryDate: spec.expiryDate,
    origin: spec.origin,
    importDocCommitment,
    approvedImportRoot,
    createdAt,
    updatedAt: createdAt,
  };
  const product: Product = {
    serialId: spec.serialId,
    batchId: spec.batchId,
    batchHash,
    productName: spec.productName,
    manufacturerName: spec.manufacturerName,
    manufacturerAddress: spec.manufacturerAddress,
    currentOwner,
    status: 'VERIFIED',
    riskLevel: 'SAFE',
    expiryDate: spec.expiryDate,
    isImported: spec.origin === 'IMPORTED',
    zkpVerified: spec.origin === 'IMPORTED',
    blockchainTx: txHash,
    metadataHash,
    importDocCommitment,
    approvedImportRoot,
    importProofMode,
    createdAt,
    updatedAt: createdAt,
  };

  return { serialHash, batchHash, metadataHash, batch, product, txHash };
}

function makeTransfer(
  id: string,
  serialId: string,
  batchId: string,
  fromRole: any,
  toRole: any,
  status: any,
  fromLocation: string,
  toLocation: string,
  offsetMinutes: number
): TransferRecord {
  const timestamp = Date.now() + offsetMinutes * 60_000;
  return {
    id,
    serialId,
    batchId,
    fromAddress: contractClient.getRoleAddress(fromRole),
    toAddress: contractClient.getRoleAddress(toRole),
    fromRole,
    toRole,
    status,
    fromLocationHash: locationHash(fromLocation),
    toLocationHash: locationHash(toLocation),
    confirmedAt: status === 'CONFIRMED' ? timestamp + 60_000 : undefined,
    rejectedAt: status === 'REJECTED' ? timestamp + 60_000 : undefined,
    createdAt: timestamp,
    updatedAt: timestamp + 60_000,
  };
}

async function main() {
  const activate = process.argv.includes('--activate');
  const suffixArg = process.argv.find((arg) => arg.startsWith('--suffix='));
  const suffix = suffixArg ? suffixArg.slice('--suffix='.length) : nowStamp();

  logStep('Loading Firebase, contract client and importer ZKP service');
  // Lazy require keeps this script debuggable: startup logs print before SDK/RPC initialization.
  ({ db } = require('../src/config/firebase'));
  ({ contractClient } = require('../src/contracts/client'));
  ({ importZkpService } = require('../src/services/importZkp'));

  logStep('Initializing contracts');
  await contractClient.initialize();
  if (!contractClient.isInitialized()) {
    throw new Error('Contracts are not initialized. Check backend .env.');
  }

  const importDocs: ImportDocumentFields[] = [
    {
      docId: `IMP-DOC-PFIZER-${suffix}`,
      importerLicense: 'VN-IMPORT-LICENSE-001',
      manufacturerId: 'PFIZER-GLOBAL',
      batchNo: `IMP-PFIZER-${suffix}`,
      documentExpiryDate: '2028-12-31',
      salt: `salt-pfizer-${suffix}`,
      regulatorCertificateId: 'DAV-CERT-IMPORT-001',
    },
  ];

  logStep('Creating regulator-approved importer document list');
  const approval = await importZkpService.approveDocuments(importDocs, 'RECALL_AUTHORITY');
  logStep(`Setting approved import root on-chain: ${approval.root}`);
  await contractClient.setApprovedImportRoot(approval.root, 'admin');

  const specs: DemoProductSpec[] = [
    {
      serialId: `VCN-DEMO-${suffix}-001`,
      batchId: `BATCH-PASTEUR-${suffix}`,
      productName: 'Hexaxim Vaccine',
      manufacturerName: 'Pasteur Da Lat',
      manufacturerAddress: contractClient.getRoleAddress('MANUFACTURER'),
      expiryDate: '2028-06-30',
      origin: 'MANUFACTURED',
      location: 'Nha may Pasteur Da Lat',
    },
    {
      serialId: `VCN-DEMO-${suffix}-002`,
      batchId: `BATCH-VABIOTECH-${suffix}`,
      productName: 'ComBE Five',
      manufacturerName: 'Vabiotech',
      manufacturerAddress: contractClient.getRoleAddress('MANUFACTURER'),
      expiryDate: '2027-12-31',
      origin: 'MANUFACTURED',
      location: 'Nha may Vabiotech Ha Noi',
    },
    {
      serialId: `VCN-DEMO-${suffix}-003`,
      batchId: importDocs[0].batchNo,
      productName: 'Pfizer Pediatric',
      manufacturerName: 'Pfizer Global',
      manufacturerAddress: contractClient.getRoleAddress('IMPORTER'),
      expiryDate: '2028-10-31',
      origin: 'IMPORTED',
      location: 'Kho nhap khau Tan Son Nhat',
      importDocument: importDocs[0],
    },
    {
      serialId: `VCN-DEMO-${suffix}-004`,
      batchId: `BATCH-RECALL-${suffix}`,
      productName: 'ColdChain Alert Vaccine',
      manufacturerName: 'Saigon BioPharma',
      manufacturerAddress: contractClient.getRoleAddress('MANUFACTURER'),
      expiryDate: '2027-08-31',
      origin: 'MANUFACTURED',
      location: 'Nha may Saigon BioPharma',
    },
  ];

  const registered = [];
  for (const spec of specs) {
    registered.push(await registerDemoProduct(spec));
  }

  const [delivered, inTransit, imported, recalled] = registered;
  const transfers: Record<string, TransferRecord> = {
    [`TR-DEMO-${suffix}-001`]: makeTransfer(`TR-DEMO-${suffix}-001`, delivered.product.serialId, delivered.product.batchId, 'MANUFACTURER', 'DISTRIBUTOR', 'CONFIRMED', 'Nha may Pasteur Da Lat', 'Kho Quan 7', -240),
    [`TR-DEMO-${suffix}-002`]: makeTransfer(`TR-DEMO-${suffix}-002`, delivered.product.serialId, delivered.product.batchId, 'DISTRIBUTOR', 'CLINIC', 'CONFIRMED', 'Kho Quan 7', 'Phong kham Nhi Quan 1', -120),
    [`TR-DEMO-${suffix}-003`]: makeTransfer(`TR-DEMO-${suffix}-003`, inTransit.product.serialId, inTransit.product.batchId, 'MANUFACTURER', 'DISTRIBUTOR', 'PENDING', 'Nha may Vabiotech Ha Noi', 'Kho Da Nang', -30),
    [`TR-DEMO-${suffix}-004`]: makeTransfer(`TR-DEMO-${suffix}-004`, imported.product.serialId, imported.product.batchId, 'IMPORTER', 'DISTRIBUTOR', 'CONFIRMED', 'Kho nhap khau Tan Son Nhat', 'Kho Binh Duong', -180),
    [`TR-DEMO-${suffix}-005`]: makeTransfer(`TR-DEMO-${suffix}-005`, recalled.product.serialId, recalled.product.batchId, 'MANUFACTURER', 'DISTRIBUTOR', 'REJECTED', 'Nha may Saigon BioPharma', 'Kho Quan 9', -90),
  };

  inTransit.product.status = 'IN_TRANSIT';
  delivered.product.status = 'DELIVERED';
  imported.product.status = 'DELIVERED';
  recalled.product.status = 'RECALLED';
  recalled.product.riskLevel = 'CRITICAL';
  recalled.batch.recalledAt = Date.now();

  const products = Object.fromEntries(registered.map((item) => [item.serialHash, item.product]));
  const batches = Object.fromEntries(registered.map((item) => [item.batchHash, item.batch]));
  const serialIndex = Object.fromEntries(registered.map((item) => [item.product.serialId, item.serialHash]));
  const riskFlags = {
    [`RISK-DEMO-${suffix}-001`]: {
      id: `RISK-DEMO-${suffix}-001`,
      serialId: recalled.product.serialId,
      batchId: recalled.product.batchId,
      reason: 'Cold chain dispute during distributor handoff',
      level: 4,
      createdAt: Date.now() - 80 * 60_000,
    },
  };
  const recalls = {
    [recalled.batch.batchHash]: {
      id: recalled.batch.batchHash,
      batchHash: recalled.batch.batchHash,
      reasonHash: toBytes32('Cold chain temperature excursion'),
      authorityAddress: contractClient.getRoleAddress('RECALL_AUTHORITY'),
      serialsAffected: 1,
      createdAt: Date.now(),
    },
  };

  const dataset = {
    products,
    batches,
    transfers,
    'serial-index': serialIndex,
    'risk-flags': riskFlags,
    recalls,
    'import-zkp': {
      root: approval.root,
      depth: 8,
      records: approval.records,
      updatedAt: Date.now(),
      approvedBy: 'RECALL_AUTHORITY',
    },
    meta: {
      name: 'demo',
      createdAt: Date.now(),
      activateHint: 'Run with --activate to mirror this dataset into app root nodes.',
    },
  };

  logStep(`Writing demo dataset demo-${suffix} to Firebase`);
  await db.ref(`demo-datasets/demo-${suffix}`).set(stripUndefined(dataset));

  if (activate) {
    logStep(`Activating demo dataset demo-${suffix}`);
    await db.ref().update(stripUndefined({
      products,
      batches,
      transfers,
      'serial-index': serialIndex,
      'risk-flags': riskFlags,
      recalls,
      'import-zkp': dataset['import-zkp'],
      'active-demo-dataset': `demo-${suffix}`,
    }));
  }

  Logger.success(`Demo dataset demo-${suffix} created${activate ? ' and activated' : ''}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    Logger.error('Seed demo failed', error);
    process.exit(1);
  });
