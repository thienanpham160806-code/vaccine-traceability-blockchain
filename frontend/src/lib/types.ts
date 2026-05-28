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
  | "PENDING_DELIVERY"
  | "DELIVERED"
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
  status: "REGISTERED" | "PENDING_DELIVERY" | "DELIVERED" | "FLAGGED" | "RECALLED";
  timestamp: string;
  txHash?: string;
};

export type DashboardStats = {
  totalBatches: number;
  totalSerials: number;
  pendingTransfers: number;
  riskAlerts: number;
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
  serials?: string[];
  txHash?: string;
  createdAt?: number;
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
