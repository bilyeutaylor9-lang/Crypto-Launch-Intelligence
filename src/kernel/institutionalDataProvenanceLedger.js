import fs from "fs";
import path from "path";
import { canonicalSourceId, evidenceFamilyForSource, getSourceById } from "../config/sourceManifest.js";

const REPORT_FILE = "institutional-data-provenance.json";

const FIELD_DEFINITIONS = [
  {
    field: "identity",
    label: "Project identity",
    family: "identity",
    weight: 1.25,
    requiredForInstitutional: true,
    paths: ["identityResolutionScore", "projectIdentity.score", "finalIdentityScore"],
  },
  {
    field: "sourceTruth",
    label: "Source truth",
    family: "source",
    weight: 1.2,
    requiredForInstitutional: true,
    paths: ["sourceTruthScore", "evidenceQualityScore", "sourceReliabilityScore"],
  },
  {
    field: "liquidityUsd",
    label: "Liquidity USD",
    family: "liquidity",
    weight: 1.1,
    requiredForInstitutional: true,
    paths: ["liquidityUsd", "liquidity", "activeLiquidityUsd", "marketData.liquidityUsd"],
  },
  {
    field: "volume24h",
    label: "24h volume",
    family: "market",
    weight: 0.9,
    paths: ["volume24h", "volume", "marketData.volume24h"],
  },
  {
    field: "marketCap",
    label: "Market cap",
    family: "valuation",
    weight: 0.95,
    paths: ["marketCap", "circulatingMarketCap", "verifiedMarketCap", "marketData.marketCap"],
  },
  {
    field: "fdv",
    label: "Fully diluted valuation",
    family: "valuation",
    weight: 0.8,
    paths: ["fdv", "fullyDilutedValue", "fullyDilutedValuation", "marketData.fdv"],
  },
  {
    field: "supply",
    label: "Supply",
    family: "supply",
    weight: 0.9,
    paths: ["circulatingSupply", "totalSupply", "maxSupply", "marketData.circulatingSupply", "marketData.totalSupply"],
  },
  {
    field: "buyers",
    label: "Buyer quality",
    family: "buyers",
    weight: 1,
    requiredForInstitutional: true,
    paths: ["organicBuyerScore", "buyerRetentionScore", "uniqueBuyers24h", "buyers24h"],
  },
  {
    field: "activityAuthenticity",
    label: "Activity authenticity",
    family: "activity",
    weight: 1,
    requiredForInstitutional: true,
    paths: ["organicEconomicIntegrityScore", "organicDemandScore", "activityAuthenticityRiskScore"],
  },
  {
    field: "safety",
    label: "Safety",
    family: "safety",
    weight: 1.15,
    requiredForInstitutional: true,
    paths: ["instantSafetyScore", "instantSafetyRiskScore", "riskScore", "contractRiskScore"],
  },
  {
    field: "wallets",
    label: "Wallet cluster",
    family: "wallet",
    weight: 0.9,
    paths: ["walletClusterScore", "walletClusterRiskScore", "smartMoneyAccumulationScore", "smartWalletArrivalScore"],
  },
  {
    field: "development",
    label: "Development",
    family: "development",
    weight: 0.75,
    paths: ["githubProScore", "githubScore", "developerActivityScore"],
  },
  {
    field: "catalyst",
    label: "Catalyst",
    family: "catalyst",
    weight: 0.75,
    paths: ["catalystScore", "catalystCalendarScore", "liveCatalystRadarScore", "roadmapProfitabilityScore"],
  },
  {
    field: "execution",
    label: "Execution route",
    family: "execution",
    weight: 0.8,
    requiredForInstitutional: true,
    paths: ["proofOfAlphaExecutionTwinScore", "executionTwinScore", "smallCapExecutionScore"],
  },
];

