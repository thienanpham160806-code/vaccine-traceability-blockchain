"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Search, Wallet } from "lucide-react";
import { clearSession, getStoredUser, type DemoUser } from "@/lib/auth";

export function Topbar() {
  const router = useRouter();
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const logout = () => {
    clearSession();
    setUser(null);
    router.push("/login");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <p className="text-sm text-muted-foreground">B2B Dashboard</p>
        <h2 className="font-semibold">Vaccine Traceability System</h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-xl border px-3 py-2 text-sm text-muted-foreground md:flex">
          <Search className="h-4 w-4" />
          Search serial, batch, owner
        </div>

        <button className="rounded-xl border p-2">
          <Bell className="h-4 w-4" />
        </button>

        <button className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/login")}>
          <Wallet className="h-4 w-4" />
          {user ? `${user.role}: ${user.address.slice(0, 6)}...${user.address.slice(-4)}` : "Login"}
        </button>

        {user ? (
          <button className="rounded-xl border p-2" onClick={logout} title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
