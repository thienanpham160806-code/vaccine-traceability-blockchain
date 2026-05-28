import { ProductTable } from "@/components/product/ProductTable";
import Link from "next/link";

export default function ProductListPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Danh sách sản phẩm</h1>
          <p className="text-muted-foreground">
            Theo dõi serial vaccine, chủ sở hữu, trạng thái blockchain và mức rủi ro.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/products/bulk"
            className="rounded-md border px-4 py-2 text-sm font-semibold"
          >
            Đăng ký hàng loạt
          </Link>
          <Link
            href="/dashboard/products/register"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Đăng ký sản phẩm
          </Link>
        </div>
      </div>

      <ProductTable />
    </div>
  );
}