const AGREEMENT_GROUPS = [
  {
    id: "valuation",
    label: "Valuation agreement",
    paths: [
      "marketCap",
      "circulatingMarketCap",
      "verifiedMarketCap",
      "fdv",
      "fullyDilutedValue",
      "fullyDilutedValuation",
      "dexScreenerMarketCap",
      "dexMarketCap",
      "geckoTerminalFdv",
      "geckoTerminalMarketCap",
      "coinGeckoMarketCap",
      "coinGeckoFdv",
      "coinMarketCapMarketCap",
      "coinMarketCapFdv",
      "bitgetMarketCap",
      "bitgetFdv",
      "selfReportedMarketCap",
      "certikMarketCap",
    ],
  },
  {
    id: "supply",
    label: "Supply agreement",
    paths: [
      "circulatingSupply",
      "totalSupply",
      "maxSupply",
      "marketData.circulatingSupply",
      "marketData.totalSupply",
      "coinGeckoCirculatingSupply",
      "coinGeckoTotalSupply",
      "coinMarketCapCirculatingSupply",
      "coinMarketCapTotalSupply",
      "bitgetTotalSupply",
      "geckoTerminalTotalSupply",
    ],
  },
  {
    id: "marketActivity",
    label: "Market activity agreement",
    paths: [
      "volume24h",
      "marketData.volume24h",
      "rawCandidate.volume24h",
      "liquidityUsd",
      "marketData.liquidityUsd",
      "rawCandidate.liquidityUsd",
    ],
  },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0 && num(item.weight) > 0);
  const weight = active.reduce((sum, item) => sum + num(item.weight), 0);
  if (!weight) return 0;
  return active.reduce((sum, item) => sum + num(item.score) * num(item.weight), 0) / weight;
}

function getPathValue(object = {}, key = "") {
  return String(key)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), object);
}

function present(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return String(value).trim().length > 0;
}

function normalizeSource(source = "") {
  return canonicalSourceId(source || "unknown");
}

function sourceFamily(source = "") {
  return evidenceFamilyForSource(source || "unknown") || "unknown";
}

function sourceConfidence(source = "") {
  const info = getSourceById(source);
  let score = 45;
  if (info.status === "IMPLEMENTED" || info.status === "ENABLED") score += 20;
  if (info.status === "DEGRADED") score += 5;
  if (info.candidateGenerator) score += 8;
  if (info.enrichmentProvider) score += 8;
  if (info.requiresKey) score += 4;
  if (info.evidenceFamily && info.evidenceFamily !== "unknown") score += 8;
  return Math.round(clamp(score));
}

function knownSources(project = {}) {
  const fromEvidence = (Array.isArray(project.evidence) ? project.evidence : [])
    .map((item) => typeof item === "string" ? null : item.source || item.provider || item.engine)
    .filter(Boolean);
  const fromSourceTruth = (project.sourceTruth?.sources || [])
    .map((source) => source.source || source.type || source.id)
    .filter(Boolean);
  const fromValuation = (project.valuationSources || [])
    .map((source) => source.source || source.provider)
    .filter(Boolean);

  return [
    project.source,
    ...(project.discoverySources || []),
    ...fromSourceTruth,
    ...fromValuation,
    ...fromEvidence,
  ]
    .filter(Boolean)
    .map(normalizeSource)
    .filter(Boolean);
}

function observedAt(project = {}, fallback = null) {
  return (
    project.observedAt ||
    project.lastObservedAt ||
    project.lastSeenAt ||
    project.discoveredAt ||
    project.timestamp ||
    fallback ||
    null
  );
}

function ageHours(timestamp = null, now = Date.now()) {
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.max(0, (now - time) / (60 * 60 * 1000));
}

function freshnessScoreFor(timestamp = null, now = Date.now()) {
  const hours = ageHours(timestamp, now);
  if (hours === null) return 55;
  if (hours <= 6) return 100;
  if (hours <= 24) return 92;
  if (hours <= 72) return 82;
  if (hours <= 168) return 68;
  if (hours <= 720) return 48;
  return 25;
}

function freshnessStatus(score = 0) {
  if (score >= 90) return "fresh";
  if (score >= 70) return "usable";
  if (score >= 45) return "stale";
  return "expired";
}

function observationTypeFor(definition = {}, pathKey = "", project = {}) {
  const text = `${definition.field} ${pathKey}`.toLowerCase();
  if (text.includes("simulat") || text.includes("quantum") || text.includes("paper") || text.includes("monte")) return "simulated";
  if (text.includes("score") || text.includes("verdict") || text.includes("risk")) return "derived";
  if (text.includes("estimated") || project.estimatedMarketCap) return "inferred";
  return "direct";
}

function confidenceForRecord({ source = "unknown", observationType = "direct", valuePresent = false, freshnessScore = 55 } = {}) {
  const typeScore =
    observationType === "direct" ? 92 :
    observationType === "derived" ? 74 :
    observationType === "inferred" ? 56 :
    observationType === "simulated" ? 50 :
    45;
  const confidence = weightedAverage([
    { score: sourceConfidence(source), weight: 0.3 },
    { score: typeScore, weight: 0.35 },
    { score: freshnessScore, weight: 0.25 },
    { score: valuePresent ? 88 : 20, weight: 0.1 },
  ]);
  return Math.round(clamp(confidence));
}

