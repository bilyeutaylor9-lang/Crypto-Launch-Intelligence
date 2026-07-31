import fs from "fs";
import path from "path";

import { isLiveExecutionReady } from "../execution/routeTruthV2.js";

const DEFAULT_LIMIT = 5;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function max(values = []) {
  return Math.max(0, ...values.map(num).filter(Number.isFinite));
}

function hasNumber(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function routeVerified(project = {}) {
  return isLiveExecutionReady(project);
}

function deterministicSafetyBlocked(project = {}) {
  const hardText = [
    project.finalSelectionState,
    project.instantSafetyStatus,
    project.riskVerdict,
    project.routeVerdict,
    ...array(project.finalBlockingReasons),
    ...array(project.opportunityHardBlockers),
    ...array(project.smallCapHunter?.blockers),
    ...array(project.proofOfAlphaExecutionTwin?.safety?.blockers),
  ]
    .map(lower)
    .join(" ");

  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.blacklistEnabled === true ||
      num(project.honeypotRiskScore) >= 85 ||
      num(project.washTradingRiskScore ?? project.washTradingScore) >= 85 ||
      num(project.trapRiskScore) >= 90 ||
      num(project.contractRiskScore) >= 90 ||
      /\bhoneypot|verified scam|rug|sell blocked|cannot sell|contract mismatch|chain mismatch|critical safety/.test(hardText)
  );
}

function opportunityScore(project = {}) {
  return Math.round(
    max([
      project.progressiveOpportunityScore,
      project.moneyRankScore,
      project.pipelineScore,
      project.confidenceAdjustedScore,
      project.marketOpportunityScore,
      project.earlyAsymmetryResearchPriorityScore,
      project.quantumOpportunityScore,
      project.smallCapHunterScore,
      project.preBreakoutRadarScore,
      project.capitalMigrationScore,
      project.breakoutBrainScore,
    ])
  );
}

function rankScore(project = {}) {
  return Math.round(
    clamp(
      max([
        project.moneyRankScore,
        project.progressiveOpportunityScore,
        project.pipelineScore,
        project.confidenceAdjustedScore,
      ]) * 0.42 +
        max([
          project.earlyAsymmetryResearchPriorityScore,
          project.preBreakoutRadarScore,
          project.smallCapHunterScore,
          project.capitalMigrationScore,
          project.quantumOpportunityScore,
        ]) * 0.34 +
        max([
          project.sourceTruthScore,
          project.sourceReliabilityScore,
          project.identityResolutionScore,
          project.projectIdentityScore,
          project.dataConfidenceScore,
        ]) * 0.14 +
        max([
          project.executionScore,
          project.proofOfAlphaExecutionTwinScore,
          project.smallCapExecutionScore,
        ]) * 0.10
    )
  );
}

function scoreByCategory(project = {}, key = "") {
  switch (key) {
    case "sniperReady":
      return max([project.progressiveOpportunityScore, project.sniperScore, project.sniperIntegrityScore]);
    case "earlyHighConviction":
      return max([project.moneyRankScore, project.progressiveOpportunityScore, project.confidenceAdjustedScore]);
    case "emergingRadar":
      return max([project.progressiveOpportunityScore, project.earlyAsymmetryResearchPriorityScore, project.attentionGapScore]);
    case "executionReady":
      return max([project.executionScore, project.proofOfAlphaExecutionTwinScore, project.smallCapExecutionScore]);
    case "smallCap":
      return max([project.smallCapHunterScore, project.smallCapUpsideScore, project.smallCapPreHitPressureScore]);
    case "preBreakout":
      return max([project.preBreakoutRadarScore, project.preBreakoutSequenceScore, project.preBreakoutMomentumScore]);
    case "capitalMigration":
      return max([project.capitalMigrationScore, project.capitalFlowScore, project.capitalMigrationCoreScore]);
    case "quantum":
      return max([
        project.quantumOpportunityScore,
        project.quantumBrainScore,
        project.quantumReasoningBrain?.score,
        project.quantumOutcomeField?.positiveProbability,
      ]);
    case "catalyst":
      return max([project.liveCatalystRadarScore, project.catalystCalendarScore, project.catalystScore, project.roadmapProfitabilityScore]);
    case "githubDevelopment":
      return max([project.githubProScore, project.githubQualityScore, project.developerActivityScore, project.developerAccelerationScore]);
    case "organicDemand":
      return max([project.organicDemandIntegrityScore, project.organicBuyerScore, project.buyerBreadthAccelerationScore, project.buyerRetentionScore]);
    case "sourceTruth":
      return max([project.sourceTruthScore, project.sourceReliabilityScore, project.institutionalDataProvenanceScore, project.dataConfidenceScore]);
    default:
      return opportunityScore(project);
  }
}

