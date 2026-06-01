"use client";

import { ArrowUp, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/providers/LanguageProvider";

const contactCopy = {
  en: {
    title: "Contact Us",
    brandSubtitle: "Vaccine Traceability",
    intro:
      "VaxiTrust supports vaccine traceability, supply chain verification, and operational monitoring for healthcare logistics.",
    contactTitle: "Support contacts",
    addressLabel: "Address",
    address: "669 Do Muoi, Quarter 13, Linh Xuan Ward, Ho Chi Minh City",
    phoneLabel: "Phone",
    emailLabel: "Website issue",
    webEmailLabel: "System email",
    note: "For urgent website issues, contact the project maintainers by email.",
    backTop: "Back to top",
  },
  vi: {
    title: "Liên hệ chúng tôi",
    brandSubtitle: "Truy xuất vaccine",
    intro:
      "VaxiTrust hỗ trợ truy xuất nguồn gốc vaccine, xác minh chuỗi cung ứng và theo dõi vận hành logistics y tế.",
    contactTitle: "Thông tin hỗ trợ",
    addressLabel: "Địa chỉ",
    address: "669 Đỗ Mười, khu phố 13, phường Linh Xuân, TP.HCM",
    phoneLabel: "Điện thoại",
    emailLabel: "Website gặp sự cố",
    webEmailLabel: "E-mail hệ thống",
    note: "Nếu website có vấn đề, vui lòng liên hệ nhóm phụ trách qua email.",
    backTop: "Lên đầu trang",
  },
} as const;

const maintainerPhones = [
  { name: "Ms. An", phone: "0828677648" },
  { name: "Mr. Quyền", phone: "0886014461" },
];

const maintainerEmails = [
  { name: "Thiên An", email: "anpntk24414h@st.uel.edu.vn" },
  { name: "Mạnh Quyền", email: "quyenpmk24414h@st.uel.edu.vn" },
];

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
}

export function ContactFooter({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const text = contactCopy[language];

  return (
    <footer
      className={`relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6 text-zinc-800 shadow-sm dark:border-blue-400/15 dark:from-zinc-950 dark:via-slate-950 dark:to-blue-950/40 dark:text-zinc-100 ${className}`}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-emerald-400/10 blur-2xl" />

      <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1.4fr_auto] lg:items-start">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold tracking-tight">VaxiTrust</p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">
                {text.brandSubtitle}
              </p>
            </div>
          </div>
          <p className="max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">{text.intro}</p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{text.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-white/80 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                {text.contactTitle}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <div>
                    <p className="font-semibold">{text.phoneLabel}</p>
                    {maintainerPhones.map((item) => (
                      <a key={item.phone} className="block text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300" href={`tel:${item.phone}`}>
                        {item.phone} ({item.name})
                      </a>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  <div>
                    <p className="font-semibold">{text.emailLabel}</p>
                    {maintainerEmails.map((item) => (
                      <a key={item.email} className="block break-all text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300" href={`mailto:${item.email}`}>
                        {item.name}: {item.email}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-white/80 bg-white/70 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                <div>
                  <p className="font-semibold">{text.addressLabel}</p>
                  <p className="text-zinc-600 dark:text-zinc-300">{text.address}</p>
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                <div>
                  <p className="font-semibold">{text.webEmailLabel}</p>
                  <a className="break-all text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300" href="mailto:vaccinetraceabilityblockchain@gmail.com">
                    vaccinetraceabilityblockchain@gmail.com
                  </a>
                </div>
              </div>
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{text.note}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={scrollToTop}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200 dark:hover:bg-blue-500/30"
          aria-label={text.backTop}
          title={text.backTop}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </footer>
  );
}
