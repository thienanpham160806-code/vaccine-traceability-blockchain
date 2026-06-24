/**
 * reconcile-firebase.ts
 * Re-register all Firebase products onto the new deployed contracts in parallel,
 * then clear stale transfers so Firebase and on-chain are back in sync.
 *
 * Usage:
 *   npm run reconcile              -- check existence before registering
 *   npm run reconcile:force        -- skip existence check (fast for fresh seed)
 *   npm run reconcile:dry          -- preview only, no writes
 *   npm run reconcile:clear        -- only clear transfers, skip re-registration
 */

import * as admin from 'firebase-admin';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN    = process.argv.includes('--dry-run');
const CLEAR_ONLY = process.argv.includes('--clear-only');
const FORCE      = process.argv.includes('--force'); // skip on-chain existence check
const ZERO_BYTES32 = '0x' + '0'.repeat(64);

const RPC_URL                  = process.env.BLOCKCHAIN_RPC_URL!;
const PRODUCT_REGISTRY_ADDRESS = process.env.PRODUCT_REGISTRY_ADDRESS!;

const ROLE_PKS: Record<string, string | undefined> = {
  MANUFACTURER: process.env.MANUFACTURER_PRIVATE_KEY,
  IMPORTER:     process.env.IMPORTER_PRIVATE_KEY,
};

// ─── Firebase ────────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID!,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL!,
});
const db = admin.database();

// ─── ABI ─────────────────────────────────────────────────────────────────────