function strictResult(project = {}, key = "") {
  switch (key) {
    case "sniperReady":
      return project.opportunityRankingTier === "SNIPER_READY" || project.sniperQualified === true;
    case "earlyHighConviction":
      return project.opportunityRankingTier === "EARLY_HIGH_CONVICTION";
    case "emergingRadar":
      return project.opportunityRankingTier === "EMERGING_RADAR";
    case "executionReady":
      return routeVerified(project) && num(project.executionScore) >= 70;
    case "smallCap":
      return project.smallCapHunterSelected === true || project.smallCapHunter?.executionReady === true;
    case "preBreakout":
      return project.preBreakoutRadarSelected === true || project.preBreakoutRadarLane === "ARMED";
    case "capitalMigration":
      return ["CONFIRMED_EARLY_FLOW", "TWO_X_ASYMMETRIC_WATCH"].includes(project.capitalMigrationLane);
    case "quantum":
      return Boolean(project.quantumOutcomeField) && scoreByCategory(project, key) >= 70;
    case "catalyst":
      return scoreByCategory(project, key) >= 70;
    case "githubDevelopment":
      return scoreByCategory(project, key) >= 70;
    case "organicDemand":
      return scoreByCategory(project, key) >= 70;
    case "sourceTruth":
      return scoreByCategory(project, key) >= 70;
    default:
      return false;
  }
}

function fallbackCandidate(project = {}, key = "") {
  if (deterministicSafetyBlocked(project)) return false;
  if (strictResult(project, key)) return false;
  if (rankScore(project) <= 0 && opportunityScore(project) <= 0 && scoreByCategory(project, key) <= 0) return false;

  switch (key) {
    case "sniperReady":
      return opportunityScore(project) >= 45;
    case "earlyHighConviction":
      return opportunityScore(project) >= 40 || scoreByCategory(project, key) >= 40;
    case "emergingRadar":
      return opportunityScore(project) >= 25 || scoreByCategory(project, key) >= 25;
    case "executionReady":
      return scoreByCategory(project, key) >= 10 || routeVerified(project) || clean(project.executionStatus || project.executionProof?.executionStatus);
    case "smallCap":
      return Boolean(project.smallCapHunter) || scoreByCategory(project, key) > 0;
    case "preBreakout":
      return scoreByCategory(project, key) > 0 || ["WATCH", "RESEARCH"].includes(project.preBreakoutRadarLane);
    case "capitalMigration":
      return scoreByCategory(project, key) > 0 || clean(project.capitalMigrationLane);
    case "quantum":
      return Boolean(project.quantumOutcomeField || project.quantumReasoningBrain);
    case "catalyst":
    case "githubDevelopment":
    case "organicDemand":
    case "sourceTruth":
      return scoreByCategory(project, key) > 0;
    default:
      return false;
  }
}

function researchBackfillCandidate(project = {}) {
  if (deterministicSafetyBlocked(project)) return false;
  return Boolean(
    project.symbol ||
      project.name ||
      rankScore(project) > 0 ||
      opportunityScore(project) > 0 ||
      hasNumber(project.pipelineScore)
  );
}

const CATEGORY_DEFINITIONS = [
  {
    key: "sniperReady",
    label: "Sniper Ready",
    emptyReason: "No candidate passed every strict sniper, trust, safety, and execution gate.",
  },
  {
    key: "earlyHighConviction",
    label: "Early High Conviction",
    emptyReason: "No candidate reached the strict high-conviction tier with enough independent proof.",
  },
  {
    key: "emergingRadar",
    label: "Emerging Radar",
    emptyReason: "No candidate reached the strict emerging radar tier.",
  },
  {
    key: "executionReady",
    label: "Execution Ready",
    emptyReason: "No candidate has a verified fresh buy and sell route with enough execution score.",
  },
  {
    key: "smallCap",
    label: "Small-Cap Hunter",
    emptyReason: "No small-cap candidate passed the strict selection gate.",
  },
  {
    key: "preBreakout",
    label: "Pre-Breakout Radar",
    emptyReason: "No candidate reached the strict ARMED pre-breakout lane.",
  },
  {
    key: "capitalMigration",
    label: "Capital Migration",
    emptyReason: "No candidate reached confirmed early-flow or asymmetric-watch status.",
  },
  {
    key: "quantum",
    label: "Quantum Research",
    emptyReason: "No candidate reached the high quantum research score threshold.",
  },
  {
    key: "catalyst",
    label: "Catalyst Radar",
    emptyReason: "No candidate reached the strict catalyst threshold.",
  },
  {
    key: "githubDevelopment",
    label: "GitHub Development",
    emptyReason: "No candidate reached the strict development threshold.",
  },
  {
    key: "organicDemand",
    label: "Organic Demand",
    emptyReason: "No candidate reached the strict organic demand threshold.",
  },
  {
    key: "sourceTruth",
    label: "Source Truth",
    emptyReason: "No candidate reached the strict source-truth threshold.",
  },
];

