import axios from "axios";
import type { ApiResponse, DashboardStats, Product, VerifyResult } from "./types";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const endpoints = {
  health: "/health",
  login: "/auth/login",

  overview: "/dashboard/overview",

  createBatch: "/batches",
  registerProduct: "/products/register",
  getProducts: "/products",

  scanTransfer: "/transfers/scan",
  confirmTransfer: "/transfers/confirm",

  verify: (serialId: string) => `/verify/${serialId}`,
  consumerVerify: (serialId: string) => `/consumer/verify/${serialId}`,

  riskFlags: "/risk-flags",
  disputes: "/disputes",

  recalls: "/recalls",
};

export function getApiErrorMessage(err: any, fallback = "Request failed.") {
  if (err?.code === "ECONNABORTED") return "Backend request timed out. Check backend and Hardhat are running.";
  if (!err?.response) return "Cannot reach backend. Start backend on http://localhost:5000 and refresh.";
  return err?.response?.data?.error?.message || fallback;
}

export async function getHealth() {
  const res = await api.get<{ status: string; timestamp: string; environment: string }>(endpoints.health);
  return res.data;
}

export async function login(payload: { address: string; role: string }) {
  const res = await api.post<ApiResponse<any>>(endpoints.login, payload);
  return res.data.data;
}

export async function getDashboardOverview() {
  const res = await api.get<ApiResponse<DashboardStats>>(endpoints.overview);
  return res.data.data;
}

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

export async function scanTransfer(payload: {
  serialId: string;
  fromRole: string;
  toRole: string;
  receiverAddress?: string;
}) {
  const res = await api.post<ApiResponse<any>>(endpoints.scanTransfer, payload);
  return res.data.data;
}

export async function confirmTransfer(serialId: string) {
  const res = await api.post<ApiResponse<any>>(endpoints.confirmTransfer, { serialId });
  return res.data.data;
}

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

export async function verifyProduct(serialId: string) {
  const res = await api.get<ApiResponse<VerifyResult>>(endpoints.verify(serialId));
  return res.data.data;
}
