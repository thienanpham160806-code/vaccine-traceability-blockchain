import type { DashboardStats, Product, VerifyResult } from "./types";

export const mockDashboardStats: DashboardStats = {
  totalBatches: 12,
  totalSerials: 1250,
  pendingTransfers: 8,
  riskAlerts: 3,
};

export const mockProducts: Product[] = [
  {
    serialId: "VCN-2026-000001",
    batchId: "BATCH-VCN-2026-001",
    productName: "Hexaxim Vaccine",
    productType: "IMPORT",
    manufacturerName: "Sanofi",
    currentOwner: "Clinic A - District 1",
    status: "VERIFIED",
    riskLevel: "SAFE",
    expiryDate: "2027-12-31",
    blockchainTx: "0x9a12...c88f",
    zkProofVerified: true,
  },
  {
    serialId: "VCN-2026-000002",
    batchId: "BATCH-VCN-2026-001",
    productName: "Hexaxim Vaccine",
    productType: "IMPORT",
    manufacturerName: "Sanofi",
    currentOwner: "Distributor HCM",
    status: "PENDING_DELIVERY",
    riskLevel: "ALERT",
    expiryDate: "2027-12-31",
    blockchainTx: "0x5b31...a09d",
    zkProofVerified: true,
  },
  {
    serialId: "VCN-2026-000003",
    batchId: "BATCH-VCN-2026-002",
    productName: "Local Vaccine A",
    productType: "LOCAL",
    manufacturerName: "VN Pharma",
    currentOwner: "Warehouse B",
    status: "RECALLED",
    riskLevel: "HIGH",
    expiryDate: "2026-10-15",
    blockchainTx: "0x77f1...b21a",
    zkProofVerified: false,
  },
];

export const mockVerifyResult: VerifyResult = {
  product: mockProducts[0],
  origin: "Sanofi - Importer verified via ZKP",
  recallStatus: false,
  zkProofVerified: true,
  timeline: [
    {
      id: "1",
      from: "Sanofi",
      to: "Importer VN",
      location: "HCM Port",
      status: "REGISTERED",
      timestamp: "2026-05-01 09:30",
      txHash: "0x111...aaa",
    },
    {
      id: "2",
      from: "Importer VN",
      to: "Distributor HCM",
      location: "HCM Warehouse",
      status: "DELIVERED",
      timestamp: "2026-05-03 14:20",
      txHash: "0x222...bbb",
    },
    {
      id: "3",
      from: "Distributor HCM",
      to: "Clinic A - District 1",
      location: "District 1",
      status: "DELIVERED",
      timestamp: "2026-05-06 10:10",
      txHash: "0x333...ccc",
    },
  ],
};