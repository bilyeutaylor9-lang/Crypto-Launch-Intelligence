const INTERNAL_AI_GROUP = "internal-ai-opinion";

const SCORE_FIELD_LINEAGE = [
  { field: "identityResolutionScore", family: "identity", group: "identity-resolution", source: "identity-resolver" },
  { field: "projectIdentityScore", family: "identity", group: "identity-resolution", source: "project-identity-engine" },
  { field: "sourceTruthScore", family: "source", group: "external-source-truth", source: "source-truth-engine" },
  { field: "sourceReliabilityScore", family: "source", group: "external-source-truth", source: "source-reliability-engine" },
  { field: "securityEvidenceScore", family: "security", group: "contract-security", source: "free-security-connectors" },
  { field: "instantSafetyScore", family: "security", group: "contract-security", source: "instant-safety-gate" },
  { field: "contractAuthoritySafetyScore", family: "security", group: "contract-security", source: "contract-authority-engine" },
  { field: "liquidityControlSafetyScore", family: "security", group: "liquidity-control", source: "liquidity-control-engine" },
  { field: "executionTwinScore", family: "execution", group: "execution-route", source: "execution-twin" },
  { field: "proofOfAlphaExecutionTwinScore", family: "execution", group: "execution-route", source: "execution-twin" },
  { field: "activeLiquidityTruthScore", family: "liquidity", group: "dex-liquidity", source: "active-liquidity-truth" },
  { field: "liquidityScore", family: "liquidity", group: "dex-liquidity", source: "liquidity-engine" },
  { field: "liquidityExpansionScore", family: "liquidity", group: "dex-liquidity", source: "liquidity-expansion-engine" },
  { field: "organicBuyerScore", family: "buyers", group: "organic-demand", source: "organic-buyer-engine" },
  { field: "buyerRetentionScore", family: "buyers", group: "organic-demand", source: "buyer-retention-engine" },
  { field: "buyPressureScore", family: "buyers", group: "organic-demand", source: "buy-pressure-engine" },
  { field: "holderGrowthScore", family: "buyers", group: "organic-demand", source: "holder-growth-engine" },
  { field: "smartWalletArrivalScore", family: "wallets", group: "smart-wallets", source: "smart-wallet-arrival-engine" },
  { field: "smartWalletScore", family: "wallets", group: "smart-wallets", source: "smart-wallet-engine" },
  { field: "smartMoneyAccumulationScore", family: "wallets", group: "smart-wallets", source: "smart-money-engine" },
  { field: "smartMoneyRotationScore", family: "wallets", group: "smart-wallets", source: "smart-money-rotation-engine" },
  { field: "githubProScore", family: "development", group: "developer-activity", source: "github-intelligence-pro" },
  { field: "githubScore", family: "development", group: "developer-activity", source: "github-quality-engine" },
  { field: "developerActivityScore", family: "development", group: "developer-activity", source: "developer-activity-engine" },
  { field: "liveCatalystRadarScore", family: "catalyst", group: "catalyst-roadmap", source: "live-catalyst-radar" },
  { field: "roadmapProfitabilityScore", family: "catalyst", group: "catalyst-roadmap", source: "roadmap-catalyst-engine" },
  { field: "catalystScore", family: "catalyst", group: "catalyst-roadmap", source: "catalyst-engine" },
  { field: "catalystCalendarScore", family: "catalyst", group: "catalyst-roadmap", source: "catalyst-calendar-engine" },
  { field: "narrativeScore", family: "narrative", group: "social-narrative", source: "narrative-engine" },
  { field: "narrativeForecastScore", family: "narrative", group: "social-narrative", source: "narrative-forecast-engine" },
  { field: "narrativeHeatScore", family: "narrative", group: "social-narrative", source: "narrative-heat-engine" },
  { field: "xSocialScore", family: "social", group: "social-narrative", source: "x-social-engine" },
  { field: "communityGrowthScore", family: "social", group: "social-narrative", source: "community-growth-engine" },
  { field: "accelerationScore", family: "momentum", group: "price-volume-momentum", source: "acceleration-engine" },
  { field: "earlyBreakoutScore", family: "momentum", group: "price-volume-momentum", source: "early-breakout-engine" },
  { field: "preBreakoutMomentumScore", family: "momentum", group: "price-volume-momentum", source: "pre-breakout-engine" },
  { field: "momentumShiftScore", family: "momentum", group: "price-volume-momentum", source: "momentum-shift-engine" },
  { field: "momentumCompressionScore", family: "momentum", group: "price-volume-momentum", source: "momentum-compression-engine" },
  { field: "volatilityExpansionScore", family: "momentum", group: "price-volume-momentum", source: "volatility-expansion-engine" },
  { field: "relativeStrengthScore", family: "momentum", group: "price-volume-momentum", source: "relative-strength-engine" },
  { field: "prePumpPatternScore", family: "learning", group: "historical-patterns", source: "pre-pump-pattern-engine" },
  { field: "outcomeLearningScore", family: "learning", group: "historical-patterns", source: "outcome-learning-engine" },
  { field: "paperTradingOutcomeScore", family: "learning", group: "historical-patterns", source: "paper-trading-outcome-engine" },
  { field: "aiEcosystemScore", family: "ai", group: INTERNAL_AI_GROUP, source: "ai-council" },
  { field: "autonomousAlphaOSScore", family: "ai", group: INTERNAL_AI_GROUP, source: "alpha-os" },
  { field: "causalMarketTwinScore", family: "ai", group: INTERNAL_AI_GROUP, source: "causal-market-twin" },
  { field: "selfEvolvingAlphaOSScore", family: "ai", group: INTERNAL_AI_GROUP, source: "self-evolving-alpha-os" },
];

