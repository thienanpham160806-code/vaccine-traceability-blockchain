import axios from "axios";
import type {
  ApiResponse,
  Batch,
  DashboardActivity,
  DashboardStats,
  Product,
  ProductDetailResponse,
  ProductListResponse,
  ProfileResponse,
  RecallRecord,
  RoleRequest,
  RiskFlag,
  TransferRecord,
  VerifyResult,
  WalletRoleInfo,
} from "./types";

type ApiErrorLike = {
  code?: string;
  message?: string;
  response?: {
    data?: {
      error?: {
        code?: string;
        message?: string;
        details?: Array<{ path?: string; message?: string }>;
      };
    };
  };
};

const productionApiUrl = "https://vaccine-traceability-blockchain.onrender.com";

function isLoopbackApiUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function resolveApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (configuredUrl && (isLocalhost || !isLoopbackApiUrl(configuredUrl))) {
      return configuredUrl;
    }
    return isLocalhost ? "http://localhost:5000" : productionApiUrl;
  }

  if (configuredUrl) return configuredUrl;

  return process.env.NODE_ENV === "production" ? productionApiUrl : "http://localhost:5000";
}

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
  importDocumentIpfsCid?: string;
  importDocCommitment?: string;
  approvedImportRoot?: string;
  importProofMode?: string;
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
  jobId?: string;
  txHash?: string;
};

export type BatchShellTransferResponse = {
  transfer: TransferRecord;
  transferId: string;
};

export type ReconcileItem = {
  productKey: string;
  serialId: string;
  serialHash: string;
  firebaseOwner?: string | null;
  firebaseOwnerRole?: string | null;
  firebaseStatus?: string | null;
  firebasePendingTransferId?: string | null;
  chainExists: boolean;
  chainOwner?: string | null;
  chainOwnerRole?: string | null;
  chainStatus?: string | null;
  chainPendingExists: boolean;
  syncStatus: Product["syncStatus"];
  problems: string[];
};

export type ReconcilePreviewResponse = {
  summary: Record<string, number>;
  items: ReconcileItem[];
};

export type ReconcileApplyResponse = {
  summary: Record<string, number>;
  applied: Array<{ serialId: string; syncStatus: Product["syncStatus"]; action: string }>;
  skipped: Array<{ serialId: string; reason: string }>;
};

export type RouteDiagnosticsResponse = {
  routes: Array<{
    fromRole: string;
    toRole: string;
    allowedOnChain: boolean;
    allowedByApiPolicy: boolean;
    mustBeBlocked: boolean;
  }>;
  invalidOpenRoutes: Array<{
    fromRole: string;
    toRole: string;
    allowedOnChain: boolean;
    allowedByApiPolicy: boolean;
    mustBeBlocked: boolean;
  }>;
  healthy: boolean;
};

export type ArchiveProductsResponse = {
  mode: "ARCHIVE" | "INVALIDATE";
  total: number;
  archived: Array<{ serialId: string; serialHash: string; status: Product["status"] }>;
  archivedBatches?: Array<{ batchId: string; serialsAffected: number; status: Product["status"] }>;
  failed: Array<{ serialId?: string; batchId?: string; code: string; message: string }>;
};

export type ArchivedDataResponse = {
  total: number;
  products: Array<{
    id: string;
    serialId?: string;
    serialHash?: string;
    mode?: "ARCHIVE" | "INVALIDATE";
    reason?: string;
    actor?: string;
    createdAt?: number;
    product?: Product | null;
  }>;
  batches: Array<{
    id: string;
    batchId?: string;
    mode?: "ARCHIVE" | "INVALIDATE";
    reason?: string;
    actor?: string;
    serialsAffected?: number;
    createdAt?: number;
    batch?: Batch | null;
  }>;
};

