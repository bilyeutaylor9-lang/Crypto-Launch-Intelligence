const STATUS_GROUPS = {
  VERIFIED_ABSENT: [
    "verified absent",
    "confirmed absent",
    "tested absent",
    "simulation confirmed absent",
  ],
  NOT_TESTED: [
    "not checked",
    "not tested",
    "not run",
    "not simulated",
    "not measured",
  ],
  PROVIDER_UNAVAILABLE: [
    "provider unavailable",
    "unavailable from provider",
    "provider down",
    "provider failed",
    "fetch failed",
    "timeout",
    "timed out",
    "unreachable",
  ],
  NOT_APPLICABLE: [
    "not applicable",
    "n/a",
    "does not apply",
    "not relevant",
    "unsupported for this chain",
    "unsupported for this venue",
  ],
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
    "not detected",
    "unresolved",
    "not available",
    "no data",
    "missing",
    "pending",
    "not reported",
    "undetermined",
    "unconfirmed",
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

const BOOLEAN_WORDS = Object.freeze({
  TRUE: ["true", "yes", "y", "1", "enabled", "active", "available", "present", "confirmed", "verified", "supported", "open", "operational", "live", "passed", "pass", "valid", "successful", "success", "ready", "allowed", "tradable"],
  FALSE: ["false", "no", "n", "0", "disabled", "inactive", "unavailable", "absent", "unsupported", "closed", "halted", "failed", "fail", "invalid", "blocked", "restricted", "not tradable"],
  UNKNOWN: ["unknown", "unverified", "unresolved", "not checked", "not tested", "not available", "no data", "missing", "insufficient evidence", "pending", "needs review", "not reported", "undetermined", "unconfirmed", "unavailable from provider"],
});

function clean(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function normalizeStatusVocabulary(value = "") {
  const raw = String(value ?? "").trim();
  const normalized = clean(raw);
  if (!normalized) return "UNKNOWN";

  for (const [status, terms] of Object.entries(STATUS_GROUPS)) {
    if (terms.some((term) => normalized === clean(term))) {
      return status;
    }
  }

  for (const [status, terms] of Object.entries(STATUS_GROUPS)) {
    if (["VERIFIED", "PARTIALLY_VERIFIED"].includes(status) && /\bnot\b|\bno\b|unconfirmed|unverified|unknown/.test(normalized)) {
      continue;
    }
    if (terms.some((term) => normalized.includes(clean(term)))) {
      return status;
    }
  }

  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNKNOWN";
}

export function normalizeBooleanVocabulary(value = "", options = {}) {
  const normalized = clean(value);
  if (!normalized) return { value: null, status: "UNKNOWN", confidence: 0 };
  const tested = Boolean(options.tested || options.sourceActuallyTested || options.verificationStatus === "VERIFIED");

  if (["not detected", "not confirmed", "not available", "no data"].includes(normalized) && !tested) {
    return { value: null, status: "UNKNOWN", confidence: 35, reason: "negative wording without test evidence" };
  }

  for (const [status, terms] of Object.entries(BOOLEAN_WORDS)) {
    if (terms.some((term) => normalized === clean(term))) {
      if (status === "TRUE") return { value: true, status: "VERIFIED_PRESENT", confidence: tested ? 90 : 62 };
      if (status === "FALSE") return { value: false, status: tested ? "VERIFIED_ABSENT" : "UNKNOWN", confidence: tested ? 88 : 40 };
      return { value: null, status: "UNKNOWN", confidence: 35 };
    }
  }

  return { value: null, status: normalizeStatusVocabulary(value), confidence: 35 };
}

export function providerStatusFromError(error = null) {
  const text = typeof error === "string" ? error : error?.message || "";
  const status = normalizeStatusVocabulary(text);
  if (status === "RATE_LIMITED") return "PROVIDER_RATE_LIMITED";
  if (status === "REGION_RESTRICTED") return "REGION_RESTRICTED";
  if (status === "PROVIDER_FAILED" || status === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_UNAVAILABLE";
}
