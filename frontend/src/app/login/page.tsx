import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login to B2B Dashboard</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input placeholder="admin@vaccine-trace.vn" />
          </div>

          <div>
            <Label>Password</Label>
            <Input type="password" placeholder="••••••••" />
          </div>

          <Button className="w-full" asChild>
            <Link href="/dashboard">Login with Email</Link>
          </Button>

          <Button className="w-full" variant="outline" asChild>
            <Link href="/dashboard">Login with Wallet</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}