function compactCandidate(project = {}, key = "", rank = 0, mode = "STRICT") {
  const missing = [
    ...array(project.missingEvidence),
    ...array(project.moneyMissingEvidence),
    ...array(project.smallCapHunter?.missingEvidence),
    ...array(project.capitalMigrationMissingEvidence),
  ];
  const warnings = [
    ...array(project.finalWarningReasons),
    ...array(project.smallCapHunter?.warnings),
    ...array(project.capitalMigrationWarnings),
  ];
  const blockers = [
    ...array(project.finalBlockingReasons),
    ...array(project.opportunityHardBlockers),
    ...array(project.smallCapHunter?.blockers),
    ...array(project.capitalMigrationBlockers),
  ];

  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.finalChain || project.canonicalChain || "unknown",
    categoryScore: Math.round(scoreByCategory(project, key)),
    opportunityScore: opportunityScore(project),
    rankScore: rankScore(project),
    displayMode: mode,
    researchOnly: mode !== "STRICT" || project.finalSelectionQualified !== true,
    executionReady: routeVerified(project),
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    tier: project.opportunityRankingTier || "UNKNOWN",
    lane: project.progressiveLane || project.fourLaneStatus || project.capitalMigrationLane || "UNKNOWN",
    routeStatus: project.executionStatus || project.executionProof?.executionStatus || project.canonicalExecutionRoute?.status || "UNKNOWN",
    confidence: project.opportunityConfidence || project.confidence || project.capitalMigrationConfidence || "Unknown",
    missingEvidence: [...new Set(missing)].slice(0, 8),
    warnings: [...new Set(warnings)].slice(0, 6),
    blockers: [...new Set(blockers)].slice(0, 6),
    whyShown:
      mode === "STRICT"
        ? "Passed this advertised category's strict gate."
        : mode === "RESEARCH_BACKFILL"
          ? "No category-specific result exists yet; this is a best available non-blocked candidate to investigate for the missing evidence family."
          : "Best available research candidate for this category while strict proof remains incomplete.",
  };
}

function buildCategory(projects = [], definition = {}, limit = DEFAULT_LIMIT) {
  const strict = projects
    .filter((project) => strictResult(project, definition.key) && !deterministicSafetyBlocked(project))
    .sort((a, b) => scoreByCategory(b, definition.key) - scoreByCategory(a, definition.key) || rankScore(b) - rankScore(a))
    .slice(0, limit);
  const strictSet = new Set(strict);
  const fallback = projects
    .filter((project) => !strictSet.has(project) && fallbackCandidate(project, definition.key))
    .sort((a, b) => scoreByCategory(b, definition.key) - scoreByCategory(a, definition.key) || rankScore(b) - rankScore(a))
    .slice(0, limit);
  const fallbackSet = new Set(fallback);
  const backfill = projects
    .filter((project) => !strictSet.has(project) && !fallbackSet.has(project) && researchBackfillCandidate(project))
    .sort((a, b) => rankScore(b) - rankScore(a) || opportunityScore(b) - opportunityScore(a))
    .slice(0, limit);
  const displayed = strict.length ? strict : fallback.length ? fallback : backfill;
  const status =
    strict.length
      ? "STRICT_RESULTS"
      : fallback.length
        ? "RESEARCH_FALLBACK"
        : backfill.length
          ? "RESEARCH_BACKFILL"
          : "NO_RESULTS";

  return {
    key: definition.key,
    label: definition.label,
    status,
    strictCount: strict.length,
    fallbackCount: fallback.length,
    backfillCount: backfill.length,
    displayedCount: displayed.length,
    strictResults: strict.map((project, index) => compactCandidate(project, definition.key, index + 1, "STRICT")),
    researchFallback: fallback.map((project, index) => compactCandidate(project, definition.key, index + 1, "RESEARCH_FALLBACK")),
    researchBackfill: backfill.map((project, index) => compactCandidate(project, definition.key, index + 1, "RESEARCH_BACKFILL")),
    displayedResults: displayed.map((project, index) =>
      compactCandidate(
        project,
        definition.key,
        index + 1,
        strict.length ? "STRICT" : fallback.length ? "RESEARCH_FALLBACK" : "RESEARCH_BACKFILL"
      )
    ),
    emptyStrictGateReason: strict.length ? "" : definition.emptyReason,
    operatorNote:
      status === "STRICT_RESULTS"
        ? "This category has candidates that passed its strict gate."
        : status === "RESEARCH_FALLBACK"
          ? "Strict gate is empty; displayed candidates are research-only and require more proof."
          : status === "RESEARCH_BACKFILL"
            ? "No category-specific result exists; displayed candidates are the best non-blocked research leads for targeted evidence recovery."
            : "No candidate had enough non-blocked evidence for this category in this scan.",
  };
}

