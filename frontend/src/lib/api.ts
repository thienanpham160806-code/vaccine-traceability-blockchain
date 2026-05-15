import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  headers: {
    "Content-Type": "application/json",
  },
});

export const endpoints = {
  login: "/auth/login",

  overview: "/dashboard/overview",

  createBatch: "/batches",
  registerProduct: "/products/register",
  getProducts: "/products",

  scanTransfer: "/transfers/scan",
  confirmTransfer: "/transfers/confirm",

  verify: (serialId: string) => /verify/${serialId},
  consumerVerify: (serialId: string) => /consumer/verify/${serialId},

  riskFlags: "/risk-flags",
  disputes: "/disputes",

  recalls: "/recalls",
};