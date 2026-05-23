export type UserRole =
  | "ADMIN"
  | "AUDITOR"
  | "MANUFACTURER"
  | "IMPORTER"
  | "DISTRIBUTOR"
  | "CLINIC"
  | "PUBLIC";

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
