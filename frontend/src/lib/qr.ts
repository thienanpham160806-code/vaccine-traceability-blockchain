const idPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;

export type ParsedQr =
  | { valid: true; kind: "serial" | "batchPayload"; value: string }
  | { valid: false; reason: string; value: string };

function configuredVerifyUrl() {
  return process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || "http://localhost:3000/consumer/verify";
}

function isTrustedUrl(url: URL) {
  if (typeof window !== "undefined" && url.origin === window.location.origin) return true;

  try {
    const configured = new URL(configuredVerifyUrl());
    return url.origin === configured.origin;
  } catch {
    return false;
  }
}

function extractVerifyValue(rawValue: string) {
  try {
    const url = new URL(rawValue);
    if (!isTrustedUrl(url)) return null;

    const markers = ["/consumer/verify/", "/dashboard/verify/"];
    for (const marker of markers) {
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).trim();
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function parseVaxiTrustQr(rawValue: string): ParsedQr {
  const value = rawValue.trim();
  if (!value) return { valid: false, reason: "Mã QR trống.", value };

  const urlValue = extractVerifyValue(value);
  const candidate = urlValue || value;

  if (idPattern.test(candidate) && !candidate.includes("/")) {
    return { valid: true, kind: "serial", value: candidate };
  }

  const payloadParts = candidate.split("/").map((part) => part.trim()).filter(Boolean);
  if (payloadParts.length === 2 && payloadParts.every((part) => bytes32Pattern.test(part))) {
    return { valid: true, kind: "batchPayload", value: candidate };
  }

  return {
    valid: false,
    reason: "Mã QR không thuộc hệ thống VaxiTrust hoặc không đúng định dạng.",
    value,
  };
}

export function verifyHrefFromQr(
  parsed: Extract<ParsedQr, { valid: true }>,
  scope: "dashboard" | "consumer",
  options?: { returnTo?: "dashboard" | "public" }
) {
  const base = scope === "dashboard" ? "/dashboard/verify" : "/consumer/verify";
  const params = new URLSearchParams({ from: "scan" });
  if (options?.returnTo) params.set("returnTo", options.returnTo);
  return `${base}/${encodeURIComponent(parsed.value)}?${params.toString()}`;
}
