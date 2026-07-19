import { loadScanMemory } from "../learning/scanMemoryStore.js";
import { summarizeStrategyMemory } from "../learning/strategyMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const weightedTotal = active.reduce(
    (sum, item) => sum + num(item.score) * item.weight,
    0
  );
  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);

  return Math.round(clamp(weightedTotal / weightTotal));
}

function maxScore(project = {}, keys = []) {
  return Math.max(0, ...keys.map((key) => num(key.split(".").reduce((obj, part) => obj?.[part], project))));
}

function proofStack(project = {}) {
  return weightedAverage([
    { score: project.proofScore, weight: 1.1 },
    { score: project.dataConfidenceScore, weight: 0.9 },
    { score: project.sourceReliabilityScore, weight: 0.9 },
    { score: project.evidenceQualityScore, weight: 0.7 },
  ]);
}

function riskStack(project = {}) {
  return weightedAverage([
    { score: project.trapRiskScore, weight: 1.1 },
    { score: project.riskScore, weight: 0.8 },
    { score: project.sellPressureScore, weight: 0.8 },
    { score: project.externalRiskScore, weight: 0.7 },
    { score: project.tokenUnlockRiskScore, weight: 0.6 },
    { score: project.vestingPressureScore, weight: 0.6 },
    { score: project.falsePositiveSimilarity, weight: 0.7 },
  ]);
}

