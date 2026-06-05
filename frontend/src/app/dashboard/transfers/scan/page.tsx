import { redirect } from "next/navigation";

export default function LegacyTransferScanPage() {
  redirect("/dashboard/transfers/create");
}
