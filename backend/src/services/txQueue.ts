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
  private readonly pollIntervalMs = 1000;
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
      const txHash = job.payload?.txHash || job.metadata?.preSubmittedTxHash || await this.submitJob(job);
      await this.updateJob(job.id, { status: 'CONFIRMING', txHash, updatedAt: Date.now() });
      const receipt = await contractClient.getProvider().waitForTransaction(txHash, 1, 180_000);

      if (receipt?.status === 1) {
        await this.updateJob(job.id, { status: 'CONFIRMED', updatedAt: Date.now() });
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

  private async failJob(jobId: string, errorMessage: string): Promise<void> {
    await this.updateJob(jobId, { status: 'FAILED', error: errorMessage, updatedAt: Date.now() });
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
