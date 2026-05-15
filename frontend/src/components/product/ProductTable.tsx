"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductStatusBadge, RiskLevelBadge } from "./ProductStatusBadge";

const mockData = [
  { serialId: "VCN-2026-000001", batchId: "BATCH-VCN-2026-001", productName: "Hexaxim Vaccine", status: "VERIFIED", riskLevel: "SAFE" },
  { serialId: "VCN-2026-000002", batchId: "BATCH-VCN-2026-001", productName: "Hexaxim Vaccine", status: "PENDING_DELIVERY", riskLevel: "SAFE" },
  { serialId: "VCN-2026-000003", batchId: "BATCH-VCN-2026-002", productName: "Local Vaccine A", status: "RECALLED", riskLevel: "HIGH" },
];

export function ProductTable() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const filteredProducts = useMemo(() => {
    return mockData.filter((p) => statusFilter === "ALL" || p.status === statusFilter);
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select className="border rounded-md p-2 text-sm bg-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="PENDING_DELIVERY">PENDING_DELIVERY</option>
          <option value="RECALLED">RECALLED</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b font-bold">
            <tr>
              <th className="p-4">Serial ID</th>
              <th className="p-4">Batch ID</th>
              <th className="p-4">Product</th>
              <th className="p-4">Status</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.serialId} className="border-b hover:bg-gray-50 transition">
                <td className="p-4 font-mono font-bold text-gray-900">{p.serialId}</td>
                <td className="p-4 text-gray-500">{p.batchId}</td>
                <td className="p-4">{p.productName}</td>
                <td className="p-4"><ProductStatusBadge status={p.status as any} /></td>
                <td className="p-4">
                  <Link href={`/dashboard/verify/${p.serialId}`} className="text-blue-600 hover:underline font-medium">
                    View Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}