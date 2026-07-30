import { getSourceManifest, SOURCE_STATUS } from "../config/sourceManifest.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function reportFor(source = {}, sourceReports = {}) {
  return sourceReports[source.id] || {};
}

function runtimeStatus(source = {}, report = {}) {
  const scanned = num(report.scannedTokens || report.discoveredTokens || report.acceptedTokens);
  const status = String(report.status || "").toUpperCase();

  if ((status === "SUCCESS_WITH_DATA" || status === "SUCCESS" || status === "USED" || status === "HEALTHY") && scanned > 0) {
    return SOURCE_STATUS.ENABLED;
  }
  if (["FAILED", "ERROR", "TIMEOUT", "RATE_LIMITED", "REGION_BLOCKED", "AUTH_REQUIRED"].includes(status)) {
    return SOURCE_STATUS.DEGRADED;
  }
  if (status === "SUCCESS_EMPTY" || status === "SUCCESS" || status === "USED" || status === "HEALTHY") return SOURCE_STATUS.IMPLEMENTED;
  if (source.status !== SOURCE_STATUS.PLANNED) return source.status;
  return SOURCE_STATUS.PLANNED;
}

export function buildSourceCapabilityAudit(discovery = {}) {
  const sourceReports = discovery.sourceReports || {};
  const sources = getSourceManifest().map((source) => {
    const report = reportFor(source, sourceReports);
    const scannedTokens = num(report.scannedTokens || report.discoveredTokens || report.acceptedTokens);
    const status = runtimeStatus(source, report);

    return {
      ...source,
      status,
      configuredStatus: source.status,
      liveDataReturned: status === SOURCE_STATUS.ENABLED,
      lastSuccessAt: status === SOURCE_STATUS.ENABLED ? discovery.scannedAt || new Date().toISOString() : null,
      uniqueCandidates24h: scannedTokens,
      errorRate: status === SOURCE_STATUS.DEGRADED ? 1 : 0,
      error: report.error || null,
    };
  });
  const enabled = sources.filter((source) => source.status === SOURCE_STATUS.ENABLED);
  const candidateGenerators = sources.filter((source) => source.candidateGenerator);
  const liveCandidateGenerators = enabled.filter((source) => source.candidateGenerator);
  const categories = sources.reduce((acc, source) => {
    acc[source.category] = acc[source.category] || { total: 0, enabled: 0, planned: 0, degraded: 0 };
    acc[source.category].total += 1;
    if (source.status === SOURCE_STATUS.ENABLED) acc[source.category].enabled += 1;
    if (source.status === SOURCE_STATUS.PLANNED) acc[source.category].planned += 1;
    if (source.status === SOURCE_STATUS.DEGRADED) acc[source.category].degraded += 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    totalSources: sources.length,
    enabledSources: enabled.length,
    plannedSources: sources.filter((source) => source.status === SOURCE_STATUS.PLANNED).length,
    degradedSources: sources.filter((source) => source.status === SOURCE_STATUS.DEGRADED).length,
    candidateGenerators: candidateGenerators.length,
    liveCandidateGenerators: liveCandidateGenerators.length,
    liveGeneratorCoveragePct: candidateGenerators.length
      ? Math.round((liveCandidateGenerators.length / candidateGenerators.length) * 100)
      : 0,
    categories,
    sources,
    note: "A source is counted as ENABLED only when it returned live candidates in the current discovery run.",
  };
}
