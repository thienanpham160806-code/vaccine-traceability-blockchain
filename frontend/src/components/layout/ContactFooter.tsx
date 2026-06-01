"use client";

import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import { VaxiTrustLogo } from "@/components/brand/VaxiTrustLogo";
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
    emailLabel: "Website support",
    webEmailLabel: "System email",
    note:
      "Use the system email for workflow support. Contact Thiên An or Mạnh Quyền directly for website troubleshooting.",
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
    emailLabel: "Hỗ trợ các vấn đề liên quan đến website",
    webEmailLabel: "E-mail hệ thống",
    note:
      "Liên hệ e-mail hệ thống nếu cần hỗ trợ công việc. Liên hệ mail Thiên An hoặc Mạnh Quyền nếu cần giải quyết các vấn đề của web.",
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

function FooterMedicalMotion() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style jsx>{`
        @keyframes footerFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)); opacity: 0.12; }
          50% { transform: translate3d(var(--x), var(--y), 0) rotate(calc(var(--rotate) + 8deg)); opacity: 0.24; }
        }
        @keyframes footerPulse {
          0%, 100% { transform: scale(0.96); opacity: 0.08; }
          50% { transform: scale(1.08); opacity: 0.18; }
        }
        .footer-float { animation: footerFloat 9s ease-in-out infinite; }
        .footer-pulse { animation: footerPulse 5s ease-in-out infinite; }
      `}</style>
      <div className="footer-pulse absolute -left-8 bottom-4 h-24 w-24 text-emerald-300/70">
        <div className="absolute left-1/2 top-0 h-full w-6 -translate-x-1/2 rounded-full bg-current" />
        <div className="absolute left-0 top-1/2 h-6 w-full -translate-y-1/2 rounded-full bg-current" />
      </div>
      <div
        className="footer-float absolute bottom-6 right-[18%] h-24 w-10 rounded-full border border-cyan-200/40 bg-cyan-100/50 shadow-[inset_6px_6px_14px_rgba(255,255,255,0.35),0_12px_30px_rgba(34,211,238,0.18)] dark:bg-cyan-300/10"
        style={{ "--rotate": "18deg", "--x": "16px", "--y": "-10px" } as React.CSSProperties}
      >
        <div className="absolute left-1/2 top-2 h-4 w-7 -translate-x-1/2 rounded-md bg-white/45 dark:bg-white/20" />
        <div className="absolute left-1/2 top-10 h-9 w-5 -translate-x-1/2 rounded-full bg-cyan-300/45" />
      </div>
      <div
        className="footer-float absolute left-[35%] top-5 h-20 w-6 rounded-full bg-blue-300/20 shadow-[0_0_24px_rgba(59,130,246,0.28)]"
        style={{ "--rotate": "-22deg", "--x": "-14px", "--y": "8px", animationDelay: "1.4s" } as React.CSSProperties}
      >
        <div className="absolute -bottom-5 left-1/2 h-7 w-1 -translate-x-1/2 rounded-full bg-blue-200/30" />
      </div>
    </div>
  );
}

export function ContactFooter({ className = "", animatedBackdrop = false }: { className?: string; animatedBackdrop?: boolean }) {
  const { language } = useLanguage();
  const text = contactCopy[language];

  return (
    <footer
      className={`relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 text-zinc-800 shadow-sm dark:border-blue-400/15 dark:from-zinc-950 dark:via-slate-950 dark:to-blue-950/40 dark:text-zinc-100 ${className}`}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-blue-400/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 left-1/3 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
      {animatedBackdrop ? <FooterMedicalMotion /> : null}

      <div className="relative grid gap-5 lg:grid-cols-[0.85fr_2fr_auto] lg:items-start xl:grid-cols-[0.75fr_2.25fr_auto]">
        <div className="space-y-3">
          <VaxiTrustLogo
            className="h-12 w-12"
            iconClassName="h-7 w-7"
            showWordmark
            subtitle={text.brandSubtitle}
            subtitleClassName="text-xs"
            wordmarkClassName="text-2xl"
          />
          <p className="max-w-md text-sm leading-5 text-zinc-600 dark:text-zinc-300">{text.intro}</p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{text.title}</h2>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2.5 rounded-xl border border-white/80 bg-white/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
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
                      <a key={item.email} className="block break-words text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300 xl:whitespace-nowrap" href={`mailto:${item.email}`}>
                        {item.name}: {item.email}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-white/80 bg-white/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
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
                  <a className="break-words text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-300 xl:whitespace-nowrap" href="mailto:vaccinetraceabilityblockchain@gmail.com">
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
