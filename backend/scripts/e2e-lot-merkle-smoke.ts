/**
 * Full end-to-end smoke test for the lot-Merkle migration, driven entirely
 * through the real HTTP API (not internal function calls) against a live
 * local hardhat chain + the real `vaccine-refactor` Firebase project.
 *
 * Flow exercised:
 *   commission (lot-Merkle, quantity=5)
 *     -> lot transfer MANUFACTURER -> DISTRIBUTOR (opens a cold-chain leg)
 *     -> device registration + signed temperature readings (1 excursion)
 *     -> confirm-lot (receive side)
 *     -> seal leg (Merkle-anchor env data on-chain)
 *     -> disaggregate 2 units off to CLINIC
 *     -> dispense 1 unit (real Merkle proof + on-chain decommission)
 *     -> verify patient-links written with no PII
 *
 * All Firebase records created are prefixed SMOKE-E2E-<runId> and removed
 * in a `finally` block regardless of pass/fail (throwaway per project
 * convention — see VaxiTrust_Migration_Checklist.md).
 *
 * Run: cd backend && npx ts-node -r tsconfig-paths/register scripts/e2e-lot-merkle-smoke.ts
 * Requires: hardhat node + `npm run deploy:local` already done, backend .env
 * pointing at that deployment, backend dev server NOT required to be running
 * separately as long as BASE_URL below points at a running instance.
 */
import axios from 'axios';
import { ethers } from 'ethers';
import { db } from '../src/config/firebase';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5000';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const prefix = `SMOKE-E2E-${runId}`;

