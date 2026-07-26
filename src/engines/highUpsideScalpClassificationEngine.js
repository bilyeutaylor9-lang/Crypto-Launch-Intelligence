import { isLiveExecutionReady } from "../execution/routeTruthV2.js";
import { isLikelyAggregateCandidate } from "../identity/displayIdentityGuard.js";

export const HIGH_UPSIDE_SCALP_LANES = [
  "SCALP_READY_RESEARCH",
  "HIGH_UPSIDE_WATCH",
  "RESEARCH_ONLY_ROUTE_MISSING",
  "HIGH_UPSIDE_RESEARCH_DEFERRED",
  "LATE_CHASE_REJECTED",
  "MEME_SPECULATION_EXCLUDED",
  "SCALP_NO_TRADE_HIGH_COST",
  "SCALP_NO_TRADE_THIN_DEPTH",
  "SCALP_NO_TRADE_STALE_QUOTE",
  "SCALP_NO_TRADE_ROUTE_UNVERIFIED",
  "SCALP_NO_TRADE_UNFAVORABLE_MICROSTRUCTURE",
  "SAFETY_BLOCKED",
  "LOWER_PRIORITY",
  "DATA_STARVED",
  "INVALID_OR_AGGREGATE_IDENTITY",
];

const MAX_MISSING_FIELDS = 80;
const MIN_DATA_COVERAGE_PCT = 42;

const COMPONENT_WEIGHTS = {
  upside: 0.25,
  flow: 0.22,
  quality: 0.18,
  proof: 0.13,
  safety: 0.12,
  route: 0.1,
};

export const HIGH_UPSIDE_SCALP_COMPONENTS = {
  upside: [
    ["sevenDayTenXScore"],
    ["preBreakoutRadarScore"],
    ["preConsensusBreakoutScore"],
    ["earlyAsymmetryResearchPriorityScore"],
  ],
  flow: [
    ["capitalMigrationScore"],
    ["capitalFlowScore"],
    ["buyerBreadthAccelerationScore"],
    ["buyPressureScore"],
    ["liquidityFormationScore"],
    ["liquidityExpansionScore"],
  ],
  quality: [
    ["utilityQualityScore"],
    ["realUtilityScore"],
    ["developerAccelerationScore"],
    ["developerActivityScore"],
    ["ecosystemIntegrationScore"],
    ["tokenomicsScore"],
  ],
  proof: [
    ["sourceTruthScore"],
    ["sourceReliabilityScore"],
    ["institutionalDataProvenanceScore"],
    ["evidenceCoverageScore"],
    ["opportunityEvidenceCoverage"],
  ],
  safety: [
    ["instantSafetyScore"],
    ["contractAuthoritySafetyScore"],
    ["liquidityControlSafetyScore"],
    ["sniperIntegrityScore"],
    ["finalIntegrityScore"],
  ],
  route: [
    ["routeTruthStatus", "executionProofState", "executionStatus", "canonicalExecutionRoute.status"],
    ["scalpMicrostructureScore"],
  ],
  risk: [
    ["trapRiskScore"],
    ["contractAuthorityRiskScore"],
    ["liquidityControlRiskScore"],
    ["washTradingRiskScore"],
    ["walletClusterRiskScore"],
    ["deployerRiskScore"],
    ["sellPressureScore"],
  ],
};

export const HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES = Object.values(HIGH_UPSIDE_SCALP_COMPONENTS)
  .flat()
  .map((paths) => paths[0]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getPath(object = {}, path = "") {
  return String(path || "")
    .split(".")
    .reduce((value, key) => (value && Object.hasOwn(value, key) ? value[key] : undefined), object);
}

function firstPresentPath(project = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(project, path);
    if (value !== undefined && value !== null && value !== "") return { path, value };
  }
  return { path: paths[0] || "unknown", value: undefined };
}

function explicitNumber(project = {}, paths = []) {
  const candidate = firstPresentPath(project, paths);
  if (candidate.value === undefined) {
    return { available: false, field: paths[0] || "unknown", value: null };
  }
  const parsed = Number(candidate.value);
  if (!Number.isFinite(parsed)) {
    return { available: false, field: candidate.path, value: null };
  }
  return { available: true, field: candidate.path, value: parsed };
}

function hasAnyPath(project = {}, paths = []) {
  return paths.some((path) => {
    const value = getPath(project, path);
    return value !== undefined && value !== null && value !== "";
  });
}

function routeReady(project = {}) {
  return isLiveExecutionReady(project);
}

export function isHighUpsideDeepStageDeferred(project = {}) {
  if (project.highUpsideScalpLane) return false;
  if (!Array.isArray(project.progressivePipelineStages)) return false;
  return !project.progressivePipelineStages.includes("deep");
}

