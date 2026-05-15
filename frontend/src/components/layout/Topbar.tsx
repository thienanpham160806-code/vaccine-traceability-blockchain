import { Bell, Search, Wallet } from "lucide-react";

export function Topbar() {
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

        <button className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <Wallet className="h-4 w-4" />
          0xAdmin...123
        </button>
      </div>
    </header>
  );
}