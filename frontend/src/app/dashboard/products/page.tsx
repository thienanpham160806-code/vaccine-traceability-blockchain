import { ProductTable } from "@/components/product/ProductTable";

export default function ProductListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Product List</h1>
        <p className="text-muted-foreground">
          View vaccine serials, ownership, blockchain status, and risk level.
        </p>
      </div>

      <ProductTable />
    </div>
  );
}