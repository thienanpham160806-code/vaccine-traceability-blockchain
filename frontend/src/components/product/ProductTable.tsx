"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductStatusBadge } from "./ProductStatusBadge";

export function ProductTable() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch((err) => setError(err?.response?.data?.error?.message || "Failed to load products."))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => statusFilter === "ALL" || p.status === statusFilter);
  }, [products, statusFilter]);

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
        {isLoading ? <p className="p-4 text-sm text-gray-500">Loading products...</p> : null}
        {error ? <p className="p-4 text-sm font-semibold text-red-600">{error}</p> : null}
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b font-bold">
            <tr>
              <th className="p-4">Serial ID</th>
              <th className="p-4">Batch ID</th>
              <th className="p-4">Product</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.serialId} className="border-b hover:bg-gray-50 transition">
                <td className="p-4 font-mono font-bold text-gray-900">{p.serialId}</td>
                <td className="p-4 text-gray-500">{p.batchId}</td>
                <td className="p-4">{p.productName}</td>
                <td className="p-4"><ProductStatusBadge status={p.status as any} /></td>
                <td className="flex flex-wrap gap-3 p-4">
                  <Link href={`/dashboard/verify/${p.serialId}`} className="text-blue-600 hover:underline font-medium">
                    Detail
                  </Link>
                  <Link href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(p.serialId)}`} className="text-emerald-600 hover:underline font-medium">
                    Transfer
                  </Link>
                  <Link href={`/consumer/verify/${p.serialId}`} className="text-zinc-600 hover:underline font-medium">
                    Public
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
