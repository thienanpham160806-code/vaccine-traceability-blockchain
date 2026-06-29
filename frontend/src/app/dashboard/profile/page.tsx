"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save, UserCircle, Wand2 } from "lucide-react";
import { getApiErrorMessage, getMyProfile, updateMyProfile } from "@/lib/api";
import { translateRole } from "@/lib/i18n";
import type { ProfileResponse } from "@/lib/types";
import { useLanguage, useTranslation } from "@/providers/LanguageProvider";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";

type ProfileForm = {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  organizationName: string;
  organizationCode: string;
  organizationAddress: string;
  licenseNumber: string;
  facilityType: string;
  storageCapacity: string;
  coldChainCapability: string;
};

const emptyForm: ProfileForm = {
  fullName: "",
  title: "",
  email: "",
  phone: "",
  organizationName: "",
  organizationCode: "",
  organizationAddress: "",
  licenseNumber: "",
  facilityType: "",
  storageCapacity: "",
  coldChainCapability: "",
};

const demoProfiles: Record<string, ProfileForm> = {
  MANUFACTURER: {
    fullName: "Nguyen Minh An",
    title: "Production QA Manager",
    email: "qa.manufacturer@vaxitrust.demo",
    phone: "+84 28 7300 1001",
    organizationName: "VaxiTrust Manufacturing",
    organizationCode: "MFR-DEMO-01",
    organizationAddress: "Khu cong nghe cao, TP.HCM",
    licenseNumber: "MFG-VAC-2026-001",
    facilityType: "Nha may san xuat vaccine",
    storageCapacity: "120,000 lieu, 2-8C",
    coldChainCapability: "Kho lanh 2-8C, logger nhiet do lien tuc, canh bao lech nguong.",
  },
  IMPORTER: {
    fullName: "Le Hoang Nam",
    title: "Import Compliance Lead",
    email: "importer@vaxitrust.demo",
    phone: "+84 24 7300 2002",
    organizationName: "VaxiTrust Import Co.",
    organizationCode: "IMP-DEMO-01",
    organizationAddress: "Cang ICD My Dinh, Ha Noi",
    licenseNumber: "IMP-VAC-2026-002",
    facilityType: "Don vi nhap khau vaccine",
    storageCapacity: "80,000 lieu, kho tam 2-8C",
    coldChainCapability: "Nhan hang container lanh, doi chieu chung tu, giam sat nhiet do khi thong quan.",
  },
  DISTRIBUTOR: {
    fullName: "Tran Quoc Bao",
    title: "Distribution Operations Lead",
    email: "ops.distributor@vaxitrust.demo",
    phone: "+84 28 7300 3003",
    organizationName: "VaxiTrust Distribution Hub",
    organizationCode: "DST-DEMO-01",
    organizationAddress: "Kho trung tam Binh Duong",
    licenseNumber: "DST-VAC-2026-003",
    facilityType: "Kho phan phoi cold chain",
    storageCapacity: "60,000 lieu, 2-8C",
    coldChainCapability: "Xe lanh, thung van chuyen dat chuan, bien ban giao nhan theo serial.",
  },
  CLINIC: {
    fullName: "Pham Thu Ha",
    title: "Clinic Vaccine Coordinator",
    email: "clinic@vaxitrust.demo",
    phone: "+84 28 7300 4004",
    organizationName: "VaxiTrust Clinic District 1",
    organizationCode: "CLC-DEMO-01",
    organizationAddress: "Quan 1, TP.HCM",
    licenseNumber: "CLC-VAC-2026-004",
    facilityType: "Phong kham tiem chung",
    storageCapacity: "5,000 lieu, tu lanh 2-8C",
    coldChainCapability: "Tu lanh vaccine rieng, kiem tra nhiet do moi ca truc.",
  },
  PHARMACY: {
    fullName: "Vo Gia Huy",
    title: "Pharmacy Branch Manager",
    email: "pharmacy@vaxitrust.demo",
    phone: "+84 28 7300 5005",
    organizationName: "VaxiTrust Pharmacy",
    organizationCode: "PHA-DEMO-01",
    organizationAddress: "Thu Duc, TP.HCM",
    licenseNumber: "PHA-VAC-2026-005",
    facilityType: "Nha thuoc co bao quan lanh",
    storageCapacity: "1,500 lieu, 2-8C",
    coldChainCapability: "Tu lanh y te, ghi nhan nhiet do va doi soat nhan hang theo ngay.",
  },
  ADMIN: {
    fullName: "Admin Operator",
    title: "System Administrator",
    email: "admin@vaxitrust.demo",
    phone: "+84 28 7300 9000",
    organizationName: "VaxiTrust Admin Console",
    organizationCode: "ADM-DEMO",
    organizationAddress: "Blockchain operations center",
    licenseNumber: "SYS-ADMIN-2026",
    facilityType: "Quan tri he thong",
    storageCapacity: "N/A",
    coldChainCapability: "Quan tri du lieu, RBAC, audit va an mem ban ghi loi.",
  },
  RECALL_AUTHORITY: {
    fullName: "Recall Authority Officer",
    title: "Recall Review Officer",
    email: "recall@vaxitrust.demo",
    phone: "+84 24 7300 9100",
    organizationName: "National Recall Authority",
    organizationCode: "RCL-DEMO",
    organizationAddress: "Ha Noi",
    licenseNumber: "RCL-AUTH-2026",
    facilityType: "Co quan thu hoi",
    storageCapacity: "N/A",
    coldChainCapability: "Xu ly canh bao, khieu nai va phat lenh thu hoi theo batch/serial.",
  },
};

