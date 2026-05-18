import { ethers } from 'ethers';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { Logger } from '../utils/logger';

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

      const provider = contractClient.getProvider();

      // Setup event filters
      if (contractClient.productRegistry) {
        this.setupProductRegistryListeners(contractClient.productRegistry);
      }

      if (contractClient.transferLedger) {
        this.setupTransferLedgerListeners(contractClient.transferLedger);
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
          await db.ref(`products/${serialID}`).update({
            batchHash,
            owner,
            isImported,
            zkpVerified,
            status,
            blockchainTx: event.transactionHash,
            lastSyncedAt: Date.now(),
          });
          Logger.success(`✅ Synced product: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync product', err);
        }
      });

      // Listen to ProductFlagged event
      contract.on('ProductFlagged', async (serialID: any, riskLevel: any, reason: any, event: any) => {
        Logger.info(`⚠️ ProductFlagged: ${serialID}`);

        try {
          await db.ref(`risk-flags/${serialID}`).set({
            serialId: serialID,
            level: riskLevel,
            reason,
            blockchainTx: event.transactionHash,
            createdAt: Date.now(),
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
          await db.ref(`recalls/${batchHash}`).set({
            batchHash,
            reasonHash,
            totalProducts,
            blockchainTx: event.transactionHash,
            createdAt: Date.now(),
          });
          Logger.success(`✅ Synced recall: ${batchHash}`);
        } catch (err) {
          Logger.error('Failed to sync recall', err);
        }
      });

      Logger.info('✅ ProductRegistry listeners ready');
    } catch (error) {
      Logger.error('Failed to setup ProductRegistry listeners', error);
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
          const transferId = `${serialID}_${Date.now()}`;
          await db.ref(`transfers/${transferId}`).set({
            serialId: serialID,
            sender,
            receiver,
            status: 'PENDING',
            fromLocationHash: fromLocHash,
            toLocationHash: toLocHash,
            blockchainTx: event.transactionHash,
            createdAt: Date.now(),
          });
          Logger.success(`✅ Synced transfer: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync transfer', err);
        }
      });

      // Listen to TransferConfirmed event
      contract.on('TransferConfirmed', async (serialID: any, sender: any, receiver: any, confirmedAt: any, event: any) => {
        Logger.info(`✅ TransferConfirmed: ${serialID}`);

        try {
          const transfersRef = db.ref('transfers');
          const snapshot = await transfersRef.once('value');
          const transfers = snapshot.val() || {};

          // Find and update the pending transfer
          for (const [key, transfer] of Object.entries(transfers)) {
            const t = transfer as any;
            if (t.serialId === serialID && t.status === 'PENDING') {
              await transfersRef.child(key).update({
                status: 'CONFIRMED',
                receiver,
                confirmedAt,
                blockchainTx: event.transactionHash,
                updatedAt: Date.now(),
              });
              break;
            }
          }
          Logger.success(`✅ Synced transfer confirm: ${serialID}`);
        } catch (err) {
          Logger.error('Failed to sync transfer confirm', err);
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
