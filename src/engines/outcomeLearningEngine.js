import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadScanMemory } from "../learning/scanMemoryStore.js";

const FEATURE_KEYS = [
  "marketRank",
  "richToken",
  "prePump",
  "narrative",
  "narrativeForecast",
  "narrativeLaunchStaking",
  "liquidity",
  "liquidityExpansion",
  "momentumShift",
  "capitalFlow",
  "buyPressure",
  "smartMoneyAccumulation",
  "smartWalletPerformance",
  "catalyst",
  "catalystCalendar",
  "xSocial",
  "institutionalWatch",
  "learningEdge",
  "quantumOpportunity",
  "risk",
  "sellPressure",
  "stakingRisk",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function vectorFromProject(project = {}) {
  return {
    marketRank: num(project.marketRankScore),
    richToken: num(project.richTokenScore),
    prePump: num(project.prePump?.score),
    narrative: num(project.narrativeScore),
    narrativeForecast: num(project.narrativeForecastScore),
    narrativeLaunchStaking: num(project.narrativeLaunchStakingScore),
    liquidity: num(project.liquidityScore),
    liquidityExpansion: num(project.liquidityExpansionScore),
    momentumShift: num(project.momentumShiftScore),
    capitalFlow: num(project.capitalFlowScore),
    buyPressure: num(project.buyPressureScore),
    smartMoneyAccumulation: num(project.smartMoneyAccumulationScore),
    smartWalletPerformance: num(project.smartWalletPerformanceScore),
    catalyst: num(project.catalystScore),
    catalystCalendar: num(project.catalystCalendarScore),
    xSocial: num(project.xSocialScore),
    institutionalWatch: num(project.institutionalWatchScore),
    learningEdge: num(project.learningEdgeScore),
    quantumOpportunity: num(project.quantumOpportunityScore),
    risk: num(project.riskScore),
    sellPressure: num(project.sellPressureScore),
    stakingRisk: num(project.stakingRiskScore),
  };
}

function vectorFromRecord(record = {}) {
  const scores = record.scores || {};

  return {
    marketRank: num(scores.marketRank),
    richToken: num(scores.richToken),
    prePump: num(scores.prePump),
    narrative: num(scores.narrative),
    narrativeForecast: num(scores.narrativeForecast),
    narrativeLaunchStaking: num(scores.narrativeLaunchStaking),
    liquidity: num(scores.liquidity),
    liquidityExpansion: num(scores.liquidityExpansion),
    momentumShift: num(scores.momentumShift),
    capitalFlow: num(scores.capitalFlow),
    buyPressure: num(scores.buyPressure),
    smartMoneyAccumulation: num(scores.smartMoneyAccumulation),
    smartWalletPerformance: num(scores.smartWalletPerformance),
    catalyst: num(scores.catalyst),
    catalystCalendar: num(scores.catalystCalendar),
    xSocial: num(scores.xSocial),
    institutionalWatch: num(scores.institutionalWatch),
    learningEdge: num(scores.learningEdge),
    quantumOpportunity: num(scores.quantumOpportunity),
    risk: num(scores.risk),
    sellPressure: num(scores.sellPressure),
    stakingRisk: num(scores.stakingRisk),
  };
}

function cosineSimilarity(a = {}, b = {}) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const key of FEATURE_KEYS) {
    const av = num(a[key]) / 100;
    const bv = num(b[key]) / 100;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA <= 0 || magB <= 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function projectKeyFromRecord(record = {}) {
  return String(record.id || `${record.chain || "unknown"}:${record.symbol || record.name || "unknown"}`).toLowerCase();
}

function buildOutcomeByKey(snapshots = []) {
  const grouped = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot?.key) continue;
    const key = String(snapshot.key).toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), snapshot]);
  }

  const outcomes = new Map();

  for (const [key, projectSnapshots] of grouped.entries()) {
    const ordered = [...projectSnapshots].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const first = ordered[0] || {};
    const last = ordered.at(-1) || {};
    const priceChangePct = pctChange(first.priceUsd, last.priceUsd);
    const marketCapChangePct = pctChange(first.marketCap, last.marketCap);
    const liquidityChangePct = pctChange(first.liquidityUsd, last.liquidityUsd);
    const scoreDelta = num(last.score) - num(first.score);
    const bestMovePct = [priceChangePct, marketCapChangePct, liquidityChangePct]
      .filter((value) => value !== 0)
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0] || priceChangePct;

    outcomes.set(key, {
      key,
      symbol: last.symbol || first.symbol || "Unknown",
      name: last.name || first.name || "Unknown",
      sampleCount: ordered.length,
      priceChangePct,
      marketCapChangePct,
      liquidityChangePct,
      scoreDelta,
      bestMovePct,
      label:
        bestMovePct >= 50 || scoreDelta >= 18
          ? "winner"
          : bestMovePct <= -25 || scoreDelta <= -15
          ? "trap"
          : "neutral",
    });
  }

  return outcomes;
}

