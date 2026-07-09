import { createOutcomeSnapshot, compareOutcomeSnapshots } from "../learning/outcomeTracker.js";
import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadScanMemory } from "../learning/scanMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function hoursBetween(from = "", to = "") {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.max(0, (end - start) / 36e5);
}

function confidenceLabel(score = 0) {
  if (score >= 78) return "High";
  if (score >= 58) return "Medium";
  if (score >= 35) return "Developing";
  return "Low";
}

function projectKey(project = {}) {
  const chain = String(project.chain || project.network || "unknown").toLowerCase();
  const address = String(project.address || project.contractAddress || project.pairAddress || "").toLowerCase();
  const symbol = String(project.symbol || project.tokenSymbol || project.name || "unknown").toLowerCase();

  return address ? `${chain}:${address}` : `${chain}:${symbol}`;
}

function predictionGrade(originalScore = 0, outcome = {}) {
  const priceChange = num(outcome.priceChangePct);
  const liquidityChange = num(outcome.liquidityChangePct);
  const volumeChange = num(outcome.volumeChangePct);
  const realizedStrength = priceChange * 0.65 + liquidityChange * 0.22 + volumeChange * 0.13;
  const predictedPositive = originalScore >= 65;
  const predictedStrong = originalScore >= 78;

  if (!num(outcome.originalScore) && !num(outcome.latestScore) && priceChange === 0) {
    return {
      label: "No Outcome Data",
      realizedStrength: 0,
      correctness: 0,
      adjustment: 0,
      reason: "No usable prior outcome movement yet.",
    };
  }

  if (predictedStrong && realizedStrength >= 35) {
    return {
      label: "High-Conviction Hit",
      realizedStrength,
      correctness: 1,
      adjustment: 8,
      reason: "A prior high score was followed by strong realized improvement.",
    };
  }

  if (predictedPositive && realizedStrength >= 12) {
    return {
      label: "Correct Positive",
      realizedStrength,
      correctness: 0.75,
      adjustment: 5,
      reason: "A prior positive setup followed through.",
    };
  }

  if (predictedPositive && realizedStrength <= -15) {
    return {
      label: "False Positive",
      realizedStrength,
      correctness: -1,
      adjustment: -10,
      reason: "A prior positive setup moved against the thesis.",
    };
  }

  if (!predictedPositive && realizedStrength >= 25) {
    return {
      label: "Missed Winner",
      realizedStrength,
      correctness: -0.7,
      adjustment: 3,
      reason: "The system was too cautious before a strong move.",
    };
  }

  if (!predictedPositive && realizedStrength <= -12) {
    return {
      label: "Correct Avoid",
      realizedStrength,
      correctness: 0.65,
      adjustment: 4,
      reason: "The system avoided a weak outcome.",
    };
  }

  return {
    label: "Too Early / Neutral",
    realizedStrength,
    correctness: 0.2,
    adjustment: 0,
    reason: "The outcome is not decisive enough yet.",
  };
}

function latestPreviousSnapshot(project = {}, snapshots = []) {
  const key = projectKey(project);
  const current = createOutcomeSnapshot(project);
  const currentTime = new Date(current.timestamp).getTime();

  return snapshots
    .filter((snapshot) => snapshot.key === key)
    .filter((snapshot) => new Date(snapshot.timestamp).getTime() < currentTime)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function buildScanPairs(memory = []) {
  const byProject = new Map();

  for (const record of memory) {
    if (!record?.id) continue;
    if (!byProject.has(record.id)) byProject.set(record.id, []);
    byProject.get(record.id).push(record);
  }

  const pairs = [];

  for (const records of byProject.values()) {
    const sorted = records
      .slice()
      .sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime());

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const before = sorted[index];
      const after = sorted[index + 1];
      const beforePrice = num(before.market?.priceUsd);
      const afterPrice = num(after.market?.priceUsd);

      if (beforePrice <= 0 || afterPrice <= 0) continue;

      pairs.push({
        before,
        after,
        priceChangePct: ((afterPrice - beforePrice) / beforePrice) * 100,
        hours: hoursBetween(before.scannedAt, after.scannedAt),
      });
    }
  }

  return pairs.filter((pair) => pair.hours >= 1);
}

