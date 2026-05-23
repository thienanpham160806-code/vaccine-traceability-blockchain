"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardOverview, getHealth, getProducts } from "@/lib/api";
import { getStoredUser, type DemoUser } from "@/lib/auth";
import type { DashboardStats, Product } from "@/lib/types";

const emptyStats: DashboardStats = {
  totalBatches: 0,
  totalSerials: 0,
  pendingTransfers: 0,
  riskAlerts: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<string>("Checking backend...");
  const [user, setUser] = useState<DemoUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    Promise.all([getHealth(), getDashboardOverview(), getProducts()])
      .then(([backendHealth, overview, productList]) => {
        setHealth(`Backend ${backendHealth.status} - ${backendHealth.environment}`);
        setStats(overview || emptyStats);
        setProducts(productList.slice(0, 5));
      })
      .catch((err) => {
        setHealth("Backend unavailable");
        setError(err?.response?.data?.error?.message || "Failed to load dashboard.");
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">B2B Overview</h1>
        <p className="text-muted-foreground">Monitor batches, serials, transfers, and risk alerts.</p>
      </div>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
          <p className="font-semibold">System Status</p>
          <p className="text-muted-foreground">{health}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
          <p className="font-semibold">Current Demo User</p>
          {user ? (
            <p className="break-all text-muted-foreground">{user.role} - {user.address}</p>
          ) : (
            <p className="text-muted-foreground">Not logged in. Use the Login button to select a role.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/dashboard/batches">
          Register Product
        </Link>
        <Link className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" href="/dashboard/products">
          View Products
        </Link>
        <Link className="rounded-md border px-4 py-2 text-sm font-semibold" href="/dashboard/scan-transfer">
          Transfer
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Batches</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats.totalBatches}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Serials</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats.totalSerials}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Pending Transfers</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats.pendingTransfers}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Risk Alerts</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats.riskAlerts}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Products</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {products.map((product) => (
            <div key={product.serialId} className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-medium">{product.productName}</p>
                <p className="text-sm text-muted-foreground">{product.serialId} - {product.batchId}</p>
              </div>
              <p className="text-sm">{product.status}</p>
            </div>
          ))}
          {products.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
