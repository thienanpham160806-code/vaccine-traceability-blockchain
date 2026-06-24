// ============= Auth & User =============
export type UserRole = 
  | 'MANUFACTURER'
  | 'IMPORTER'
  | 'DISTRIBUTOR'
  | 'CLINIC'
  | 'PHARMACY'
  | 'PUBLIC'
  | 'AUDITOR'
  | 'RECALL_AUTHORITY'
  | 'ADMIN';

export interface User {
  id: string;
  address: string;
  walletAddress?: string;
  role: UserRole;
  roles?: UserRole[];
  name?: string;
  fullName?: string;
  title?: string;
  email?: string;
  phone?: string;
  organizationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  type: UserRole | string;
  code?: string;
  address?: string;
  walletAddress?: string;
  licenseNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  facilityType?: string;
  storageCapacity?: string;
  coldChainCapability?: string;
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface PublicOrganizationProfile {
  id?: string;
  name?: string;
  type?: UserRole | string;
  code?: string;
  address?: string;
  licenseNumber?: string;
  facilityType?: string;
  storageCapacity?: string;
  coldChainCapability?: string;
  isActive?: boolean;
}

// ============= Product & Batch =============
export type ProductStatus =
  | 'REGISTERED'
  | 'VERIFIED'
  | 'IN_TRANSIT'
  | 'PENDING_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERED_TO_DISTRIBUTOR'
  | 'DELIVERED_TO_CLINIC'
  | 'DELIVERED_TO_PHARMACY'
  | 'ADMINISTERED'
  | 'FLAGGED'
  | 'RECALLED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Product {
  serialId: string;
  batchId: string;
  batchHash: string;
  productName: string;
  manufacturerName: string;
  manufacturerAddress: string;
  currentOwner: string;
  ownerRole?: UserRole;
  status: ProductStatus;
  riskLevel: RiskLevel;
  expiryDate: string;
  isImported: boolean;
  zkpVerified: boolean;
  blockchainTx?: string;
  importDocumentIpfsCid?: string;
  importDocCommitment?: string;
  approvedImportRoot?: string;
  importProofMode?: string;

  metadataHash?: string;
  ipfsCid?: string;
  qrImage?: string;
  notes?: string;
  registeredAt?: number;

  createdAt: number;
  updatedAt: number;
}

export interface Batch {
  id: string;
  batchHash: string;
  batchQR: string; // BATCH-VCN-2026-001
  metadataHash: string;
  productName: string;
  quantity: number;
  manufacturerAddress: string;
  manufacturerName: string;
  expiryDate: string;
  origin: 'MANUFACTURED' | 'IMPORTED';
  ipfsCid?: string; // IPFS CID of batch snapshot
  importDocumentIpfsCid?: string;
  importDocCommitment?: string;
  approvedImportRoot?: string;
  recalledAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ============= Transfer =============
export type TransferStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'RETURNED';

export interface TransferRecord {
  id: string;
  serialId: string;
  batchId: string;
  fromAddress: string;
  toAddress: string;
  fromRole: UserRole;
  toRole: UserRole;
  status: TransferStatus;
  fromLocationHash?: string;
  toLocationHash?: string;
  fromLocationName?: string;
  toLocationName?: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  carrierName?: string;
  vehicleId?: string;
  departedAt?: number;
  arrivedAt?: number;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureUnit?: 'C' | 'F';
  handlingNotes?: string;
  ipfsCid?: string;
  blockchainTx?: string;
  rejectedReason?: string;
  confirmedAt?: number;
  rejectedAt?: number;
  returnedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TransferEvent {
  id: string;
  from: string;
  to: string;
  location: string;
  status: ProductStatus;
  timestamp: string;
  txHash?: string;
}

// ============= Dashboard =============
export interface DashboardStats {
  totalBatches: number;
  totalSerials: number;
  pendingTransfers: number;
  riskAlerts: number;
  totalProducts?: number;
  recalledBatches?: number;
  last7DaysTrend?: Array<{
    date: string;
    count: number;
  }>;
}

export interface DashboardActivity {
  id: string;
  type: 'PRODUCT' | 'TRANSFER' | 'RISK' | 'RECALL';
  title: string;
  subtitle: string;
  status?: string;
  href: string;
  timestamp: number;
  audienceRoles?: string[];
}

// ============= Verify =============
export interface VerifyResult {
  product: Product;
  batch: Batch;
  timeline: TransferRecord[];
  supplyChainNodes: SupplyChainNode[];
  recallStatus: boolean;
  zkProofVerified: boolean;
  onChainVerified?: boolean;
  metadataHashMatch?: boolean;
  onChainStatus?: string | null;
  lastScan?: { timestamp: number; locationHash: string } | null;
  risk?: { riskLevel: string; riskScore: number; triggeredRules: string[] };
}

export interface SupplyChainNode {
  id: string;
  role: UserRole | string;
  walletAddress?: string;
  organization?: PublicOrganizationProfile | null;
  organizationName?: string;
  organizationCode?: string;
  licenseNumber?: string;
  addressOrRegion?: string;
  facilityType?: string;
  warehouseName?: string;
  locationName?: string;
  temperatureRange?: string;
  departedAt?: number;
  arrivedAt?: number;
  status?: string;
  transferId?: string;
  carrierName?: string;
  vehicleId?: string;
  handlingNotes?: string;
  technicalDetails: {
    txHash?: string;
    blockchainTx?: string;
    ipfsCid?: string;
    fromLocationHash?: string;
    toLocationHash?: string;
    fromAddress?: string;
    toAddress?: string;
  };
}

// ============= Risk & Alerts =============
export interface RiskFlag {
  id: string;
  serialId: string;
  batchId: string;
  reason: string; // DOUBLE_SCAN, INVALID_ROUTE, etc
  level: number; // 0-4
  createdAt: number;
}

// ============= Recall & Dispute =============
export interface Recall {
  id: string;
  batchHash: string;
  reasonHash: string;
  authorityAddress: string;
  serialsAffected: number;
  createdAt: number;
}

export interface Dispute {
  id: string;
  relatedSerialId: string;
  reportedBy: string;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED';
  reason: string;
  evidenceIpfsCid?: string;
  resolutionNote?: string;
  createdAt: number;
  updatedAt: number;
}

// ============= API Response =============
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ============= Request/Response Types =============
export interface RegisterProductRequest {
  serialId: string;
  batchHash: string;
  metadataHash: string;
  productName: string;
  quantity?: number;
  expiryDate: string;
  importDocHash?: string;
  zkpProof?: string;
}

export interface TransferScanRequest {
  serialId: string;
  senderRole: UserRole;
  receiverRole: UserRole;
  receiverAddress: string;
  fromLocationHash?: string;
  toLocationHash?: string;
  fromLocationName?: string;
  toLocationName?: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  carrierName?: string;
  vehicleId?: string;
  departedAt?: number;
  arrivedAt?: number;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureUnit?: 'C' | 'F';
  handlingNotes?: string;
}

export interface TransferConfirmRequest {
  serialId: string;
  receiverLocationHash?: string;
}

export interface TransferRejectRequest {
  serialId: string;
  rejectionReason: string;
}