const REQUIRED_GROUP_SETS = [
  ["identity-resolution"],
  ["contract-security", "liquidity-control"],
  ["dex-liquidity", "execution-route"],
  ["organic-demand", "smart-wallets", "developer-activity", "catalyst-roadmap"],
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getPathValue(object = {}, key = "") {
  return String(key)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), object);
}

function isInternalAI(value = "") {
  return /\b(ai|agent|council|brain|llama|gpt|model|autonomous|simulation|quantum)\b/i.test(String(value || ""));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function confidenceFromScore(score = 0, fallback = 0.55) {
  if (!score) return fallback;
  return Number((clamp(score) / 100).toFixed(2));
}

function evidenceItemLineage(item = {}, index = 0) {
  if (typeof item === "string") {
    return {
      id: `evidence:${index}`,
      rawProvider: "unknown",
      rawObservation: item,
      timestamp: null,
      evidenceFamily: "unclassified",
      derivedFeature: item,
      parentEngine: "unknown",
      independenceGroup: "unclassified",
      freshness: "UNKNOWN",
      confidence: 0.45,
      score: 0,
      internalOpinion: false,
    };
  }

  const parentEngine = item.engine || item.sourceEngine || item.parentEngine || item.source || "unknown";
  const rawProvider = item.provider || item.source || parentEngine;
  const family = lower(item.family || item.evidenceFamily || item.category || item.type || parentEngine || "unclassified");
  const internalOpinion = isInternalAI(parentEngine) || isInternalAI(rawProvider);
  const timestamp = item.observedAt || item.timestamp || item.createdAt || null;
  return {
    id: `evidence:${index}`,
    rawProvider,
    rawObservation: item.signal || item.reason || item.message || item.label || item.type || "evidence",
    timestamp,
    evidenceFamily: family || "unclassified",
    derivedFeature: item.derivedFeature || item.signal || item.type || "evidence",
    parentEngine,
    independenceGroup: internalOpinion ? INTERNAL_AI_GROUP : groupForFamily(family),
    freshness: freshness(timestamp),
    confidence: confidenceFromScore(num(item.confidence) > 1 ? item.confidence : num(item.confidence) * 100, 0.5),
    score: clamp(item.score || item.value || 0),
    internalOpinion,
  };
}

function groupForFamily(family = "") {
  const text = lower(family);
  if (/identity|contract|token/.test(text)) return "identity-resolution";
  if (/security|safety|honeypot|authority|tax|blacklist|mint/.test(text)) return "contract-security";
  if (/liquidity|pool|lp/.test(text)) return "dex-liquidity";
  if (/execution|route|quote|slippage|sell/.test(text)) return "execution-route";
  if (/buyer|holder|demand|organic/.test(text)) return "organic-demand";
  if (/wallet|smart|whale/.test(text)) return "smart-wallets";
  if (/github|developer|commit|repo/.test(text)) return "developer-activity";
  if (/catalyst|roadmap|launch|listing/.test(text)) return "catalyst-roadmap";
  if (/narrative|social|x|community/.test(text)) return "social-narrative";
  if (/momentum|price|volume|breakout|pump|acceleration|volatility|relative/.test(text)) return "price-volume-momentum";
  if (/learning|pattern|outcome|backtest/.test(text)) return "historical-patterns";
  return "unclassified";
}

function freshness(timestamp = null) {
  if (!timestamp) return "UNKNOWN";
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return "UNKNOWN";
  const ageHours = Math.max(0, (Date.now() - parsed) / 3600000);
  if (ageHours <= 6) return "LIVE";
  if (ageHours <= 48) return "RECENT";
  if (ageHours <= 168) return "AGING";
  return "STALE";
}

function scoreFieldLineage(project = {}) {
  return SCORE_FIELD_LINEAGE.flatMap((entry) => {
    const value = getPathValue(project, entry.field);
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) return [];
    return {
      id: `score:${entry.field}`,
      rawProvider: entry.source,
      rawObservation: `${entry.field}=${Math.round(clamp(value))}`,
      timestamp: project.updatedAt || project.observedAt || project.scannedAt || null,
      evidenceFamily: entry.family,
      derivedFeature: entry.field,
      parentEngine: entry.source,
      independenceGroup: entry.group,
      freshness: freshness(project.updatedAt || project.observedAt || project.scannedAt || null),
      confidence: confidenceFromScore(value),
      score: clamp(value),
      internalOpinion: entry.group === INTERNAL_AI_GROUP,
    };
  });
}

