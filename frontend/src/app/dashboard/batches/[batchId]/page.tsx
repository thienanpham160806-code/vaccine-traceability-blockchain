import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ batchId: string }>;
}

export default async function LegacyBatchDetailPage({ params }: PageProps) {
  const { batchId } = await params;
  redirect(`/dashboard/products/batches/${encodeURIComponent(batchId)}`);
}
