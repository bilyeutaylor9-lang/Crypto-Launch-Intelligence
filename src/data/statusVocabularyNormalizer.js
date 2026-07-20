const STATUS_GROUPS = {
  VERIFIED: [
    "verified",
    "confirmed",
    "validated",
    "active",
    "live",
    "tradable",
    "available",
    "supported",
    "operational",
    "ready",
    "open",
    "enabled",
  ],
  PARTIALLY_VERIFIED: [
    "partially verified",
    "partially confirmed",
    "detected",
    "market detected",
    "route detected",
    "preliminary",
    "limited evidence",
    "provisionally available",
  ],
  UNVERIFIED: [
    "unverified",
    "unknown",
    "not confirmed",
    "unresolved",
    "needs review",
    "research required",
    "insufficient evidence",
  ],
  UNAVAILABLE: [
    "unavailable",
    "disabled",
    "closed",
    "halted",
    "paused",
    "inactive",
    "not tradable",
    "unsupported",
    "delisted",
    "maintenance",
  ],
  RATE_LIMITED: ["rate limited", "429", "too many requests", "quota exceeded"],
  PROVIDER_FAILED: ["failed", "fetch failed", "timeout", "timed out", "5xx", "unreachable"],
  REGION_RESTRICTED: ["451", "region restricted", "not available in your region", "geo blocked"],
};

function clean(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function normalizeStatusVocabulary(value = "") {
  const raw = String(value ?? "").trim();
  const normalized = clean(raw);
  if (!normalized) return "UNKNOWN";

  for (const [status, terms] of Object.entries(STATUS_GROUPS)) {
    if (terms.some((term) => normalized === clean(term) || normalized.includes(clean(term)))) {
      return status;
    }
  }

  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNKNOWN";
}

export function providerStatusFromError(error = null) {
  const text = typeof error === "string" ? error : error?.message || "";
  const status = normalizeStatusVocabulary(text);
  if (status === "RATE_LIMITED") return "PROVIDER_RATE_LIMITED";
  if (status === "REGION_RESTRICTED") return "REGION_RESTRICTED";
  if (status === "PROVIDER_FAILED") return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}
