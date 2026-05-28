import axios from "axios";
import type {
  ApiResponse,
  Batch,
  DashboardStats,
  Product,
  ProductDetailResponse,
  ProductListResponse,
  RecallRecord,
  RiskFlag,
  TransferRecord,
  VerifyResult,
} from "./types";

type ApiErrorLike = {
  code?: string;
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
};

function requireApiData<T>(data: T | undefined, fallback: string): T {
  if (data === undefined) {
    throw new Error(fallback);
  }

  return data;
}

export type RegisterProductResponse = {
  product: Product;
  batch: Batch;
  batchHash: string;
  metadataHash: string;
  serialHash: string;
  ipfsCid?: string;
  qrContent?: string;
  qrImage?: string;
  txHash?: string;
};

export type BulkRegisterResponse = {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    index: number;
    serialId?: string;
    serialHash?: string;
    success: boolean;
    product?: Product;
    batch?: Batch;
    txHash?: string;
    ipfsCid?: string;
    error?: string;
  }>;
};

export type TransferActionResponse = {
  transfer?: TransferRecord;
  transferId?: string;
  serialId?: string;
  serialHash?: string;
  rejectionReason?: string;
  txHash?: string;
};

export type DisputeRecord = {
  id?: string;
  relatedSerialId: string;
  reason: string;
  reportedBy?: string;
  status?: string;
  statusNote?: string;
  evidenceIpfsCid?: string;
  evidence?: Array<{
    id: string;
    type: string;
    title: string;
    value: string;
    addedBy?: string;
    createdAt?: number;
  }>;
  statusHistory?: Array<{
    status: string;
    note?: string;
    updatedBy?: string;
    createdAt?: number;
  }>;
  createdAt?: number;
  updatedAt?: number;
  closedAt?: number | null;
};

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    address: string;
    role: string;
  };
};

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("demoToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const endpoints = {
  health: "/health",
  login: "/auth/login",

  overview: "/dashboard/overview",

  getBatches: "/batches",
  getBatch: (batchId: string) => `/batches/${batchId}`,
  getBatchSerials: (batchId: string) => `/batches/${batchId}/serials`,
  createBatch: "/batches",
  registerProduct: "/products/register",
  bulkRegisterProducts: "/products/bulk",
  getProducts: "/products",
  getProductDetail: (serialId: string) => `/products/${serialId}/detail`,
  updateProduct: (serialId: string) => `/products/${serialId}`,

  getTransfers: "/transfers",
  getTransfer: (transferId: string) => `/transfers/${transferId}`,
  scanTransfer: "/transfers/scan",
  confirmTransfer: "/transfers/confirm",
  rejectTransfer: "/transfers/reject",

  verify: (serialId: string) => `/verify/${serialId}`,
  consumerVerify: (serialId: string) => `/consumer/verify/${serialId}`,

  riskFlags: "/risk-flags",
  getRiskFlag: (id: string) => `/risk-flags/${id}`,
  resolveRiskFlag: (id: string) => `/risk-flags/${id}/resolve`,
  disputes: "/disputes",
  getDispute: (id: string) => `/disputes/${id}`,
  updateDisputeStatus: (id: string) => `/disputes/${id}/status`,
  addDisputeEvidence: (id: string) => `/disputes/${id}/evidence`,

  recalls: "/recalls",
};

export function getApiErrorMessage(err: unknown, fallback = "Request failed.") {
  const error = err as ApiErrorLike;
  if (error?.code === "ECONNABORTED") return "Backend request timed out. Check backend and Hardhat are running.";
  if (!error?.response) return "Cannot reach backend. Start backend on http://localhost:5000 and refresh.";
  return error.response.data?.error?.message || fallback;
}

export async function getHealth() {
  const res = await api.get<{ status: string; timestamp: string; environment: string }>(endpoints.health);
  return res.data;
}

export async function login(payload: { address: string; role: string }) {
  const res = await api.post<ApiResponse<LoginResponse>>(endpoints.login, payload);
  return requireApiData(res.data.data, "Login response did not include data.");
}

export async function getDashboardOverview() {
  const res = await api.get<ApiResponse<DashboardStats>>(endpoints.overview);
  return requireApiData(res.data.data, "Dashboard response did not include data.");
}

// ============= Batches =============

export async function getBatches() {
  const res = await api.get<ApiResponse<Batch[]>>(endpoints.getBatches);
  return res.data.data || [];
}

export async function getBatch(batchId: string) {
  const res = await api.get<ApiResponse<Batch>>(endpoints.getBatch(batchId));
  return requireApiData(res.data.data, "Batch response did not include data.");
}

export async function getBatchSerials(batchId: string) {
  const res = await api.get<ApiResponse<Product[]>>(endpoints.getBatchSerials(batchId));
  return res.data.data || [];
}

// ============= Products =============

export async function getProducts(params?: {
  search?: string;
  status?: string;
  manufacturer?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}) {
  const res = await api.get<ApiResponse<ProductListResponse | Product[]>>(endpoints.getProducts, {
    params,
  });
  const data = res.data.data;

  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: params?.page || 1,
      pageSize: params?.pageSize || data.length || 10,
    };
  }

  return data || {
    items: [],
    total: 0,
    page: params?.page || 1,
    pageSize: params?.pageSize || 10,
  };
}