function firstPresent(project = {}, paths = []) {
  for (const pathKey of paths) {
    const value = getPathValue(project, pathKey);
    if (present(value)) return { path: pathKey, value };
  }
  return { path: paths[0] || "", value: null };
}

function recordForField(project = {}, definition = {}, source = "unknown", now = Date.now()) {
  const selected = firstPresent(project, definition.paths || []);
  const timestamp = observedAt(project);
  const freshness = freshnessScoreFor(timestamp, now);
  const observationType = observationTypeFor(definition, selected.path, project);
  const valuePresent = present(selected.value);

  return {
    field: definition.field,
    label: definition.label,
    family: definition.family,
    path: selected.path,
    source: normalizeSource(source),
    sourceFamily: sourceFamily(source),
    rawValue: selected.value,
    normalizedValue: typeof selected.value === "number" ? num(selected.value) : selected.value,
    observedAt: timestamp,
    freshnessScore: freshness,
    freshnessStatus: freshnessStatus(freshness),
    observationType,
    confidence: confidenceForRecord({
      source,
      observationType,
      valuePresent,
      freshnessScore: freshness,
    }),
    requiredForInstitutional: Boolean(definition.requiredForInstitutional),
    present: valuePresent,
  };
}

function collectNumberEntries(project = {}, paths = [], options = {}) {
  const pathEntries = paths
    .map((pathKey) => ({
      source: project.source || "project",
      path: pathKey,
      value: num(getPathValue(project, pathKey)),
    }))
    .filter((entry) => entry.value > 0);
  const externalEntries = options.includeValuationSources ? (project.valuationSources || [])
    .map((entry) => ({
      source: entry.source || entry.provider || "valuation-source",
      path: entry.type || entry.label || "valuationSources",
      value: num(entry.value),
    }))
    .filter((entry) => entry.value > 0) : [];
  return [...pathEntries, ...externalEntries];
}

function dispersionScore(entries = []) {
  const values = entries.map((entry) => num(entry.value)).filter((value) => value > 0);
  if (values.length < 2) {
    return {
      sourceCount: values.length,
      dispersion: 1,
      agreementScore: values.length ? 72 : 45,
      status: values.length ? "single-source" : "missing",
    };
  }

  const dispersion = Math.max(...values) / Math.min(...values);
  const agreementScore =
    dispersion >= 1000 ? 5 :
    dispersion >= 100 ? 18 :
    dispersion >= 25 ? 35 :
    dispersion >= 10 ? 52 :
    dispersion >= 3 ? 72 :
    92;

  return {
    sourceCount: values.length,
    dispersion: Number(dispersion.toFixed(2)),
    agreementScore,
    status:
      agreementScore >= 85 ? "aligned" :
      agreementScore >= 65 ? "usable" :
      agreementScore >= 45 ? "conflicted" :
      "severely-conflicted",
  };
}

function agreementGroups(project = {}) {
  return AGREEMENT_GROUPS.map((group) => {
    const entries = collectNumberEntries(project, group.paths, {
      includeValuationSources: group.id === "valuation",
    });
    const scored = dispersionScore(entries);
    return {
      ...group,
      ...scored,
      entries: entries.slice(0, 25),
    };
  });
}

function readinessFor(score = 0, blockers = [], warnings = []) {
  if (blockers.length) return "BLOCKED";
  if (score >= 82 && warnings.length <= 2) return "INSTITUTIONAL_READY";
  if (score >= 68) return "REVIEW_READY";
  if (score >= 48) return "DEGRADED_USABLE";
  return "INSUFFICIENT_PROVENANCE";
}

