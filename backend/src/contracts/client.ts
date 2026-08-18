import { ethers } from 'ethers';
import config from '../config/env';
import { Logger } from '../utils/logger';
import ProductRegistryABI from './abis/ProductRegistry.json';
import TransferLedgerABI from './abis/TransferLedger.json';
import AccessControlABI from './abis/SupplyChainAccessControl.json';
import ColdChainRegistryABI from './abis/ColdChainRegistry.json';

const PRODUCT_REGISTRY_ABI: any[] = (ProductRegistryABI as any).abi || ProductRegistryABI;
const TRANSFER_LEDGER_ABI: any[] = (TransferLedgerABI as any).abi || TransferLedgerABI;
const ACCESS_CONTROL_ABI: any[] = (AccessControlABI as any).abi || AccessControlABI;
const COLD_CHAIN_REGISTRY_ABI: any[] = (ColdChainRegistryABI as any).abi || ColdChainRegistryABI;


/**
 * Contract client - manages interaction with smart contracts
 */
export class ContractClient {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  public productRegistry: ethers.Contract | null = null;
  public transferLedger: ethers.Contract | null = null;
  public accessControl: ethers.Contract | null = null;
  public coldChainRegistry: ethers.Contract | null = null;
  private readonly roleNames = [
    'ADMIN',
    'MANUFACTURER',
    'IMPORTER',
    'DISTRIBUTOR',
    'CLINIC',
    'PHARMACY',
    'AUDITOR',
    'RECALL_AUTHORITY',
  ];

  constructor() {
    try {
      const rpcUrls = config.blockchainRpcUrls;
      const privateKey = config.backendPrivateKey;

      if (!rpcUrls.length || !privateKey) {
        throw new Error('Missing RPC URL or private key in config');
      }

      if (rpcUrls.length === 1) {
        const p = new ethers.JsonRpcProvider(rpcUrls[0]);
        p.pollingInterval = 1000;
        this.provider = p;
      } else {
        this.provider = new ethers.FallbackProvider(
          rpcUrls.map((rpcUrl) => {
            const p = new ethers.JsonRpcProvider(rpcUrl);
            p.pollingInterval = 1000;
            return p;
          }),
          1
        );
      }
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      Logger.success(`✅ Backend wallet: ${this.wallet.address}`);
    } catch (error) {
      Logger.error('Failed to initialize contract client', error);
      throw error;
    }
  }

  /**
   * Initialize contracts with addresses from config
   */
  async initialize(): Promise<void> {
    try {
      const registryAddr = config.productRegistryAddress;
      const ledgerAddr = config.transferLedgerAddress;
      const accessCtrlAddr = config.accessControlAddress;

      if (!registryAddr || !ledgerAddr || !accessCtrlAddr) {
        Logger.warn('⚠️ Contract addresses not configured - skipping initialization');
        return;
      }

      this.productRegistry = new ethers.Contract(
        registryAddr,
        PRODUCT_REGISTRY_ABI,
        this.wallet
      );

      this.transferLedger = new ethers.Contract(
        ledgerAddr,
        TRANSFER_LEDGER_ABI,
        this.wallet
      );

      this.accessControl = new ethers.Contract(
        accessCtrlAddr,
        ACCESS_CONTROL_ABI,
        this.wallet
      );

      Logger.success('✅ Smart contracts initialized');
      Logger.info(`   ProductRegistry: ${registryAddr}`);
      Logger.info(`   TransferLedger: ${ledgerAddr}`);
      Logger.info(`   AccessControl: ${accessCtrlAddr}`);

      const coldChainAddr = config.coldChainRegistryAddress;
      if (coldChainAddr) {
        this.coldChainRegistry = new ethers.Contract(
          coldChainAddr,
          COLD_CHAIN_REGISTRY_ABI,
          this.wallet
        );
        Logger.info(`   ColdChainRegistry: ${coldChainAddr}`);
      } else {
        Logger.warn('⚠️ COLD_CHAIN_REGISTRY_ADDRESS not configured - cold-chain anchoring disabled');
      }
    } catch (error) {
      Logger.error('Failed to initialize contracts', error);
      throw error;
    }
  }