const ENGINE_SIGNAL_KEYS = [
  "pipeline",
  "confidenceAdjusted",
  "aiEcosystem",
  "simulationBrain",
  "marketScientist",
  "quantumBrain",
  "worldModel",
  "alphaLab",
  "narrativeHeat",
  "liquidity",
  "liquidityExpansion",
  "smartMoneyAccumulation",
  "smartWalletPerformance",
  "catalystCalendar",
  "prePumpPattern",
  "signalCombination",
  "sourceReliability",
  "trapRisk",
];

function scoreForRecord(record = {}, key = "") {
  return num(record.scores?.[key]);
}

function analyzeEngineReliability(memory = []) {
  const pairs = buildScanPairs(memory);
  const ranked = ENGINE_SIGNAL_KEYS.map((key) => {
    const samples = pairs
      .map((pair) => ({
        score: scoreForRecord(pair.before, key),
        priceChangePct: pair.priceChangePct,
      }))
      .filter((sample) => sample.score > 0);
    const high = samples.filter((sample) =>
      key === "trapRisk" ? sample.score >= 55 : sample.score >= 65
    );
    const hits = high.filter((sample) =>
      key === "trapRisk" ? sample.priceChangePct <= -12 : sample.priceChangePct >= 12
    ).length;
    const misses = high.filter((sample) =>
      key === "trapRisk" ? sample.priceChangePct >= 12 : sample.priceChangePct <= -12
    ).length;
    const hitRate = high.length ? Math.round((hits / high.length) * 100) : 0;
    const missRate = high.length ? Math.round((misses / high.length) * 100) : 0;
    const trustScore = Math.round(
      clamp(hitRate * 0.75 + (100 - missRate) * 0.25 - (high.length < 8 ? 18 : high.length < 20 ? 8 : 0))
    );

    return {
      engine: key,
      samples: high.length,
      hitRate,
      missRate,
      trustScore,
      confidence: high.length >= 30 ? "High" : high.length >= 12 ? "Medium" : high.length >= 4 ? "Low" : "Cold Start",
    };
  }).sort((a, b) => b.trustScore - a.trustScore);

  return {
    pairs: pairs.length,
    ranked,
    strongest: ranked.slice(0, 8),
    weakest: ranked.slice(-8).reverse(),
  };
}

function currentSignalTrust(project = {}, reliability = {}) {
  const byEngine = new Map((reliability.ranked || []).map((engine) => [engine.engine, engine]));
  const active = ENGINE_SIGNAL_KEYS.map((key) => ({
    key,
    score:
      key === "simulationBrain"
        ? num(project.simulationBrainScore)
        : key === "pipeline"
        ? num(project.pipelineScore)
        : key === "confidenceAdjusted"
        ? num(project.confidenceAdjustedScore)
        : num(project[`${key}Score`]),
    reliability: byEngine.get(key),
  })).filter((item) => item.score >= 60 && item.reliability);
  const trusted = active.filter((item) => num(item.reliability.trustScore) >= 58);
  const noisy = active.filter((item) => item.reliability.samples >= 4 && num(item.reliability.trustScore) < 42);

  return {
    activeSignals: active.length,
    trustedSignals: trusted.map((item) => ({
      engine: item.key,
      currentScore: item.score,
      trustScore: item.reliability.trustScore,
      samples: item.reliability.samples,
    })),
    noisySignals: noisy.map((item) => ({
      engine: item.key,
      currentScore: item.score,
      trustScore: item.reliability.trustScore,
      samples: item.reliability.samples,
    })),
  };
}

