import { ProductForm } from "@/components/product/ProductForm";

export default function RegisterProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Register Product</h1>
        <p className="text-muted-foreground">
          Create a vaccine product, write the registration on-chain, save metadata, and generate a consumer QR.
        </p>
      </div>

      <ProductForm />
    </div>
  );
}