export async function getProductDetail(serialId: string) {
  const res = await api.get<ApiResponse<ProductDetailResponse>>(endpoints.getProductDetail(serialId));
  return requireApiData(res.data.data, "Product detail response did not include data.");
}

export async function updateProduct(
  serialId: string,
  payload: {
    productName?: string;
    manufacturerName?: string;
    expiryDate?: string;
    notes?: string;
  }
) {
  const res = await api.put<ApiResponse<{ product: Product }>>(endpoints.updateProduct(serialId), payload);
  return requireApiData(res.data.data, "Update product response did not include data.");
}

export async function registerProduct(payload: {
  serialId: string;
  batchId: string;
  productName: string;
  manufacturerName?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  quantity?: number;
}) {
  const res = await api.post<ApiResponse<RegisterProductResponse>>(endpoints.registerProduct, payload);
  return requireApiData(res.data.data, "Register product response did not include data.");
}

export async function bulkRegisterProducts(products: Array<{
  serialId: string;
  batchId?: string;
  batchHash?: string;
  productName: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  quantity?: number;
  importDocHash?: string;
  zkpProof?: string;
}>) {
  const res = await api.post<ApiResponse<BulkRegisterResponse>>(endpoints.bulkRegisterProducts, { products });
  return requireApiData(res.data.data, "Bulk register response did not include data.");
}

// ============= Transfers =============

export async function getTransfers() {
  const res = await api.get<ApiResponse<TransferRecord[]>>(endpoints.getTransfers);
  return res.data.data || [];
}

export async function getTransfer(transferId: string) {
  const res = await api.get<ApiResponse<TransferRecord>>(endpoints.getTransfer(transferId));
  return requireApiData(res.data.data, "Transfer response did not include data.");
}

export async function scanTransfer(payload: {
  serialId: string;
  fromRole: string;
  toRole: string;
  receiverAddress?: string;
  batchId?: string;
}) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.scanTransfer, payload);
  return requireApiData(res.data.data, "Scan transfer response did not include data.");
}

export async function confirmTransfer(serialId: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.confirmTransfer, { serialId });
  return requireApiData(res.data.data, "Confirm transfer response did not include data.");
}

export async function rejectTransfer(serialId: string, rejectionReason: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.rejectTransfer, { serialId, rejectionReason });
  return requireApiData(res.data.data, "Reject transfer response did not include data.");
}

// ============= Risk & Disputes =============

export async function getRiskFlags() {
  const res = await api.get<ApiResponse<RiskFlag[]>>(endpoints.riskFlags);
  return res.data.data || [];
}

export async function getRiskFlag(id: string) {
  const res = await api.get<ApiResponse<RiskFlag>>(endpoints.getRiskFlag(id));
  return requireApiData(res.data.data, "Risk flag response did not include data.");
}

export async function resolveRiskFlag(id: string, payload: { note?: string; resolvedBy?: string }) {
  const res = await api.put<ApiResponse<RiskFlag>>(endpoints.resolveRiskFlag(id), payload);
  return requireApiData(res.data.data, "Resolve risk flag response did not include data.");
}

export async function getRecalls() {
  const res = await api.get<ApiResponse<RecallRecord[]>>(endpoints.recalls);
  return res.data.data || [];
}

export async function createRecall(payload: { batchHash: string; reason: string; serials: string[] }) {
  const res = await api.post<ApiResponse<RecallRecord>>(endpoints.recalls, payload);
  return requireApiData(res.data.data, "Create recall response did not include data.");
}

export async function getDisputes() {
  const res = await api.get<ApiResponse<DisputeRecord[]>>(endpoints.disputes);
  return res.data.data || [];
}

export async function getDispute(id: string) {
  const res = await api.get<ApiResponse<DisputeRecord>>(endpoints.getDispute(id));
  return requireApiData(res.data.data, "Dispute response did not include data.");
}

export async function createDispute(payload: { relatedSerialId: string; reason: string; reportedBy?: string }) {
  const res = await api.post<ApiResponse<DisputeRecord>>(endpoints.disputes, payload);
  return requireApiData(res.data.data, "Create dispute response did not include data.");
}

export async function updateDisputeStatus(
  id: string,
  payload: { status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "REJECTED"; note?: string; updatedBy?: string }
) {
  const res = await api.put<ApiResponse<DisputeRecord>>(endpoints.updateDisputeStatus(id), payload);
  return requireApiData(res.data.data, "Update dispute status response did not include data.");
}

export async function addDisputeEvidence(
  id: string,
  payload: { type?: string; title?: string; value: string; addedBy?: string }
) {
  const res = await api.post<ApiResponse<DisputeRecord>>(endpoints.addDisputeEvidence(id), payload);
  return requireApiData(res.data.data, "Add dispute evidence response did not include data.");
}

// ============= Verify =============

export async function verifyProduct(serialId: string) {
  const res = await api.get<ApiResponse<VerifyResult>>(endpoints.verify(serialId));
  return requireApiData(res.data.data, "Verify response did not include data.");
}
