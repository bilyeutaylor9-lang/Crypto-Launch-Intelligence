import { summarizePaperTradingOutcomes } from "../learning/paperTradingOutcomeStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function strategyId(project = {}) {
  return String(
    project.bestAutonomousStrategy?.id ||
      project.autonomousStrategyLab?.bestStrategy?.id ||
      project.alphaLabBestStrategy?.id ||
      "no_strategy"
  );
}

function findStrategyStats(summary = {}, project = {}) {
  const id = strategyId(project);
  return (summary.strategies || []).find((strategy) => strategy.id === id) || null;
}

function scoreFromStats(project = {}, stats = null) {
  const coldStartScore = Math.round(
    clamp(
      num(project.paperTradeScore) * 0.28 +
        num(project.causalAlphaScore) * 0.22 +
        num(project.autonomousAlphaOSScore) * 0.22 +
        num(project.proofScore) * 0.14 +
        (100 - Math.max(num(project.trapRiskScore), num(project.sellPressureScore))) * 0.14
    )
  );

  if (!stats || stats.evaluated < 3) return coldStartScore;

  return Math.round(
    clamp(
      coldStartScore * 0.5 +
        num(stats.winRate) * 0.22 +
        clamp(50 + num(stats.avgReturnPct), 0, 100) * 0.18 +
        (100 - num(stats.lossRate)) * 0.1
    )
  );
}

function verdict(score = 0, stats = null) {
  if (stats?.evaluated >= 20 && stats.winRate >= 60 && score >= 70) return "Promote Strategy Weight";
  if (stats?.evaluated >= 8 && stats.winRate >= 50 && score >= 62) return "Paper Edge Confirming";
  if (score >= 58) return "Paper Watch";
  if (stats?.evaluated >= 8 && stats.lossRate >= 55) return "Strategy Needs Downgrade";
  return "Collect More Outcomes";
}

export function analyzePaperTradingOutcomeLab(project = {}, context = {}) {
  const summary = context.summary || summarizePaperTradingOutcomes();
  const stats = findStrategyStats(summary, project);
  const score = scoreFromStats(project, stats);
  const labVerdict = verdict(score, stats);

  return {
    ...project,
    paperOutcomeLabScore: score,
    paperOutcomeLabVerdict: labVerdict,
    paperStrategyWinRate: stats?.winRate || 0,
    paperStrategyLossRate: stats?.lossRate || 0,
    paperStrategyAverageReturnPct: stats?.avgReturnPct || 0,
    paperStrategySamples: stats?.evaluated || 0,
    paperTradingOutcomeLab: {
      score,
      verdict: labVerdict,
      strategyId: strategyId(project),
      strategyName:
        project.bestAutonomousStrategy?.name ||
        project.autonomousStrategyLab?.bestStrategy?.name ||
        "No Strategy",
      strategyStats: stats || {
        status: "Cold Start",
        evaluated: 0,
        winRate: 0,
        avgReturnPct: 0,
      },
      globalStats: {
        records: summary.totalRecords || 0,
        evaluated: summary.evaluatedRecords || 0,
        winRate: summary.winRate || 0,
        averageReturnPct: summary.averageReturnPct || 0,
      },
      summary:
        stats && stats.evaluated > 0
          ? `${stats.name} has ${stats.winRate}% paper win rate over ${stats.evaluated} evaluated calls.`
          : "Strategy is still collecting paper outcome samples.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Paper Trading Outcome Lab",
        signal: "strategy paper-trade outcomes and promotion/downgrade evidence",
        score,
        confidence: Math.min(0.85, 0.35 + (stats?.evaluated || 0) / 50),
        impact: score >= 65 ? "Positive" : score <= 38 ? "Negative" : "Neutral",
        reasons: [
          stats
            ? `Strategy ${stats.name} win rate ${stats.winRate}% across ${stats.evaluated} evaluated calls.`
            : "No evaluated strategy outcomes yet.",
        ],
      },
    ],
  };
}

export function analyzePaperTradingOutcomeLabBatch(projects = []) {
  const summary = summarizePaperTradingOutcomes();
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzePaperTradingOutcomeLab(project, { summary })
  );
}

export function summarizePaperTradingOutcomeLab(projects = []) {
  const summary = summarizePaperTradingOutcomes();

  return {
    generatedAt: new Date().toISOString(),
    memory: summary,
    totalProjects: projects.length,
    promoteStrategyCount: projects.filter((project) => project.paperOutcomeLabVerdict === "Promote Strategy Weight").length,
    downgradeStrategyCount: projects.filter((project) => project.paperOutcomeLabVerdict === "Strategy Needs Downgrade").length,
    topPaperCandidates: [...projects]
      .sort((a, b) => num(b.paperOutcomeLabScore) - num(a.paperOutcomeLabScore))
      .slice(0, 50)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.paperOutcomeLabScore || 0,
        verdict: project.paperOutcomeLabVerdict || "Unknown",
        strategy: project.bestAutonomousStrategy?.name || "No Strategy",
        strategyWinRate: project.paperStrategyWinRate || 0,
        strategySamples: project.paperStrategySamples || 0,
        alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
      })),
  };
}