export type DisputeRecord = {
  id?: string;
  targetType?: "SERIAL" | "BATCH";
  targetId?: string;
  relatedSerialId: string;
  relatedBatchId?: string;
  reason: string;
  reportedBy?: string;
  reportedByAddress?: string;
  createdByAddress?: string;
  createdByRole?: string;
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
    roles?: string[];
  };
};

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const apiBaseUrl = api.defaults.baseURL || "backend";

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
  me: "/auth/me",
  myProfile: "/auth/me/profile",
  authSession: "/auth/session",
  roleRequests: "/auth/role-requests",
  walletRoles: (address: string) => `/auth/roles/${encodeURIComponent(address)}`,

  overview: "/dashboard/overview",
  recentActivity: "/dashboard/recent-activity",

  getBatches: "/batches",
  getBatch: (batchId: string) => `/batches/${batchId}`,
  getBatchSerials: (batchId: string) => `/batches/${batchId}/serials`,
  createBatch: "/batches",
  registerProduct: "/products/register",
  transferableProducts: "/products/transferable",
  syncWalletProductRegistration: "/products/sync-wallet-register",
  bulkRegisterProducts: "/products/bulk",
  getProducts: "/products",
  getProductDetail: (serialId: string) => `/products/${encodeURIComponent(serialId)}/detail`,
  updateProduct: (serialId: string) => `/products/${encodeURIComponent(serialId)}`,
  administerProduct: (serialId: string) => `/products/${encodeURIComponent(serialId)}/administer`,

  getTransfers: "/transfers",
  getTransfer: (transferId: string) => `/transfers/${transferId}`,
  scanTransfer: "/transfers/scan",
  batchShellTransfer: "/transfers/batch-shell",
  confirmBatchShellTransfer: (transferId: string) => `/transfers/${encodeURIComponent(transferId)}/confirm-batch-shell`,
  rejectBatchShellTransfer: (transferId: string) => `/transfers/${encodeURIComponent(transferId)}/reject-batch-shell`,
  confirmTransfer: "/transfers/confirm",
  rejectTransfer: "/transfers/reject",
  clearStaleTransfer: (transferId: string) => `/transfers/${encodeURIComponent(transferId)}/clear-stale`,
  bulkScanTransfer: "/transfers/bulk-scan",
  syncWalletTransferCreate: "/transfers/sync-wallet-create",
  syncWalletTransferConfirm: "/transfers/sync-wallet-confirm",
  syncWalletTransferReject: "/transfers/sync-wallet-reject",

  verify: (serialId: string) => `/verify/${encodeURIComponent(serialId)}`,
  consumerVerify: (serialId: string) => `/verify/${encodeURIComponent(serialId)}`,

  riskFlags: "/risk-flags",
  getRiskFlag: (id: string) => `/risk-flags/${id}`,
  resolveRiskFlag: (id: string) => `/risk-flags/${id}/resolve`,
  disputes: "/disputes",
  getDispute: (id: string) => `/disputes/${id}`,
  updateDisputeStatus: (id: string) => `/disputes/${id}/status`,
  addDisputeEvidence: (id: string) => `/disputes/${id}/evidence`,

  recalls: "/recalls",
  syncWalletRecall: "/recalls/sync-wallet",
  reconcilePreview: "/admin/reconcile/preview",
  reconcileApply: "/admin/reconcile/apply",
  routeDiagnostics: "/admin/route-diagnostics",
  routeDiagnosticsApply: "/admin/route-diagnostics/apply",
  archiveProducts: "/admin/products/archive",
  archivedData: "/admin/archived",
};