const STRATEGY_TEMPLATES = [
  {
    id: "roadmap_catalyst_confirmation",
    name: "Roadmap Catalyst Confirmation",
    holdWindow: "14-45 days",
    thesis: "Roadmap proof plus near-term catalysts can create a cleaner pre-momentum setup.",
    components: (project) => ({
      roadmap: maxScore(project, ["roadmapProfitabilityScore", "fullRoadmap.milestoneCount"]),
      catalysts: maxScore(project, ["liveCatalystRadarScore", "catalystCalendarScore", "catalystScore"]),
      narrative: maxScore(project, ["narrativeHeatScore", "narrativeForecastScore"]),
      proof: proofStack(project),
      risk: 100 - riskStack(project),
    }),
    triggers: [
      "Roadmap milestone is confirmed by official docs, blog, GitHub, or credible news.",
      "Catalyst urgency remains high while trap risk stays controlled.",
      "Liquidity or volume expands before the catalyst date.",
    ],
    invalidations: [
      "Roadmap date is delayed or cannot be verified.",
      "Catalyst appears fully priced in after a large move.",
      "Trap risk or sell pressure expands before confirmation.",
    ],
  },
  {
    id: "github_builder_momentum",
    name: "GitHub Builder Momentum",
    holdWindow: "30-120 days",
    thesis: "Sustained builder activity can identify real projects before social attention catches up.",
    components: (project) => ({
      github: maxScore(project, ["developerActivityScore", "githubQualityScore", "githubScore"]),
      change: maxScore(project, ["projectChangeScore", "worldModelScore"]),
      narrative: maxScore(project, ["narrativeHeatScore", "infrastructureNarrativeScore"]),
      proof: proofStack(project),
      risk: 100 - riskStack(project),
    }),
    triggers: [
      "Commit/activity quality continues improving across multiple scans.",
      "Roadmap or docs align with real shipped work.",
      "Social attention begins rising after builder momentum.",
    ],
    invalidations: [
      "Repository activity becomes stale or purely cosmetic.",
      "Docs and roadmap do not match actual development.",
      "Token incentives dominate without product traction.",
    ],
  },
  {
    id: "liquidity_breakout_pressure",
    name: "Liquidity Breakout Pressure",
    holdWindow: "3-21 days",
    thesis: "Liquidity expansion, capital flow, and buy pressure can precede sharp repricing.",
    components: (project) => ({
      liquidity: maxScore(project, ["liquidityExpansionScore", "liquidityScore"]),
      flow: maxScore(project, ["capitalFlowScore", "buyPressureScore"]),
      timing: maxScore(project, ["opportunityTimingScore", "earlyBreakoutScore", "momentumShiftScore"]),
      proof: proofStack(project),
      risk: 100 - maxScore(project, ["sellPressureScore", "trapRiskScore", "riskScore"]),
    }),
    triggers: [
      "Liquidity expands while buy pressure remains stronger than sell pressure.",
      "Momentum shift and early-breakout scores continue rising.",
      "No large unlock, vesting, or holder concentration risk appears.",
    ],
    invalidations: [
      "Liquidity leaves the pair or migration risk appears.",
      "Sell pressure overtakes buy pressure.",
      "Move becomes a late chase or already-pumped setup.",
    ],
  },
  {
    id: "narrative_heat_momentum",
    name: "Narrative Heat Momentum",
    holdWindow: "7-30 days",
    thesis: "A hot narrative with improving momentum can become a leader if evidence catches up.",
    components: (project) => ({
      narrative: maxScore(project, ["narrativeHeatScore", "narrativeForecastScore", "aiWarRoomNarratives.length"]),
      momentum: maxScore(project, ["accelerationScore", "trendChangeScore", "momentumShiftScore", "velocityScore"]),
      social: maxScore(project, ["xSocialScore", "socialAccelerationScore", "externalSignalScore"]),
      proof: proofStack(project),
      risk: 100 - riskStack(project),
    }),
    triggers: [
      "Narrative heat rises with social acceleration and real liquidity support.",
      "Project becomes best-in-class inside an active narrative cluster.",
      "Proof score improves instead of relying only on hype.",
    ],
    invalidations: [
      "Social heat fades without liquidity or GitHub confirmation.",
      "Bot, low-source, or thin-proof risk rises.",
      "Narrative leader rotates to a stronger competitor.",
    ],
  },
  {
    id: "smart_money_confirmation",
    name: "Smart Money Confirmation",
    holdWindow: "7-45 days",
    thesis: "Smart-wallet conviction is stronger when it aligns with catalysts, proof, and liquidity.",
    components: (project) => ({
      smartMoney: maxScore(project, [
        "smartMoneyAccumulationScore",
        "smartWalletPerformanceScore",
        "smartWalletScore",
        "whaleScore",
      ]),
      liquidity: maxScore(project, ["liquidityScore", "liquidityExpansionScore", "capitalFlowScore"]),
      catalysts: maxScore(project, ["liveCatalystRadarScore", "catalystCalendarScore", "exchangeProbabilityScore"]),
      proof: proofStack(project),
      risk: 100 - riskStack(project),
    }),
    triggers: [
      "Smart-money accumulation persists after liquidity expands.",
      "Wallet conviction aligns with catalysts or listings.",
      "Top-wallet behavior does not flip into distribution.",
    ],
    invalidations: [
      "Smart-wallet net flow flips negative.",
      "Whale activity becomes exit liquidity after social hype.",
      "Proof or source reliability stays weak.",
    ],
  },
  {
    id: "launch_airdrop_cycle",
    name: "Launch/Airdrop Cycle",
    holdWindow: "14-60 days",
    thesis: "Launch readiness, airdrops, listings, and staking can create a why-now window.",
    components: (project) => ({
      launch: maxScore(project, ["launchReadinessScore", "upcomingLaunchScore", "airdropScore"]),
      catalyst: maxScore(project, ["catalystCalendarScore", "liveCatalystRadarScore", "exchangeProbabilityScore"]),
      staking: maxScore(project, ["stakingMomentumScore", "narrativeLaunchStakingScore"]),
      proof: proofStack(project),
      risk: 100 - maxScore(project, ["stakingRiskScore", "tokenUnlockRiskScore", "vestingPressureScore", "trapRiskScore"]),
    }),
    triggers: [
      "Launch or airdrop date is verified across multiple sources.",
      "Staking or liquidity incentives look sustainable.",
      "Exchange/listing probability rises before the event.",
    ],
    invalidations: [
      "Airdrop farmers or unlocks create immediate sell pressure.",
      "Staking APY appears unsustainable or withdrawal rules are hostile.",
      "Launch evidence is rumor-only.",
    ],
  },
  {
    id: "truth_verified_alpha",
    name: "Truth-Verified Alpha",
    holdWindow: "21-90 days",
    thesis: "High proof, high source reliability, and AI agreement can outperform noisy high scores.",
    components: (project) => ({
      proof: proofStack(project),
      confidence: maxScore(project, ["confidenceAdjustedScore", "dataConfidenceScore"]),
      ai: maxScore(project, ["aiEcosystemScore", "alphaInvestigatorScore", "aiPortfolioWarRoomScore"]),
      simulation: maxScore(project, ["simulationBrainScore", "outcomeJudgeScore"]),
      risk: 100 - riskStack(project),
    }),
    triggers: [
      "Proof, source reliability, and AI confidence all improve together.",
      "Causal and simulation layers agree on the same core driver.",
      "Red-team review is clear or only lightly challenged.",
    ],
    invalidations: [
      "Evidence quality deteriorates or sources conflict.",
      "AI agents disagree because risk is rising.",
      "Outcome judge downgrades the setup after reality checks.",
    ],
  },
];