function sourceLineage(project = {}) {
  const sources = [
    project.source,
    project.dex,
    project.exchange,
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
    ...(Array.isArray(project.sources) ? project.sources : []),
  ]
    .map(lower)
    .filter(Boolean);

  return [...new Set(sources)].map((source) => ({
    id: `source:${source}`,
    rawProvider: source,
    rawObservation: `project observed by ${source}`,
    timestamp: project.discoveredAt || project.updatedAt || null,
    evidenceFamily: "source",
    derivedFeature: "source-observation",
    parentEngine: "discovery",
    independenceGroup: "external-source-truth",
    freshness: freshness(project.discoveredAt || project.updatedAt || null),
    confidence: 0.5,
    score: 50,
    internalOpinion: false,
  }));
}

function summarizeGroups(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = item.independenceGroup || "unclassified";
    const current = groups.get(key) || {
      group: key,
      evidenceFamilies: new Set(),
      rawProviders: new Set(),
      parentEngines: new Set(),
      items: [],
      internalOpinion: key === INTERNAL_AI_GROUP,
    };
    current.items.push(item);
    current.evidenceFamilies.add(item.evidenceFamily);
    current.rawProviders.add(lower(item.rawProvider));
    current.parentEngines.add(lower(item.parentEngine));
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => {
    const averageScore = Math.round(clamp(average(group.items.map((item) => item.score))));
    const averageConfidence = Number((average(group.items.map((item) => item.confidence)) || 0).toFixed(2));
    return {
      group: group.group,
      evidenceFamilies: [...group.evidenceFamilies].filter(Boolean).sort(),
      rawProviders: [...group.rawProviders].filter(Boolean).sort(),
      parentEngines: [...group.parentEngines].filter(Boolean).sort(),
      evidenceCount: group.items.length,
      averageScore,
      cappedContribution: Math.round(clamp(averageScore * Math.min(1, 0.55 + group.rawProviders.size * 0.15))),
      averageConfidence,
      internalOpinion: group.internalOpinion,
      status:
        averageScore >= 65 && group.rawProviders.size >= 1
          ? "CONFIRMED"
          : averageScore >= 35
            ? "PARTIAL"
            : "THIN",
    };
  });
}

