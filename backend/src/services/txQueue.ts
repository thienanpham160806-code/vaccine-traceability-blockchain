import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { Logger } from '../utils/logger';

export type OnChainTxJobType =
  | 'REGISTER_PRODUCT'
  | 'REGISTER_IMPORTED_PRODUCT'
  | 'CREATE_TRANSFER'
  | 'CONFIRM_TRANSFER'
  | 'REJECT_TRANSFER';

export type OnChainTxJobStatus = 'QUEUED' | 'SUBMITTED' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED';

export interface OnChainTxJob {
  id: string;
  type: OnChainTxJobType;
  status: OnChainTxJobStatus;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  txHash?: string;
  error?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

class OnChainTxQueue {
  private jobs = new Map<string, OnChainTxJob>();
  private processing = false;
  private readonly pollIntervalMs = 250;
  private readonly maxAttempts = 3;

  constructor() {
    void this.start();
  }

  async start(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    Logger.success('🧵 On-chain tx queue started');
    await this.hydratePendingJobs();
    void this.runLoop();
  }

  async enqueue(job: Omit<OnChainTxJob, 'id' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'>): Promise<OnChainTxJob> {
    const record: OnChainTxJob = {
      id: `${job.type.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: job.type,
      status: 'QUEUED',
      payload: job.payload || {},
      metadata: job.metadata || {},
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(record.id, record);
    await this.persist(record);
    Logger.info(`📥 Queued on-chain tx ${record.id} (${job.type})`);
    return record;
  }

  private async runLoop(): Promise<void> {
    while (this.processing) {
      const queuedJobs = Array.from(this.jobs.values()).filter((job) => job.status === 'QUEUED');
      if (queuedJobs.length === 0) {
        await this.delay(this.pollIntervalMs);
        continue;
      }

      const nextJob = queuedJobs[0];
      try {
        await this.processJob(nextJob);
      } catch (error) {
        Logger.error(`Failed to process tx queue job ${nextJob.id}`, error);
        await this.failJob(nextJob.id, error instanceof Error ? error.message : 'Unknown queue error');
      }

      await this.delay(this.pollIntervalMs);
    }
  }

  private async processJob(job: OnChainTxJob): Promise<void> {
    const existing = this.jobs.get(job.id);
    if (!existing || existing.status === 'CONFIRMED' || existing.status === 'FAILED') {
      return;
    }

    if (existing.attempts >= this.maxAttempts) {
      await this.failJob(job.id, 'Maximum submission attempts reached');
      return;
    }

    await this.updateJob(job.id, { status: 'SUBMITTED', updatedAt: Date.now(), attempts: existing.attempts + 1 });

    try {
      const txHash = existing.txHash || job.payload?.txHash || job.metadata?.preSubmittedTxHash || await this.submitJob(job);
      await this.updateJob(job.id, { status: 'CONFIRMING', txHash, updatedAt: Date.now() });
      await this.syncSubmittedTx(job, txHash);
      const receipt = await contractClient.getProvider().waitForTransaction(txHash, 1, 60_000);

      if (receipt?.status === 1) {
        await this.updateJob(job.id, { status: 'CONFIRMED', updatedAt: Date.now() });
        await this.syncConfirmedTx(job, txHash);
        Logger.success(`✅ On-chain tx confirmed ${txHash}`);
      } else {
        throw new Error(`Transaction ${txHash} was reverted`);
      }
    } catch (error) {
      Logger.error(`On-chain tx submission failed for job ${job.id}`, error);
      throw error;
    }
  }

  private async submitJob(job: OnChainTxJob): Promise<string> {
    const payload = job.payload || {};

    switch (job.type) {
      case 'REGISTER_PRODUCT':
        return contractClient.registerProduct(
          payload.serialId,
          payload.batchHash,
          payload.metadataHash,
          payload.importDocHash,
          payload.zkpProof,
          payload.signerRole
        );
      case 'REGISTER_IMPORTED_PRODUCT':
        return contractClient.registerImportedProductZK(
          payload.serialId,
          payload.batchHash,
          payload.metadataHash,
          payload.proof,
          payload.signerRole
        );
      case 'CREATE_TRANSFER':
        return contractClient.createTransferRequest(
          payload.serialId,
          payload.receiver,
          payload.fromLocationHash,
          payload.toLocationHash,
          payload.signerRole
        );
      case 'CONFIRM_TRANSFER':
        return contractClient.confirmTransfer(
          payload.serialId,
          payload.receiverLocationHash,
          payload.signerRole,
          payload.expectedReceiver
        );
      case 'REJECT_TRANSFER':
        return contractClient.rejectTransfer(
          payload.serialId,
          payload.reason,
          payload.signerRole,
          payload.expectedReceiver
        );
      default:
        throw new Error(`Unsupported tx job type: ${job.type}`);
    }
  }

  private deliveredStatus(toRole?: string): string {
    if (toRole === 'DISTRIBUTOR') return 'DELIVERED_TO_DISTRIBUTOR';
    if (toRole === 'CLINIC') return 'DELIVERED_TO_CLINIC';
    if (toRole === 'PHARMACY') return 'DELIVERED_TO_PHARMACY';
    return 'DELIVERED';
  }

  private async syncSubmittedTx(job: OnChainTxJob, txHash: string): Promise<void> {
    const transferId = job.metadata?.transferId;
    const serialHash = job.metadata?.serialHash || job.payload?.serialId;
    const batchHash = job.metadata?.batchHash || job.payload?.batchHash;

    if ((job.type === 'REGISTER_PRODUCT' || job.type === 'REGISTER_IMPORTED_PRODUCT') && serialHash) {
      try {
        const now = Date.now();
        const updates: Record<string, unknown> = {
          [`products/${serialHash}/blockchainTx`]: txHash,
          [`products/${serialHash}/syncStatus`]: 'PROCESSING',
          [`products/${serialHash}/processingJobId`]: job.id,
          [`products/${serialHash}/processingTxHash`]: txHash,
          [`products/${serialHash}/updatedAt`]: now,
        };
        if (batchHash) {
          updates[`batches/${batchHash}/blockchainTx`] = txHash;
          updates[`batches/${batchHash}/syncStatus`] = 'PROCESSING';
          updates[`batches/${batchHash}/processingJobId`] = job.id;
          updates[`batches/${batchHash}/updatedAt`] = now;
        }
        await db.ref().update(updates);
      } catch (error) {
        Logger.warn(`Could not sync submitted registration tx ${txHash} for job ${job.id}`, error);
      }
      return;
    }

    if (!transferId) return;

    try {
      const patch: Record<string, unknown> = {
        processingJobId: job.id,
        processingTxHash: txHash,
        updatedAt: Date.now(),
      };
      if (job.type === 'CREATE_TRANSFER') patch.blockchainTx = txHash;
      await db.ref(`transfers/${transferId}`).update(patch);
    } catch (error) {
      Logger.warn(`Could not sync submitted tx ${txHash} for job ${job.id}`, error);
    }
  }

  private async syncConfirmedTx(job: OnChainTxJob, txHash: string): Promise<void> {
    const transferId = job.metadata?.transferId;
    const serialHash = job.metadata?.serialHash || job.payload?.serialId;
    if (!serialHash) return;

    try {
      const now = Date.now();
      if (job.type === 'REGISTER_PRODUCT' || job.type === 'REGISTER_IMPORTED_PRODUCT') {
        const batchHash = job.metadata?.batchHash || job.payload?.batchHash;
        const updates: Record<string, unknown> = {
          [`products/${serialHash}/blockchainTx`]: txHash,
          [`products/${serialHash}/status`]: 'VERIFIED',
          [`products/${serialHash}/syncStatus`]: 'OK',
          [`products/${serialHash}/processingJobId`]: null,
          [`products/${serialHash}/processingTxHash`]: null,
          [`products/${serialHash}/updatedAt`]: now,
        };
        if (batchHash) {
          updates[`batches/${batchHash}/blockchainTx`] = txHash;
          updates[`batches/${batchHash}/syncStatus`] = 'OK';
          updates[`batches/${batchHash}/processingJobId`] = null;
          updates[`batches/${batchHash}/updatedAt`] = now;
        }
        await db.ref().update(updates);
        return;
      }

      if (!transferId) return;
      const transferSnapshot = await db.ref(`transfers/${transferId}`).once('value');
      const transfer = transferSnapshot.val() || {};

      if (job.type === 'CREATE_TRANSFER') {
        await Promise.all([
          db.ref(`transfers/${transferId}`).update({
            status: 'PENDING',
            blockchainTx: txHash,
            processingJobId: null,
            processingTxHash: null,
            updatedAt: now,
          }),
          db.ref(`products/${serialHash}`).update({
            status: 'IN_TRANSIT',
            currentOwner: transfer.fromAddress || job.payload?.sender,
            ownerRole: transfer.fromRole || job.payload?.signerRole,
            latestTransferId: transferId,
            syncStatus: 'OK',
            processingTransferJobId: null,
            updatedAt: now,
          }),
        ]);
        return;
      }

      if (job.type === 'CONFIRM_TRANSFER') {
        const toRole = transfer.toRole || job.payload?.signerRole;
        const toAddress = transfer.toAddress || job.payload?.expectedReceiver;
        const updates: Record<string, unknown> = {
          [`transfers/${transferId}/status`]: 'CONFIRMED',
          [`transfers/${transferId}/confirmedAt`]: now,
          [`transfers/${transferId}/blockchainTx`]: txHash,
          [`transfers/${transferId}/processingJobId`]: null,
          [`transfers/${transferId}/processingTxHash`]: null,
          [`transfers/${transferId}/updatedAt`]: now,
          [`products/${serialHash}/status`]: this.deliveredStatus(toRole),
          [`products/${serialHash}/currentOwner`]: toAddress,
          [`products/${serialHash}/ownerRole`]: toRole,
          [`products/${serialHash}/syncStatus`]: 'OK',
          [`products/${serialHash}/processingTransferJobId`]: null,
          [`products/${serialHash}/updatedAt`]: now,
          [`pending-transfers/${serialHash}`]: null,
        };
        const batchKey = transfer.batchHash || transfer.batchId;
        if (batchKey) {
          updates[`batches/${batchKey}/currentOwner`] = toAddress;
          updates[`batches/${batchKey}/ownerRole`] = toRole;
          updates[`batches/${batchKey}/updatedAt`] = now;
        }
        await db.ref().update(updates);
        return;
      }

      if (job.type === 'REJECT_TRANSFER') {
        await Promise.all([
          db.ref(`transfers/${transferId}`).update({
            status: 'REJECTED',
            rejectedAt: now,
            blockchainTx: txHash,
            processingJobId: null,
            processingTxHash: null,
            updatedAt: now,
          }),
          db.ref(`products/${serialHash}`).update({
            status: transfer.previousProductStatus || 'VERIFIED',
            currentOwner: transfer.fromAddress || null,
            ownerRole: transfer.fromRole || null,
            syncStatus: 'OK',
            processingTransferJobId: null,
            updatedAt: now,
          }),
          db.ref(`pending-transfers/${serialHash}`).remove(),
        ]);
      }
    } catch (error) {
      Logger.warn(`Could not sync confirmed tx ${txHash} for job ${job.id}`, error);
    }
  }

  private async failJob(jobId: string, errorMessage: string): Promise<void> {
    await this.updateJob(jobId, { status: 'FAILED', error: errorMessage, updatedAt: Date.now() });
    const job = this.jobs.get(jobId);
    const serialHash = job?.metadata?.serialHash || job?.payload?.serialId;
    const batchHash = job?.metadata?.batchHash || job?.payload?.batchHash;

    if (serialHash && (job?.type === 'REGISTER_PRODUCT' || job?.type === 'REGISTER_IMPORTED_PRODUCT')) {
      try {
        const now = Date.now();
        const updates: Record<string, unknown> = {
          [`products/${serialHash}/syncStatus`]: 'FIREBASE_ONLY',
          [`products/${serialHash}/processingJobId`]: null,
          [`products/${serialHash}/processingTxHash`]: null,
          [`products/${serialHash}/syncError`]: errorMessage,
          [`products/${serialHash}/updatedAt`]: now,
        };
        if (batchHash) {
          updates[`batches/${batchHash}/syncStatus`] = 'FIREBASE_ONLY';
          updates[`batches/${batchHash}/processingJobId`] = null;
          updates[`batches/${batchHash}/syncError`] = errorMessage;
          updates[`batches/${batchHash}/updatedAt`] = now;
        }
        await db.ref().update(updates);
      } catch (err) {
        Logger.warn(`Could not mark registration job ${jobId} as failed in Firebase`, err);
      }
    }

    const transferId = job?.metadata?.transferId;
    if (transferId && serialHash && job?.type === 'CREATE_TRANSFER') {
      try {
        const transferSnapshot = await db.ref(`transfers/${transferId}`).once('value');
        const transfer = transferSnapshot.val() || {};
        const now = Date.now();
        await Promise.all([
          db.ref(`transfers/${transferId}`).update({
            status: 'REJECTED',
            error: errorMessage,
            processingJobId: null,
            processingTxHash: null,
            updatedAt: now,
          }),
          db.ref(`products/${serialHash}`).update({
            status: transfer.previousProductStatus || 'VERIFIED',
            currentOwner: transfer.fromAddress || null,
            ownerRole: transfer.fromRole || null,
            syncStatus: 'OK',
            processingTransferJobId: null,
            syncError: errorMessage,
            updatedAt: now,
          }),
          db.ref(`pending-transfers/${serialHash}`).remove(),
        ]);
      } catch (err) {
        Logger.warn(`Could not roll back create-transfer job ${jobId} after failure`, err);
      }
      return;
    }

    if (transferId && (job?.type === 'CONFIRM_TRANSFER' || job?.type === 'REJECT_TRANSFER')) {
      try {
        await db.ref(`transfers/${transferId}`).update({
          status: 'PENDING',
          processingJobId: null,
          processingTxHash: null,
          error: errorMessage,
          updatedAt: Date.now(),
        });
      } catch (err) {
        Logger.warn(`Could not reset transfer ${transferId} to PENDING after job failure`, err);
      }
    }
  }

  private async hydratePendingJobs(): Promise<void> {
    try {
      const snapshot = await db.ref('onchain-jobs').once('value');
      const jobs = Object.values(snapshot.val() || {}) as OnChainTxJob[];
      let loaded = 0;

      for (const job of jobs) {
        if (!job?.id) continue;
        if (!['QUEUED', 'SUBMITTED', 'CONFIRMING'].includes(job.status)) continue;
        this.jobs.set(job.id, {
          ...job,
          status: 'QUEUED',
        });
        loaded += 1;
      }

      if (loaded > 0) Logger.info(`Loaded ${loaded} pending on-chain tx job(s) from Firebase`);
    } catch (error) {
      Logger.warn('Could not hydrate pending on-chain tx jobs', error);
    }
  }

  private async updateJob(jobId: string, patch: Partial<OnChainTxJob>): Promise<void> {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return;
    }

    const updated: OnChainTxJob = { ...existing, ...patch, updatedAt: Date.now() };
    this.jobs.set(jobId, updated);
    await this.persist(updated);
  }

  private async persist(job: OnChainTxJob): Promise<void> {
    try {
      await db.ref(`onchain-jobs/${job.id}`).set(job);
    } catch (error) {
      Logger.warn(`Could not persist tx queue job ${job.id}`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const txQueue = new OnChainTxQueue();
export default txQueue;