function scoreTemplate(project = {}, template = {}, strategyMemory = null) {
  const components = template.components(project);
  const componentValues = Object.entries(components).map(([name, score]) => ({ name, score: clamp(score) }));
  const score = weightedAverage(
    componentValues.map((component) => ({
      score: component.score,
      weight: component.name === "risk" || component.name === "proof" ? 1.1 : 1,
    }))
  );
  const risk = riskStack(project);
  const readiness = Math.round(
    clamp(score * 0.54 + proofStack(project) * 0.22 + (100 - risk) * 0.18 + num(project.dataConfidenceScore) * 0.06)
  );
  const memory = strategyMemory || summarizeStrategyMemory();
  const memoryStrategy = memory.strategies.find((item) => item.id === template.id);
  const memoryBoost = memoryStrategy
    ? Math.round(clamp((memoryStrategy.avgAlphaOSScore - 50) * 0.12 + Math.min(8, memoryStrategy.observations / 10), -8, 12))
    : 0;
  const finalScore = Math.round(clamp(score + memoryBoost - Math.max(0, risk - 62) * 0.18));

  return {
    id: template.id,
    name: template.name,
    thesis: template.thesis,
    holdWindow: template.holdWindow,
    score: finalScore,
    readiness,
    memoryBoost,
    memoryStatus: memoryStrategy?.status || "Cold Start",
    memoryObservations: memoryStrategy?.observations || 0,
    components: componentValues.sort((a, b) => b.score - a.score),
    entryTriggers: template.triggers,
    invalidationRules: template.invalidations,
    status:
      finalScore >= 76 && readiness >= 65
        ? "Promote To Paper Strategy"
        : finalScore >= 62
        ? "Paper Test"
        : finalScore >= 48
        ? "Research Hypothesis"
        : "No Edge",
  };
}

function strategyVerdict(best = null, project = {}) {
  if (!best) return "No Strategy";
  if (best.score >= 78 && best.readiness >= 70 && riskStack(project) < 45) return "Paper Strong Buy Candidate";
  if (best.score >= 66 && best.readiness >= 58) return "Priority Paper Trade";
  if (best.score >= 52) return "Strategy Watch";
  return "No Strategy";
}

function paperTradeScore(best = null, project = {}) {
  if (!best) return 0;

  return Math.round(
    clamp(
      best.score * 0.34 +
        best.readiness * 0.22 +
        num(project.breakoutProbability30d) * 0.16 +
        Math.max(0, num(project.expectedReturn30dPct)) * 0.12 +
        proofStack(project) * 0.08 +
        (100 - riskStack(project)) * 0.08
    )
  );
}

function buildPaperTradingPlan(project = {}, best = null, score = 0) {
  if (!best) {
    return {
      mode: "No Paper Trade",
      positionStyle: "Research only",
      entryTriggers: ["Wait for at least one strategy to score above 52."],
      invalidationRules: ["No active strategy edge."],
      reviewCadence: "Next full scan",
      expectedHoldingWindow: "Not estimated",
      promotionGate: "Needs a matched strategy, proof score above 50, and risk below 55.",
    };
  }

  const risk = riskStack(project);
  const proof = proofStack(project);
  const mode =
    score >= 75 && risk < 45
      ? "Paper Trade Priority"
      : score >= 58
      ? "Paper Trade Watch"
      : "Research Only";

  return {
    mode,
    positionStyle:
      mode === "Paper Trade Priority"
        ? "Simulated starter position with staged confirmation"
        : mode === "Paper Trade Watch"
        ? "Simulated watch entry only after the first trigger"
        : "No simulated entry until evidence improves",
    entryTriggers: best.entryTriggers,
    invalidationRules: [
      ...best.invalidationRules,
      "Autonomous Strategy Lab score drops below 50.",
      "Causal Alpha Brain downgrades the primary driver.",
    ],
    reviewCadence: risk >= 55 ? "Every scan until risk compresses" : "Every 24h scan cycle",
    expectedHoldingWindow: best.holdWindow,
    promotionGate:
      proof >= 65 && risk < 40
        ? "Can promote if causal score and simulation score both remain above 68."
        : "Keep paper-only until proof rises above 65 and risk falls below 40.",
  };
}

