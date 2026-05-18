"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { demoActors, loginDemo } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(demoActors[0].role);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedActor = demoActors.find((actor) => actor.role === selectedRole) || demoActors[0];

  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const user = await loginDemo(selectedActor);
      console.info("Logged in demo user", user);
      router.push("/dashboard");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Login failed."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login to B2B Dashboard</CardTitle>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Demo Role</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
            >
              {demoActors.map((actor) => (
                <option key={actor.role} value={actor.role}>
                  {actor.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-1 text-muted-foreground">Selected local demo actor</p>
            <p className="font-semibold">{selectedActor.role}</p>
            <p className="break-all font-mono text-muted-foreground">{selectedActor.address}</p>
          </div>

          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

          <button
            className="h-10 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Logging in..." : "Login with Demo Wallet"}
          </button>
          <p className="text-xs text-muted-foreground">
            On success, the selected role is stored in localStorage and shown in the dashboard top bar.
          </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