function demoProfileForRole(role: string): ProfileForm {
  return demoProfiles[role] || {
    fullName: "Demo User",
    title: "Supply Chain Operator",
    email: "user@vaxitrust.demo",
    phone: "+84 28 7300 0000",
    organizationName: "VaxiTrust Demo Organization",
    organizationCode: `${role || "PUBLIC"}-DEMO`,
    organizationAddress: "Vietnam",
    licenseNumber: "DEMO-LICENSE",
    facilityType: "Demo facility",
    storageCapacity: "Demo capacity",
    coldChainCapability: "Demo cold chain capability.",
  };
}

function formFromProfile(data?: ProfileResponse): ProfileForm {
  if (!data) return emptyForm;
  return {
    fullName: data.user.fullName || data.user.name || "",
    title: data.user.title || "",
    email: data.user.email || "",
    phone: data.user.phone || "",
    organizationName: data.organization?.name || "",
    organizationCode: data.organization?.code || "",
    organizationAddress: data.organization?.address || "",
    licenseNumber: data.organization?.licenseNumber || "",
    facilityType: data.organization?.facilityType || "",
    storageCapacity: data.organization?.storageCapacity || "",
    coldChainCapability: data.organization?.coldChainCapability || "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

export default function ProfilePage() {
  const t = useTranslation();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [formOverride, setFormOverride] = useState<ProfileForm | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
  });

  const form = formOverride || formFromProfile(data);

  const mutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async () => {
      setError(null);
      setMessage(t("Đã lưu profile."));
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getApiErrorMessage(err, t("Không thể lưu profile.")));
    },
  });

  const updateField = (field: keyof ProfileForm, value: string) => {
    setFormOverride((current) => ({ ...(current || form), [field]: value }));
    setMessage(null);
    setError(null);
  };

  if (isLoading) {
    return <p className="text-sm text-zinc-500">{t("Đang tải profile...")}</p>;
  }

  const role = data?.user.role || "PUBLIC";
  const address = data?.user.address || data?.user.walletAddress || "";

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">{t("Profile")}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("Thông tin này dùng để hiển thị rõ từng node trong lịch sử chuỗi cung ứng.")}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <p className="font-bold text-zinc-900 dark:text-zinc-100">{translateRole(role, language)}</p>
          <p className="mt-0.5 font-mono text-zinc-500">{address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "N/A"}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setFormOverride(demoProfileForRole(role));
          setMessage(t("Đã điền dữ liệu demo. Bạn có thể chỉnh lại rồi bấm lưu."));
          setError(null);
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
      >
        <Wand2 className="h-4 w-4" />
        Điền demo cho role này
      </button>

      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center gap-2">
          <UserCircle className="h-5 w-5 text-blue-600" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{t("Thông tin người dùng")}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("Họ tên")}>
            <input className={inputCls} value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
          </Field>
          <Field label={t("Chức danh")}>
            <input className={inputCls} value={form.title} onChange={(e) => updateField("title", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          </Field>
          <Field label={t("Điện thoại")}>
            <input className={inputCls} value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{t("Hồ sơ tổ chức / cơ sở")}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("Tên tổ chức")}>
            <input className={inputCls} value={form.organizationName} onChange={(e) => updateField("organizationName", e.target.value)} />
          </Field>
          <Field label={t("Mã tổ chức")}>
            <input className={inputCls} value={form.organizationCode} onChange={(e) => updateField("organizationCode", e.target.value)} />
          </Field>
          <Field label={t("Số giấy phép")}>
            <input className={inputCls} value={form.licenseNumber} onChange={(e) => updateField("licenseNumber", e.target.value)} />
          </Field>
          <Field label={t("Loại cơ sở")}>
            <input className={inputCls} value={form.facilityType} onChange={(e) => updateField("facilityType", e.target.value)} placeholder={t("Kho lạnh, phòng khám, nhà máy...")} />
          </Field>
          <Field label={t("Địa chỉ / khu vực")}>
            <input className={inputCls} value={form.organizationAddress} onChange={(e) => updateField("organizationAddress", e.target.value)} />
          </Field>
          <Field label={t("Sức chứa kho")}>
            <input className={inputCls} value={form.storageCapacity} onChange={(e) => updateField("storageCapacity", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("Năng lực cold chain")}>
            <textarea
              className={`${inputCls} min-h-24 resize-y`}
              value={form.coldChainCapability}
              onChange={(e) => updateField("coldChainCapability", e.target.value)}
              placeholder={t("Ví dụ: Duy trì 2-8C, cảm biến nhiệt độ, cảnh báo lệch chuẩn.")}
            />
          </Field>
        </div>
      </section>

      <button
        type="button"
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {mutation.isPending ? t("Đang lưu...") : t("Lưu profile")}
      </button>
    </div>
  );
}