function requiredQuorum(groups = []) {
  const confirmed = new Set(
    groups
      .filter((group) => group.status === "CONFIRMED" && !group.internalOpinion)
      .map((group) => group.group)
  );
  const partial = new Set(
    groups
      .filter((group) => ["CONFIRMED", "PARTIAL"].includes(group.status) && !group.internalOpinion)
      .map((group) => group.group)
  );
  const missing = [];

  for (const options of REQUIRED_GROUP_SETS) {
    if (options.some((group) => confirmed.has(group))) continue;
    missing.push(options.join("|"));
  }

  return {
    requiredSets: REQUIRED_GROUP_SETS,
    confirmedGroups: [...confirmed].sort(),
    partialGroups: [...partial].sort(),
    missingRequiredGroups: missing,
    passed: missing.length === 0,
  };
}

export function buildEvidenceLineage(project = {}) {
  const items = [
    ...scoreFieldLineage(project),
    ...sourceLineage(project),
    ...(Array.isArray(project.evidence) ? project.evidence : []).map(evidenceItemLineage),
  ];
  const groups = summarizeGroups(items);
  const externalGroups = groups.filter((group) => !group.internalOpinion);
  const confirmedExternalGroups = externalGroups.filter((group) => group.status === "CONFIRMED");
  const internalOpinionCount = items.filter((item) => item.internalOpinion).length;
  const correlatedGroups = groups.filter((group) => group.evidenceCount >= 4 || group.parentEngines.length >= 4);
  const correlationPenalty = Math.round(
    clamp(
      correlatedGroups.reduce((sum, group) => sum + Math.max(0, group.evidenceCount - 2) * 2.5, 0) +
        internalOpinionCount * 1.5,
      0,
      35
    )
  );
  const quorum = requiredQuorum(groups);
  const weightedIndependentScore = Math.round(clamp(average(externalGroups.map((group) => group.cappedContribution)) - correlationPenalty));
  const effectiveIndependentEvidenceCount = Number(
    (
      confirmedExternalGroups.length +
      externalGroups.filter((group) => group.status === "PARTIAL").length * 0.5
    ).toFixed(1)
  );

  return {
    schemaVersion: "evidence-lineage-correlation-v1",
    status: quorum.passed ? "QUORUM_PASSED" : "QUORUM_INCOMPLETE",
    evidenceItems: items.slice(0, 150),
    groups: groups.sort((a, b) => b.cappedContribution - a.cappedContribution),
    effectiveIndependentEvidenceCount,
    internalOpinionCount,
    correlatedGroupCount: correlatedGroups.length,
    correlatedGroups: correlatedGroups.map((group) => group.group),
    correlationPenalty,
    weightedIndependentScore,
    requiredQuorum: quorum,
    warnings: [
      ...(internalOpinionCount ? [`${internalOpinionCount} internal AI opinion signals excluded from independent evidence count.`] : []),
      ...(correlatedGroups.length ? [`${correlatedGroups.length} correlated evidence groups capped to reduce double counting.`] : []),
      ...quorum.missingRequiredGroups.map((group) => `Missing independent evidence quorum for ${group}.`),
    ],
  };
}

export function analyzeEvidenceLineageCorrelation(project = {}) {
  const evidenceLineage = buildEvidenceLineage(project);
  const missing = evidenceLineage.requiredQuorum.missingRequiredGroups;
  return {
    ...project,
    evidenceLineage,
    evidenceLineageStatus: evidenceLineage.status,
    evidenceLineageQualified: evidenceLineage.requiredQuorum.passed,
    effectiveIndependentEvidenceCount: evidenceLineage.effectiveIndependentEvidenceCount,
    evidenceCorrelationPenalty: evidenceLineage.correlationPenalty,
    evidenceIndependentScore: evidenceLineage.weightedIndependentScore,
    evidenceLineageMissingRequiredGroups: missing,
    evidenceLineageWarnings: evidenceLineage.warnings,
  };
}

export function analyzeEvidenceLineageCorrelationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeEvidenceLineageCorrelation(project));
}
