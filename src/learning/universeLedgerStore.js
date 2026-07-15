import fs from "fs";
import path from "path";
import { attachProjectIdentity, identityKeyForProject } from "../discovery/projectIdentityGraph.js";

const DATA_DIR = path.resolve("data");
const LEDGER_FILE = path.join(DATA_DIR, "universe-ledger.json");
const MAX_PROJECTS = Number(process.env.MAX_UNIVERSE_LEDGER_PROJECTS || 100000);
const MAX_HISTORY = Number(process.env.MAX_UNIVERSE_LEDGER_HISTORY || 24);

const EVIDENCE_FAMILIES = [
  "identity",
  "safety",
  "liquidity",
  "buyerQuality",
  "smartParticipants",
  "development",
  "productDelivery",
  "adoption",
  "revenue",
  "catalysts",
  "tokenEconomics",
  "marketStructure",
  "narrative",
  "manipulationRisk",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyLedger() {
  return {
    generatedAt: null,
    ledgerVersion: "universe-ledger-v1",
    projects: {},
    indexes: {
      finalStates: {},
      lifecycleStates: {},
      funnelStages: {},
      riskClasses: {},
      chains: {},
      sources: {},
    },
  };
}

function normalizeLedger(parsed = {}) {
  return {
    generatedAt: parsed.generatedAt || null,
    ledgerVersion: parsed.ledgerVersion || "universe-ledger-v1",
    projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    indexes: {
      finalStates:
        parsed.indexes?.finalStates && typeof parsed.indexes.finalStates === "object"
          ? parsed.indexes.finalStates
          : {},
      lifecycleStates:
        parsed.indexes?.lifecycleStates && typeof parsed.indexes.lifecycleStates === "object"
          ? parsed.indexes.lifecycleStates
          : {},
      funnelStages:
        parsed.indexes?.funnelStages && typeof parsed.indexes.funnelStages === "object"
          ? parsed.indexes.funnelStages
          : {},
      riskClasses:
        parsed.indexes?.riskClasses && typeof parsed.indexes.riskClasses === "object"
          ? parsed.indexes.riskClasses
          : {},
      chains:
        parsed.indexes?.chains && typeof parsed.indexes.chains === "object"
          ? parsed.indexes.chains
          : {},
      sources:
        parsed.indexes?.sources && typeof parsed.indexes.sources === "object"
          ? parsed.indexes.sources
          : {},
    },
  };
}

function readLedger() {
  ensureDataDir();

  if (!fs.existsSync(LEDGER_FILE)) return emptyLedger();

  try {
    return normalizeLedger(JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")));
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger = emptyLedger()) {
  ensureDataDir();
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(normalizeLedger(ledger), null, 2));
}

function sourceList(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source || source.type),
  ]
    .filter(Boolean)
    .map((source) => String(source).trim().toLowerCase())
    .filter(Boolean);
}

function hasIdentity(project = {}) {
  const identity = project.projectIdentity || attachProjectIdentity(project).projectIdentity;
  const resolvingEvidence = (identity.evidence || []).filter((item) => item !== "symbol");
  return resolvingEvidence.length > 0;
}

function hasAnyScore(project = {}, keys = [], threshold = 55) {
  return keys.some((key) => num(project[key]) >= threshold);
}

