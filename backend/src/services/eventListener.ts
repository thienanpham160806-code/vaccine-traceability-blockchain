import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { txQueue } from './txQueue';
import { markLotUnitsRecalled, markLotUnitsVerified } from './lotSync';

const DISPENSE_EVENT_TYPE = CryptoUtils.keccak256('DISPENSE');

const productStatuses = ['REGISTERED', 'VERIFIED', 'IN_TRANSIT', 'DELIVERED', 'FLAGGED', 'RECALLED'];
const riskLevels = ['SAFE', 'ALERT', 'ALERT', 'HIGH', 'CRITICAL'];

function eventTxHash(event: any): string | undefined {
  return event?.transactionHash || event?.log?.transactionHash;
}

function asString(value: any): string {
  return String(value || '');
}

function toNumber(value: any): number {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chainTimestampMs(value: any): number {
  const timestamp = toNumber(value);
  if (!timestamp) return Date.now();
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
}

function chainStatus(value: any): string {
  return productStatuses[toNumber(value)] || asString(value) || 'VERIFIED';
}

function chainRiskLevel(value: any): string {
  return riskLevels[toNumber(value)] || 'HIGH';
}

function deliveredStatus(toRole?: string): string {
  switch (toRole) {
    case 'DISTRIBUTOR': return 'DELIVERED_TO_DISTRIBUTOR';
    case 'CLINIC': return 'DELIVERED_TO_CLINIC';
    case 'PHARMACY': return 'DELIVERED_TO_PHARMACY';
    default: return 'DELIVERED';
  }
}

function compactRecord<T extends Record<string, any>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== '')) as Partial<T>;
}

async function readProductByHash(serialHash: string): Promise<any> {
  const snapshot = await db.ref(`products/${serialHash}`).once('value');
  return snapshot.val() || {};
}

async function primaryRoleFor(address: string): Promise<string | undefined> {
  try {
    return (await contractClient.getAccountRoles(address)).primaryRole || undefined;
  } catch (error) {
    Logger.warn(`Could not infer primary role for ${address}`, error);
    return undefined;
  }
}

async function updateJobStatusByTx(txHash: string | undefined, status: 'CONFIRMED' | 'FAILED'): Promise<void> {
  if (!txHash) return;
  try {
    const snapshot = await db.ref('onchain-jobs').once('value');
    const jobs = snapshot.val() || {};
    const matches = Object.entries(jobs).filter(([, job]: [string, any]) => {
      return job?.txHash === txHash || job?.metadata?.preSubmittedTxHash === txHash;
    });

    await Promise.all(matches.map(([jobId]) => db.ref(`onchain-jobs/${jobId}`).update({ status, updatedAt: Date.now() })));
  } catch (error) {
    Logger.warn(`Could not sync tx queue status for ${txHash}`, error);
  }
}

async function findTransferForSerial(serialHash: string, status?: string, txHash?: string): Promise<{ key: string; value: any } | null> {
  const snapshot = await db.ref('transfers').once('value');
  const transfers = snapshot.val() || {};

  for (const [key, transfer] of Object.entries(transfers)) {
    const value = transfer as any;
    const matchesSerial =
      value.serialHash === serialHash ||
      value.serialId === serialHash ||
      String(key).startsWith(`${serialHash}_`) ||
      String(value.id || '').startsWith(`${serialHash}_`);
    const matchesTx = txHash && value.blockchainTx === txHash;
    const matchesStatus = !status || value.status === status;

    if ((matchesSerial || matchesTx) && matchesStatus) {
      return { key, value };
    }
  }

  return null;
}

/**
 * Event listener - listens to blockchain events and syncs to Firebase
 */
export class EventListener {
  private isRunning = false;

  /**
   * Start listening to blockchain events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Event listener already running');
      return;
    }

    try {
      this.isRunning = true;
      Logger.success('🔊 Event listener started');

      // Setup event filters
      if (contractClient.productRegistry) {
        this.setupProductRegistryListeners(contractClient.productRegistry);
      }

      if (contractClient.transferLedger) {
        this.setupTransferLedgerListeners(contractClient.transferLedger);
      }

      if (contractClient.coldChainRegistry) {
        this.setupColdChainRegistryListeners(contractClient.coldChainRegistry);
      } else {
        Logger.warn('⚠️ ColdChainRegistry not initialized — EnvAnchored events will not be synced');
      }

      // Log polling status
      Logger.info('📡 Listening for blockchain events...');
    } catch (error) {
      Logger.error('Failed to start event listener', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop listener
   */
  stop(): void {
    this.isRunning = false;
    Logger.info('🔇 Event listener stopped');
  }

