import { ProductForm } from "@/components/product/ProductForm";

export default function BatchManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Batch Management</h1>
        <p className="text-muted-foreground">
          Create vaccine batch, register serials, upload documents, and generate QR code.
        </p>
      </div>

      <ProductForm />
    </div>
  );
}