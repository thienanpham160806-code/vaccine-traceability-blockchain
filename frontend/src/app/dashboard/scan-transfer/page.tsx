import { redirect } from "next/navigation";

export default function LegacyScanTransferPage() {
  redirect("/dashboard/transfers/create");
}
