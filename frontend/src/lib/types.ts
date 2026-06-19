export type UserRole =
  | "ADMIN"
  | "AUDITOR"
  | "MANUFACTURER"
  | "IMPORTER"
  | "DISTRIBUTOR"
  | "CLINIC"
  | "PHARMACY"
  | "PUBLIC"
  | "RECALL_AUTHORITY";

export type ProductType = "LOCAL" | "IMPORT";

export type ProductStatus =
  | "VERIFIED"
  | "IN_TRANSIT"
  | "PENDING_DELIVERY"
  | "DELIVERED"
  | "DELIVERED_TO_DISTRIBUTOR"
  | "DELIVERED_TO_CLINIC"
  | "DELIVERED_TO_PHARMACY"
  | "ADMINISTERED"
  | "FLAGGED"
  | "RECALLED"
  | "INVALID";

export type RiskLevel = "SAFE" | "ALERT" | "HIGH" | "CRITICAL";

export type Product = {
  serialId: string;
  batchId: string;
  batchHash?: string;
  productName: string;
  productType?: ProductType;
  manufacturerName: string;
  manufacturerAddress?: string;
  currentOwner: string;
  ownerRole?: UserRole;
  status: ProductStatus;
  riskLevel: RiskLevel;
  expiryDate: string;

  isImported?: boolean;
  zkpVerified?: boolean;
  blockchainTx?: string;

  metadataHash?: string;
  ipfsCid?: string;
  qrImage?: string;
  notes?: string;
  registeredAt?: number;

  createdAt?: number;
  updatedAt?: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp?: number;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductDetailResponse = {
  product: Product;
  batch?: Batch | null;
  timeline: TransferRecord[];
  riskFlags: RiskFlag[];
  recall?: RecallRecord | null;
  blockchain: {
    serialHash: string;
    txHash?: string;
    currentOwner: string;
    status: string;
    transferHistory: unknown[];
    available: boolean;
  };
};

export type TransferEvent = {
  id: string;
  from: string;
  to: string;
  location: string;
  status: "REGISTERED" | "VERIFIED" | "IN_TRANSIT" | "PENDING_DELIVERY" | "DELIVERED" | "DELIVERED_TO_DISTRIBUTOR" | "DELIVERED_TO_CLINIC" | "DELIVERED_TO_PHARMACY" | "ADMINISTERED" | "FLAGGED" | "RECALLED" | "PENDING" | "CONFIRMED" | "REJECTED" | "RETURNED";
  timestamp: string;
  txHash?: string;
  blockchainTx?: string;
  fromAddress?: string;
  toAddress?: string;
  sender?: string;
  receiver?: string;
  rejectedReason?: string;
  rejectionReason?: string;
  rejectedAt?: number;
};

export type DashboardStats = {
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
};

export type DashboardActivity = {
  id: string;
  type: "PRODUCT" | "TRANSFER" | "RISK" | "RECALL";
  title: string;
  subtitle: string;
  status?: string;
  href: string;
  timestamp: number;
  audienceRoles?: string[];
};

export type Batch = {
  id: string;
  batchHash: string;
  batchQR?: string;
  metadataHash?: string;
  productName: string;
  quantity: number;
  manufacturerAddress?: string;
  manufacturerName?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  ipfsCid?: string;
  recalledAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type VerifyResult = {
  product: Product;
  batch?: Batch;
  timeline: TransferEvent[];
  recallStatus: boolean;
  zkProofVerified: boolean;
};

export type RiskFlag = {
  id?: string;
  serialId?: string;
  serialHash?: string;
  batchId?: string;
  batchHash?: string;
  reason?: string;
  flagReason?: string;
  level?: string | number;
  riskLevel?: RiskLevel;
  status?: "OPEN" | "RESOLVED";
  resolutionNote?: string;
  resolvedBy?: string;
  createdAt?: number;
  updatedAt?: number;
  resolvedAt?: number;
};

export type RecallRecord = {
  id?: string;
  batchHash?: string;
  reason?: string;
  reasonHash?: string;
  serials?: string[];
  serialsAffected?: number;
  txHash?: string;
  blockchainTx?: string;
  createdAt?: number;
  updatedAt?: number;
  recalledAt?: number;
};

export type TransferStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "RETURNED";

export type TransferRecord = {
  id: string;
  serialId: string;
  batchId?: string;
  fromAddress: string;
  toAddress: string;
  fromRole: UserRole;
  toRole: UserRole;
  status: TransferStatus;
  fromLocationHash?: string;
  toLocationHash?: string;
  ipfsCid?: string;
  blockchainTx?: string;
  rejectedReason?: string;
  confirmedAt?: number;
  rejectedAt?: number;
  returnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type RoleRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type RoleRequest = {
  id: string;
  address: string;
  currentRole?: UserRole;
  requestedRole: Exclude<UserRole, "ADMIN" | "PUBLIC">;
  note?: string;
  status: RoleRequestStatus;
  txHash?: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
};

export type WalletRoleInfo = {
  address: string;
  roles: UserRole[];
  primaryRole: UserRole | null;
  hasAdminRole: boolean;
};