export function analyzeAutonomousStrategyLab(project = {}, context = {}) {
  const strategyMemory = context.strategyMemory || summarizeStrategyMemory();
  const tournament = STRATEGY_TEMPLATES.map((template) => scoreTemplate(project, template, strategyMemory))
    .sort((a, b) => b.score - a.score || b.readiness - a.readiness);
  const best = tournament[0] || null;
  const strategyLabScore = best ? Math.round(clamp(best.score)) : 0;
  const readiness = best ? best.readiness : 0;
  const paperScore = paperTradeScore(best, project);
  const verdict = strategyVerdict(best, project);
  const paperPlan = buildPaperTradingPlan(project, best, paperScore);
  const risk = riskStack(project);

  return {
    ...project,
    strategyLabScore,
    strategyReadinessPct: readiness,
    strategyLabVerdict: verdict,
    bestAutonomousStrategy: best,
    strategyTournament: tournament,
    paperTradeScore: paperScore,
    paperTradingPlan: paperPlan,
    autonomousStrategyLab: {
      score: strategyLabScore,
      readiness,
      verdict,
      bestStrategy: best,
      paperTradeScore: paperScore,
      risk,
      proof: proofStack(project),
      plan: paperPlan,
      summary: best
        ? `${verdict}: ${best.name} scored ${best.score} with ${best.readiness}% readiness.`
        : "No active autonomous strategy matched this project.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Strategy Lab",
        signal: "strategy tournament, paper-trade plan, and memory-adjusted readiness",
        score: strategyLabScore,
        confidence: Math.round(clamp(readiness)) / 100,
        impact: strategyLabScore >= 65 ? "Positive" : strategyLabScore <= 38 ? "Negative" : "Neutral",
        reasons: best
          ? [`Best strategy: ${best.name}.`, `Paper trade score ${paperScore}, risk ${risk}.`]
          : ["No strategy scored high enough for paper trading."],
      },
    ],
  };
}

export function analyzeAutonomousStrategyLabBatch(projects = []) {
  const strategyMemory = summarizeStrategyMemory();
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeAutonomousStrategyLab(project, { strategyMemory })
  );
}

export function summarizeAutonomousStrategyLab(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const strategyMap = new Map();

  for (const project of safeProjects) {
    for (const strategy of project.strategyTournament || []) {
      const current = strategyMap.get(strategy.id) || {
        id: strategy.id,
        name: strategy.name,
        activeProjects: 0,
        avgScore: 0,
        avgReadiness: 0,
        topProjects: [],
      };
      const activeProjects = current.activeProjects + 1;
      strategyMap.set(strategy.id, {
        ...current,
        activeProjects,
        avgScore: Math.round((current.avgScore * current.activeProjects + strategy.score) / activeProjects),
        avgReadiness: Math.round(
          (current.avgReadiness * current.activeProjects + strategy.readiness) / activeProjects
        ),
        topProjects: [
          ...current.topProjects,
          {
            name: project.name || "Unknown",
            symbol: project.symbol || "UNKNOWN",
            score: strategy.score,
            readiness: strategy.readiness,
            verdict: project.strategyLabVerdict || "Unknown",
          },
        ]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    paperStrongBuyCandidates: safeProjects.filter((project) => project.strategyLabVerdict === "Paper Strong Buy Candidate").length,
    priorityPaperTrades: safeProjects.filter((project) => project.strategyLabVerdict === "Priority Paper Trade").length,
    strategyCount: strategyMap.size,
    strategies: [...strategyMap.values()].sort((a, b) => b.avgScore - a.avgScore),
    memory: summarizeStrategyMemory(),
    topCandidates: [...safeProjects]
      .sort((a, b) => num(b.strategyLabScore) - num(a.strategyLabScore))
      .slice(0, 50)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.strategyLabScore || 0,
        readiness: project.strategyReadinessPct || 0,
        verdict: project.strategyLabVerdict || "Unknown",
        bestStrategy: project.bestAutonomousStrategy?.name || "No Strategy",
        paperTradeScore: project.paperTradeScore || 0,
        plan: project.paperTradingPlan || {},
      })),
  };
}

export function estimateStrategyMemorySampleCount() {
  return loadScanMemory().length;
}