export function getApiErrorMessage(err: unknown, fallback = "Request failed.") {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      return `Backend phản hồi quá thời gian. Hãy kiểm tra backend và RPC: ${apiBaseUrl}.`;
    }
    if (!err.response) {
      return `Không kết nối được backend. Hãy kiểm tra cấu hình NEXT_PUBLIC_API_URL: ${apiBaseUrl}.`;
    }
  } else if (err instanceof Error && err.message) {
    return err.message;
  }

  const error = err as ApiErrorLike;
  if (error?.code === "ECONNABORTED") {
    return `Backend phản hồi quá thời gian. Render có thể đang cold start, hãy thử lại sau vài giây. API hiện tại: ${apiBaseUrl}.`;
  }
  if (!error?.response) {
    return error?.message || `Không kết nối được backend. Hãy kiểm tra NEXT_PUBLIC_API_URL hoặc trạng thái Render: ${apiBaseUrl}.`;
  }
  const code = error.response.data?.error?.code;
  const message = error.response.data?.error?.message || error.message;
  const details = error.response.data?.error?.details;
  const messages: Record<string, string> = {
    FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
    ROLE_MISMATCH: message || "Vai trò hiện tại không khớp với thao tác này.",
    WALLET_SESSION_MISMATCH: "Ví MetaMask đang chọn không khớp với phiên đăng nhập. Vui lòng đăng nhập lại bằng ví này.",
    ROLE_ALREADY_ASSIGNED: "Ví này đã có quyền hoạt động và không thể gửi yêu cầu dành cho người dùng mới.",
    SELF_APPROVAL_NOT_ALLOWED: "Ví quản trị không thể tự duyệt yêu cầu cấp quyền cho chính mình.",
    ROLE_REQUEST_TARGET_CHANGED: "Trạng thái quyền của ví yêu cầu đã thay đổi. Hãy làm mới danh sách trước khi duyệt.",
    MISSING_TOKEN: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
    INVALID_TOKEN: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    INVALID_ADDRESS: "Địa chỉ ví không hợp lệ.",
    INVALID_SERIAL_ID: "Serial chỉ được dùng chữ, số, dấu gạch ngang hoặc gạch dưới.",
    INVALID_BATCH_ID: "Mã lô chỉ được dùng chữ, số, dấu gạch ngang hoặc gạch dưới.",
    ON_CHAIN_PENDING_TRANSFER_NOT_FOUND:
      "Lệnh này còn pending trong Firebase nhưng không còn pending trên smart contract hiện tại. Admin cần dọn lệnh stale hoặc tạo lại lệnh chuyển bằng serial sản phẩm.",
  };

  if (code === "VALIDATION_ERROR" && Array.isArray(details) && details.length > 0) {
    return details
      .map((detail) => `${detail.path || "field"}: ${detail.message || "không hợp lệ"}`)
      .join("; ");
  }

  return (code && messages[code]) || message || fallback;
}

export async function getHealth() {
  const res = await api.get<{ status: string; timestamp: string; environment: string }>(endpoints.health);
  return res.data;
}

export async function login(payload: { address: string; role: string }) {
  const res = await api.post<ApiResponse<LoginResponse>>(endpoints.login, payload);
  return requireApiData(res.data.data, "Login response did not include data.");
}

export async function getDemoActors() {
  const res = await api.get<ApiResponse<Array<{ role: string; label: string; address: string; source?: string }>>>(
    endpoints.demoActors
  );
  return res.data.data || [];
}

export async function requestAuthNonce(address: string) {
  const res = await api.post<ApiResponse<{ message: string; expiresAt: number }>>(endpoints.authNonce, {
    address,
  });
  return requireApiData(res.data.data, "Nonce response did not include data.");
}

export async function loginWithSignature(payload: { address: string; signature: string }) {
  const res = await api.post<ApiResponse<LoginResponse>>(endpoints.loginWithSignature, payload);
  return requireApiData(res.data.data, "Login response did not include data.");
}

export async function refreshAuthSession() {
  const res = await api.get<ApiResponse<LoginResponse>>(endpoints.authSession);
  return requireApiData(res.data.data, "Session refresh response did not include data.");
}

export async function getWalletRoles(address: string) {
  const res = await api.get<ApiResponse<WalletRoleInfo>>(endpoints.walletRoles(address));
  return requireApiData(res.data.data, "Wallet roles response did not include data.");
}

export async function getMyProfile() {
  const res = await api.get<ApiResponse<ProfileResponse>>(endpoints.me);
  return requireApiData(res.data.data, "Profile response did not include data.");
}

export async function updateMyProfile(payload: {
  organizationId?: string;
  fullName?: string;
  title?: string;
  email?: string;
  phone?: string;
  organizationName?: string;
  organizationType?: string;
  organizationCode?: string;
  organizationAddress?: string;
  licenseNumber?: string;
  facilityType?: string;
  storageCapacity?: string;
  coldChainCapability?: string;
}) {
  const res = await api.put<ApiResponse<ProfileResponse>>(endpoints.myProfile, payload);
  return requireApiData(res.data.data, "Profile update response did not include data.");
}

