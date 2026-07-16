import {
  recordMarketOpportunitySnapshot,
  summarizeMarketOpportunityLearning,
} from "../learning/marketOpportunityLearningStore.js";
import { assembleOpportunityEvidence } from "../opportunity/opportunityEvidenceAssembler.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function boundedAdjustment(value = 0) {
  return Math.max(-4, Math.min(4, num(value)));
}

function hardBlocks(project = {}) {
  const values = [
    ...(Array.isArray(project.opportunityHardBlockers) ? project.opportunityHardBlockers : []),
    ...(Array.isArray(project.hardBlockers) ? project.hardBlockers : []),
    ...(Array.isArray(project.finalBlockingReasons) ? project.finalBlockingReasons : []),
    ...(Array.isArray(project.sniperBlockingReasons) ? project.sniperBlockingReasons : []),
  ];
  return values.filter(Boolean);
}

function scoreBucket(score = 0) {
  if (num(score) >= 75) return "HIGH";
  if (num(score) >= 55) return "MEDIUM";
  return "LOW";
}

function statsById(stats = []) {
  return new Map((Array.isArray(stats) ? stats : []).map((stat) => [stat.id, stat]));
}

function signalFamilies(project = {}) {
  const record = project.opportunityEvidenceRecord || assembleOpportunityEvidence(project);
  const families = new Set();
  for (const signal of Array.isArray(record.signals) ? record.signals : []) {
    if (signal.type) families.add(String(signal.type));
  }
  for (const family of Array.isArray(record.evidenceFamilies) ? record.evidenceFamilies : []) {
    if (family.family) families.add(String(family.family).toUpperCase());
  }
  return [...families];
}

function confidenceLabel(summary = {}) {
  if (num(summary.evaluated) <= 0) return "COLD_START";
  if (num(summary.evaluated) < 10) return "LOW_SAMPLE";
  if (num(summary.evaluated) < 50) return "DEVELOPING";
  return "HIGHER_SAMPLE";
}

function statAdjustment(stat = null, weight = 1) {
  if (!stat || num(stat.evaluated) <= 0) return 0;
  const sampleMultiplier = stat.evaluated >= 10 ? 1 : stat.evaluated >= 3 ? 0.65 : 0.35;
  return ((num(stat.score) - 50) / 12) * weight * sampleMultiplier;
}

function explainStat(stat = null, label = "") {
  if (!stat || num(stat.evaluated) <= 0) return null;
  return `${label} history: ${stat.avgReturnPct}% average return, ${stat.winRate}% win rate across ${stat.evaluated} evaluated receipt(s).`;
}

function learningContext(project = {}, summary = {}) {
  const familyStats = statsById(summary.signalFamilyStats);
  const horizonStats = statsById(summary.horizonStats);
  const timingStats = statsById(summary.timingStats);
  const attentionStats = statsById(summary.attentionGapStats);
  const localAIStats = statsById(summary.localAIStats);
  const record = project.opportunityEvidenceRecord || assembleOpportunityEvidence(project);
  const horizon = record.timeHorizons?.recommended || project.recommendedHorizon || "RESEARCH_ONLY";
  const matchedFamilies = signalFamilies(project)
    .map((family) => familyStats.get(family))
    .filter(Boolean)
    .sort((a, b) => num(b.evaluated) - num(a.evaluated) || num(b.score) - num(a.score))
    .slice(0, 5);
  const timing = timingStats.get(`TIMING_${scoreBucket(project.opportunityTimingScore || record.scores?.timing)}`);
  const attention = attentionStats.get(`ATTENTION_GAP_${scoreBucket(project.attentionGapScore || record.scores?.attentionGap)}`);
  const localAI = localAIStats.get(`LOCAL_AI_${scoreBucket(project.localAIConsensusScore || record.scores?.localAIConsensus)}`);
  const horizonStat = horizonStats.get(horizon);
  const rawAdjustment =
    matchedFamilies.reduce((sum, stat) => sum + statAdjustment(stat, 0.55), 0) +
    statAdjustment(horizonStat, 0.8) +
    statAdjustment(timing, 0.65) +
    statAdjustment(attention, 0.65) +
    statAdjustment(localAI, 0.4);
  const blocks = hardBlocks(project);
  const adjustment = blocks.length ? Math.min(0, boundedAdjustment(rawAdjustment)) : boundedAdjustment(rawAdjustment);
  const hints = [
    ...matchedFamilies.map((stat) => explainStat(stat, stat.id)),
    explainStat(horizonStat, horizon),
    explainStat(timing, "Timing bucket"),
    explainStat(attention, "Attention-gap bucket"),
    explainStat(localAI, "Local-AI bucket"),
  ].filter(Boolean);

  return {
    adjustment: Math.round(adjustment),
    hints: hints.slice(0, 8),
    matchedFamilies: matchedFamilies.map((stat) => ({
      family: stat.id,
      evaluated: stat.evaluated,
      score: stat.score,
      winRate: stat.winRate,
      avgReturnPct: stat.avgReturnPct,
    })),
    horizonStats: horizonStat || null,
    timingStats: timing || null,
    attentionGapStats: attention || null,
    localAIStats: localAI || null,
  };
}

