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

export type RiskLevel = "SAFE" | "ALERT" | "HIGH";

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
  blockchainTx?: string;
  zkProofVerified?: boolean;
  isImported?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
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

export type VerifyResult = {
  product: Product;
  origin: string;
  recallStatus: boolean;
  zkProofVerified: boolean;
  timeline: TransferEvent[];
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
  batchQR: string;
  metadataHash?: string;
  productName: string;
  quantity: number;
  manufacturerAddress: string;
  manufacturerName: string;
  expiryDate: string;
  origin: "MANUFACTURED" | "IMPORTED";
  ipfsCid?: string;
  recalledAt?: number;
  createdAt: number;
  updatedAt: number;
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