export function markHighUpsideScalpResearchDeferred(project = {}) {
  return {
    ...project,
    highUpsideScalpScore: 0,
    highUpsideScalpLane: "HIGH_UPSIDE_RESEARCH_DEFERRED",
    highUpsideScalpComponentScores: {},
    highUpsideScalpComponentCoverage: {},
    highUpsideScalpDataCoverage: null,
    highUpsideScalpMissingFields: [],
    highUpsideScalpClassificationReason:
      "Project was not selected into the deep high-upside scalp evidence stage this scan; this is funnel deferral, not missing evidence.",
    highUpsideScalpDiagnostics: {
      routeReady: routeReady(project),
      lateChase: lateChase(project),
      utilityBlocked: utilityBlocked(project),
      deterministicSafetyBlocked: deterministicSafetyBlocked(project),
      deferredByFunnel: true,
      selectedStages: project.progressivePipelineStages || [],
      missingFieldCount: 0,
      componentCoveragePct: null,
      componentScoreMedian: 0,
    },
  };
}

function routeComponent(project = {}, paths = []) {
  if (!hasAnyPath(project, paths)) {
    return { available: false, field: paths[0] || "routeTruthStatus", value: null };
  }
  return {
    available: true,
    field: paths.find((path) => hasAnyPath(project, [path])) || paths[0] || "routeTruthStatus",
    value: routeReady(project) ? 85 : 35,
  };
}

function familyScore(project = {}, family = "", specs = []) {
  const components = specs.map((paths) =>
    family === "route" && paths.includes("routeTruthStatus")
      ? routeComponent(project, paths)
      : explicitNumber(project, paths)
  );
  const available = components.filter((component) => component.available);
  const missingFields = components
    .filter((component) => !component.available)
    .map((component) => component.field);
  const score = available.length
    ? Math.round(available.reduce((sum, component) => sum + clamp(component.value), 0) / available.length)
    : null;

  return {
    score,
    available: available.length,
    expected: components.length,
    coveragePct: components.length ? Math.round((available.length / components.length) * 100) : 100,
    missingFields,
    sourceFields: available.map((component) => component.field),
  };
}

function average(values = []) {
  const active = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function priceChange24h(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange24hPct, project.priceChange24hPct, project.priceChange24h]));
}

function priceChange7d(project = {}) {
  return num(first([project.sevenDayTenXPriceExtension?.priceChange7dPct, project.priceChange7dPct, project.priceChange7d]));
}

function lateChase(project = {}) {
  const status = String(project.sevenDayTenXLateChaseStatus || project.preBreakoutMomentumStage || project.prePump?.status || "");
  return /ALREADY_10X|LATE_CHASE|ALREADY_PUMPED|EXTENDED/.test(status) || priceChange24h(project) >= 85 || priceChange7d(project) >= 220;
}

function utilityBlocked(project = {}) {
  return project.memeOnlySpeculative === true || project.utilityClassification === "MEME_SPECULATION";
}

function deterministicSafetyBlocked(project = {}) {
  const blockers = [
    ...(project.sevenDayTenXBlockers || []),
    ...(project.finalSelectionBlockers || []),
    ...(project.finalBlockingReasons || []),
    ...(project.sniperIntegrityBlockers || []),
  ]
    .join(" ")
    .toLowerCase();
  const hasSafetyBlockerText =
    /honeypot|verified scam|identity conflict|contract mismatch|chain mismatch|cannot sell|sell restricted|blacklist|mint authority|liquidity removal|owner can drain|malicious|critical safety/.test(
      blockers
    );

  return Boolean(
    project.honeypotDetected ||
      project.verifiedScam ||
      project.sellRestricted ||
      project.identityConflict ||
      project.canonicalIdentityHardBlock ||
      project.instantSafetyStatus === "CRITICAL" ||
      num(project.contractAuthorityRiskScore) >= 70 ||
      num(project.liquidityControlRiskScore) >= 75 ||
      num(project.washTradingRiskScore) >= 75 ||
      (project.finalSelectionState === "BLOCKED" && hasSafetyBlockerText)
  );
}

function routeOnlyScalpBlock(project = {}) {
  return /ROUTE|QUOTE|STALE/i.test(String(project.scalpMicrostructureLane || ""));
}

function scoreFromFamilies(componentScores = {}, dataCoveragePct = 0) {
  let weightedScore = 0;
  let activeWeight = 0;

  for (const [family, weight] of Object.entries(COMPONENT_WEIGHTS)) {
    const score = componentScores[family]?.score;
    if (!Number.isFinite(Number(score))) continue;
    weightedScore += Number(score) * weight;
    activeWeight += weight;
  }

  const baseScore = activeWeight > 0 ? weightedScore / activeWeight : 0;
  const riskPenalty = Number.isFinite(Number(componentScores.risk?.score))
    ? Number(componentScores.risk.score) * 0.24
    : 0;
  const coveragePenalty = dataCoveragePct < 70 ? (70 - dataCoveragePct) * 0.2 : 0;
  return Math.round(clamp(baseScore - riskPenalty - coveragePenalty));
}

