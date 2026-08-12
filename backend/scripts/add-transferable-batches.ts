/**
 * add-transferable-batches.ts
 * Thêm 5 lô transferable cho MANUFACTURER và DISTRIBUTOR
 * 
 * Usage:
 *   npx ts-node scripts/add-transferable-batches.ts
 */

import * as admin from 'firebase-admin';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ─── Firebase Setup ───────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID!,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL!,
});
const db = admin.database();

// ─── Wallet Addresses ──────────────────────────────────────────────────────

function walletAddr(pk?: string): string {
  if (!pk) return ethers.ZeroAddress;
  const key = pk.startsWith('0x') ? pk : `0x${pk}`;
  return new ethers.Wallet(key).address;
}

const WALLETS = {
  MANUFACTURER:     walletAddr(process.env.MANUFACTURER_ADDRESS || process.env.MANUFACTURER_PRIVATE_KEY),
  IMPORTER:         walletAddr(process.env.IMPORTER_ADDRESS || process.env.IMPORTER_PRIVATE_KEY),
  DISTRIBUTOR:      walletAddr(process.env.DISTRIBUTOR_ADDRESS || process.env.DISTRIBUTOR_PRIVATE_KEY),
  CLINIC:           walletAddr(process.env.CLINIC_ADDRESS || process.env.CLINIC_PRIVATE_KEY),
  PHARMACY:         walletAddr(process.env.PHARMACY_ADDRESS || process.env.PHARMACY_PRIVATE_KEY),
  RECALL_AUTHORITY: walletAddr(process.env.RECALL_AUTHORITY_ADDRESS || process.env.RECALL_AUTHORITY_PRIVATE_KEY),
};

console.log('📋 Wallet Addresses:');
Object.entries(WALLETS).forEach(([role, addr]) => {
  console.log(`   ${role.padEnd(20)}: ${addr}`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function hash32(v: string): string {
  return /^0x[0-9a-f]{64}$/i.test(v) ? v : ethers.keccak256(ethers.toUtf8Bytes(v));
}

const daysAgo = (n: number) => Date.now() - n * 86_400_000;
const daysLater = (n: number) => Date.now() + n * 86_400_000;

// ─── Mock Data ─────────────────────────────────────────────────────────────

const VACCINES = [
  { name: 'Hexaxim (6-in-1)', manufacturer: 'Sanofi Pasteur' },
  { name: 'ComBE Five (5-in-1)', manufacturer: 'Vabiotech' },
  { name: 'Influenza Vaccine', manufacturer: 'Abbott' },
  { name: 'Gardasil 9 (HPV)', manufacturer: 'Pfizer' },
  { name: 'Prevenar 13', manufacturer: 'Pfizer' },
];

const WAREHOUSES = {
  MANUFACTURER: [
    'Nhà máy Sanofi Pasteur TP.HCM',
    'Xưởng sản xuất Vabiotech Hà Nội',
  ],
  DISTRIBUTOR: [
    'Kho phân phối Quận 7 TP.HCM',
    'Kho Vaccine Hà Đông',
    'Kho phân phối Đà Nẵng',
  ],
};

// ─── Counters ──────────────────────────────────────────────────────────────

let batchCounter = 10000;
let transferCounter = 10000;

const nextBatchId = () => `BATCH-VCN-2026-${String(++batchCounter).padStart(4, '0')}`;
const nextTransferId = () => `TR-${String(++transferCounter).padStart(5, '0')}`;

// ─── Generators ──────────────────────────────────────────────────────────

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeBatch(vacIdx: number, ownerRole: 'MANUFACTURER' | 'DISTRIBUTOR') {
  const vac = VACCINES[vacIdx % VACCINES.length];
  const batchId = nextBatchId();
  const batchHash = hash32(batchId);
  const metadataHash = hash32(JSON.stringify({ batchId, productName: vac.name, manufacturer: vac.manufacturer }));
  const expiryDate = new Date(daysLater(540)).toISOString().split('T')[0];

  return {
    id: batchId,
    batchHash,
    batchQR: batchId,
    metadataHash,
    productName: vac.name,
    quantity: 3,
    manufacturerAddress: WALLETS.MANUFACTURER,
    manufacturerName: vac.manufacturer,
    expiryDate,
    origin: 'MANUFACTURED',
    currentOwner: WALLETS[ownerRole],
    ownerRole,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
  };
}

function makeProduct(batch: any, suffix: string, owner: string, ownerRole: string) {
  const serialId = `${batch.batchQR}-${suffix}`;
  const serialHash = hash32(serialId);

  return {
    serialId,
    serialHash,
    batchId: batch.id,
    batchHash: batch.batchHash,
    productName: batch.productName,
    manufacturerName: batch.manufacturerName,
    manufacturerAddress: batch.manufacturerAddress,
    currentOwner: owner,
    ownerRole,
    status: 'VERIFIED', // Transferable status
    riskLevel: 'LOW',
    expiryDate: batch.expiryDate,
    isImported: false,
    zkpVerified: false,
    syncStatus: 'OK',
    blockchainTx: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    createdAt: batch.createdAt,
    updatedAt: batch.createdAt,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Add 5 Transferable Batches (MANUFACTURER + DISTRIBUTOR)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batches: Record<string, any> = {};
    const products: Record<string, any> = {};
    const serialIndex: Record<string, string> = {};

    // Create 3 batches for MANUFACTURER
    console.log('🏭 Creating 3 batches for MANUFACTURER...\n');
    for (let i = 0; i < 3; i++) {
      const batch = makeBatch(i, 'MANUFACTURER');
      batches[batch.batchHash] = batch;
      console.log(`   Batch ${i + 1}/3: ${batch.batchQR} (MANUFACTURER)`);

      // Create 3 products per batch
      for (let p = 1; p <= 3; p++) {
        const suffix = `S${String(p).padStart(2, '0')}`;
        const product = makeProduct(batch, suffix, WALLETS.MANUFACTURER, 'MANUFACTURER');
        products[product.serialHash] = product;
        serialIndex[product.serialId] = product.serialHash;
      }
    }

    // Create 2 batches for DISTRIBUTOR
    console.log('\n📦 Creating 2 batches for DISTRIBUTOR...\n');
    for (let i = 3; i < 5; i++) {
      const batch = makeBatch(i, 'DISTRIBUTOR');
      batches[batch.batchHash] = batch;
      console.log(`   Batch ${i - 2}/2: ${batch.batchQR} (DISTRIBUTOR)`);

      // Create 3 products per batch
      for (let p = 1; p <= 3; p++) {
        const suffix = `S${String(p).padStart(2, '0')}`;
        const product = makeProduct(batch, suffix, WALLETS.DISTRIBUTOR, 'DISTRIBUTOR');
        products[product.serialHash] = product;
        serialIndex[product.serialId] = product.serialHash;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   • Batches: ${Object.keys(batches).length}`);
    console.log(`   • Products: ${Object.keys(products).length}`);
    console.log(`   • All with status: VERIFIED (transferable)`);
    console.log(`   • All with syncStatus: OK`);

    // Write to Firebase
    console.log('\n📝 Writing to Firebase...\n');
    await db.ref('/').update({
      '/batches': batches,
      '/products': products,
      '/serial-index': serialIndex,
    });

    console.log('   ✅ Successfully wrote all data to Firebase');
    console.log('\n✅ Done! 5 transferable batches have been added.\n');
    console.log('📋 Ready to transfer:');
    console.log('   • 3 batches from MANUFACTURER (9 products)');
    console.log('   • 2 batches from DISTRIBUTOR (6 products)');
    console.log('\n');

  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