function buildTrainingSet(memory = [], snapshots = []) {
  const outcomesByKey = buildOutcomeByKey(snapshots);
  const latestRecordByKey = new Map();

  for (const record of memory) {
    const key = projectKeyFromRecord(record);
    latestRecordByKey.set(key, record);
  }

  return [...latestRecordByKey.entries()]
    .map(([key, record]) => {
      const outcome = outcomesByKey.get(key);
      const fallbackScore = num(record.scores?.pipeline);
      const label = outcome?.label || (fallbackScore >= 80 ? "winner" : fallbackScore <= 40 ? "trap" : "neutral");

      return {
        key,
        name: record.name || outcome?.name || "Unknown",
        symbol: record.symbol || outcome?.symbol || "Unknown",
        vector: vectorFromRecord(record),
        label,
        outcomePct: outcome?.bestMovePct || 0,
        scoreDelta: outcome?.scoreDelta || 0,
        sampleCount: outcome?.sampleCount || 1,
      };
    })
    .filter((item) => Object.values(item.vector).some((value) => num(value) > 0));
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + num(value), 0) / values.length;
}

export function analyzeOutcomeLearning(project = {}, context = {}) {
  const trainingSet = context.trainingSet || [];
  const vector = vectorFromProject(project);

  if (trainingSet.length < 3) {
    return {
      ...project,
      outcomeLearningScore: 50,
      outcomeLearning: {
        sampleSize: trainingSet.length,
        winnerMatches: 0,
        trapMatches: 0,
        estimatedWinRate: 50,
        summary: "Neutral: not enough historical outcome memory yet.",
        topMatches: [],
      },
      evidence: [
        ...(project.evidence || []),
        {
          engine: "Outcome Learning Engine",
          signal: "Historical outcome memory",
          score: 50,
          confidence: 0.25,
          impact: "Neutral",
          reasons: ["The scanner needs more saved outcomes before this layer becomes aggressive."],
        },
      ],
    };
  }

  const matches = trainingSet
    .map((sample) => ({
      ...sample,
      similarity: cosineSimilarity(vector, sample.vector),
    }))
    .filter((sample) => sample.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12);

  const winnerMatches = matches.filter((sample) => sample.label === "winner");
  const trapMatches = matches.filter((sample) => sample.label === "trap");
  const neutralMatches = matches.filter((sample) => sample.label === "neutral");
  const winnerSimilarity = winnerMatches.reduce((sum, sample) => sum + sample.similarity, 0);
  const trapSimilarity = trapMatches.reduce((sum, sample) => sum + sample.similarity, 0);
  const neutralSimilarity = neutralMatches.reduce((sum, sample) => sum + sample.similarity * 0.25, 0);
  const totalSimilarity = Math.max(0.01, winnerSimilarity + trapSimilarity + neutralSimilarity);
  const winnerFit = winnerSimilarity / totalSimilarity;
  const trapFit = trapSimilarity / totalSimilarity;
  const estimatedWinRate = Math.round(clamp((winnerSimilarity + neutralSimilarity) / totalSimilarity * 100));
  const averageWinnerOutcomePct = Math.round(average(winnerMatches.map((sample) => sample.outcomePct)));
  const averageTrapOutcomePct = Math.round(average(trapMatches.map((sample) => sample.outcomePct)));
  const confidence = Math.min(0.9, 0.35 + matches.length / 30 + trainingSet.length / 300);
  const score = Math.round(
    clamp(
      50 +
        (winnerFit - trapFit) * 38 +
        (estimatedWinRate - 50) * 0.3 +
        Math.min(8, trainingSet.length / 20)
    )
  );
  const trapRisk = Math.round(clamp(trapFit * 100));
  const summary =
    score >= 70
      ? "Historical memory resembles prior winners."
      : score <= 38
      ? "Historical memory resembles prior traps."
      : "Historical memory is mixed or still developing.";

  return {
    ...project,
    outcomeLearningScore: score,
    outcomeWinRate: estimatedWinRate,
    outcomeTrapRisk: trapRisk,
    outcomeLearning: {
      sampleSize: trainingSet.length,
      winnerMatches: winnerMatches.length,
      trapMatches: trapMatches.length,
      neutralMatches: neutralMatches.length,
      winSimilarityScore: Math.round(winnerSimilarity * 100),
      trapSimilarityScore: Math.round(trapSimilarity * 100),
      estimatedWinRate,
      averageWinnerOutcomePct,
      averageTrapOutcomePct,
      topMatches: matches.slice(0, 5).map((sample) => ({
        name: sample.name,
        symbol: sample.symbol,
        label: sample.label,
        similarity: Math.round(sample.similarity * 100),
        outcomePct: Math.round(sample.outcomePct),
        scoreDelta: Math.round(sample.scoreDelta),
      })),
      summary,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Outcome Learning Engine",
        signal: "Similarity to prior winners and traps",
        score,
        confidence,
        impact: score >= 65 ? "Positive" : score <= 40 ? "Negative" : "Neutral",
        reasons: [
          `${trainingSet.length} historical memory samples analyzed.`,
          `${winnerMatches.length} close winner matches and ${trapMatches.length} close trap matches found.`,
          `Estimated historical win-rate fit: ${estimatedWinRate}%.`,
        ],
      },
    ],
  };
}

export function analyzeOutcomeLearningBatch(projects = []) {
  const snapshots = loadOutcomeSnapshots();
  const memory = loadScanMemory();
  const context = {
    trainingSet: buildTrainingSet(memory, snapshots),
  };

  return projects.map((project) => analyzeOutcomeLearning(project, context));
}
