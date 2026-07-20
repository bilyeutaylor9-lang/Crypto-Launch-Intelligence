export function buildAliasAuditRecord({
  canonicalField,
  canonicalValue,
  rawValue,
  sourceField,
  sourcePath,
  sourceProvider = "unknown",
  providerFieldName = null,
  detectedAlias = null,
  sourceTimestamp = null,
  sourceUnit = null,
  canonicalUnit = null,
  conversionApplied = "none",
  normalizationRule = "direct",
  confidence = 50,
  validationStatus = "UNKNOWN",
  validationReason = null,
  parsedMarketPair = null,
  conflicts = [],
  alternativesConsidered = [],
} = {}) {
  return {
    canonicalField,
    resolvedValue: canonicalValue,
    canonicalValue,
    originalField: sourceField,
    originalValue: rawValue,
    originalPath: sourcePath,
    sourceField,
    sourcePath,
    sourceProvider,
    provider: sourceProvider,
    providerFieldName: providerFieldName || sourceField,
    detectedAlias: detectedAlias || sourceField,
    sourceTimestamp,
    timestamp: sourceTimestamp,
    unitBefore: sourceUnit,
    unitAfter: canonicalUnit,
    sourceUnit,
    canonicalUnit,
    conversionApplied,
    normalizationRule,
    confidence,
    validationStatus,
    validationReason,
    parsedMarketPair,
    conflicts,
    rejectedAlternatives: alternativesConsidered,
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