  /**
   * Check if contracts are initialized
   */
  isInitialized(): boolean {
    return !!(this.productRegistry && this.transferLedger && this.accessControl);
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }

  getRoleAddress(role?: string): string {
    return this.getSigner(role).address;
  }

  /**
   * Sign an arbitrary message as a given role's wallet — used for
   * demo-actor custody attestations (TransferLedger.recordEvent's
   * actorSignature). The contract only checks length > 0, matching this
   * MVP's mock-proof pattern elsewhere; this is not verified on-chain.
   */
  async signMessage(message: string, role?: string): Promise<string> {
    return this.getSigner(role).signMessage(message);
  }

  private normalizeRole(role?: string): keyof typeof config.rolePrivateKeys {
    const normalized = (role || 'MANUFACTURER').toLowerCase();

    switch (normalized) {
      case 'admin':
        return 'admin';
      case 'manufacturer':
      case 'manufacturer_role':
        return 'manufacturer';
      case 'importer':
      case 'importer_role':
        return 'importer';
      case 'distributor':
      case 'distributor_role':
        return 'distributor';
      case 'clinic':
      case 'clinic_role':
        return 'clinic';
      case 'pharmacy':
      case 'pharmacy_role':
        return 'pharmacy';
      case 'recall_authority':
      case 'recallauthority':
      case 'recall_authority_role':
        return 'recall_authority';
      default:
        throw new Error(`Unsupported local signer role: ${role}`);
    }
  }

  private getSigner(role?: string): ethers.Wallet {
    const roleKey = this.normalizeRole(role);
    const privateKey = config.rolePrivateKeys[roleKey] || config.backendPrivateKey;

    if (!privateKey) {
      throw new Error(`Missing private key for role: ${roleKey}`);
    }

    return new ethers.Wallet(privateKey, this.provider);
  }