function evidenceFamilyStatus(project = {}) {
  const identity = project.projectIdentity || attachProjectIdentity(project).projectIdentity;
  const resolvingIdentityEvidence = (identity.evidence || []).filter((item) => item !== "symbol");
  const sources = sourceList(project);
  const statuses = {
    identity: {
      status: hasIdentity(project) ? "confirmed" : "missing",
      score: clamp(resolvingIdentityEvidence.length * 18 + (project.identityVerified ? 30 : 0)),
      evidence: identity.evidence || [],
    },
    safety: {
      status:
        project.instantSafetyStatus === "PASS" || project.contractVerified || num(project.instantSafetyScore) >= 60
          ? "confirmed"
          : num(project.instantSafetyRiskScore) >= 60
          ? "risk"
          : "missing",
      score: clamp(project.instantSafetyScore || (project.contractVerified ? 70 : 0)),
      evidence: [project.instantSafetyStatus, project.contractVerified ? "contractVerified" : ""].filter(Boolean),
    },
    liquidity: {
      status:
        num(project.liquidityUsd ?? project.liquidity) > 0 || hasAnyScore(project, ["liquidityScore", "liquidityExpansionScore", "activeLiquidityTruthScore"])
          ? "confirmed"
          : "missing",
      score: clamp(
        Math.log10(Math.max(1, num(project.liquidityUsd ?? project.liquidity))) * 12 +
          num(project.liquidityScore || project.liquidityExpansionScore || project.activeLiquidityTruthScore) * 0.55
      ),
      evidence: [
        num(project.liquidityUsd ?? project.liquidity) > 0 ? "liquidityUsd" : "",
        num(project.activeLiquidityTruthScore) > 0 ? "activeLiquidityTruth" : "",
      ].filter(Boolean),
    },
    buyerQuality: {
      status: hasAnyScore(project, ["organicBuyerScore", "buyerRetentionScore", "holderGrowthScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.organicBuyerScore, project.buyerRetentionScore, project.holderGrowthScore]),
      evidence: ["organicBuyerScore", "buyerRetentionScore", "holderGrowthScore"].filter((key) => num(project[key]) > 0),
    },
    smartParticipants: {
      status: hasAnyScore(project, ["smartMoneyAccumulationScore", "smartWalletScore", "smartWalletArrivalScore"], 50)
        ? "confirmed"
        : num(project.walletClusterRiskScore) >= 60
        ? "risk"
        : "missing",
      score: clamp(
        average([project.smartMoneyAccumulationScore, project.smartWalletScore, project.smartWalletArrivalScore]) -
          num(project.walletClusterRiskScore) * 0.25
      ),
      evidence: ["smartMoneyAccumulationScore", "smartWalletScore", "smartWalletArrivalScore"].filter((key) => num(project[key]) > 0),
    },
    development: {
      status: hasAnyScore(project, ["githubProScore", "githubScore", "developerActivityScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.githubProScore, project.githubScore, project.developerActivityScore]),
      evidence: ["githubProScore", "githubScore", "developerActivityScore"].filter((key) => num(project[key]) > 0),
    },
    productDelivery: {
      status: hasAnyScore(project, ["roadmapProfitabilityScore", "liveCatalystRadarScore", "projectChangeScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.roadmapProfitabilityScore, project.liveCatalystRadarScore, project.projectChangeScore]),
      evidence: ["roadmapProfitabilityScore", "liveCatalystRadarScore", "projectChangeScore"].filter((key) => num(project[key]) > 0),
    },
    adoption: {
      status: hasAnyScore(project, ["organicDemandScore", "communityGrowthScore", "buyerRetentionScore", "holderGrowthScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.organicDemandScore, project.communityGrowthScore, project.buyerRetentionScore, project.holderGrowthScore]),
      evidence: ["organicDemandScore", "communityGrowthScore", "buyerRetentionScore", "holderGrowthScore"].filter((key) => num(project[key]) > 0),
    },
    revenue: {
      status: num(project.revenueScore || project.protocolRevenueScore || project.fees24h) > 0 ? "confirmed" : "missing",
      score: clamp(project.revenueScore || project.protocolRevenueScore || Math.log10(Math.max(1, num(project.fees24h))) * 12),
      evidence: ["revenueScore", "protocolRevenueScore", "fees24h"].filter((key) => num(project[key]) > 0),
    },
    catalysts: {
      status: hasAnyScore(project, ["catalystScore", "catalystCalendarScore", "liveCatalystRadarScore", "exchangeProbabilityScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.catalystScore, project.catalystCalendarScore, project.liveCatalystRadarScore, project.exchangeProbabilityScore]),
      evidence: ["catalystScore", "catalystCalendarScore", "liveCatalystRadarScore", "exchangeProbabilityScore"].filter((key) => num(project[key]) > 0),
    },
    tokenEconomics: {
      status:
        hasAnyScore(project, ["tokenomicsScore"], 50) ||
        num(project.tokenUnlockRiskScore || project.vestingPressureScore) > 0
          ? num(project.tokenUnlockRiskScore || project.vestingPressureScore) >= 65
            ? "risk"
            : "confirmed"
          : "missing",
      score: clamp(num(project.tokenomicsScore) - Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)) * 0.35),
      evidence: ["tokenomicsScore", "tokenUnlockRiskScore", "vestingPressureScore"].filter((key) => num(project[key]) > 0),
    },
    marketStructure: {
      status: num(project.volume24h ?? project.volume) > 0 || hasAnyScore(project, ["marketRankScore", "relativeStrengthScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([
        project.marketRankScore,
        project.relativeStrengthScore,
        Math.log10(Math.max(1, num(project.volume24h ?? project.volume))) * 10,
      ]),
      evidence: ["marketRankScore", "relativeStrengthScore", "volume24h"].filter((key) => key === "volume24h" ? num(project.volume24h ?? project.volume) > 0 : num(project[key]) > 0),
    },
    narrative: {
      status: hasAnyScore(project, ["narrativeHeatScore", "narrativeForecastScore", "narrativeScore", "xSocialScore"], 50)
        ? "confirmed"
        : "missing",
      score: average([project.narrativeHeatScore, project.narrativeForecastScore, project.narrativeScore, project.xSocialScore]),
      evidence: ["narrativeHeatScore", "narrativeForecastScore", "narrativeScore", "xSocialScore"].filter((key) => num(project[key]) > 0),
    },
    manipulationRisk: {
      status: manipulationRisk(project) >= 60 ? "risk" : "clear",
      score: manipulationRisk(project),
      evidence: ["trapRiskScore", "walletClusterRiskScore", "washTradingRiskScore", "bundledLaunchRiskScore"].filter((key) => num(project[key]) > 0),
    },
  };

  return Object.fromEntries(EVIDENCE_FAMILIES.map((family) => [family, statuses[family]]));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function manipulationRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.walletClusterRiskScore),
    num(project.washTradingRiskScore),
    num(project.bundledLaunchRiskScore),
    num(project.economicIntegrityRiskScore),
    num(project.organicDemandFirewallRisk)
  );
}

function aggregateRisk(project = {}) {
  return Math.max(
    manipulationRisk(project),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.instantSafetyRiskScore),
    num(project.deployerRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore)
  );
}

function riskClass(project = {}) {
  const risk = aggregateRisk(project);
  if (risk >= 80) return "critical";
  if (risk >= 65) return "high";
  if (risk >= 45) return "medium";
  if (risk > 0) return "low";
  return "unknown";
}

function dataCoverageScore(families = {}) {
  const confirmed = Object.values(families).filter((family) => family.status === "confirmed" || family.status === "clear").length;
  const risky = Object.values(families).filter((family) => family.status === "risk").length;
  return Math.round(clamp((confirmed / EVIDENCE_FAMILIES.length) * 100 - risky * 3));
}

function lifecycleState(project = {}, finalState = "DEFERRED") {
  if (["BLOCKED", "INVALIDATED"].includes(finalState)) return "INVALIDATED";
  if (project.prePump?.status === "ALREADY_PUMPED" || project.preBreakoutMomentumStage === "ALREADY_PUMPED") return "LATE_CHASE";
  if (project.prePump?.status === "LATE_CHASE" || project.preBreakoutMomentumStage === "LATE_CHASE") return "LATE_CHASE";
  if (aggregateRisk(project) >= 80) return "INVALIDATED";
  if (project.sniperState) return project.sniperState;
  if (project.autonomousCausalProjectState === "ARMED" || project.finalSelectionState === "QUALIFIED") return "ARMED";
  if (hasAnyScore(project, ["developerActivityScore", "githubProScore", "organicBuyerScore", "buyerRetentionScore"], 65)) {
    return "FUNDAMENTALS_ACCELERATING";
  }
  if (hasAnyScore(project, ["quietAccumulationScore", "smartMoneyAccumulationScore"], 65)) return "QUIET_ACCUMULATION";
  if (num(project.liquidityUsd ?? project.liquidity) > 0 || hasAnyScore(project, ["liquidityScore", "liquidityExpansionScore"], 50)) {
    return "LIQUIDITY_FORMING";
  }
  if (hasIdentity(project)) return "FORMING";
  return "IDENTITY_PENDING";
}

function finalDecision(project = {}, context = {}) {
  const rejected = Boolean(context.rejected);
  const selected = Boolean(context.selected);
  const families = context.evidenceFamilies || evidenceFamilyStatus(project);
  const coverage = dataCoverageScore(families);
  const risk = aggregateRisk(project);
  const blockers = [];
  const warnings = [];

  if (!hasIdentity(project)) blockers.push("canonical identity unresolved");
  if (families.safety.status === "risk") blockers.push("safety family has active risk");
  if (families.liquidity.status === "missing" && project.discoveryLane !== "prelaunch") warnings.push("liquidity evidence missing");
  if (families.manipulationRisk.status === "risk") blockers.push("manipulation-risk family active");
  if (risk >= 80) blockers.push("critical aggregate risk");
  if (rejected) blockers.push("failed discovery quality gate");
  if (coverage < 25) warnings.push("low data coverage");

  let finalState = "DEFERRED";
  let funnelStage = "UNIVERSAL_BASELINE";
  let reason = "baseline recorded; awaiting more independent evidence";

  if (blockers.length) {
    finalState = "BLOCKED";
    funnelStage = "BLOCKED";
    reason = blockers[0];
  } else if (selected) {
    finalState = "PROMOTED";
    funnelStage = "DEEP_SNIPER_QUEUE";
    reason = "ranked inside current scan cap after universal baseline";
  } else if (coverage >= 45 && risk < 65) {
    finalState = "RESEARCH_ONLY";
    funnelStage = "COMPETITIVE_ANALYSIS";
    reason = "credible baseline but not selected for expensive research in this scan";
  }

  return {
    finalState,
    finalQualified: finalState === "PROMOTED" && risk < 65,
    finalConfidence:
      coverage >= 75 && risk < 45 ? "High" : coverage >= 55 ? "Medium" : coverage >= 30 ? "Developing" : "Low",
    finalBlockingReasons: blockers,
    finalWarningReasons: warnings,
    finalEvidenceFamilies: families,
    finalInvalidationConditions: [
      "identity conflict appears",
      "safety family becomes restricted or critical",
      "liquidity disappears or hard-exit liquidity deteriorates",
      "manipulation-risk family becomes active",
      "source agreement collapses below minimum coverage",
    ],
    funnelStage,
    reason,
  };
}

function compactBaseline(project = {}) {
  return {
    priceUsd: num(project.priceUsd ?? project.price),
    liquidityUsd: num(project.liquidityUsd ?? project.liquidity),
    volume24h: num(project.volume24h ?? project.volume),
    marketCap: num(project.circulatingMarketCap ?? project.marketCap),
    fdv: num(project.fdv ?? project.fullyDilutedValue),
    priceChange24h: num(project.priceChange24h),
    discoveryPriorityScore: num(project.discoveryPriorityScore),
    independentEvidenceScore: num(project.independentEvidenceScore),
    dataCoverageScore: num(project.dataCoverageScore),
  };
}

export function buildUniverseLedgerRecord(project = {}, context = {}) {
  const enriched = attachProjectIdentity(project);
  const identityKey = identityKeyForProject(enriched);
  const families = evidenceFamilyStatus(enriched);
  const decision = finalDecision(enriched, { ...context, evidenceFamilies: families });
  const coverage = dataCoverageScore(families);
  const state = lifecycleState(enriched, decision.finalState);
  const observedAt = context.observedAt || new Date().toISOString();

  return {
    projectId: enriched.projectId,
    identityKey,
    canonicalIdentity: {
      projectId: enriched.projectId,
      identityKey,
      name: enriched.name || "Unknown",
      symbol: enriched.symbol || "UNKNOWN",
      symbolIdentity: enriched.symbolIdentity || null,
      symbolIdentityId: enriched.symbolIdentityId || null,
      chainSymbolIdentityId: enriched.chainSymbolIdentityId || null,
      symbolInstanceId: enriched.symbolInstanceId || null,
      chain: enriched.chain || "unknown",
      evidence: enriched.projectIdentity?.evidence || [],
      tokenContracts: enriched.projectIdentity?.tokenContracts || [],
      poolAddresses: enriched.projectIdentity?.poolAddresses || [],
      externalAssetIds: enriched.projectIdentity?.externalAssetIds || [],
      exchangeAssetIds: enriched.projectIdentity?.exchangeAssetIds || [],
      domains: enriched.projectIdentity?.domains || [],
      repositories: enriched.projectIdentity?.repositories || [],
    },
    baselineScan: compactBaseline({
      ...enriched,
      dataCoverageScore: coverage,
    }),
    dataCoverageScore: coverage,
    riskClass: riskClass(enriched),
    aggregateRiskScore: aggregateRisk(enriched),
    lifecycleState: state,
    sourceCoverage: {
      sources: [...new Set(sourceList(enriched))],
      sourceCount: new Set(sourceList(enriched)).size,
    },
    finalState: decision.finalState,
    finalQualified: decision.finalQualified,
    finalConfidence: decision.finalConfidence,
    finalBlockingReasons: decision.finalBlockingReasons,
    finalWarningReasons: decision.finalWarningReasons,
    finalEvidenceFamilies: decision.finalEvidenceFamilies,
    finalInvalidationConditions: decision.finalInvalidationConditions,
    processing: {
      stage: decision.funnelStage,
      reason: decision.reason,
      selectedForDeepResearch: Boolean(context.selected),
      rejectedByDiscoveryGate: Boolean(context.rejected),
      rank: context.rank || null,
    },
    firstSeenAt: enriched.discoveredAt || observedAt,
    lastSeenAt: observedAt,
  };
}

function addIndex(index = {}, key = "", projectId = "") {
  const normalized = String(key || "unknown").toLowerCase();
  const current = index[normalized] || { count: 0, projects: [] };
  const projects = [...new Set([...(current.projects || []), projectId])].slice(-1000);
  index[normalized] = {
    count: projects.length,
    projects,
  };
}

function rebuildIndexes(projects = {}) {
  const indexes = emptyLedger().indexes;

  for (const [projectId, profile] of Object.entries(projects)) {
    const latest = profile.latest || {};
    addIndex(indexes.finalStates, latest.finalState, projectId);
    addIndex(indexes.lifecycleStates, latest.lifecycleState, projectId);
    addIndex(indexes.funnelStages, latest.processing?.stage, projectId);
    addIndex(indexes.riskClasses, latest.riskClass, projectId);
    addIndex(indexes.chains, latest.canonicalIdentity?.chain, projectId);
    for (const source of latest.sourceCoverage?.sources || []) addIndex(indexes.sources, source, projectId);
  }

  return indexes;
}

function trimProjects(projects = {}) {
  return Object.fromEntries(
    Object.entries(projects)
      .sort(([, a], [, b]) => Date.parse(b.latest?.lastSeenAt || 0) - Date.parse(a.latest?.lastSeenAt || 0))
      .slice(0, MAX_PROJECTS)
  );
}

export function buildUniverseLedgerSnapshot(projects = [], context = {}) {
  const selectedKeys = new Set((context.selected || []).map((project) => identityKeyForProject(project)));
  const rejectedKeys = new Set((context.rejected || []).map((project) => identityKeyForProject(project)));
  const rankByKey = new Map((context.ranked || []).map((project, index) => [identityKeyForProject(project), index + 1]));
  const observedAt = context.observedAt || new Date().toISOString();
  const safeProjects = Array.isArray(projects) ? projects : [];
  const records = safeProjects.map((project) => {
    const key = identityKeyForProject(project);
    return buildUniverseLedgerRecord(project, {
      observedAt,
      selected: selectedKeys.has(key),
      rejected: rejectedKeys.has(key),
      rank: rankByKey.get(key),
    });
  });

  return {
    observedAt,
    records,
    totals: summarizeRecords(records, context.targetCandidates || 0),
  };
}

function summarizeRecords(records = [], targetCandidates = 0) {
  const count = (predicate) => records.filter(predicate).length;
  const by = (key) =>
    records.reduce((acc, record) => {
      const value = key(record) || "unknown";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

  return {
    totalProjects: records.length,
    targetCandidates,
    targetMet: targetCandidates > 0 ? records.length >= targetCandidates : false,
    targetShortfall: targetCandidates > 0 ? Math.max(0, targetCandidates - records.length) : 0,
    promoted: count((record) => record.finalState === "PROMOTED"),
    researchOnly: count((record) => record.finalState === "RESEARCH_ONLY"),
    deferred: count((record) => record.finalState === "DEFERRED"),
    blocked: count((record) => record.finalState === "BLOCKED"),
    finalQualified: count((record) => record.finalQualified),
    lowCoverage: count((record) => record.dataCoverageScore < 30),
    highRisk: count((record) => ["high", "critical"].includes(record.riskClass)),
    byFinalState: by((record) => record.finalState),
    byLifecycleState: by((record) => record.lifecycleState),
    byFunnelStage: by((record) => record.processing?.stage),
    byRiskClass: by((record) => record.riskClass),
  };
}

export function loadUniverseLedger() {
  return readLedger();
}

export function saveUniverseLedger(projects = [], context = {}) {
  const ledger = readLedger();
  const snapshot = buildUniverseLedgerSnapshot(projects, context);

  for (const record of snapshot.records) {
    const previous = ledger.projects[record.projectId] || {
      projectId: record.projectId,
      firstSeenAt: record.firstSeenAt,
      history: [],
      observations: 0,
    };

    ledger.projects[record.projectId] = {
      ...previous,
      projectId: record.projectId,
      firstSeenAt: previous.firstSeenAt || record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      observations: num(previous.observations) + 1,
      latest: record,
      history: [...(previous.history || []), {
        at: record.lastSeenAt,
        finalState: record.finalState,
        lifecycleState: record.lifecycleState,
        funnelStage: record.processing?.stage,
        riskClass: record.riskClass,
        dataCoverageScore: record.dataCoverageScore,
        aggregateRiskScore: record.aggregateRiskScore,
      }].slice(-MAX_HISTORY),
    };
  }

  ledger.generatedAt = snapshot.observedAt;
  ledger.projects = trimProjects(ledger.projects);
  ledger.indexes = rebuildIndexes(ledger.projects);
  writeLedger(ledger);

  return {
    file: LEDGER_FILE,
    generatedAt: snapshot.observedAt,
    savedProjects: snapshot.records.length,
    trackedProjects: Object.keys(ledger.projects).length,
    totals: snapshot.totals,
  };
}

function topIndex(index = {}, limit = 12) {
  return Object.entries(index)
    .map(([id, value]) => ({
      id,
      count: num(value.count),
      projects: value.projects || [],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function summarizeUniverseLedger(ledger = readLedger()) {
  const normalized = normalizeLedger(ledger);
  const profiles = Object.values(normalized.projects);
  const latestRecords = profiles.map((profile) => profile.latest).filter(Boolean);

  return {
    file: LEDGER_FILE,
    generatedAt: normalized.generatedAt,
    ledgerVersion: normalized.ledgerVersion,
    trackedProjects: profiles.length,
    totals: summarizeRecords(latestRecords),
    indexes: {
      finalStates: topIndex(normalized.indexes.finalStates),
      lifecycleStates: topIndex(normalized.indexes.lifecycleStates),
      funnelStages: topIndex(normalized.indexes.funnelStages),
      riskClasses: topIndex(normalized.indexes.riskClasses),
      chains: topIndex(normalized.indexes.chains),
      sources: topIndex(normalized.indexes.sources),
    },
    topPromoted: latestRecords
      .filter((record) => record.finalState === "PROMOTED")
      .sort((a, b) => num(b.baselineScan?.discoveryPriorityScore) - num(a.baselineScan?.discoveryPriorityScore))
      .slice(0, 50),
    topBlocked: latestRecords
      .filter((record) => record.finalState === "BLOCKED")
      .sort((a, b) => num(b.aggregateRiskScore) - num(a.aggregateRiskScore))
      .slice(0, 50),
    lowCoverage: latestRecords
      .filter((record) => record.dataCoverageScore < 30)
      .slice(0, 50),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeUniverseLedger(), null, 2));
}
