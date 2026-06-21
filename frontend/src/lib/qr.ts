const idPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;
const legacySerialPattern = /^(?=.{3,128}$)(?=.*[A-Za-z])(?=.*\d)(?=.*[._:-])[A-Za-z0-9._:-]+$/;

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

    const match = url.pathname.match(/^\/(?:consumer|dashboard)\/verify\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]).trim() : null;
  } catch {
    return null;
  }
}

function isAbsoluteUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function getConsumerVerifyQrValue(serialId: string) {
  const browserBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/consumer/verify`
      : "http://localhost:3000/consumer/verify";
  const base = process.env.NEXT_PUBLIC_CONSUMER_VERIFY_BASE_URL || browserBase;
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(serialId)}`;
}

export function parseVaxiTrustQr(
  rawValue: string,
  options: { source?: "manual" | "scan" } = {}
): ParsedQr {
  const value = rawValue.trim();
  if (!value) return { valid: false, reason: "Mã QR hoặc serial đang trống.", value };

  const urlValue = extractVerifyValue(value);
  if (!urlValue && isAbsoluteUrl(value)) {
    return {
      valid: false,
      reason: "URL trong mã QR không thuộc hệ thống VaxiTrust.",
      value,
    };
  }

  const candidate = urlValue || value;
  const payloadParts = candidate.split("/").map((part) => part.trim()).filter(Boolean);
  if (payloadParts.length === 2 && payloadParts.every((part) => bytes32Pattern.test(part))) {
    return { valid: true, kind: "batchPayload", value: candidate };
  }

  const source = options.source || "manual";
  const isAllowedSerial =
    source === "scan"
      ? Boolean(urlValue) || legacySerialPattern.test(candidate)
      : idPattern.test(candidate);

  if (isAllowedSerial && !candidate.includes("/")) {
    return { valid: true, kind: "serial", value: candidate };
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
