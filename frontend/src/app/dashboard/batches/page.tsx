import { redirect } from "next/navigation";

export default function LegacyBatchesPage() {
  redirect("/dashboard/products/batches");
}