function classificationReason(lane = "", project = {}, score = 0, coveragePct = 0) {
  if (lane === "INVALID_OR_AGGREGATE_IDENTITY") {
    return "Provider row is malformed or appears to describe an aggregate market instead of a tradable token.";
  }
  if (lane === "SAFETY_BLOCKED") return "Deterministic safety, identity, or manipulation blocker prevents scalp research.";
  if (lane === "LATE_CHASE_REJECTED") return "Price action is already extended for high-upside scalp mode.";
  if (lane === "MEME_SPECULATION_EXCLUDED") return "Meme-only speculation is excluded from the real-utility scalp lane.";
  if (String(lane).startsWith("SCALP_NO_TRADE")) return "Scalp microstructure engine rejected current trade conditions.";
  if (lane === "HIGH_UPSIDE_RESEARCH_DEFERRED") {
    return "Project was not selected into the deep high-upside scalp evidence stage this scan.";
  }
  if (lane === "RESEARCH_ONLY_ROUTE_MISSING") return "Candidate stays visible for research, but fresh buy and sell route proof is missing.";
  if (lane === "DATA_STARVED") return `Only ${coveragePct}% of expected high-upside scalp evidence is available.`;
  if (lane === "SCALP_READY_RESEARCH") return "Full high-upside scalp evidence and route checks are strong enough for manual research.";
  if (lane === "HIGH_UPSIDE_WATCH") return "Evidence is developing but remains below scalp-ready thresholds.";
  if (lane === "LOWER_PRIORITY") return `Score ${score} is below the high-upside watch threshold.`;
  return "No primary high-upside scalp lane could be assigned.";
}

function primaryLane(project = {}, score = 0, dataCoveragePct = 0) {
  if (isLikelyAggregateCandidate(project)) return "INVALID_OR_AGGREGATE_IDENTITY";
  if (deterministicSafetyBlocked(project)) return "SAFETY_BLOCKED";
  if (lateChase(project)) return "LATE_CHASE_REJECTED";
  if (utilityBlocked(project)) return "MEME_SPECULATION_EXCLUDED";
  if (routeOnlyScalpBlock(project)) {
    return dataCoveragePct >= MIN_DATA_COVERAGE_PCT ? "RESEARCH_ONLY_ROUTE_MISSING" : "DATA_STARVED";
  }
  if (String(project.scalpMicrostructureLane || "").startsWith("SCALP_NO_TRADE")) return project.scalpMicrostructureLane;
  if (!routeReady(project) && dataCoveragePct >= MIN_DATA_COVERAGE_PCT) return "RESEARCH_ONLY_ROUTE_MISSING";
  if (dataCoveragePct < MIN_DATA_COVERAGE_PCT) return "DATA_STARVED";
  if (project.scalpMicrostructureLane === "SCALP_WATCHLIST") return "HIGH_UPSIDE_WATCH";
  if (score >= 72) return "SCALP_READY_RESEARCH";
  if (score >= 58) return "HIGH_UPSIDE_WATCH";
  return "LOWER_PRIORITY";
}

export function classifyHighUpsideScalpProject(project = {}) {
  if (isHighUpsideDeepStageDeferred(project)) {
    return markHighUpsideScalpResearchDeferred(project);
  }

  const componentScores = Object.fromEntries(
    Object.entries(HIGH_UPSIDE_SCALP_COMPONENTS).map(([family, specs]) => [
      family,
      familyScore(project, family, specs),
    ])
  );
  const available = Object.values(componentScores).reduce((sum, family) => sum + family.available, 0);
  const expected = Object.values(componentScores).reduce((sum, family) => sum + family.expected, 0);
  const dataCoveragePct = expected ? Math.round((available / expected) * 100) : 100;
  const missingFields = Object.values(componentScores)
    .flatMap((family) => family.missingFields)
    .slice(0, MAX_MISSING_FIELDS);
  const score = scoreFromFamilies(componentScores, dataCoveragePct);
  const lane = primaryLane(project, score, dataCoveragePct);

  return {
    ...project,
    highUpsideScalpScore: score,
    highUpsideScalpLane: lane,
    highUpsideScalpComponentScores: Object.fromEntries(
      Object.entries(componentScores).map(([family, value]) => [family, value.score])
    ),
    highUpsideScalpComponentCoverage: componentScores,
    highUpsideScalpDataCoverage: dataCoveragePct,
    highUpsideScalpMissingFields: missingFields,
    highUpsideScalpClassificationReason: classificationReason(lane, project, score, dataCoveragePct),
    highUpsideScalpDiagnostics: {
      routeReady: routeReady(project),
      lateChase: lateChase(project),
      utilityBlocked: utilityBlocked(project),
      deterministicSafetyBlocked: deterministicSafetyBlocked(project),
      missingFieldCount: missingFields.length,
      componentCoveragePct: dataCoveragePct,
      componentScoreMedian: average(
        Object.values(componentScores)
          .map((family) => family.score)
          .filter((value) => Number.isFinite(Number(value)))
      ),
    },
  };
}

export function analyzeHighUpsideScalpClassificationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    classifyHighUpsideScalpProject(project)
  );
}
