"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, UploadCloud, XCircle } from "lucide-react";
import { bulkRegisterProducts, getApiErrorMessage } from "@/lib/api";
import { bulkProductCsvSchema } from "@/lib/validation";
import { ActionSpinner } from "@/components/ui/ActionSpinner";
import { useTranslation } from "@/providers/LanguageProvider";

const csvHeaders = [
  "serialId",
  "batchId",
  "productName",
  "manufacturerName",
  "expiryDate",
  "origin",
  "quantity",
  "docId",
  "importerLicense",
  "manufacturerId",
  "batchNo",
  "documentExpiryDate",
  "salt",
  "regulatorCertificateId",
];

type BulkProductRow = {
  serialId: string;
  batchId?: string;
  productName: string;
  manufacturerName?: string;
  expiryDate: string;
  origin?: "MANUFACTURED" | "IMPORTED";
  quantity?: number;
  importDocument?: {
    docId: string;
    importerLicense: string;
    manufacturerId: string;
    batchNo: string;
    documentExpiryDate: string;
    salt: string;
    regulatorCertificateId: string;
  };
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
      "",
      "",
      "",
      "",
      "",
    ].join(","),
    [
      `VCN-BULK-${stamp}-002`,
      `IMP-BATCH-${stamp}`,
      "Imported Demo Vaccine",
      "Global Vaccine Ltd",
      "2027-12-31",
      "IMPORTED",
      "1",
      `IMP-DOC-${stamp}`,
      "IMPORTER-LICENSE-DEMO",
      "GLOBAL-VACCINE-LTD",
      `IMP-BATCH-${stamp}`,
      "2027-12-31",
      `salt-${stamp}`,
      "REG-CERT-DEMO",
    ].join(","),
  ].join("\n");
}

function downloadSampleCsv() {
  const blob = new Blob([makeSampleCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vaxitrust-bulk-products-template.csv";
  link.click();
  URL.revokeObjectURL(url);
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

    const isImported = row.origin === "IMPORTED";
    if (isImported) {
      const missingImportFields = ["docId", "importerLicense", "manufacturerId", "batchNo", "documentExpiryDate", "salt", "regulatorCertificateId"].filter((field) => !row[field]);
      if (missingImportFields.length > 0) {
        throw new Error(`Dòng ${rowIndex + 2} thiếu cột nhập khẩu: ${missingImportFields.join(", ")}`);
      }
    }

    const product: BulkProductRow = {
      serialId: row.serialId,
      batchId: row.batchId || undefined,
      productName: row.productName,
      manufacturerName: row.manufacturerName || undefined,
      expiryDate: row.expiryDate,
      origin: isImported ? "IMPORTED" : "MANUFACTURED",
      quantity: row.quantity ? Number(row.quantity) : undefined,
      importDocument: isImported ? {
        docId: row.docId,
        importerLicense: row.importerLicense,
        manufacturerId: row.manufacturerId,
        batchNo: row.batchNo || row.batchId,
        documentExpiryDate: row.documentExpiryDate,
        salt: row.salt,
        regulatorCertificateId: row.regulatorCertificateId,
      } : undefined,
    };

    const parsed = bulkProductCsvSchema.safeParse(product);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.join(".") || "row";
      throw new Error(`Dòng ${rowIndex + 2} - ${field}: ${issue?.message || "giá trị không hợp lệ"}`);
    }

    return product;
  });
}

function getUnknownErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : null;
}