export function analyzeAutonomousOutcomeJudge(project = {}, context = {}) {
  const snapshots = context.snapshots || [];
  const reliability = context.reliability || { pairs: 0, ranked: [] };
  const previous = latestPreviousSnapshot(project, snapshots);
  const current = createOutcomeSnapshot(project);
  const signalTrust = currentSignalTrust(project, reliability);
  const outcome = previous ? compareOutcomeSnapshots(previous, current) : null;
  const grade = outcome ? predictionGrade(num(previous.score), outcome) : null;
  const historyAgeHours = previous ? Math.round(hoursBetween(previous.timestamp, current.timestamp)) : 0;
  const memoryConfidencePenalty = reliability.pairs < 10 ? 8 : reliability.pairs < 30 ? 3 : 0;
  const realityAdjustment = Math.round(
    clamp(
      (grade?.adjustment || 0) +
        signalTrust.trustedSignals.length * 1.5 -
        signalTrust.noisySignals.length * 2 -
        memoryConfidencePenalty,
      -15,
      15
    )
  );
  const baseConfidence = num(project.simulationConfidenceScore || project.dataConfidenceScore || project.confidenceAdjustedScore);
  const outcomeAdjustedConfidenceScore = Math.round(clamp(baseConfidence + realityAdjustment));
  const outcomeJudgeScore = Math.round(
    clamp(
      outcomeAdjustedConfidenceScore * 0.42 +
        num(project.simulationBrainScore) * 0.22 +
        num(project.aiEcosystemScore) * 0.16 +
        (grade ? (grade.correctness + 1) * 35 : 35) * 0.12 +
        Math.min(100, reliability.pairs * 4) * 0.08
    )
  );
  const status = previous ? "Tracked" : "Cold Start";
  const verdict =
    status === "Cold Start"
      ? "Awaiting Outcome Data"
      : grade.label === "False Positive"
      ? "Downgrade Thesis"
      : grade.label === "High-Conviction Hit"
      ? "Upgrade Trusted Thesis"
      : grade.label === "Missed Winner"
      ? "Study Missed Winner"
      : grade.label === "Correct Positive"
      ? "Maintain Positive Thesis"
      : "Keep Monitoring";

  return {
    ...project,
    outcomeJudgeStatus: status,
    outcomeJudgeVerdict: verdict,
    outcomeJudgeScore,
    outcomeRealityAdjustment: realityAdjustment,
    outcomeAdjustedConfidenceScore,
    outcomeAdjustedConfidence: confidenceLabel(outcomeAdjustedConfidenceScore),
    outcomeHistoryAgeHours: historyAgeHours,
    outcomeJudgement: {
      status,
      verdict,
      score: outcomeJudgeScore,
      realityAdjustment,
      confidenceScore: outcomeAdjustedConfidenceScore,
      confidence: confidenceLabel(outcomeAdjustedConfidenceScore),
      previousSnapshot: previous || null,
      currentSnapshot: current,
      outcome,
      grade,
      signalTrust,
      reliabilitySampleCount: reliability.pairs || 0,
      summary: previous
        ? `${grade.label}: ${grade.reason}`
        : "No prior outcome snapshot for this project yet.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Outcome Judge",
        signal: "prediction accountability and realized-outcome calibration",
        score: outcomeJudgeScore,
        confidence: Math.min(0.85, 0.35 + Math.min(50, reliability.pairs || 0) / 100),
        impact: realityAdjustment > 3 ? "Positive" : realityAdjustment < -3 ? "Negative" : "Neutral",
        reasons: [
          previous ? `${grade.label}: ${Math.round(num(outcome?.priceChangePct))}% price change since prior snapshot.` : "Cold start: no prior snapshot.",
          `Trusted signals: ${signalTrust.trustedSignals.length}; noisy signals: ${signalTrust.noisySignals.length}.`,
        ],
      },
    ],
  };
}

export function analyzeAutonomousOutcomeJudgeBatch(projects = [], options = {}) {
  const snapshots = options.snapshots || loadOutcomeSnapshots();
  const memory = options.memory || loadScanMemory();
  const reliability = options.reliability || analyzeEngineReliability(memory);

  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeAutonomousOutcomeJudge(project, { snapshots, reliability })
  );
}

export function summarizeOutcomeJudge(projects = [], options = {}) {
  const memory = options.memory || loadScanMemory();
  const reliability = options.reliability || analyzeEngineReliability(memory);
  const safeProjects = Array.isArray(projects) ? projects : [];

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    trackedProjects: safeProjects.filter((project) => project.outcomeJudgeStatus === "Tracked").length,
    coldStartProjects: safeProjects.filter((project) => project.outcomeJudgeStatus === "Cold Start").length,
    reliabilitySampleCount: reliability.pairs,
    strongestEngines: reliability.strongest,
    weakestEngines: reliability.weakest,
    verdictCounts: safeProjects.reduce((counts, project) => {
      const verdict = project.outcomeJudgeVerdict || "Unknown";
      counts[verdict] = (counts[verdict] || 0) + 1;
      return counts;
    }, {}),
  };
}