export async function createRoleRequest(payload: { requestedRole: string; note?: string; walletAddress: string }) {
  const res = await api.post<ApiResponse<RoleRequest>>(endpoints.roleRequests, payload);
  return requireApiData(res.data.data, "Role request response did not include data.");
}

export async function getRoleRequests() {
  const res = await api.get<ApiResponse<RoleRequest[]>>(endpoints.roleRequests);
  return res.data.data || [];
}

export async function approveRoleRequest(id: string) {
  const res = await api.post<ApiResponse<RoleRequest>>(`${endpoints.roleRequests}/${encodeURIComponent(id)}/approve`);
  return requireApiData(res.data.data, "Role request approve response did not include data.");
}

export async function rejectRoleRequest(id: string, reason?: string) {
  const res = await api.post<ApiResponse<RoleRequest>>(`${endpoints.roleRequests}/${encodeURIComponent(id)}/reject`, { reason });
  return requireApiData(res.data.data, "Role request reject response did not include data.");
}

export async function getDashboardOverview(scope: "mine" | "all" = "mine") {
  const res = await api.get<ApiResponse<DashboardStats>>(endpoints.overview, { params: { scope } });
  return requireApiData(res.data.data, "Dashboard response did not include data.");
}

export async function getDashboardRecentActivity(limit = 10, scope: "mine" | "all" = "mine") {
  const res = await api.get<ApiResponse<DashboardActivity[]>>(endpoints.recentActivity, {
    params: { limit, scope },
  });
  return res.data.data || [];
}

// ============= Batches =============

export async function getBatches(params?: { scope?: "mine" | "all" }) {
  const res = await api.get<ApiResponse<Batch[]>>(endpoints.getBatches, { params });
  return res.data.data || [];
}

export async function getBatch(batchId: string, params?: { scope?: "mine" | "all" }) {
  const res = await api.get<ApiResponse<Batch>>(endpoints.getBatch(batchId), { params });
  return requireApiData(res.data.data, "Batch response did not include data.");
}

export async function getBatchSerials(batchId: string, params?: { scope?: "mine" | "all" }) {
  const res = await api.get<ApiResponse<Product[]>>(endpoints.getBatchSerials(batchId), { params });
  return res.data.data || [];
}

// ============= Products =============

export async function getProducts(params?: {
  search?: string;
  status?: string;
  manufacturer?: string;
  owner?: string;
  batch?: string;
  scope?: "mine" | "all";
  origin?: "MANUFACTURED" | "IMPORTED";
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
  importDocument?: {
    docId: string;
    importerLicense: string;
    manufacturerId: string;
    batchNo: string;
    documentExpiryDate: string;
    salt: string;
    regulatorCertificateId: string;
  };
}) {
  const res = await api.post<ApiResponse<RegisterProductResponse>>(endpoints.registerProduct, payload);
  return requireApiData(res.data.data, "Register product response did not include data.");
}

export async function syncWalletProductRegistration(payload: {
  txHash: string;
  serialId: string;
  batchId: string;
  productName: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  quantity?: number;
  importDocHash?: string;
  zkpProof?: string;
}) {
  const res = await api.post<ApiResponse<RegisterProductResponse>>(endpoints.syncWalletProductRegistration, payload);
  return requireApiData(res.data.data, "Wallet registration sync response did not include data.");
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
  importDocument?: {
    docId: string;
    importerLicense: string;
    manufacturerId: string;
    batchNo: string;
    documentExpiryDate: string;
    salt: string;
    regulatorCertificateId: string;
  };
}>) {
  const res = await api.post<ApiResponse<BulkRegisterResponse>>(endpoints.bulkRegisterProducts, { products });
  return requireApiData(res.data.data, "Bulk register response did not include data.");
}

export async function approveImportDocuments(payload: {
  approvedBy?: string;
  documents: Array<{
    docId: string;
    importerLicense: string;
    manufacturerId: string;
    batchNo: string;
    documentExpiryDate: string;
    salt: string;
    regulatorCertificateId: string;
  }>;
}) {
  const res = await api.post<ApiResponse<{
    approvedImportRoot: string;
    totalDocuments: number;
    commitments: string[];
    ipfsCid?: string;
    txHash?: string | null;
  }>>("/import-zkp/approvals", payload);
  return requireApiData(res.data.data, "Import approval response did not include data.");
}

