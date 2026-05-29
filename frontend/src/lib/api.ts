import axios from "axios";
import type { ApiResponse, Batch, DashboardActivity, DashboardStats, Product, TransferRecord, VerifyResult } from "./types";

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
  demoActors: "/auth/demo-actors",
  authNonce: "/auth/nonce",
  loginWithSignature: "/auth/login-with-signature",

  overview: "/dashboard/overview",
  recentActivity: "/dashboard/recent-activity",

  getBatches: "/batches",
  getBatch: (batchId: string) => `/batches/${batchId}`,
  getBatchSerials: (batchId: string) => `/batches/${batchId}/serials`,
  createBatch: "/batches",
  registerProduct: "/products/register",
  getProducts: "/products",

  getTransfers: "/transfers",
  getTransfer: (transferId: string) => `/transfers/${transferId}`,
  scanTransfer: "/transfers/scan",
  confirmTransfer: "/transfers/confirm",
  rejectTransfer: "/transfers/reject",

  verify: (serialId: string) => `/verify/${serialId}`,
  consumerVerify: (serialId: string) => `/consumer/verify/${serialId}`,

  riskFlags: "/risk-flags",
  disputes: "/disputes",

  recalls: "/recalls",
};

export function getApiErrorMessage(err: any, fallback = "Request failed.") {
  if (err?.code === "ECONNABORTED") return "Yêu cầu đến backend quá thời gian. Hãy kiểm tra backend và RPC.";
  if (!err?.response) return "Không kết nối được backend. Hãy kiểm tra http://localhost:5000.";

  const code = err?.response?.data?.error?.code;
  const message = err?.response?.data?.error?.message;
  const messages: Record<string, string> = {
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    ROLE_MISMATCH: message || "Vai trò hiện tại không khớp với thao tác này.",
    MISSING_TOKEN: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
    INVALID_TOKEN: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    INVALID_ADDRESS: "Địa chỉ ví không hợp lệ.",
    NONCE_NOT_FOUND: "Phiên ký MetaMask đã hết hạn. Vui lòng thử lại.",
    NONCE_EXPIRED: "Phiên ký MetaMask đã hết hạn. Vui lòng thử lại.",
    SIGNATURE_MISMATCH: "Chữ ký MetaMask không khớp với ví đang đăng nhập.",
    INVALID_SERIAL_ID: "Serial chỉ được dùng chữ, số, dấu gạch ngang hoặc gạch dưới.",
    INVALID_BATCH_ID: "Mã lô chỉ được dùng chữ, số, dấu gạch ngang hoặc gạch dưới.",
  };

  return messages[code] || message || fallback;
}

export async function getHealth() {
  const res = await api.get<{ status: string; timestamp: string; environment: string }>(endpoints.health);
  return res.data;
}

export async function login(payload: { address: string; role: string }) {
  const res = await api.post<ApiResponse<any>>(endpoints.login, payload);
  return res.data.data;
}

export async function getDemoActors() {
  const res = await api.get<ApiResponse<Array<{ role: string; label: string; address: string }>>>(endpoints.demoActors);
  return res.data.data || [];
}

export async function requestAuthNonce(address: string) {
  const res = await api.post<ApiResponse<{ message: string; expiresAt: number }>>(endpoints.authNonce, {
    address,
  });
  return res.data.data;
}

export async function loginWithSignature(payload: { address: string; signature: string }) {
  const res = await api.post<ApiResponse<any>>(endpoints.loginWithSignature, payload);
  return res.data.data;
}

export async function getDashboardOverview() {
  const res = await api.get<ApiResponse<DashboardStats>>(endpoints.overview);
  return res.data.data;
}

export async function getDashboardRecentActivity(limit = 10) {
  const res = await api.get<ApiResponse<DashboardActivity[]>>(endpoints.recentActivity, {
    params: { limit },
  });
  return res.data.data || [];
}

// ============= Batches =============

export async function getBatches() {
  const res = await api.get<ApiResponse<Batch[]>>(endpoints.getBatches);
  return res.data.data || [];
}

export async function getBatch(batchId: string) {
  const res = await api.get<ApiResponse<Batch>>(endpoints.getBatch(batchId));
  return res.data.data;
}

export async function getBatchSerials(batchId: string) {
  const res = await api.get<ApiResponse<Product[]>>(endpoints.getBatchSerials(batchId));
  return res.data.data || [];
}

// ============= Products =============

export async function getProducts() {
  const res = await api.get<ApiResponse<Product[]>>(endpoints.getProducts);
  return res.data.data || [];
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
  const res = await api.post<ApiResponse<any>>(endpoints.registerProduct, payload);
  return res.data.data;
}

// ============= Transfers =============

export async function getTransfers() {
  const res = await api.get<ApiResponse<TransferRecord[]>>(endpoints.getTransfers);
  return res.data.data || [];
}

export async function getTransfer(transferId: string) {
  const res = await api.get<ApiResponse<TransferRecord>>(endpoints.getTransfer(transferId));
  return res.data.data;
}

export async function scanTransfer(payload: {
  serialId: string;
  fromRole: string;
  toRole: string;
  receiverAddress?: string;
  batchId?: string;
}) {
  const res = await api.post<ApiResponse<any>>(endpoints.scanTransfer, payload);
  return res.data.data;
}

export async function confirmTransfer(serialId: string) {
  const res = await api.post<ApiResponse<any>>(endpoints.confirmTransfer, { serialId });
  return res.data.data;
}

export async function rejectTransfer(serialId: string, rejectionReason: string) {
  const res = await api.post<ApiResponse<any>>(endpoints.rejectTransfer, { serialId, rejectionReason });
  return res.data.data;
}

// ============= Risk & Disputes =============

export async function getRiskFlags() {
  const res = await api.get<ApiResponse<any[]>>(endpoints.riskFlags);
  return res.data.data || [];
}

export async function getRecalls() {
  const res = await api.get<ApiResponse<any[]>>(endpoints.recalls);
  return res.data.data || [];
}

export async function createRecall(payload: { batchHash: string; reason: string; serials: string[] }) {
  const res = await api.post<ApiResponse<any>>(endpoints.recalls, payload);
  return res.data.data;
}

export async function getDisputes() {
  const res = await api.get<ApiResponse<any[]>>(endpoints.disputes);
  return res.data.data || [];
}

export async function createDispute(payload: { relatedSerialId: string; reason: string; reportedBy?: string }) {
  const res = await api.post<ApiResponse<any>>(endpoints.disputes, payload);
  return res.data.data;
}

// ============= Verify =============

export async function verifyProduct(serialId: string) {
  const res = await api.get<ApiResponse<VerifyResult>>(endpoints.verify(serialId));
  return res.data.data;
}