  private getSignerForAddress(expectedAddress: string, fallbackRole?: string): ethers.Wallet {
    const normalizedExpected = ethers.getAddress(expectedAddress);

    if (fallbackRole) {
      const roleSigner = this.getSigner(fallbackRole);
      if (ethers.getAddress(roleSigner.address) === normalizedExpected) {
        return roleSigner;
      }
    }

    const privateKeys = [
      ...Object.values(config.rolePrivateKeys),
      config.backendPrivateKey,
    ].filter(Boolean);

    for (const privateKey of privateKeys) {
      try {
        const signer = new ethers.Wallet(privateKey, this.provider);
        if (ethers.getAddress(signer.address) === normalizedExpected) {
          return signer;
        }
      } catch {
        // Ignore malformed keys here; env validation handles them elsewhere.
      }
    }

    throw new Error(
      `Backend does not have the private key for receiver ${normalizedExpected}. Reject this transfer with the receiver MetaMask wallet, or configure the matching role private key.`
    );
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      Logger.error('Failed to get wallet balance', error);
      throw error;
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      Logger.error('Failed to get block number', error);
      throw error;
    }
  }

  /**
   * Get provider (for event listeners)
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }

  roleNameToBytes32(role: string): string {
    if (role.toLowerCase() === 'admin' || role.toLowerCase() === 'default_admin') {
      return ethers.ZeroHash;
    }

    return ethers.keccak256(ethers.toUtf8Bytes(`${role.toUpperCase()}_ROLE`));
  }

  bytes32ToRoleName(roleHash: string): string | null {
    if (roleHash.toLowerCase() === ethers.ZeroHash.toLowerCase()) return 'ADMIN';
    const normalizedHash = roleHash.toLowerCase();
    return this.roleNames.find((role) => this.roleNameToBytes32(role).toLowerCase() === normalizedHash) || null;
  }

  async getAccountRoles(address: string): Promise<{ roles: string[]; primaryRole: string | null }> {
    if (!this.accessControl) {
      throw new Error('AccessControl contract not initialized');
    }

    const roles: string[] = [];
    for (const role of this.roleNames) {
      const roleHash = this.roleNameToBytes32(role);
      if (await this.accessControl.hasRole(roleHash, address)) {
        roles.push(role);
      }
    }

    let primaryRole: string | null = null;
    try {
      const primaryRoleHash = await this.accessControl.getPrimaryRole(address);
      if (primaryRoleHash && primaryRoleHash !== ethers.ZeroHash) {
        primaryRole = this.bytes32ToRoleName(primaryRoleHash);
      }
    } catch (error) {
      Logger.warn('Failed to read primary role', error);
    }

    return {
      roles,
      primaryRole: primaryRole || roles[0] || null,
    };
  }

  async signerHasRole(signerRole: string, requiredRole: string = signerRole): Promise<boolean> {
    if (!this.accessControl) {
      throw new Error('AccessControl contract not initialized');
    }

    const signerAddress = this.getRoleAddress(signerRole);
    const roleHash = this.roleNameToBytes32(requiredRole);
    return this.accessControl.hasRole(roleHash, signerAddress);
  }

  async grantUserRole(account: string, role: string, setPrimary = true): Promise<string> {
    if (!this.accessControl) {
      throw new Error('AccessControl contract not initialized');
    }

    const normalizedRole = role.toUpperCase();
    if (normalizedRole === 'ADMIN' || normalizedRole === 'PUBLIC') {
      throw new Error(`Role cannot be granted from dashboard: ${role}`);
    }

    const admin = this.accessControl.connect(this.getSigner('admin')) as ethers.Contract;
    const roleHash = this.roleNameToBytes32(normalizedRole);
    const hasRole = await this.accessControl.hasRole(roleHash, account);
    let txHash = '';

    if (!hasRole) {
      const tx = await admin.grantUserRole(account, roleHash);
      const receipt = await tx.wait();
      txHash = receipt?.hash || tx.hash;
    }

    if (setPrimary) {
      const primaryRoleHash = await this.accessControl.getPrimaryRole(account);
      if (String(primaryRoleHash).toLowerCase() !== roleHash.toLowerCase()) {
        const tx = await admin.setPrimaryRole(account, roleHash);
        const receipt = await tx.wait();
        txHash = receipt?.hash || tx.hash || txHash;
      }
    }

    return txHash;
  }

  async isValidRoute(fromRole: string, toRole: string): Promise<boolean> {
    if (!this.accessControl) {
      throw new Error('AccessControl contract not initialized');
    }

    return this.accessControl.isValidRoute(
      this.roleNameToBytes32(fromRole),
      this.roleNameToBytes32(toRole)
    );
  }

  async setTransferRoute(fromRole: string, toRole: string, allowed: boolean, signerRole: string = 'admin'): Promise<string> {
    if (!this.accessControl) {
      throw new Error('AccessControl contract not initialized');
    }

    const accessControl = this.accessControl.connect(this.getSigner(signerRole)) as ethers.Contract;
    const tx = await accessControl.setRoute(
      this.roleNameToBytes32(fromRole),
      this.roleNameToBytes32(toRole),
      allowed
    );
    const receipt = await tx.wait();
    return receipt?.hash || tx.hash;
  }

  private async getGasOverrides(): Promise<{ maxPriorityFeePerGas: bigint; maxFeePerGas: bigint }> {
    const tip = ethers.parseUnits('25', 'gwei');
    try {
      const feeData = await this.provider.getFeeData();
      const baseFee = (feeData as any).lastBaseFeePerGas ?? feeData.maxFeePerGas ?? ethers.parseUnits('5', 'gwei');
      return {
        maxPriorityFeePerGas: tip,
        maxFeePerGas: baseFee * 3n + tip,
      };
    } catch {
      return {
        maxPriorityFeePerGas: tip,
        maxFeePerGas: ethers.parseUnits('200', 'gwei'),
      };
    }
  }

  /**
   * Register product on blockchain
   */
  async registerProduct(
    serialId: string,
    batchHash: string,
    metadataHash: string,
    importDocHash: string = '0x0000000000000000000000000000000000000000000000000000000000000000',
    zkpProof: string = '0x',
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting product registration: ${serialId}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await registry.registerProduct(
        serialId,
        batchHash,
        metadataHash,
        importDocHash,
        zkpProof,
        gasOverrides
      );

      Logger.info(`📤 Product registration tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to register product', error);
      throw error;
    }
  }

  async registerImportedProductZK(
    serialId: string,
    batchHash: string,
    metadataHash: string,
    proof: {
      a: [string, string];
      b: [[string, string], [string, string]];
      c: [string, string];
      input: [string, string, string, string, string];
    },
    signerRole: string = 'IMPORTER'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting imported product registration with ZKP: ${serialId}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await registry.registerImportedProductZK(
        serialId,
        batchHash,
        metadataHash,
        proof.a,
        proof.b,
        proof.c,
        proof.input,
        gasOverrides
      );

      Logger.info(`📤 Imported product registration tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to register imported product with ZKP', error);
      throw error;
    }
  }

  async getApprovedImportRoot(): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    const root = await this.productRegistry.approvedImportRoot();
    return root.toString();
  }

  async setApprovedImportRoot(root: string, signerRole: string = 'admin'): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
    const tx = await registry.setApprovedImportRoot(root);
    const receipt = await tx.wait();
    return receipt?.hash || tx.hash;
  }

  /**
   * Get product info from blockchain
   */
  async getProduct(serialId: string): Promise<any> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      const product = await this.productRegistry.getProduct(serialId);
      return product;
    } catch (error) {
      Logger.error('Failed to get product', error);
      throw error;
    }
  }

  /**
   * Check whether a product exists in the active ProductRegistry contract.
   */
  async productExists(serialId: string): Promise<boolean> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      return await this.productRegistry.productExists(serialId);
    } catch (error) {
      Logger.error('Failed to check product existence', error);
      throw error;
    }
  }

  /**
   * Get product status
   */
  async getProductStatus(serialId: string): Promise<number> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      const status = await this.productRegistry.getStatus(serialId);
      return status;
    } catch (error) {
      Logger.error('Failed to get product status', error);
      throw error;
    }
  }

  async getCurrentOwner(serialId: string): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      return await this.productRegistry.getCurrentOwner(serialId);
    } catch (error) {
      Logger.error('Failed to get current owner', error);
      throw error;
    }
  }

  /**
   * Create transfer request on blockchain
   */
  async createTransferRequest(
    serialId: string,
    receiver: string,
    fromLocationHash: string = '0x0000000000000000000000000000000000000000000000000000000000000000',
    toLocationHash: string = '0x0000000000000000000000000000000000000000000000000000000000000000',
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting transfer for: ${serialId}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.createTransferRequest(
        serialId,
        receiver,
        fromLocationHash,
        toLocationHash,
        gasOverrides
      );

      Logger.info(`📤 Transfer tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to create transfer request', error);
      throw error;
    }
  }

  /**
   * Confirm transfer on blockchain
   */
  async confirmTransfer(
    serialId: string,
    receiverLocationHash: string = '0x0000000000000000000000000000000000000000000000000000000000000000',
    signerRole: string = 'DISTRIBUTOR',
    expectedReceiver?: string
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting transfer confirmation: ${serialId}`);

      const signer = expectedReceiver
        ? this.getSignerForAddress(expectedReceiver, signerRole)
        : this.getSigner(signerRole);
      const ledger = this.transferLedger.connect(signer) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.confirmTransfer(serialId, receiverLocationHash, gasOverrides);

      Logger.info(`📤 Transfer confirmation tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to confirm transfer', error);
      throw error;
    }
  }

  /**
   * Returns the on-chain pending transfer receiver address, or null if none exists.
   */
  async getPendingTransferReceiver(serialId: string): Promise<string | null> {
    if (!this.transferLedger) return null;
    try {
      const pending = await this.transferLedger.pendingTransfers(serialId);
      // tuple index 8 is the `exists` boolean
      if (!pending[8]) return null;
      return String(pending[2]); // index 2 is receiver address
    } catch {
      return null;
    }
  }

  /**
   * Reject transfer on blockchain (receiver cancels pending transfer)
   */
  async rejectTransfer(
    serialId: string,
    reason: string,
    signerRole: string = 'DISTRIBUTOR',
    expectedReceiver?: string
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting transfer rejection: ${serialId}`);

      const reasonBytes = reason.startsWith('0x') && reason.length === 66
        ? reason
        : ethers.keccak256(ethers.toUtf8Bytes(reason));

      const signer = expectedReceiver
        ? this.getSignerForAddress(expectedReceiver, signerRole)
        : this.getSigner(signerRole);
      const ledger = this.transferLedger.connect(signer) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.rejectTransfer(serialId, reasonBytes, gasOverrides);

      Logger.info(`📤 Transfer rejection tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to reject transfer', error);
      throw error;
    }
  }

  async getPendingTransfer(serialId: string): Promise<{
    serialId: string;
    sender: string;
    receiver: string;
    senderRole: string;
    receiverRole: string;
    fromLocationHash: string;
    toLocationHash: string;
    requestedAt: bigint;
    exists: boolean;
  }> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      const pending = await this.transferLedger.pendingTransfers(serialId);
      return {
        serialId: pending[0],
        sender: pending[1],
        receiver: pending[2],
        senderRole: pending[3],
        receiverRole: pending[4],
        fromLocationHash: pending[5],
        toLocationHash: pending[6],
        requestedAt: pending[7],
        exists: Boolean(pending[8]),
      };
    } catch (error) {
      Logger.error('Failed to get pending transfer', error);
      throw error;
    }
  }

  /**
   * Get transfer history
   */
  async getTransferHistory(serialId: string): Promise<any[]> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      const history = await this.transferLedger.getTransferHistory(serialId);
      return history;
    } catch (error) {
      Logger.error('Failed to get transfer history', error);
      throw error;
    }
  }

  async unflagProduct(
    serialId: string,
    signerRole: string = 'RECALL_AUTHORITY'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
    const tx = await registry.unflagProduct(serialId);
    const receipt = await tx.wait();
    Logger.success(`✅ Product unflagged. TX: ${receipt?.hash}`);
    return receipt?.hash || tx.hash;
  }

  /**
   * Recall batch on blockchain
   */
  async recallBatch(
    batchHash: string,
    reasonHash: string,
    signerRole: string = 'RECALL_AUTHORITY'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      Logger.info(`📝 Recalling batch: ${batchHash}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await registry.recallBatch(batchHash, reasonHash);

      const receipt = await tx.wait();
      Logger.success(`✅ Batch recalled. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error) {
      Logger.error('Failed to recall batch', error);
      throw error;
    }
  }

  /**
   * Commission a lot on-chain: 1 tx anchoring the Merkle aggregation root
   * for every serial in the lot, instead of 1 tx per serial.
   */
  async commissionLot(
    lotIdHash: string,
    aggregationRoot: string,
    metadataHash: string,
    zkProof: string = '0x01',
    timestamp: number = Math.floor(Date.now() / 1000),
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting lot commissioning: ${lotIdHash}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await registry.commissionLot(
        lotIdHash,
        aggregationRoot,
        metadataHash,
        zkProof,
        timestamp,
        gasOverrides
      );

      Logger.info(`📤 Lot commissioning tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to commission lot', error);
      throw error;
    }
  }

  /**
   * Log a lot-level custody event (SHIP/RECEIVE/STORE/DISAGGREGATE).
   * Routed through TransferLedger, which forwards to ProductRegistry.recordEvent
   * (only TransferLedger itself may call that function on-chain).
   */
  async recordEvent(
    lotIdHash: string,
    fromActorHash: string,
    toActorHash: string,
    payloadHash: string,
    actorSignature: string,
    timestamp: number = Math.floor(Date.now() / 1000),
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting custody event for lot: ${lotIdHash}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.recordEvent(
        lotIdHash,
        fromActorHash,
        toActorHash,
        payloadHash,
        actorSignature,
        timestamp,
        gasOverrides
      );

      Logger.info(`📤 Custody event tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to record custody event', error);
      throw error;
    }
  }

  /**
   * Anchor a sealed cold-chain leg's environmental Merkle root + compliance
   * flag. Routed through TransferLedger, which forwards to ColdChainRegistry.
   */
  async anchorEnv(
    lotIdHash: string,
    legId: string,
    envMerkleRoot: string,
    windowStart: number,
    windowEnd: number,
    complianceFlag: boolean,
    zkProof: string = '0x01',
    timestamp: number = Math.floor(Date.now() / 1000),
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting cold-chain anchor for leg: ${legId}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.anchorEnv(
        lotIdHash,
        legId,
        envMerkleRoot,
        windowStart,
        windowEnd,
        complianceFlag,
        zkProof,
        timestamp,
        gasOverrides
      );

      Logger.info(`📤 Cold-chain anchor tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to anchor cold-chain leg', error);
      throw error;
    }
  }

  /**
   * Split a lot into a sub-lot bound for a different destination. The
   * authenticity anchor for every unit stays the parent lot's aggregation
   * root; this only records which sub-tree/actor a unit currently belongs
   * to, so custody/cold-chain can be tracked per sub-lot after the split.
   */
  async disaggregate(
    parentLotIdHash: string,
    subLotIdHash: string,
    subLotRoot: string,
    toActorHash: string,
    timestamp: number = Math.floor(Date.now() / 1000),
    signerRole: string = 'MANUFACTURER'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting lot disaggregation: ${parentLotIdHash} -> ${subLotIdHash}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.disaggregate(
        parentLotIdHash,
        subLotIdHash,
        subLotRoot,
        toActorHash,
        timestamp,
        gasOverrides
      );

      Logger.info(`📤 Disaggregation tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to disaggregate lot', error);
      throw error;
    }
  }

  /**
   * Decommission a single unit (dispense/consume/QA-pull) — the only point
   * at which an individual serial touches the chain again after
   * commissioning, verified against the lot's aggregation root via a real
   * Merkle inclusion proof.
   */
  async decommissionUnit(
    unitIdHash: string,
    lotIdHash: string,
    merkleProof: string[],
    eventType: string,
    timestamp: number = Math.floor(Date.now() / 1000),
    signerRole: string = 'CLINIC'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Broadcasting unit decommission: ${unitIdHash}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const gasOverrides = await this.getGasOverrides();
      const tx = await ledger.decommissionUnit(
        unitIdHash,
        lotIdHash,
        merkleProof,
        eventType,
        timestamp,
        gasOverrides
      );

      Logger.info(`📤 Unit decommission tx submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      Logger.error('Failed to decommission unit', error);
      throw error;
    }
  }

  /**
   * Recall a whole lot on-chain.
   */
  async recallLot(
    lotIdHash: string,
    reasonHash: string,
    signerRole: string = 'RECALL_AUTHORITY'
  ): Promise<string> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      Logger.info(`📝 Recalling lot: ${lotIdHash}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await registry.recallLot(lotIdHash, reasonHash);

      const receipt = await tx.wait();
      Logger.success(`✅ Lot recalled. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error) {
      Logger.error('Failed to recall lot', error);
      throw error;
    }
  }

  async lotExists(lotIdHash: string): Promise<boolean> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      return await this.productRegistry.lotExists(lotIdHash);
    } catch (error) {
      Logger.error('Failed to check lot existence', error);
      throw error;
    }
  }

  async getLot(lotIdHash: string): Promise<{
    lotIdHash: string;
    aggregationRoot: string;
    metadataHash: string;
    exists: boolean;
    recalled: boolean;
    commissionedAt: bigint;
  }> {
    if (!this.productRegistry) {
      throw new Error('ProductRegistry contract not initialized');
    }

    try {
      const lot = await this.productRegistry.lots(lotIdHash);
      return {
        lotIdHash: lot[0],
        aggregationRoot: lot[1],
        metadataHash: lot[2],
        exists: Boolean(lot[3]),
        recalled: Boolean(lot[4]),
        commissionedAt: lot[5],
      };
    } catch (error) {
      Logger.error('Failed to get lot', error);
      throw error;
    }
  }
}

export const contractClient = new ContractClient();
export default contractClient;