export async function getImportApprovals() {
  const res = await api.get<ApiResponse<{
    approvedImportRoot: string;
    onChainRoot?: string | null;
    totalDocuments: number;
    documents: Array<{
      commitment: string;
      regulatorCertificateId: string;
      approvedBy?: string;
      approvedAt?: number;
    }>;
  }>>("/import-zkp/approvals");
  return requireApiData(res.data.data, "Import approvals response did not include data.");
}

// ============= Transfers =============

export async function getTransfers(params?: { scope?: "mine" | "all" }) {
  const res = await api.get<ApiResponse<TransferRecord[]>>(endpoints.getTransfers, { params });
  return res.data.data || [];
}

export async function administerProduct(serialId: string, payload?: { reason?: string }) {
  const res = await api.post<ApiResponse<{ product: Product; auditId: string }>>(endpoints.administerProduct(serialId), payload || {});
  return requireApiData(res.data.data, "Administer product response did not include data.");
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
  fromLocation?: string;
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
  temperatureUnit?: "C" | "F";
  handlingNotes?: string;
}) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.scanTransfer, payload);
  return requireApiData(res.data.data, "Scan transfer response did not include data.");
}

export async function createBatchShellTransfer(payload: {
  batchId: string;
  fromRole: string;
  toRole: string;
  receiverAddress?: string;
}) {
  const res = await api.post<ApiResponse<BatchShellTransferResponse>>(endpoints.batchShellTransfer, payload);
  return requireApiData(res.data.data, "Batch shell transfer response did not include data.");
}

export async function confirmBatchShellTransfer(transferId: string) {
  const res = await api.post<ApiResponse<TransferRecord>>(endpoints.confirmBatchShellTransfer(transferId));
  return requireApiData(res.data.data, "Confirm batch shell transfer response did not include data.");
}

export async function rejectBatchShellTransfer(transferId: string, rejectionReason: string) {
  const res = await api.post<ApiResponse<TransferRecord>>(endpoints.rejectBatchShellTransfer(transferId), { rejectionReason });
  return requireApiData(res.data.data, "Reject batch shell transfer response did not include data.");
}

export async function bulkScanTransfer(payload: {
  serialIds: string[];
  fromRole: string;
  toRole: string;
  receiverAddress?: string;
  batchId?: string;
  fromLocation?: string;
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
  temperatureUnit?: "C" | "F";
  handlingNotes?: string;
}) {
  const res = await api.post<ApiResponse<{
    batchTransferGroupId: string;
    total: number;
    successful: Array<{ serialId: string; transfer?: TransferRecord; serialHash?: string; jobId?: string }>;
    failed: Array<{ serialId: string; code: string; message: string }>;
  }>>(endpoints.bulkScanTransfer, payload);
  return requireApiData(res.data.data, "Bulk scan transfer response did not include data.");
}

export async function confirmTransfer(serialId: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.confirmTransfer, { serialId });
  return requireApiData(res.data.data, "Confirm transfer response did not include data.");
}

export async function rejectTransfer(serialId: string, rejectionReason: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.rejectTransfer, { serialId, rejectionReason });
  return requireApiData(res.data.data, "Reject transfer response did not include data.");
}

export async function clearStaleTransfer(transferId: string) {
  const res = await api.post<ApiResponse<{ transferId: string; serialId: string; restoredOwner: string; restoredRole: string }>>(
    endpoints.clearStaleTransfer(transferId)
  );
  return requireApiData(res.data.data, "Clear stale transfer response did not include data.");
}

export async function syncWalletTransferCreate(payload: {
  txHash: string;
  serialId: string;
  fromRole: string;
  toRole: string;
  receiverAddress: string;
  batchId?: string;
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
  temperatureUnit?: "C" | "F";
  handlingNotes?: string;
}) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.syncWalletTransferCreate, payload);
  return requireApiData(res.data.data, "Wallet transfer sync response did not include data.");
}

