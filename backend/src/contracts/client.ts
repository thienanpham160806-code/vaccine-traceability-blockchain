import { ethers } from 'ethers';
import config from '../config/env';
import { Logger } from '../utils/logger';

// Import ABIs (they will be loaded from artifacts)
let PRODUCT_REGISTRY_ABI: any[] = [];
let TRANSFER_LEDGER_ABI: any[] = [];
let ACCESS_CONTROL_ABI: any[] = [];

// Try to load ABIs from JSON files
try {
  const ProductRegistryABI = require('./abis/ProductRegistry.json');
  const TransferLedgerABI = require('./abis/TransferLedger.json');
  const AccessControlABI = require('./abis/SupplyChainAccessControl.json');

  PRODUCT_REGISTRY_ABI = ProductRegistryABI.abi || ProductRegistryABI;
  TRANSFER_LEDGER_ABI = TransferLedgerABI.abi || TransferLedgerABI;
  ACCESS_CONTROL_ABI = AccessControlABI.abi || AccessControlABI;
} catch (error) {
  Logger.warn('⚠️ Could not load ABIs from JSON files, using fallback');
  // Fallback to minimal ABIs
  PRODUCT_REGISTRY_ABI = [
    'function registerProduct(bytes32 serialID, bytes32 batchHash, bytes32 metadataHash, bytes32 importDocHash, bytes zkpProof) external',
    'function getProduct(bytes32 serialID) external view returns (tuple(bytes32, bytes32, bytes32, bytes32, address, address, uint8, uint8, bool, bool, uint8, bytes32, uint256, bool))',
    'function getStatus(bytes32 serialID) external view returns (uint8)',
    'function getRiskLevel(bytes32 serialID) external view returns (uint8)',
    'function productExists(bytes32 serialID) external view returns (bool)',
    'function getCurrentOwner(bytes32 serialID) external view returns (address)',
    'function setTransferLedger(address newTransferLedger) external',
    'function recallBatch(bytes32 batchHash, bytes32 reasonHash) external',
    'event ProductRegistered(bytes32 indexed serialID, bytes32 indexed batchHash, address indexed owner, bool isImported, bool zkpVerified, uint8 status)',
    'event ProductFlagged(bytes32 indexed serialID, uint8 riskLevel, bytes32 indexed reason)',
    'event BatchRecalled(bytes32 indexed batchHash, bytes32 indexed reasonHash, uint256 totalProducts)',
  ];

  TRANSFER_LEDGER_ABI = [
    'function createTransferRequest(bytes32 serialID, address receiver, bytes32 fromLocationHash, bytes32 toLocationHash) external',
    'function confirmTransfer(bytes32 serialID, bytes32 receiverLocationHash) external',
    'function rejectTransfer(bytes32 serialID, bytes32 reason) external',
    'function getTransferHistory(bytes32 serialID) external view returns (tuple(bytes32, address, address, bytes32, bytes32, bytes32, bytes32, uint256, uint256)[])',
    'function getPendingTransfer(bytes32 serialID) external view returns (tuple(bytes32, address, address, bytes32, bytes32, bytes32, bytes32, uint256, bool))',
    'event TransferRequested(bytes32 indexed serialID, address indexed sender, address indexed receiver, bytes32 fromLocationHash, bytes32 toLocationHash, uint256 requestedAt)',
    'event TransferConfirmed(bytes32 indexed serialID, address indexed sender, address indexed receiver, uint256 confirmedAt)',
    'event TransferRejected(bytes32 indexed serialID, address indexed sender, address indexed receiver, bytes32 reason)',
    'event DoubleScanDetected(bytes32 indexed serialID, bytes32 previousLocationHash, bytes32 newLocationHash, uint256 previousTimestamp, uint256 newTimestamp)',
  ];

  ACCESS_CONTROL_ABI = [
    'function hasRole(bytes32 role, address account) external view returns (bool)',
    'function grantUserRole(address account, bytes32 role) external',
    'function getPrimaryRole(address account) external view returns (bytes32)',
    'function isValidRoute(bytes32 fromRole, bytes32 toRole) external view returns (bool)',
    'function MANUFACTURER_ROLE() external view returns (bytes32)',
    'function IMPORTER_ROLE() external view returns (bytes32)',
    'function DISTRIBUTOR_ROLE() external view returns (bytes32)',
    'function CLINIC_ROLE() external view returns (bytes32)',
  ];
}

/**
 * Contract client - manages interaction with smart contracts
 */
export class ContractClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  public productRegistry: ethers.Contract | null = null;
  public transferLedger: ethers.Contract | null = null;
  public accessControl: ethers.Contract | null = null;
  private readonly roleNames = [
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
      const rpcUrl = config.blockchainRpcUrl;
      const privateKey = config.backendPrivateKey;

      if (!rpcUrl || !privateKey) {
        throw new Error('Missing RPC URL or private key in config');
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl);
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
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  roleNameToBytes32(role: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(`${role.toUpperCase()}_ROLE`));
  }

  bytes32ToRoleName(roleHash: string): string | null {
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
      Logger.info(`📝 Registering product: ${serialId}`);

      const registry = this.productRegistry.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await registry.registerProduct(
        serialId,
        batchHash,
        metadataHash,
        importDocHash,
        zkpProof
      );

      const receipt = await tx.wait();
      Logger.success(`✅ Product registered. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error) {
      Logger.error('Failed to register product', error);
      throw error;
    }
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
      Logger.info(`📝 Creating transfer for: ${serialId}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await ledger.createTransferRequest(
        serialId,
        receiver,
        fromLocationHash,
        toLocationHash
      );

      const receipt = await tx.wait();
      Logger.success(`✅ Transfer created. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
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
    signerRole: string = 'DISTRIBUTOR'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Confirming transfer: ${serialId}`);

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await ledger.confirmTransfer(serialId, receiverLocationHash);

      const receipt = await tx.wait();
      Logger.success(`✅ Transfer confirmed. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error) {
      Logger.error('Failed to confirm transfer', error);
      throw error;
    }
  }

  /**
   * Reject transfer on blockchain (receiver cancels pending transfer)
   */
  async rejectTransfer(
    serialId: string,
    reason: string,
    signerRole: string = 'DISTRIBUTOR'
  ): Promise<string> {
    if (!this.transferLedger) {
      throw new Error('TransferLedger contract not initialized');
    }

    try {
      Logger.info(`📝 Rejecting transfer: ${serialId}`);

      const reasonBytes = reason.startsWith('0x') && reason.length === 66
        ? reason
        : ethers.keccak256(ethers.toUtf8Bytes(reason));

      const ledger = this.transferLedger.connect(this.getSigner(signerRole)) as ethers.Contract;
      const tx = await ledger.rejectTransfer(serialId, reasonBytes);

      const receipt = await tx.wait();
      Logger.success(`✅ Transfer rejected. TX: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error) {
      Logger.error('Failed to reject transfer', error);
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
}

export const contractClient = new ContractClient();
export default contractClient;
