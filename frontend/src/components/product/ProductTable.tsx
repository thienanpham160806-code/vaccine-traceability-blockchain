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
      .catch((err) => setError(err?.response?.data?.error?.message || "Không tải được danh sách sản phẩm."))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => statusFilter === "ALL" || p.status === statusFilter);
  }, [products, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select className="border rounded-md p-2 text-sm bg-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">Tất cả trạng thái</option>
          <option value="VERIFIED">Đã xác thực</option>
          <option value="IN_TRANSIT">Đang vận chuyển</option>
          <option value="PENDING_DELIVERY">Đang vận chuyển (cũ)</option>
          <option value="DELIVERED">Đã giao</option>
          <option value="FLAGGED">Bị cảnh báo</option>
          <option value="RECALLED">Đã thu hồi</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {isLoading ? <p className="p-4 text-sm text-gray-500">Đang tải sản phẩm...</p> : null}
        {error ? <p className="p-4 text-sm font-semibold text-red-600">{error}</p> : null}
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b font-bold">
            <tr>
              <th className="p-4">Serial ID</th>
              <th className="p-4">Batch ID</th>
              <th className="p-4">Sản phẩm</th>
              <th className="p-4">Trạng thái</th>
              <th className="p-4">Thao tác</th>
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
                    Chi tiết
                  </Link>
                  <Link href={`/dashboard/scan-transfer?serialId=${encodeURIComponent(p.serialId)}`} className="text-emerald-600 hover:underline font-medium">
                    Chuyển
                  </Link>
                  <Link href={`/consumer/verify/${p.serialId}`} className="text-zinc-600 hover:underline font-medium">
                    Công khai
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
