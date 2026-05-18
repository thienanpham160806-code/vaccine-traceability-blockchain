"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  QrCode,
  ShieldAlert,
  Truck,
  RotateCcw,
} from "lucide-react";

const menuItems = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Batch Management",
    href: "/dashboard/batches",
    icon: Boxes,
  },
  {
    title: "Product List",
    href: "/dashboard/products",
    icon: ClipboardCheck,
  },
  {
    title: "Scan / Transfer",
    href: "/dashboard/scan-transfer",
    icon: Truck,
  },
  {
    title: "Risk & Dispute",
    href: "/dashboard/risk-dispute",
    icon: ShieldAlert,
  },
  {
    title: "Recall",
    href: "/dashboard/recall",
    icon: RotateCcw,
  },
];

export function Sidebar() {
  const router = useRouter();
  const [serialId, setSerialId] = useState("");

  const goVerify = () => {
    if (serialId.trim()) {
      router.push(`/dashboard/verify/${encodeURIComponent(serialId.trim())}`);
    }
  };

  return (
    <aside className="hidden min-h-screen w-72 border-r bg-zinc-950 px-4 py-6 text-white lg:block">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20">
          <Activity className="h-5 w-5 text-emerald-400" />
        </div>

        <div>
          <p className="text-sm text-zinc-400">Blockchain</p>
          <h1 className="text-lg font-semibold">Vaccine Trace</h1>
        </div>
      </div>

      <nav className="space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 rounded-xl border border-zinc-800 p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Verify Serial</p>
        <input
          className="mb-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-white"
          value={serialId}
          onChange={(e) => setSerialId(e.target.value)}
          placeholder="VCN-DEMO-001"
        />
        <button className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white" onClick={goVerify}>
          Open Verify
        </button>
      </div>
    </aside>
  );
}
