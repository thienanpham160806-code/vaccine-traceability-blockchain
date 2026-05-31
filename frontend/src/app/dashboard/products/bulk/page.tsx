"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { bulkRegisterProducts, getApiErrorMessage } from "@/lib/api";
import { bulkProductCsvSchema } from "@/lib/validation";

const csvHeaders = [
  "serialId",
  "batchId",
  "productName",
  "manufacturerName",
  "expiryDate",
  "origin",
  "quantity",
  "importDocHash",
  "zkpProof",
];

type BulkProductRow = {
  serialId: string;
  batchId?: string;
  productName: string;
  manufacturerName?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  quantity?: number;
  importDocHash?: string;
  zkpProof?: string;
};

type BulkRegisterResult = {
  total: number;
  successful: number;
  failed: number;
  results?: Array<{
    index: number;
    serialId?: string;
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
};

function makeSampleCsv() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  return [
    csvHeaders.join(","),
    [
      `VCN-BULK-${stamp}-001`,
      `BATCH-BULK-${stamp}`,
      "Bulk Demo Vaccine",
      "Local Manufacturer",
      "2027-12-31",
      "MANUFACTURED",
      "1",
      "",
      "",
    ].join(","),
    [
      `VCN-BULK-${stamp}-002`,
      `BATCH-BULK-${stamp}`,
      "Bulk Demo Vaccine",
      "Local Manufacturer",
      "2027-12-31",
      "MANUFACTURED",
      "1",
      "",
      "",
    ].join(","),
  ].join("\n");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && nextChar === "\"") {
      current += "\"";
      index++;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvProducts(csv: string): BulkProductRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV phải có dòng tiêu đề và ít nhất một dòng sản phẩm.");
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = ["serialId", "productName", "expiryDate"].filter(
    (header) => !headers.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(`CSV thiếu cột bắt buộc: ${missingHeaders.join(", ")}`);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] || "";
      return acc;
    }, {});

    if (!row.serialId || !row.productName || !row.expiryDate) {
      throw new Error(`Dòng ${rowIndex + 2} thiếu serialId, productName hoặc expiryDate.`);
    }

    const product: BulkProductRow = {
      serialId: row.serialId,
      batchId: row.batchId || undefined,
      productName: row.productName,
      manufacturerName: row.manufacturerName || undefined,
      expiryDate: row.expiryDate,
      origin: row.origin === "IMPORTED" ? "IMPORTED" : "MANUFACTURED",
      quantity: row.quantity ? Number(row.quantity) : undefined,
      importDocHash: row.importDocHash || undefined,
      zkpProof: row.zkpProof || undefined,
    };

    const parsed = bulkProductCsvSchema.safeParse(product);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.join(".") || "row";
      throw new Error(`Dòng ${rowIndex + 2} - ${field}: ${issue?.message || "giá trị không hợp lệ"}`);
    }

    return parsed.data;
  });
}

function getUnknownErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : null;
}

export default function BulkRegisterProductsPage() {
  const [csvText, setCsvText] = useState(() => makeSampleCsv());
  const [fileName, setFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkRegisterResult | null>(null);

  const parsedProducts = useMemo(() => {
    try {
      return parseCsvProducts(csvText);
    } catch {
      return [];
    }
  }, [csvText]);

  const resetSample = () => {
    setCsvText(makeSampleCsv());
    setFileName("");
    setResult(null);
    setError(null);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;

    setResult(null);
    setError(null);
    setCsvText(await file.text());
    setFileName(file.name);
    toast.success(`Đã tải file ${file.name}`);
  };

  const submit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const products = parseCsvProducts(csvText);
      const data = await bulkRegisterProducts(products);
      setResult(data);
      toast.success(`Đăng ký hàng loạt hoàn tất: ${data.successful} thành công, ${data.failed} lỗi.`);
    } catch (err: unknown) {
      const message = getUnknownErrorMessage(err) || getApiErrorMessage(err, "Đăng ký hàng loạt thất bại.");
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Đăng ký hàng loạt</h1>
          <p className="text-muted-foreground">
            Tải lên hoặc dán nội dung CSV. Hệ thống sẽ chuyển từng dòng thành dữ liệu đăng ký sản phẩm.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            onClick={resetSample}
            type="button"
          >
            Tạo mẫu mới
          </button>
          <Link href="/dashboard/products" className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50">
            Danh sách sản phẩm
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4 border-b border-zinc-200 pb-4">
            <h2 className="text-xl font-bold">Dữ liệu CSV</h2>
            <p className="text-sm text-muted-foreground">
              Cột bắt buộc: serialId, productName, expiryDate. Cột tùy chọn: batchId, manufacturerName, origin, quantity, importDocHash, zkpProof.
            </p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-[160px_1fr]">
            <label
              className="flex cursor-pointer items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              htmlFor="bulk-csv-file"
            >
              Chọn file
            </label>
            <div className="flex min-h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600">
              {fileName || "Chưa chọn file"}
            </div>
            <input
              accept=".csv,text/csv"
              className="sr-only"
              id="bulk-csv-file"
              onChange={(event) => handleFile(event.target.files?.[0])}
              type="file"
            />
          </div>

          <textarea
            className="min-h-[280px] w-full rounded-md border bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-blue-400"
            spellCheck={false}
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setResult(null);
              setError(null);
            }}
          />

          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
            disabled={isSubmitting || parsedProducts.length === 0}
            onClick={submit}
            type="button"
          >
            {isSubmitting ? "Đang đăng ký..." : `Đăng ký ${parsedProducts.length} sản phẩm`}
          </button>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Xem trước</h2>

          {parsedProducts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Chưa có dòng hợp lệ để xem trước.</p>
          ) : (
            <div className="mt-4 max-h-[360px] overflow-auto rounded-lg border border-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="p-3">Serial</th>
                    <th className="p-3">Lô hàng</th>
                    <th className="p-3">Sản phẩm</th>
                    <th className="p-3">Hết hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedProducts.map((product) => (
                    <tr className="border-t border-zinc-100" key={product.serialId}>
                      <td className="p-3 font-mono">{product.serialId}</td>
                      <td className="p-3">{product.batchId || "Tự tạo"}</td>
                      <td className="p-3">{product.productName}</td>
                      <td className="p-3">{product.expiryDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mt-6 text-xl font-bold">Kết quả</h2>
          {!result ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Gửi CSV để xem trạng thái từng dòng, mã giao dịch và lỗi nếu có.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-2xl font-bold">{result.total}</p>
                  <p className="text-muted-foreground">Tổng</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-2xl font-bold text-emerald-700">{result.successful}</p>
                  <p className="text-emerald-700">Thành công</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                  <p className="text-red-700">Lỗi</p>
                </div>
              </div>

              <div className="space-y-3">
                {result.results?.map((item) => (
                  <div
                    className={`rounded-lg border p-3 text-sm ${
                      item.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                    }`}
                    key={`${item.index}-${item.serialId || "unknown"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        #{item.index + 1} {item.serialId || "Không rõ serial"}
                      </p>
                      <span className={item.success ? "text-green-700" : "text-red-700"}>
                        {item.success ? "THÀNH CÔNG" : "LỖI"}
                      </span>
                    </div>
                    {item.success ? (
                      <div className="mt-2 space-y-1">
                        <p className="break-all font-mono text-xs text-muted-foreground">{item.txHash}</p>
                        {item.serialId ? (
                          <Link
                            className="text-sm font-semibold text-blue-600 hover:underline"
                            href={`/dashboard/products/${encodeURIComponent(item.serialId)}`}
                          >
                            Mở chi tiết
                          </Link>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-red-700">{item.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