function loadAbi(name: string): any[] {
  const p = path.join(__dirname, '..', 'src', 'contracts', 'abis', `${name}.json`);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return raw.abi || raw;
}
const REGISTRY_ABI = loadAbi('ProductRegistry');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBytes32(value: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

const log  = (m: string) => console.log(m);
const ok   = (m: string) => console.log('  ✅', m);
const skip = (m: string) => console.log('  ⏭ ', m);
const fail = (m: string) => console.log('  ❌', m);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log('═══════════════════════════════════════════════');
  log('  Firebase ↔ On-chain Reconciliation Script');
  if (DRY_RUN)    log('  MODE: DRY RUN (no writes)');
  if (CLEAR_ONLY) log('  MODE: CLEAR ONLY');
  log('═══════════════════════════════════════════════');
  log(`\nRPC:      ${RPC_URL}`);
  log(`Registry: ${PRODUCT_REGISTRY_ADDRESS}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // ── Build signers keyed by role ───────────────────────────────────────────

  const signers: Record<string, ethers.Wallet> = {};
  for (const [role, pk] of Object.entries(ROLE_PKS)) {
    if (pk) signers[role] = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  }

  // ── Step 1: Re-register products in parallel ──────────────────────────────

  if (!CLEAR_ONLY) {
    log('─── Step 1: Re-register products on-chain (parallel) ───\n');

    const snap = await db.ref('products').once('value');
    const map  = snap.val() as Record<string, any> | null;

    if (!map) {
      log('No products in Firebase.\n');
    } else {
      const entries = Object.entries(map);
      log(`Found ${entries.length} product(s). Checking on-chain status...\n`);

      // Map entries to metadata (always needed)
      const mapped = entries.map(([productKey, product]) => {
        const serialId   = product.serialId || productKey;
        const serialHash = toBytes32(serialId);
        const signerRole = product.isImported ? 'IMPORTER' : 'MANUFACTURER';
        const signer     = signers[signerRole];
        return { productKey, product, serialId, serialHash, signerRole, signer, noKey: !signer };
      });

      let toRegister: typeof mapped;
      const noKey = mapped.filter(e => e.noKey);
      noKey.forEach(e => fail(`${e.serialId} — no private key for ${e.signerRole}`));

      if (FORCE) {
        log(`  --force: skipping on-chain existence check for ${mapped.length} product(s)`);
        toRegister = mapped.filter(e => !e.noKey);
      } else {
        // Check all existence in parallel
        log(`  Checking on-chain existence for ${mapped.length} product(s)...`);
        const existResults = await Promise.all(
          mapped.filter(e => !e.noKey).map(async (e) => {
            try {
              const registry = new ethers.Contract(PRODUCT_REGISTRY_ADDRESS, REGISTRY_ABI, e.signer!);
              const exists   = await registry.productExists(e.serialHash);
              return { ...e, exists };
            } catch {
              return { ...e, exists: false };
            }
          })
        );
        const alreadyOn = existResults.filter(e => e.exists);
        alreadyOn.forEach(e => skip(`${e.serialId} — already on-chain`));
        toRegister = existResults.filter(e => !e.exists) as typeof mapped;
      }

      if (toRegister.length === 0) {
        log('\n  Nothing to register.\n');
      } else {
        log(`\n  Sending ${toRegister.length} transaction(s) in parallel...\n`);

        // Group by role to manage nonces per wallet
        const byRole: Record<string, typeof toRegister> = {};
        for (const item of toRegister) {
          if (!byRole[item.signerRole]) byRole[item.signerRole] = [];
          byRole[item.signerRole].push(item);
        }

        // For each role wallet: get starting nonce, then send all txs with incremental nonces
        const allTxPromises: Promise<{ item: typeof toRegister[0]; txHash: string } | { item: typeof toRegister[0]; error: string }>[] = [];

        for (const [role, items] of Object.entries(byRole)) {
          const signer = signers[role]!;
          let nonce    = await signer.getNonce();
          const registry = new ethers.Contract(PRODUCT_REGISTRY_ADDRESS, REGISTRY_ABI, signer);

          for (const item of items) {
            const batchHash    = item.product.batchHash    || toBytes32(item.product.batchId || item.serialId);
            const metadataHash = item.product.metadataHash || toBytes32(
              JSON.stringify({ serialId: item.serialId, productName: item.product.productName })
            );

            if (DRY_RUN) {
              console.log(`  [dry-run] would send tx for ${item.serialId} (${role}) nonce=${nonce}`);
              nonce++;
              continue;
            }

            const currentNonce = nonce++;
            const txPromise = (async () => {
              try {
                const tx = await registry.registerProduct(
                  item.serialHash,
                  batchHash,
                  metadataHash,
                  ZERO_BYTES32,
                  '0x',
                  { gasLimit: 500000, nonce: currentNonce }
                );
                console.log(`  📤 ${item.serialId} submitted (nonce=${currentNonce}, tx=${tx.hash.slice(0, 18)}...)`);
                const receipt = await tx.wait();
                return { item, txHash: receipt.hash };
              } catch (e: any) {
                return { item, error: e.message as string };
              }
            })();
            allTxPromises.push(txPromise);
          }
        }

        // Wait for all transactions
        if (!DRY_RUN) {
          log('\n  Waiting for confirmations...\n');
          const results = await Promise.all(allTxPromises);
          const now = Date.now();

          let registered = 0, failed = 0;
          const firebaseUpdates: Promise<void>[] = [];

          for (const result of results) {
            if ('error' in result) {
              fail(`${result.item.serialId} — ${result.error}`);
              failed++;
            } else {
              ok(`${result.item.serialId} → ${result.txHash.slice(0, 18)}...`);
              registered++;
              const signer = signers[result.item.signerRole]!;
              firebaseUpdates.push(
                db.ref(`products/${result.item.productKey}`).update({
                  blockchainTx: result.txHash,
                  status:       'VERIFIED',
                  currentOwner: signer.address,
                  ownerRole:    result.item.signerRole,
                  updatedAt:    now,
                })
              );
            }
          }

          // Update Firebase in parallel
          await Promise.all(firebaseUpdates);
          log('');
          log(`  Registered: ${registered}  |  Failed: ${failed}  |  Skipped: ${alreadyOn.length}`);
        }
      }
    }
  }

  // ── Step 2: Clear stale transfers ─────────────────────────────────────────

  log('\n─── Step 2: Clear stale transfers ───\n');

  const [tSnap, pSnap] = await Promise.all([
    db.ref('transfers').once('value'),
    db.ref('pending-transfers').once('value'),
  ]);

  log(`  transfers:         ${tSnap.numChildren()} record(s)`);
  log(`  pending-transfers: ${pSnap.numChildren()} record(s)`);

  if (!DRY_RUN) {
    await Promise.all([
      tSnap.numChildren() > 0 ? db.ref('transfers').remove() : Promise.resolve(),
      pSnap.numChildren() > 0 ? db.ref('pending-transfers').remove() : Promise.resolve(),
    ]);
    if (tSnap.numChildren() > 0)  ok('Deleted all transfers');
    if (pSnap.numChildren() > 0)  ok('Deleted all pending-transfers');
  } else {
    log('  [dry-run] would delete transfers and pending-transfers');
  }

  log('\n═══════════════════════════════════════════════');
  log('  Reconciliation complete.');
  log('═══════════════════════════════════════════════\n');

  await db.app.delete();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});
