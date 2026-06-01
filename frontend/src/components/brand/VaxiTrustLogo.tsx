type VaxiTrustLogoProps = {
  className?: string;
  iconClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  showSubtitle?: boolean;
};

export function VaxiTrustLogo({
  className = "h-12 w-12",
  iconClassName = "h-7 w-7",
  subtitle = "TRUY XUẤT VACCINE",
  subtitleClassName = "text-[11px]",
  wordmarkClassName = "text-2xl",
  showWordmark = false,
  showSubtitle = true,
}: VaxiTrustLogoProps) {
  const icon = (
    <div
      className={`flex shrink-0 items-center justify-center rounded-[28%] border border-blue-400/55 bg-blue-100/70 shadow-[0_0_32px_rgba(46,125,255,0.24)] dark:border-blue-700/70 dark:bg-blue-950/55 ${className}`}
    >
      <svg
        aria-hidden="true"
        className={iconClassName}
        fill="none"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M32 5 54 12v17c0 14.4-8.5 25.6-22 30-13.5-4.4-22-15.6-22-30V12l22-7Z"
          fill="#2E7DFF"
        />
        <path
          d="M32 55.5C20.2 51.2 13 41.4 13 29V14.3L32 8.2l19 6.1V29c0 12.4-7.2 22.2-19 26.5Z"
          fill="url(#shieldGlow)"
        />
        <path
          className="fill-white dark:fill-zinc-950"
          d="M28.7 41.8 18.8 31.9l4.5-4.5 5.4 5.4 12.8-12.9 4.6 4.5-17.4 17.4Z"
        />
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id="shieldGlow" x1="32" x2="32" y1="8" y2="56">
            <stop stopColor="#3B82F6" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );

  if (!showWordmark) return icon;

  return (
    <div className="flex items-center gap-4">
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className={`font-extrabold leading-none tracking-normal text-zinc-950 dark:text-zinc-50 ${wordmarkClassName}`}>
          VaxiTrust
        </span>
        {showSubtitle ? (
          <span className={`mt-1 font-bold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300 ${subtitleClassName}`}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