export function summarizeAdvertisedCategoryCoverage(projects = [], options = {}) {
  const safe = Array.isArray(projects) ? projects : [];
  const storedClassificationCount = safe.filter((project) =>
    Boolean(
      project.opportunityRankingTier ||
      project.progressiveLane ||
      project.highUpsideScalpLane ||
      project.capitalMigrationLane
    )
  ).length;
  const candidates = [...safe].sort((a, b) => rankScore(b) - rankScore(a));
  const limit = Math.max(1, Math.round(num(options.limit || DEFAULT_LIMIT)));
  const categories = CATEGORY_DEFINITIONS.map((definition) => buildCategory(candidates, definition, limit));
  const categoriesWithAnyResult = categories.filter((category) => category.displayedCount > 0).length;
  const categoriesWithStrictResults = categories.filter((category) => category.status === "STRICT_RESULTS").length;
  const categoriesUsingResearchFallback = categories.filter((category) => category.status === "RESEARCH_FALLBACK").length;
  const categoriesUsingResearchBackfill = categories.filter((category) => category.status === "RESEARCH_BACKFILL").length;
  const emptyCategories = categories.filter((category) => category.status === "NO_RESULTS").length;

  return {
    generatedAt: new Date().toISOString(),
    status:
      emptyCategories === 0
        ? "ALL_ADVERTISED_CATEGORIES_HAVE_RESULTS"
        : categoriesWithAnyResult
          ? "PARTIAL_CATEGORY_COVERAGE"
          : "NO_CATEGORY_RESULTS",
    totalProjects: safe.length,
    storedClassificationCount,
    storedClassificationCoveragePct: safe.length
      ? Math.round((storedClassificationCount / safe.length) * 100)
      : 0,
    reportLayerRecomputation: false,
    advertisedCategoryCount: categories.length,
    categoriesWithAnyResult,
    categoriesWithStrictResults,
    categoriesUsingResearchFallback,
    categoriesUsingResearchBackfill,
    emptyCategories,
    categories,
    operatorNotes: [
      "Strict results are still the only qualified category outputs.",
      "Research fallback results are real scanned candidates, but they are not buys and are not execution-ready unless the route status says so.",
      "Research backfill results mean the category has no direct signal yet, so the scanner is assigning the best safe candidates for targeted evidence recovery.",
      "A category with research fallback is useful for investigation, not promotion.",
      "Deterministic safety blocks such as honeypot, scam, rug, sell restriction, or critical contract mismatch are excluded from fallbacks.",
      "This report consumes stored pipeline decisions and never re-runs ranking engines after report compaction.",
    ],
  };
}

export function writeAdvertisedCategoryCoverageReport(projects = [], meta = {}, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = {
    ...summarizeAdvertisedCategoryCoverage(projects, options),
    scanRunId: meta.scanRunId || meta.runId || null,
    codeCommitSha: meta.codeCommitSha || meta.commitSha || null,
  };
  const filePath = path.join(reportsDir, "advertised-category-coverage.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}

export const ADVERTISED_CATEGORY_DEFINITIONS = CATEGORY_DEFINITIONS;
