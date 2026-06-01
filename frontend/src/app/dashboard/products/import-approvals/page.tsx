"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { approveImportDocuments, getApiErrorMessage, getImportApprovals } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { useTranslation } from "@/providers/LanguageProvider";

const headers = ["docId", "importerLicense", "manufacturerId", "batchNo", "documentExpiryDate", "salt", "regulatorCertificateId"];

function sampleCsv() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return [
    headers.join(","),
    [`IMP-DOC-${stamp}`, "IMPORTER-LICENSE-DEMO", "GLOBAL-VACCINE-LTD", `IMP-BATCH-${stamp}`, "2027-12-31", `salt-${stamp}`, "REG-CERT-DEMO"].join(","),
    [`IMP-DOC-${stamp}-2`, "IMPORTER-LICENSE-DEMO", "NORDIC-BIO", `IMP-BATCH-${stamp}-2`, "2028-06-30", `salt-${stamp}-2`, "REG-CERT-DEMO-2"].join(","),
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

function parseApprovalCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV cần có tiêu đề và ít nhất một chứng từ.");
  const csvHeaders = parseCsvLine(lines[0]);
  const missing = headers.filter((header) => !csvHeaders.includes(header));
  if (missing.length) throw new Error(`CSV thiếu cột: ${missing.join(", ")}`);

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = csvHeaders.reduce<Record<string, string>>((acc, header, cellIndex) => {
      acc[header] = values[cellIndex] || "";
      return acc;
    }, {});
    const missingValues = headers.filter((header) => !row[header]);
    if (missingValues.length) throw new Error(`Dòng ${index + 2} thiếu: ${missingValues.join(", ")}`);
    if (Number.isNaN(new Date(row.documentExpiryDate).getTime())) throw new Error(`Dòng ${index + 2}: documentExpiryDate không hợp lệ.`);
    return {
      docId: row.docId,
      importerLicense: row.importerLicense,
      manufacturerId: row.manufacturerId,
      batchNo: row.batchNo,
      documentExpiryDate: row.documentExpiryDate,
      salt: row.salt,
      regulatorCertificateId: row.regulatorCertificateId,
    };
  });
}

export default function ImportApprovalsPage() {
  const t = useTranslation();
  const [csvText, setCsvText] = useState(sampleCsv);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const user = typeof window === "undefined" ? null : getStoredUser();
  const canApprove = user?.role === "RECALL_AUTHORITY" || user?.role === "ADMIN";

  const documents = useMemo(() => {
    try {
      return parseApprovalCsv(csvText);
    } catch {
      return [];
    }
  }, [csvText]);

  useEffect(() => {
    getImportApprovals().then(setState).catch(() => undefined);
  }, []);

  const downloadSample = () => {
    const blob = new Blob([sampleCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vaxitrust-import-approvals-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!canApprove || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const parsedDocs = parseApprovalCsv(csvText);
      const result = await approveImportDocuments({ approvedBy: user?.role || "RECALL_AUTHORITY", documents: parsedDocs });
      setState(result);
      toast.success(t("Đã duyệt danh sách chứng từ nhập khẩu."));
    } catch (err) {
      const message = err instanceof Error ? err.message : getApiErrorMessage(err, t("Duyệt chứng từ thất bại."));
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
          <h1 className="text-3xl font-bold">{t("Duyệt chứng từ nhập khẩu")}</h1>
          <p className="text-muted-foreground">{t("Tạo danh sách regulator, Merkle root và cập nhật root lên smart contract.")}</p>
        </div>
        <button type="button" onClick={downloadSample} className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50">
          {t("Tải CSV mẫu")}
        </button>
      </div>

      {!canApprove ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {t("Chỉ đơn vị thu hồi hoặc admin được duyệt danh sách regulator.")}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold">{t("Danh sách chứng từ")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{headers.join(", ")}</p>
          <textarea className="mt-4 min-h-[320px] w-full rounded-md border bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-blue-400" value={csvText} onChange={(event) => setCsvText(event.target.value)} spellCheck={false} />
          {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <button type="button" onClick={submit} disabled={!canApprove || isSubmitting || documents.length === 0} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {isSubmitting ? t("Đang xử lý...") : `${t("Duyệt")} ${documents.length} ${t("chứng từ")}`}
          </button>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold">{t("Trạng thái regulator root")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Firebase root</p>
              <p className="break-all font-mono text-xs text-zinc-700">{state?.approvedImportRoot || state?.approvedRoot || "0"}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">On-chain root</p>
              <p className="break-all font-mono text-xs text-zinc-700">{state?.onChainRoot || state?.approvedImportRoot || "0"}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">IPFS CID</p>
              <p className="break-all font-mono text-xs text-zinc-700">{state?.ipfsCid || "N/A"}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">TX</p>
              <p className="break-all font-mono text-xs text-zinc-700">{state?.txHash || "N/A"}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
