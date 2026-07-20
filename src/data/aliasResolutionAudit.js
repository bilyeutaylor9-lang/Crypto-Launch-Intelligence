export function buildAliasAuditRecord({
  canonicalField,
  canonicalValue,
  sourceField,
  sourcePath,
  sourceProvider = "unknown",
  sourceTimestamp = null,
  sourceUnit = null,
  canonicalUnit = null,
  conversionApplied = "none",
  normalizationRule = "direct",
  confidence = 50,
  validationStatus = "UNKNOWN",
  conflicts = [],
  alternativesConsidered = [],
} = {}) {
  return {
    canonicalField,
    canonicalValue,
    sourceField,
    sourcePath,
    sourceProvider,
    sourceTimestamp,
    sourceUnit,
    canonicalUnit,
    conversionApplied,
    normalizationRule,
    confidence,
    validationStatus,
    conflicts,
    alternativesConsidered,
  };
}

export function summarizeAliasAudit(records = []) {
  const safe = Array.isArray(records) ? records : [];
  const byStatus = safe.reduce((acc, record) => {
    const status = record.validationStatus || "UNKNOWN";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    records: safe.length,
    resolved: safe.filter((record) => record.validationStatus === "VALID").length,
    conflicted: safe.filter((record) => (record.conflicts || []).length).length,
    byStatus,
  };
}