function buildBlockersAndWarnings({
  records = [],
  sourceCount = 0,
  sourceFamilyCount = 0,
  agreement = [],
  score = 0,
} = {}) {
  const blockers = [];
  const warnings = [];
  const missingRequired = records.filter((record) => record.requiredForInstitutional && !record.present);
  const staleRequired = records.filter((record) => record.requiredForInstitutional && record.freshnessStatus === "expired");
  const severeAgreement = agreement.filter((item) => item.status === "severely-conflicted");
  const conflictedAgreement = agreement.filter((item) => item.status === "conflicted");
  const inferredOrSimulatedRequired = records.filter((record) =>
    record.requiredForInstitutional && ["inferred", "simulated"].includes(record.observationType)
  );

  if (sourceCount < 2) blockers.push("Fewer than two independent provenance sources.");
  if (sourceFamilyCount < 2) warnings.push("Evidence is concentrated in too few source families.");
  if (missingRequired.length >= 4) blockers.push("Multiple institutional-required fields are missing.");
  else if (missingRequired.length) warnings.push(`${missingRequired.length} institutional-required field(s) are missing.`);
  if (staleRequired.length) warnings.push(`${staleRequired.length} institutional-required field(s) are stale or expired.`);
  if (severeAgreement.length) blockers.push("Critical cross-source valuation, supply, or activity disagreement detected.");
  if (conflictedAgreement.length) warnings.push("Cross-source valuation, supply, or activity disagreement needs review.");
  if (inferredOrSimulatedRequired.length >= 2) warnings.push("Institutional-required fields rely on inferred or simulated data.");
  if (score < 40) warnings.push("Overall provenance score is weak.");

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

export function buildInstitutionalDataProvenanceLedger(project = {}, options = {}) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const sources = [...new Set(knownSources(project))];
  const primarySource = sources[0] || project.source || "unknown";
  const records = FIELD_DEFINITIONS.map((definition) => recordForField(project, definition, primarySource, now));
  const agreement = agreementGroups(project);
  const presentRecords = records.filter((record) => record.present);
  const directRecords = records.filter((record) => record.present && record.observationType === "direct");
  const derivedRecords = records.filter((record) => record.present && record.observationType === "derived");
  const inferredRecords = records.filter((record) => record.present && ["inferred", "simulated"].includes(record.observationType));
  const sourceFamilies = [...new Set(sources.map(sourceFamily).filter(Boolean))];
  const criticalRecords = records.filter((record) => record.requiredForInstitutional);
  const criticalCoverage = criticalRecords.length
    ? (criticalRecords.filter((record) => record.present).length / criticalRecords.length) * 100
    : 0;
  const fieldCoverage = records.length ? (presentRecords.length / records.length) * 100 : 0;
  const sourceIndependenceScore = clamp(sourceFamilies.length * 18 + Math.min(20, sources.length * 3));
  const directObservationScore = records.length ? (directRecords.length / records.length) * 100 : 0;
  const freshnessScore = average(records.filter((record) => record.present).map((record) => record.freshnessScore)) || 55;
  const sourceAgreementScore = average(agreement.map((item) => item.agreementScore)) || 45;
  const confidenceScore = average(records.filter((record) => record.present).map((record) => record.confidence)) || 35;
  const score = Math.round(
    clamp(
      weightedAverage([
        { score: criticalCoverage, weight: 1.25 },
        { score: fieldCoverage, weight: 0.9 },
        { score: sourceIndependenceScore, weight: 1.05 },
        { score: sourceAgreementScore, weight: 1.1 },
        { score: directObservationScore, weight: 0.75 },
        { score: freshnessScore, weight: 0.8 },
        { score: confidenceScore, weight: 0.9 },
      ])
    )
  );
  const { blockers, warnings } = buildBlockersAndWarnings({
    records,
    sourceCount: sources.length,
    sourceFamilyCount: sourceFamilies.length,
    agreement,
    score,
  });
  const readiness = readinessFor(score, blockers, warnings);

  return {
    version: "institutional-data-provenance-v1",
    generatedAt: new Date(now).toISOString(),
    projectId: project.projectId || project.permanentProjectKey || project.identityKey || `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score,
    institutionalReadiness: readiness,
    canPromoteInstitutionally: readiness === "INSTITUTIONAL_READY",
    components: {
      criticalCoverage: Math.round(clamp(criticalCoverage)),
      fieldCoverage: Math.round(clamp(fieldCoverage)),
      sourceIndependence: Math.round(sourceIndependenceScore),
      sourceAgreement: Math.round(sourceAgreementScore),
      directObservation: Math.round(clamp(directObservationScore)),
      freshness: Math.round(clamp(freshnessScore)),
      recordConfidence: Math.round(confidenceScore),
    },
    sourceSummary: {
      sourceCount: sources.length,
      sources,
      sourceFamilyCount: sourceFamilies.length,
      sourceFamilies,
      primarySource: normalizeSource(primarySource),
    },
    recordSummary: {
      totalRecords: records.length,
      presentRecords: presentRecords.length,
      directRecords: directRecords.length,
      derivedRecords: derivedRecords.length,
      inferredOrSimulatedRecords: inferredRecords.length,
      requiredRecords: criticalRecords.length,
      missingRequiredRecords: criticalRecords.filter((record) => !record.present).length,
    },
    agreement,
    blockers,
    warnings,
    records,
  };
}

export function analyzeInstitutionalDataProvenance(project = {}, options = {}) {
  const ledger = buildInstitutionalDataProvenanceLedger(project, options);

  return {
    ...project,
    institutionalDataProvenance: ledger,
    institutionalDataProvenanceScore: ledger.score,
    institutionalDataReadiness: ledger.institutionalReadiness,
    institutionalDataCanPromote: ledger.canPromoteInstitutionally,
    institutionalDataBlockers: ledger.blockers,
    institutionalDataWarnings: ledger.warnings,
    institutionalDataSourceCount: ledger.sourceSummary.sourceCount,
    institutionalDataSourceFamilyCount: ledger.sourceSummary.sourceFamilyCount,
  };
}

export function analyzeInstitutionalDataProvenanceBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeInstitutionalDataProvenance(project, options)
  );
}

function compactLedger(ledger = {}) {
  return {
    projectId: ledger.projectId,
    name: ledger.name,
    symbol: ledger.symbol,
    chain: ledger.chain,
    score: ledger.score,
    institutionalReadiness: ledger.institutionalReadiness,
    canPromoteInstitutionally: Boolean(ledger.canPromoteInstitutionally),
    sourceCount: ledger.sourceSummary?.sourceCount || 0,
    sourceFamilyCount: ledger.sourceSummary?.sourceFamilyCount || 0,
    components: ledger.components || {},
    blockers: ledger.blockers || [],
    warnings: ledger.warnings || [],
  };
}

export function summarizeInstitutionalDataProvenance(projects = [], options = {}) {
  const ledgers = (Array.isArray(projects) ? projects : []).map((project) =>
    project.institutionalDataProvenance?.version
      ? project.institutionalDataProvenance
      : buildInstitutionalDataProvenanceLedger(project, options)
  );
  const count = (status) => ledgers.filter((ledger) => ledger.institutionalReadiness === status).length;

  return {
    generatedAt: new Date(options.now ? new Date(options.now).getTime() : Date.now()).toISOString(),
    name: "Institutional Data Provenance Ledger",
    doctrine: [
      "Every major score must carry source, timestamp, confidence, and observation type.",
      "Direct observed evidence outranks inferred, simulated, or single-source fields.",
      "Cross-source valuation, supply, and market-activity disagreement blocks institutional promotion.",
      "Institutional readiness is a data-trust gate, not a buy or sell recommendation.",
    ],
    totalProjects: ledgers.length,
    averageProvenanceScore: Math.round(average(ledgers.map((ledger) => ledger.score))),
    counts: {
      institutionalReady: count("INSTITUTIONAL_READY"),
      reviewReady: count("REVIEW_READY"),
      degradedUsable: count("DEGRADED_USABLE"),
      blocked: count("BLOCKED"),
      insufficientProvenance: count("INSUFFICIENT_PROVENANCE"),
    },
    topReady: ledgers
      .filter((ledger) => ledger.institutionalReadiness === "INSTITUTIONAL_READY")
      .sort((a, b) => num(b.score) - num(a.score))
      .slice(0, 25)
      .map(compactLedger),
    reviewQueue: ledgers
      .filter((ledger) => ledger.institutionalReadiness !== "INSTITUTIONAL_READY")
      .sort((a, b) => (b.blockers || []).length - (a.blockers || []).length || num(a.score) - num(b.score))
      .slice(0, 50)
      .map(compactLedger),
    topDisagreements: ledgers
      .filter((ledger) => (ledger.agreement || []).some((item) => ["conflicted", "severely-conflicted"].includes(item.status)))
      .sort((a, b) => num(a.components?.sourceAgreement) - num(b.components?.sourceAgreement))
      .slice(0, 25)
      .map((ledger) => ({
        ...compactLedger(ledger),
        agreement: ledger.agreement,
      })),
    ledgerDetailMode: options.includeDetailedLedgers === true ? "FULL" : "COMPACT",
    ledgers: options.includeDetailedLedgers === true ? ledgers : ledgers.map(compactLedger),
  };
}

export function writeInstitutionalDataProvenanceReport(projects = [], options = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeInstitutionalDataProvenance(projects, options);
  const filePath = path.join(reportsDir, REPORT_FILE);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return {
    filePath,
    report,
  };
}