export default function BulkRegisterProductsPage() {
  const t = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      parseCsvProducts(text);
      setResult(null);
      setError(null);
      setCsvText(text);
      setFileName(file.name);
      toast.success(t("Đã tải file CSV lên."));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("Không đọc được tệp CSV.");
      setError(message);
      toast.error(message);
    } finally {
      event.target.value = "";
    }
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
          <h1 className="text-3xl font-bold">{t("Đăng ký hàng loạt")}</h1>
          <p className="text-muted-foreground">
            {t("Tải mẫu CSV, chọn file đã điền hoặc dán nội dung CSV để tạo nhiều serial sản phẩm cùng lúc.")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            onClick={downloadSampleCsv}
            type="button"
          >
            <Download className="h-4 w-4" />
            {t("Tải CSV mẫu")}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadCloud className="h-4 w-4" />
            {t("Tải CSV lên")}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            onClick={resetSample}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            {t("Tạo mẫu mới")}
          </button>
          <Link href="/dashboard/products" className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900">
            {t("Danh sách sản phẩm")}
          </Link>
          <input ref={fileInputRef} accept=".csv,text/csv" className="hidden" onChange={handleFile} type="file" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900 dark:text-zinc-100">{t("Dữ liệu CSV")}</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("Cột bắt buộc: serialId, productName, expiryDate. Nếu origin là IMPORTED, nhập thêm các cột chứng từ ZKP.")}
                </p>
                {fileName ? <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">{t("File đang dùng")}: <span className="font-mono">{fileName}</span></p> : null}
              </div>
            </div>
          </div>

          <label
            className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/5 dark:hover:bg-blue-500/10"
            htmlFor="bulk-csv-file"
          >
            <UploadCloud className="mb-2 h-7 w-7 text-blue-600 dark:text-blue-300" />
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">{t("Chọn file CSV để tải lên")}</span>
            <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{fileName || t("Hoặc chỉnh trực tiếp nội dung bên dưới")}</span>
          </label>
          <input
            accept=".csv,text/csv"
            className="sr-only"
            id="bulk-csv-file"
            onChange={handleFile}
            type="file"
          />

          <textarea
            className="min-h-[300px] w-full rounded-xl border border-zinc-300 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-black/60"
            spellCheck={false}
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setResult(null);
              setError(null);
            }}
          />

          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <button
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
            disabled={isSubmitting || parsedProducts.length === 0}
            onClick={submit}
            type="button"
          >
            {isSubmitting ? <ActionSpinner label={t("Đang đăng ký...")} /> : `${t("Đăng ký")} ${parsedProducts.length} ${t("sản phẩm")}`}
          </button>
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t("Xem trước")}</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                {parsedProducts.length} {t("dòng hợp lệ")}
              </span>
            </div>

            {parsedProducts.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-800">
                {t("Chưa có dòng hợp lệ để xem trước.")}
              </p>
            ) : (
              <div className="mt-4 max-h-[360px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="p-3">Serial</th>
                      <th className="p-3">{t("Lô hàng")}</th>
                      <th className="p-3">{t("Sản phẩm")}</th>
                      <th className="p-3">{t("Nguồn gốc")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {parsedProducts.map((product) => (
                      <tr className="bg-white dark:bg-zinc-950/60" key={product.serialId}>
                        <td className="p-3 font-mono font-semibold">{product.serialId}</td>
                        <td className="p-3">{product.batchId || t("Tự tạo")}</td>
                        <td className="p-3">{product.productName}</td>
                        <td className="p-3">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {product.origin || "MANUFACTURED"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <h2 className="text-xl font-bold">{t("Kết quả")}</h2>
            {!result ? (
              <p className="mt-4 rounded-lg border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-800">
                {t("Gửi CSV để xem trạng thái từng dòng, mã giao dịch và lỗi nếu có.")}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-2xl font-bold">{result.total}</p>
                    <p className="text-muted-foreground">{t("Tổng")}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.successful}</p>
                    <p className="text-emerald-700 dark:text-emerald-300">{t("Thành công")}</p>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300">{result.failed}</p>
                    <p className="text-red-700 dark:text-red-300">{t("Lỗi")}</p>
                  </div>
                </div>

                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {result.results?.map((item) => (
                    <div
                      className={`rounded-lg border p-3 text-sm ${
                        item.success
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                          : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
                      }`}
                      key={`${item.index}-${item.serialId || "unknown"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">
                          #{item.index + 1} {item.serialId || t("Không rõ serial")}
                        </p>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${item.success ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                          {item.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {item.success ? t("Thành công") : t("Lỗi")}
                        </span>
                      </div>
                      {item.success ? (
                        <div className="mt-2 space-y-1">
                          <p className="break-all font-mono text-xs text-muted-foreground">{item.txHash}</p>
                          {item.serialId ? (
                            <Link
                              className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-300"
                              href={`/dashboard/products/${encodeURIComponent(item.serialId)}`}
                            >
                              {t("Mở chi tiết")}
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-red-700 dark:text-red-300">{item.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