export function analyzeMarketOpportunityLearning(project = {}, context = {}) {
  const summary = context.summary || summarizeMarketOpportunityLearning([], context);
  const confidence = confidenceLabel(summary);
  const learned = learningContext(project, summary);
  const marketOpportunityRank = clamp(project.marketOpportunityRank ?? project.marketOpportunityRankScore);
  const learnedMarketOpportunityRank = Math.round(clamp(marketOpportunityRank + learned.adjustment));
  const learningScore = Math.round(
    clamp(
      50 +
        learned.adjustment * 6 +
        Math.min(18, num(summary.evaluated) * 0.9) +
        (learned.matchedFamilies.length ? 4 : 0)
    )
  );

  return {
    ...project,
    marketOpportunityLearningScore: learningScore,
    marketOpportunityLearningConfidence: confidence,
    marketOpportunityLearningAdjustment: learned.adjustment,
    learnedMarketOpportunityRank,
    marketOpportunityLearningHints:
      learned.hints.length > 0
        ? learned.hints
        : ["No evaluated market-opportunity receipts yet. Collect more scan outcomes before trusting learned weights."],
    marketOpportunityWeightHints: (summary.weightHints || []).slice(0, 10),
    marketOpportunityLearning: {
      score: learningScore,
      confidence,
      adjustment: learned.adjustment,
      learnedMarketOpportunityRank,
      records: summary.records || 0,
      evaluated: summary.evaluated || 0,
      pending: summary.pending || 0,
      matchedFamilies: learned.matchedFamilies,
      horizonStats: learned.horizonStats,
      timingStats: learned.timingStats,
      attentionGapStats: learned.attentionGapStats,
      localAIStats: learned.localAIStats,
      hints: learned.hints,
      disclaimer: "Historical learning is a bounded research hint. It cannot override safety blocks or guarantee an outcome.",
    },
    evidence: [
      ...(Array.isArray(project.evidence) ? project.evidence : []),
      {
        engine: "Market Opportunity Learning Engine",
        signal: "Historical receipts for market-opportunity ranking patterns",
        score: learningScore,
        confidence: confidence === "COLD_START" ? 0.25 : confidence === "LOW_SAMPLE" ? 0.45 : 0.65,
        impact: learned.adjustment > 0 ? "Positive" : learned.adjustment < 0 ? "Negative" : "Neutral",
        reasons:
          learned.hints.length > 0
            ? learned.hints.slice(0, 4)
            : ["The learning loop needs more evaluated receipts before it can nudge ranking confidence."],
      },
    ],
  };
}

export function analyzeMarketOpportunityLearningBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  if (options.recordSnapshot && !options.auditMode) {
    recordMarketOpportunitySnapshot(safeProjects, {
      filePath: options.filePath,
      now: options.now,
      topN: options.topN || 5,
      minHoursBetweenSnapshots: options.minHoursBetweenSnapshots,
    });
  }
  const summary = summarizeMarketOpportunityLearning(safeProjects, {
    filePath: options.filePath,
    now: options.now,
  });

  return safeProjects.map((project) => analyzeMarketOpportunityLearning(project, { summary }));
}
