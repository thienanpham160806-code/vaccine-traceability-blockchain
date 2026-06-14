type LanguageFlagProps = {
  language: "en" | "vi";
  className?: string;
};

export function LanguageFlag({ language, className = "" }: LanguageFlagProps) {
  const baseClass = `inline-flex h-4 w-6 shrink-0 overflow-hidden rounded-[3px] border border-white/20 shadow-sm ${className}`;

  if (language === "vi") {
    return (
      <span className={baseClass} aria-hidden="true">
        <svg viewBox="0 0 36 24" className="h-full w-full" focusable="false">
          <rect width="36" height="24" fill="#da251d" />
          <polygon
            points="18,5.4 19.65,10.05 24.58,10.19 20.68,13.2 22.07,17.93 18,15.14 13.93,17.93 15.32,13.2 11.42,10.19 16.35,10.05"
            fill="#ffdd00"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={baseClass} aria-hidden="true">
      <svg viewBox="0 0 36 24" className="h-full w-full" focusable="false">
        <rect width="36" height="24" fill="#012169" />
        <path d="M0 0L36 24M36 0L0 24" stroke="#fff" strokeWidth="5" />
        <path d="M0 0L36 24M36 0L0 24" stroke="#c8102e" strokeWidth="2.7" />
        <path d="M18 0V24M0 12H36" stroke="#fff" strokeWidth="8" />
        <path d="M18 0V24M0 12H36" stroke="#c8102e" strokeWidth="4.4" />
      </svg>
    </span>
  );
}