export async function syncWalletTransferConfirm(serialId: string, txHash: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.syncWalletTransferConfirm, { serialId, txHash });
  return requireApiData(res.data.data, "Wallet confirm sync response did not include data.");
}

export async function syncWalletTransferReject(serialId: string, rejectionReason: string, txHash: string) {
  const res = await api.post<ApiResponse<TransferActionResponse>>(endpoints.syncWalletTransferReject, {
    serialId,
    rejectionReason,
    txHash,
  });
  return requireApiData(res.data.data, "Wallet reject sync response did not include data.");
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

export async function getTransferableProducts(role?: string) {
  const res = await api.get<
    ApiResponse<{
      items: Product[];
      total: number;
      ownerAddress: string;
      ownerRole: string;
      canTransfer: boolean;
      allowedToRoles: string[];
    }>
  >(endpoints.transferableProducts, {
    params: role ? { role } : undefined,
  });

  return requireApiData(res.data.data, "Transferable product response did not include data.");
}

export async function syncWalletRecall(payload: { batchHash: string; reason: string; serials: string[]; txHash: string }) {
  const res = await api.post<ApiResponse<RecallRecord>>(endpoints.syncWalletRecall, payload);
  return requireApiData(res.data.data, "Wallet recall sync response did not include data.");
}

export async function previewReconcile() {
  const res = await api.get<ApiResponse<ReconcilePreviewResponse>>(endpoints.reconcilePreview);
  return requireApiData(res.data.data, "Reconcile preview response did not include data.");
}

export async function applyReconcile() {
  const res = await api.post<ApiResponse<ReconcileApplyResponse>>(endpoints.reconcileApply);
  return requireApiData(res.data.data, "Reconcile apply response did not include data.");
}

export async function getRouteDiagnostics() {
  const res = await api.get<ApiResponse<RouteDiagnosticsResponse>>(endpoints.routeDiagnostics);
  return requireApiData(res.data.data, "Route diagnostics response did not include data.");
}

export async function applyRouteDiagnostics() {
  const res = await api.post<ApiResponse<{
    route: { fromRole: string; toRole: string };
    changed: boolean;
    allowedBefore: boolean;
    allowedAfter: boolean;
    txHash?: string | null;
  }>>(endpoints.routeDiagnosticsApply);
  return requireApiData(res.data.data, "Route diagnostics apply response did not include data.");
}

export async function archiveProducts(payload: { serialIds?: string[]; batchIds?: string[]; reason?: string; mode?: "ARCHIVE" | "INVALIDATE" }) {
  const res = await api.post<ApiResponse<ArchiveProductsResponse>>(endpoints.archiveProducts, payload);
  return requireApiData(res.data.data, "Archive products response did not include data.");
}

export async function getArchivedData() {
  const res = await api.get<ApiResponse<ArchivedDataResponse>>(endpoints.archivedData);
  return requireApiData(res.data.data, "Archived data response did not include data.");
}

export async function getDisputes() {
  const res = await api.get<ApiResponse<DisputeRecord[]>>(endpoints.disputes);
  return res.data.data || [];
}

export async function getDispute(id: string) {
  const res = await api.get<ApiResponse<DisputeRecord>>(endpoints.getDispute(id));
  return requireApiData(res.data.data, "Dispute response did not include data.");
}

export async function createDispute(payload: { relatedSerialId?: string; targetId?: string; targetType?: "SERIAL" | "BATCH"; reason: string; reportedBy?: string }) {
  const res = await api.post<ApiResponse<DisputeRecord>>(endpoints.disputes, payload);
  return requireApiData(res.data.data, "Create dispute response did not include data.");
}

export async function updateDisputeStatus(
  id: string,
  payload: { status: "OPEN" | "INVESTIGATING" | "NEEDS_EXPLANATION" | "RESOLVED" | "REJECTED" | "RECALL_CREATED"; note?: string; updatedBy?: string }
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

export async function reregisterProduct(serialId: string) {
  const res = await api.post<ApiResponse<{ txHash: string; serialHash: string; serialId: string }>>(
    `/products/${encodeURIComponent(serialId)}/reregister`
  );
  return requireApiData(res.data.data, "Re-register response did not include data.");
}