const ACCOUNTS = {
  MANUFACTURER: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  DISTRIBUTOR: { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
  CLINIC: { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' },
};

const cleanupPaths: string[] = [];
let passCount = 0;
let failCount = 0;

function step(label: string) {
  console.log(`\n\x1b[36m▶ ${label}\x1b[0m`);
}

function pass(label: string, detail?: unknown) {
  passCount++;
  console.log(`  \x1b[32m✓ ${label}\x1b[0m${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
}

function fail(label: string, detail?: unknown): never {
  failCount++;
  console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  throw new Error(`Smoke test failed at: ${label}`);
}

async function login(role: keyof typeof ACCOUNTS): Promise<string> {
  const { address, key } = ACCOUNTS[role];
  const wallet = new ethers.Wallet(key);
  const nonceRes = await axios.post(`${BASE_URL}/auth/nonce`, { address });
  const message = nonceRes.data.data.message;
  const signature = await wallet.signMessage(message);
  const loginRes = await axios.post(`${BASE_URL}/auth/login-with-signature`, { address, signature });
  return loginRes.data.data.token;
}

function authHeader(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function waitForJob(jobId: string, label: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db.ref(`onchain-jobs/${jobId}`).once('value');
    const job = snap.val();
    if (job?.status === 'CONFIRMED') {
      pass(`${label} (job ${jobId} confirmed, tx ${job.txHash?.slice(0, 10)}...)`);
      return;
    }
    if (job?.status === 'FAILED') {
      fail(`${label} — job ${jobId} FAILED`, job.error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${label} — job ${jobId} timed out after ${timeoutMs}ms`);
}

async function main() {
  console.log(`=== Lot-Merkle E2E smoke test (${prefix}) ===`);
  console.log(`API: ${BASE_URL}`);

  // ---- 1. Login as the 3 actors we need ----
  step('Login as MANUFACTURER / DISTRIBUTOR / CLINIC');
  const manufacturerToken = await login('MANUFACTURER');
  const distributorToken = await login('DISTRIBUTOR');
  const clinicToken = await login('CLINIC');
  pass('All 3 actors logged in via nonce+signature');

  // ---- 2. Commission a lot (quantity=5) ----
  step('POST /products/register — commission lot (quantity=5)');
  const registerRes = await axios.post(`${BASE_URL}/products/register`, {
    serialId: prefix,
    productName: 'Smoke Test Vaccine',
    manufacturerName: 'Smoke Test Manufacturer',
    expiryDate: '2027-12-31',
    quantity: 5,
  });
  const { lot, lotIdHash, aggregationRoot, serials, unitIdHashes, jobId: commissionJobId } = registerRes.data.data;
  if (serials.length !== 5 || unitIdHashes.length !== 5) fail('Expected 5 serials + 5 unitIdHashes', { serials, unitIdHashes });
  pass('Lot commissioned (Firebase written, job queued)', { lotCode: lot.id, lotIdHash, aggregationRoot });
  cleanupPaths.push(`batches/${lotIdHash}`, `lot-index/${lot.id}`);
  serials.forEach((s: string) => cleanupPaths.push(`serial-index/${s}`));
  unitIdHashes.forEach((h: string) => cleanupPaths.push(`products/${h}`));
  await waitForJob(commissionJobId, 'COMMISSION_LOT confirmed on-chain');

  const batchSnap = await db.ref(`batches/${lotIdHash}`).once('value');
  const batch = batchSnap.val();
  if (batch?.syncStatus !== 'OK') fail('batch.syncStatus should be OK after commission confirm', batch);
  pass('batches/{lotIdHash}.syncStatus === OK');

  // ---- 3. Lot transfer MANUFACTURER -> DISTRIBUTOR ----
  step('POST /transfers/lot-scan — MANUFACTURER ships lot to DISTRIBUTOR');
  const lotScanRes = await axios.post(
    `${BASE_URL}/transfers/lot-scan`,
    { lotId: lot.id, fromRole: 'MANUFACTURER', toRole: 'DISTRIBUTOR' },
    authHeader(manufacturerToken)
  );
  const { transfer, legId, jobId: shipJobId } = lotScanRes.data.data;
  const transferId = transfer.id;
  cleanupPaths.push(`transfers/${transferId}`, `cold-chain-legs/${legId}`, `cold-chain-readings/${legId}`);
  pass('Lot transfer created + cold-chain leg opened', { transferId, legId });
  await waitForJob(shipJobId, 'SHIP-side RECORD_EVENT confirmed');

  const transferAfterShip = (await db.ref(`transfers/${transferId}`).once('value')).val();
  if (transferAfterShip?.status !== 'PENDING') fail('transfer.status should be PENDING after SHIP confirm', transferAfterShip);
  pass('transfer.status === PENDING (ready for receiver to confirm)');

  // ---- 4. Cold-chain device + signed readings ----
  step('POST /coldchain/devices — register simulated sensor');
  const deviceWallet = ethers.Wallet.createRandom();
  const deviceId = `${prefix}-DEVICE`;
  cleanupPaths.push(`devices/${deviceId}`);
  await axios.post(
    `${BASE_URL}/coldchain/devices`,
    { deviceId, address: deviceWallet.address, label: 'Smoke test sensor' },
    authHeader(distributorToken)
  );
  pass('Device registered', { deviceId, address: deviceWallet.address });

  step('POST /coldchain/readings — push signed temperature readings (incl. 1 excursion)');
  const readingTemps = [4.5, 5.1, 12.0, 3.8]; // 12.0 is an intentional excursion (leg threshold defaults 2-8°C)
  let excursionSeen = false;
  for (let i = 0; i < readingTemps.length; i++) {
    const timestamp = Date.now() + i * 1000;
    const temperatureC = readingTemps[i];
    const payload = JSON.stringify({ legId, deviceId, timestamp, temperatureC });
    const signature = await deviceWallet.signMessage(payload);
    const readingRes = await axios.post(`${BASE_URL}/coldchain/readings`, { legId, deviceId, timestamp, temperatureC, signature });
    if (readingRes.data.data.isExcursion) excursionSeen = true;
  }
  if (!excursionSeen) fail('Expected at least one excursion reading to be flagged');
  pass(`${readingTemps.length} readings ingested, excursion correctly flagged`);

  // ---- 5. DISTRIBUTOR confirms receipt ----
  step('POST /transfers/:transferId/confirm-lot — DISTRIBUTOR confirms receipt');
  const confirmRes = await axios.post(`${BASE_URL}/transfers/${transferId}/confirm-lot`, {}, authHeader(distributorToken));
  if (confirmRes.data.data.unitsUpdated !== 5) fail('Expected 5 units updated on confirm-lot', confirmRes.data.data);
  pass('Lot transfer confirmed, 5 units re-owned to DISTRIBUTOR');

  const legAfterConfirm = (await db.ref(`cold-chain-legs/${legId}`).once('value')).val();
  if (legAfterConfirm?.status !== 'CLOSED_PENDING_SEAL') fail('leg.status should be CLOSED_PENDING_SEAL', legAfterConfirm);
  pass('cold-chain-legs/{legId}.status === CLOSED_PENDING_SEAL');

  // ---- 6. Seal the leg (anchors env Merkle root on-chain) ----
  step('POST /coldchain/legs/:legId/seal — DISTRIBUTOR seals + anchors');
  const sealRes = await axios.post(`${BASE_URL}/coldchain/legs/${legId}/seal`, {}, authHeader(distributorToken));
  const { jobId: anchorJobId, complianceFlag } = sealRes.data.data;
  if (complianceFlag !== false) fail('complianceFlag should be false (excursion present)', sealRes.data.data);
  pass('Leg sealed, complianceFlag correctly false due to excursion');
  await waitForJob(anchorJobId, 'ANCHOR_ENV confirmed on-chain');

  const legAfterSeal = (await db.ref(`cold-chain-legs/${legId}`).once('value')).val();
  if (legAfterSeal?.status !== 'SEALED' || !legAfterSeal?.anchoredTx) fail('leg should be SEALED with anchoredTx', legAfterSeal);
  pass('cold-chain-legs/{legId}.status === SEALED with anchoredTx');

  const batchAfterSeal = (await db.ref(`batches/${lotIdHash}`).once('value')).val();
  if (batchAfterSeal?.coldChainStatus !== 'EXCURSION') fail('batch.coldChainStatus should be EXCURSION', batchAfterSeal);
  pass('batches/{lotIdHash}.coldChainStatus === EXCURSION (propagated from leg)');

  // ---- 7. Disaggregate 2 units off to CLINIC ----
  step('POST /disaggregate — DISTRIBUTOR splits 2 units off to CLINIC');
  const disaggRes = await axios.post(
    `${BASE_URL}/disaggregate`,
    { lotId: lot.id, quantity: 2, toRole: 'CLINIC' },
    authHeader(distributorToken)
  );
  const { subLot, subLotIdHash, jobId: disaggJobId } = disaggRes.data.data;
  cleanupPaths.push(`sub-lots/${subLotIdHash}`);
  if (subLot.unitLeaves.length !== 2) fail('Expected 2 units in sub-lot', subLot);
  pass('Sub-lot created with 2 units', { subLotIdHash });
  await waitForJob(disaggJobId, 'DISAGGREGATE confirmed on-chain');

  const subLotAfter = (await db.ref(`sub-lots/${subLotIdHash}`).once('value')).val();
  if (subLotAfter?.syncStatus !== 'OK') fail('sub-lot.syncStatus should be OK', subLotAfter);
  pass('sub-lots/{subLotIdHash}.syncStatus === OK');

  // Map the 2 sub-lot unitIdHashes back to their human serialId.
  const unitIdHashToSerial = new Map<string, string>(unitIdHashes.map((h: string, i: number) => [h, serials[i]]));
  const dispensedSerialId = unitIdHashToSerial.get(subLot.unitLeaves[0]);
  if (!dispensedSerialId) fail('Could not map sub-lot unit back to a serialId');

  // ---- 8. Dispense 1 unit — the real Merkle-proof-verifying on-chain call ----
  step(`POST /verify/${dispensedSerialId}/dispense — CLINIC dispenses (real Merkle proof)`);
  const dispenseRes = await axios.post(
    `${BASE_URL}/verify/${encodeURIComponent(dispensedSerialId as string)}/dispense`,
    { niisRef: 'SMOKE-NIIS-1', reason: 'E2E smoke test' },
    authHeader(clinicToken)
  );
  const { patientToken, jobId: dispenseJobId, unitIdHash: dispensedUnitIdHash } = dispenseRes.data.data;
  cleanupPaths.push(`patient-links/${patientToken}`);
  pass('Dispense accepted, patientToken issued', { patientToken });
  await waitForJob(dispenseJobId, 'DECOMMISSION confirmed on-chain (Merkle proof verified by ProductRegistry)');

  const productAfter = (await db.ref(`products/${dispensedUnitIdHash}`).once('value')).val();
  if (productAfter?.status !== 'ADMINISTERED' || productAfter?.syncStatus !== 'OK') {
    fail('product should be ADMINISTERED + syncStatus OK after dispense', productAfter);
  }
  pass('products/{unitIdHash}.status === ADMINISTERED, syncStatus === OK');

  const patientLink = (await db.ref(`patient-links/${patientToken}`).once('value')).val();
  if (!patientLink || patientLink.serialHash !== dispensedUnitIdHash) fail('patient-links record missing or mismatched', patientLink);
  const piiFields = ['name', 'fullName', 'cccd', 'bhyt', 'dob', 'phone', 'email'];
  const leakedPii = piiFields.filter((f) => f in patientLink);
  if (leakedPii.length > 0) fail('patient-links record contains PII-shaped fields', leakedPii);
  pass('patient-links/{token} written correctly with no PII fields', { lotIdHash: patientLink.lotIdHash });

  // ---- 9. Sanity check: the ROOT lot's aggregationRoot was used, not the sub-lot's ----
  if (patientLink.lotIdHash !== lotIdHash) {
    fail('patient-links.lotIdHash should be the ROOT lot, not the sub-lot (critical invariant)', {
      expectedRoot: lotIdHash,
      got: patientLink.lotIdHash,
    });
  }
  pass('Dispense correctly resolved to the ROOT ancestor lot for its Merkle proof (critical invariant holds)');

  console.log(`\n\x1b[32m=== ALL ${passCount} CHECKS PASSED ===\x1b[0m`);
}

main()
  .catch((err) => {
    console.error(`\n\x1b[31m=== SMOKE TEST FAILED (${passCount} passed, ${failCount + 1} failed) ===\x1b[0m`);
    if (axios.isAxiosError(err)) {
      console.error('HTTP', err.response?.status, JSON.stringify(err.response?.data));
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(`\nCleaning up ${cleanupPaths.length} test path(s)...`);
    const updates: Record<string, null> = {};
    for (const path of cleanupPaths) updates[path] = null;
    try {
      await db.ref().update(updates);
      console.log('Cleanup done.');
    } catch (err) {
      console.error('Cleanup failed (manual cleanup may be needed):', err);
    }
    process.exit(process.exitCode || 0);
  });
