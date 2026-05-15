import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockDashboardStats, mockProducts } from "@/lib/mock-data";

export default function DashboardPage() {
  const stats = mockDashboardStats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">B2B Overview</h1>

        <p className="text-muted-foreground">
          Monitor batches, serials, transfers, and risk alerts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Batches</CardTitle>
          </CardHeader>

          <CardContent className="text-3xl font-bold">
            {stats.totalBatches}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Serials</CardTitle>
          </CardHeader>

          <CardContent className="text-3xl font-bold">
            {stats.totalSerials}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Pending Transfers
            </CardTitle>
          </CardHeader>

          <CardContent className="text-3xl font-bold">
            {stats.pendingTransfers}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Risk Alerts</CardTitle>
          </CardHeader>

          <CardContent className="text-3xl font-bold">
            {stats.riskAlerts}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Products</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {mockProducts.map((product) => (
            <div
              key={product.serialId}
              className="flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">
                  {product.productName}
                </p>

                <p className="text-sm text-muted-foreground">
                  {product.serialId} - {product.batchId}
                </p>
              </div>

              <p className="text-sm">{product.status}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}