  /**
   * Setup ProductRegistry event listeners
   */
  private setupProductRegistryListeners(contract: ethers.Contract): void {
    try {
      // Listen to ProductRegistered event
      contract.on('ProductRegistered', async (serialID: any, batchHash: any, owner: any, isImported: any, zkpVerified: any, status: any, event: any) => {
        Logger.info(`📦 ProductRegistered: ${serialID}`);
        
        try {
          const serialHash = asString(serialID);
          const now = Date.now();
          await db.ref(`products/${serialHash}`).update({
            serialHash,
            batchHash: asString(batchHash),
            currentOwner: asString(owner),
            ownerRole: Boolean(isImported) ? 'IMPORTER' : 'MANUFACTURER',
            isImported: Boolean(isImported),
            zkpVerified: Boolean(zkpVerified),
            status: chainStatus(status),
            blockchainTx: eventTxHash(event),
            updatedAt: now,
            lastSyncedAt: now,
          });
          await updateJobStatusByTx(eventTxHash(event), 'CONFIRMED');
          Logger.success(`✅ Synced product: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync product', err);
        }
      });

      // Listen to ProductFlagged event
      contract.on('ProductFlagged', async (serialID: any, riskLevel: any, reason: any, event: any) => {
        Logger.info(`⚠️ ProductFlagged: ${serialID}`);

        try {
          const serialHash = asString(serialID);
          const now = Date.now();
          const [product, existingSnapshot] = await Promise.all([
            readProductByHash(serialHash),
            db.ref(`risk-flags/${serialHash}`).once('value'),
          ]);
          const existing = existingSnapshot.val() || {};

          await db.ref(`risk-flags/${serialHash}`).update(compactRecord({
            id: serialHash,
            serialHash,
            serialId: product.serialId || existing.serialId || serialHash,
            batchId: product.batchId || existing.batchId,
            batchHash: product.batchHash || existing.batchHash,
            level: toNumber(riskLevel),
            riskLevel: chainRiskLevel(riskLevel),
            reason: asString(reason),
            flagReason: asString(reason),
            status: existing.status || 'OPEN',
            blockchainTx: eventTxHash(event),
            createdAt: existing.createdAt || now,
            updatedAt: now,
          }));

          await db.ref(`products/${serialHash}`).update({
            status: 'FLAGGED',
            riskLevel: chainRiskLevel(riskLevel),
            updatedAt: now,
          });
          Logger.success(`✅ Synced risk flag: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync risk flag', err);
        }
      });

      // Listen to BatchRecalled event
      contract.on('BatchRecalled', async (batchHash: any, reasonHash: any, totalProducts: any, event: any) => {
        Logger.info(`🛑 BatchRecalled: ${batchHash}`);

        try {
          const batchKey = asString(batchHash);
          const now = Date.now();
          const existingSnapshot = await db.ref(`recalls/${batchKey}`).once('value');
          const existing = existingSnapshot.val() || {};

          await db.ref(`recalls/${batchKey}`).update({
            id: existing.id || batchKey,
            batchHash: batchKey,
            reasonHash: asString(reasonHash),
            totalProducts: toNumber(totalProducts),
            serialsAffected: existing.serialsAffected || toNumber(totalProducts),
            txHash: existing.txHash || eventTxHash(event),
            blockchainTx: eventTxHash(event),
            createdAt: existing.createdAt || now,
            updatedAt: now,
          });

          await db.ref(`batches/${batchKey}`).update({
            recalledAt: now,
            updatedAt: now,
          });
          Logger.success(`✅ Synced recall: ${batchHash}`);
        } catch (err) {
          Logger.error('Failed to sync recall', err);
        }
      });

      // Listen to LotCommissioned event — authoritative backstop for
      // txQueue's optimistic COMMISSION_LOT confirm handling (e.g. if the
      // backend restarted mid-flight and never saw the tx confirm itself).
      // markLotUnitsVerified is idempotent, so this is safe to re-run.
      contract.on('LotCommissioned', async (lotIdHash: any, aggregationRoot: any, metadataHash: any, timestamp: any, event: any) => {
        Logger.info(`📦 LotCommissioned: ${lotIdHash}`);

        try {
          const lotIdHashStr = asString(lotIdHash);
          const now = Date.now();
          const txHash = eventTxHash(event);

          await db.ref(`batches/${lotIdHashStr}`).update(compactRecord({
            aggregationRoot: asString(aggregationRoot),
            metadataHash: asString(metadataHash),
            blockchainTx: txHash,
            syncStatus: 'OK',
            processingJobId: null,
            updatedAt: now,
          }));

          const verifiedCount = await markLotUnitsVerified(lotIdHashStr, txHash || '');
          await updateJobStatusByTx(txHash, 'CONFIRMED');
          Logger.success(`✅ Synced lot commission: ${lotIdHash} (${verifiedCount} unit(s))`);
        } catch (err) {
          Logger.error('Failed to sync lot commission', err);
        }
      });

      // Listen to LotRecalled event
      contract.on('LotRecalled', async (lotIdHash: any, reasonHash: any, timestamp: any, event: any) => {
        Logger.info(`🛑 LotRecalled: ${lotIdHash}`);

        try {
          const lotIdHashStr = asString(lotIdHash);
          const now = Date.now();
          const txHash = eventTxHash(event);

          await db.ref(`batches/${lotIdHashStr}`).update({
            recalledAt: now,
            custodyStatus: 'RECALLED',
            blockchainTx: txHash,
            updatedAt: now,
          });

          const recalledCount = await markLotUnitsRecalled(lotIdHashStr, asString(reasonHash), txHash || '');
          await updateJobStatusByTx(txHash, 'CONFIRMED');
          Logger.success(`✅ Synced lot recall: ${lotIdHash} (${recalledCount} unit(s))`);
        } catch (err) {
          Logger.error('Failed to sync lot recall', err);
        }
      });

      // Listen to LotDisaggregated event
      contract.on('LotDisaggregated', async (parentLotIdHash: any, subLotIdHash: any, subLotRoot: any, toActorHash: any, timestamp: any, event: any) => {
        Logger.info(`✂️ LotDisaggregated: ${parentLotIdHash} -> ${subLotIdHash}`);

        try {
          const subLotIdHashStr = asString(subLotIdHash);
          const now = Date.now();
          const txHash = eventTxHash(event);

          await db.ref(`sub-lots/${subLotIdHashStr}`).update({
            blockchainTx: txHash,
            syncStatus: 'OK',
            processingJobId: null,
            updatedAt: now,
          });

          await updateJobStatusByTx(txHash, 'CONFIRMED');
          Logger.success(`✅ Synced lot disaggregation: ${subLotIdHash}`);
        } catch (err) {
          Logger.error('Failed to sync lot disaggregation', err);
        }
      });

      // Listen to UnitDecommissioned event (dispense/decommission)
      contract.on('UnitDecommissioned', async (unitIdHash: any, lotIdHash: any, eventType: any, timestamp: any, event: any) => {
        Logger.info(`💉 UnitDecommissioned: ${unitIdHash}`);

        try {
          const unitIdHashStr = asString(unitIdHash);
          const now = Date.now();
          const txHash = eventTxHash(event);
          const targetStatus = asString(eventType).toLowerCase() === DISPENSE_EVENT_TYPE.toLowerCase() ? 'ADMINISTERED' : 'DECOMMISSIONED';

          await db.ref(`products/${unitIdHashStr}`).update({
            status: targetStatus,
            syncStatus: 'OK',
            blockchainTx: txHash,
            processingJobId: null,
            updatedAt: now,
          });

          await updateJobStatusByTx(txHash, 'CONFIRMED');
          Logger.success(`✅ Synced unit decommission: ${unitIdHash} (${targetStatus})`);
        } catch (err) {
          Logger.error('Failed to sync unit decommission', err);
        }
      });

      Logger.info('✅ ProductRegistry listeners ready');
    } catch (error) {
      Logger.error('Failed to setup ProductRegistry listeners', error);
    }
  }

  /**
   * Setup ColdChainRegistry event listeners
   */
  private setupColdChainRegistryListeners(contract: ethers.Contract): void {
    try {
      contract.on('EnvAnchored', async (lotIdHash: any, legId: any, envMerkleRoot: any, windowStart: any, windowEnd: any, complianceFlag: any, timestamp: any, event: any) => {
        Logger.info(`🌡️ EnvAnchored: ${lotIdHash} / ${legId}`);

        try {
          const legIdStr = asString(legId);
          const now = Date.now();
          const txHash = eventTxHash(event);
          const compliant = Boolean(complianceFlag);

          await db.ref(`cold-chain-legs/${legIdStr}`).update({
            status: 'SEALED',
            envMerkleRoot: asString(envMerkleRoot),
            complianceFlag: compliant,
            anchoredTx: txHash,
            processingJobId: null,
            updatedAt: now,
          });

          await db.ref(`batches/${asString(lotIdHash)}`).update({
            coldChainStatus: compliant ? 'PASS' : 'EXCURSION',
            updatedAt: now,
          });

          await updateJobStatusByTx(txHash, 'CONFIRMED');
          Logger.success(`✅ Synced env anchor: ${legId}`);
        } catch (err) {
          Logger.error('Failed to sync env anchor', err);
        }
      });

      Logger.info('✅ ColdChainRegistry listeners ready');
    } catch (error) {
      Logger.error('Failed to setup ColdChainRegistry listeners', error);
    }
  }

  /**
   * Setup TransferLedger event listeners
   */
  private setupTransferLedgerListeners(contract: ethers.Contract): void {
    try {
      // Listen to TransferRequested event
      contract.on('TransferRequested', async (serialID: any, sender: any, receiver: any, fromLocHash: any, toLocHash: any, requestedAt: any, event: any) => {
        Logger.info(`📤 TransferRequested: ${serialID}`);

        try {
          const serialHash = asString(serialID);
          const now = Date.now();
          const product = await readProductByHash(serialHash);
          const existing = await findTransferForSerial(serialHash, 'PENDING', eventTxHash(event));
          const [fromRole, toRole] = await Promise.all([
            existing?.value.fromRole ? Promise.resolve(existing.value.fromRole) : primaryRoleFor(asString(sender)),
            existing?.value.toRole ? Promise.resolve(existing.value.toRole) : primaryRoleFor(asString(receiver)),
          ]);
          const transferId = existing?.key || `${serialHash}_${now}`;
          const createdAt = existing?.value.createdAt || chainTimestampMs(requestedAt);

          await db.ref(`transfers/${transferId}`).update(compactRecord({
            id: transferId,
            serialHash,
            serialId: existing?.value.serialId || product.serialId || serialHash,
            batchId: existing?.value.batchId || product.batchId,
            fromAddress: asString(sender),
            toAddress: asString(receiver),
            fromRole,
            toRole,
            status: 'PENDING',
            fromLocationHash: asString(fromLocHash),
            toLocationHash: asString(toLocHash),
            blockchainTx: eventTxHash(event),
            createdAt,
            updatedAt: now,
          }));

          await db.ref(`products/${serialHash}`).update({
            status: 'IN_TRANSIT',
            currentOwner: asString(sender),
            updatedAt: now,
          });
          await updateJobStatusByTx(eventTxHash(event), 'CONFIRMED');
          Logger.success(`✅ Synced transfer: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync transfer', err);
        }
      });

      // Listen to TransferConfirmed event
      contract.on('TransferConfirmed', async (serialID: any, sender: any, receiver: any, confirmedAt: any, event: any) => {
        Logger.info(`✅ TransferConfirmed: ${serialID}`);

        try {
          const serialHash = asString(serialID);
          const now = Date.now();
          const existing = await findTransferForSerial(serialHash, 'PENDING');

          if (existing) {
            await db.ref(`transfers/${existing.key}`).update({
              status: 'CONFIRMED',
              toAddress: asString(receiver),
              confirmedAt: chainTimestampMs(confirmedAt),
              blockchainTx: eventTxHash(event),
              updatedAt: now,
            });
          }

          await db.ref(`products/${serialHash}`).update({
            status: deliveredStatus(existing?.value.toRole),
            currentOwner: asString(receiver),
            ownerRole: existing?.value.toRole || null,
            updatedAt: now,
          });

          const batchKey = existing?.value.batchHash || existing?.value.batchId;
          if (batchKey) {
            await db.ref(`batches/${batchKey}`).update({
              currentOwner: asString(receiver),
              ownerRole: existing?.value.toRole || null,
              updatedAt: now,
            });
          }

          await updateJobStatusByTx(eventTxHash(event), 'CONFIRMED');
          Logger.success(`✅ Synced transfer confirm: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync transfer confirm', err);
        }
      });

      contract.on('TransferRejected', async (serialID: any, sender: any, receiver: any, reason: any, event: any) => {
        Logger.info(`TransferRejected: ${serialID}`);

        try {
          const serialHash = asString(serialID);
          const now = Date.now();
          const existing = await findTransferForSerial(serialHash, 'PENDING');

          if (existing) {
            await db.ref(`transfers/${existing.key}`).update({
              status: 'REJECTED',
              toAddress: asString(receiver),
              rejectedReasonHash: asString(reason),
              blockchainTx: eventTxHash(event),
              rejectedAt: now,
              updatedAt: now,
            });
          }

          await db.ref(`products/${serialHash}`).update({
            status: 'VERIFIED',
            currentOwner: existing?.value.fromAddress || null,
            ownerRole: existing?.value.fromRole || null,
            updatedAt: now,
          });
          await updateJobStatusByTx(eventTxHash(event), 'CONFIRMED');
          Logger.success(`Synced transfer reject: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync transfer reject', err);
        }
      });

      Logger.info('✅ TransferLedger listeners ready');
    } catch (error) {
      Logger.error('Failed to setup TransferLedger listeners', error);
    }
  }
}

export const eventListener = new EventListener();
export default eventListener;
