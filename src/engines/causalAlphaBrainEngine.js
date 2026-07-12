import { loadScanMemory } from "../learning/scanMemoryStore.js";

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

function scoreCluster(project = {}, cluster = []) {
  return weightedAverage(cluster.map((item) => ({ score: item.score(project), weight: item.weight })));
}

const CAUSAL_CLUSTERS = [
  {
    id: "narrative",
    label: "Narrative Gravity",
    type: "driver",
    weight: 1.05,
    signals: [
      { weight: 1.1, score: (p) => p.narrativeHeatScore },
      { weight: 0.9, score: (p) => p.narrativeForecastScore },
      { weight: 0.7, score: (p) => p.infrastructureNarrativeScore },
      { weight: 0.6, score: (p) => p.aiPortfolioWarRoomScore },
    ],
  },
  {
    id: "catalyst",
    label: "Why-Now Catalyst",
    type: "driver",
    weight: 1.12,
    signals: [
      { weight: 1.1, score: (p) => p.liveCatalystRadarScore },
      { weight: 0.9, score: (p) => p.catalystCalendarScore },
      { weight: 0.8, score: (p) => p.roadmapProfitabilityScore },
      { weight: 0.6, score: (p) => p.exchangeProbabilityScore },
    ],
  },
  {
    id: "liquidity",
    label: "Liquidity Confirmation",
    type: "driver",
    weight: 1.14,
    signals: [
      { weight: 1.0, score: (p) => p.liquidityExpansionScore },
      { weight: 0.9, score: (p) => p.liquidityScore },
      { weight: 0.9, score: (p) => p.capitalFlowScore },
      { weight: 0.8, score: (p) => p.buyPressureScore },
    ],
  },
  {
    id: "smart_money",
    label: "Smart Money Conviction",
    type: "driver",
    weight: 1.05,
    signals: [
      { weight: 1.0, score: (p) => p.smartMoneyAccumulationScore },
      { weight: 0.9, score: (p) => p.smartWalletPerformanceScore },
      { weight: 0.7, score: (p) => p.smartWalletScore },
      { weight: 0.6, score: (p) => p.whaleScore || p.whaleActivityScore },
    ],
  },
  {
    id: "builders",
    label: "Builder Proof",
    type: "driver",
    weight: 0.96,
    signals: [
      { weight: 1.0, score: (p) => p.developerActivityScore || p.developerScore },
      { weight: 0.8, score: (p) => p.githubQualityScore || p.githubScore },
      { weight: 0.6, score: (p) => p.projectChangeScore },
      { weight: 0.5, score: (p) => p.worldModelScore },
    ],
  },
  {
    id: "proof",
    label: "Evidence Quality",
    type: "driver",
    weight: 1.18,
    signals: [
      { weight: 1.1, score: (p) => p.proofScore },
      { weight: 0.9, score: (p) => p.dataConfidenceScore },
      { weight: 0.9, score: (p) => p.sourceReliabilityScore },
      { weight: 0.7, score: (p) => p.evidenceQualityScore },
    ],
  },
  {
    id: "strategy",
    label: "Strategy Fit",
    type: "driver",
    weight: 1.08,
    signals: [
      { weight: 1.0, score: (p) => p.strategyLabScore },
      { weight: 0.8, score: (p) => p.paperTradeScore },
      { weight: 0.8, score: (p) => p.alphaLabScore },
      { weight: 0.6, score: (p) => p.aiPortfolioWarRoomScore },
    ],
  },
  {
    id: "simulation",
    label: "Forward Simulation",
    type: "driver",
    weight: 1.08,
    signals: [
      { weight: 1.0, score: (p) => p.simulationBrainScore },
      { weight: 0.8, score: (p) => p.breakoutProbability30d },
      { weight: 0.5, score: (p) => 50 + num(p.expectedReturn30dPct) },
      { weight: 0.6, score: (p) => p.quantumBrainScore },
    ],
  },
  {
    id: "risk",
    label: "Risk Drag",
    type: "blocker",
    weight: 1.25,
    signals: [
      { weight: 1.0, score: (p) => p.trapRiskScore },
      { weight: 0.9, score: (p) => p.riskScore },
      { weight: 0.8, score: (p) => p.sellPressureScore },
      { weight: 0.7, score: (p) => p.falsePositiveSimilarity },
      { weight: 0.6, score: (p) => p.externalRiskScore },
      { weight: 0.6, score: (p) => p.tokenUnlockRiskScore },
    ],
  },
];

function projectId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function historicalDelta(project = {}, scanMemory = null) {
  const id = projectId(project);
  const records = (Array.isArray(scanMemory) ? scanMemory : loadScanMemory())
    .filter((record) => record.id === id)
    .slice(-12);

  if (records.length < 2) {
    return {
      samples: records.length,
      scoreDelta: 0,
      liquidityDelta: 0,
      narrativeDelta: 0,
      summary: "Not enough prior scans for causal trend memory.",
    };
  }

  const first = records[0];
  const last = records[records.length - 1];
  const scoreDelta = Math.round(num(last.scores?.pipeline) - num(first.scores?.pipeline));
  const liquidityDelta = Math.round(num(last.market?.liquidityUsd) - num(first.market?.liquidityUsd));
  const narrativeDelta = Math.round(num(last.scores?.narrativeHeat) - num(first.scores?.narrativeHeat));

  return {
    samples: records.length,
    scoreDelta,
    liquidityDelta,
    narrativeDelta,
    summary:
      scoreDelta > 0
        ? `Historical score improved by ${scoreDelta} across ${records.length} scans.`
        : `Historical score has not improved across ${records.length} scans.`,
  };
}

function buildNodes(project = {}) {
  return CAUSAL_CLUSTERS.map((cluster) => {
    const score = scoreCluster(project, cluster.signals);
    const contribution = Math.round(
      cluster.type === "blocker"
        ? -score * cluster.weight * 0.18
        : score * cluster.weight * 0.18
    );

    return {
      id: cluster.id,
      label: cluster.label,
      type: cluster.type,
      score,
      weight: cluster.weight,
      contribution,
      state:
        cluster.type === "blocker"
          ? score >= 65
            ? "Blocking"
            : score >= 42
            ? "Watch"
            : "Clear"
          : score >= 70
          ? "Strong Driver"
          : score >= 52
          ? "Developing Driver"
          : "Weak",
    };
  });
}

function buildEdges(nodes = []) {
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const edges = [
    ["narrative", "liquidity", "Narrative needs liquidity confirmation."],
    ["catalyst", "liquidity", "Catalysts matter more when liquidity expands."],
    ["builders", "proof", "Builder activity strengthens evidence quality."],
    ["smart_money", "liquidity", "Smart-money conviction needs liquid exit depth."],
    ["strategy", "simulation", "Strategy fit should survive forward simulation."],
    ["proof", "strategy", "Proof determines whether a strategy can graduate."],
    ["risk", "strategy", "Risk drag can block strategy promotion."],
  ];

  return edges.map(([from, to, relationship]) => ({
    from,
    to,
    relationship,
    strength: Math.round(clamp((num(byId[from]?.score) + num(byId[to]?.score)) / 2)),
    polarity: from === "risk" ? "negative" : "positive",
  }));
}

function counterfactuals(project = {}, nodes = [], baseScore = 0) {
  return nodes
    .filter((node) => node.type === "driver")
    .map((node) => {
      const scoreWithoutDriver = Math.round(clamp(baseScore - Math.max(4, node.contribution)));
      return {
        remove: node.label,
        scoreWithoutDriver,
        estimatedImpact: Math.round(baseScore - scoreWithoutDriver),
        interpretation:
          node.score >= 70
            ? `${node.label} is a major explanation for the current alpha case.`
            : `${node.label} is not yet strong enough to carry the thesis alone.`,
      };
    })
    .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
    .slice(0, 6);
}

function confidence(project = {}, history = {}) {
  return Math.round(
    clamp(
      num(project.proofScore) * 0.28 +
        num(project.dataConfidenceScore) * 0.22 +
        num(project.sourceReliabilityScore) * 0.22 +
        num(project.evidenceQualityScore) * 0.12 +
        Math.min(12, history.samples * 2) +
        (project.aiDisagreement?.level === "High" ? -8 : 4)
    )
  );
}

function verdict(score = 0, confidenceScore = 0, blocker = 0) {
  if (blocker >= 72) return "Causal Block";
  if (score >= 76 && confidenceScore >= 62) return "Causal Strong Buy Candidate";
  if (score >= 64 && confidenceScore >= 50) return "Causal Priority Research";
  if (score >= 48) return "Causal Watch";
  return "Causal Reject";
}

export function analyzeCausalAlphaBrain(project = {}, context = {}) {
  const nodes = buildNodes(project);
  const history = historicalDelta(project, context.scanMemory);
  const positive = nodes
    .filter((node) => node.type === "driver")
    .reduce((sum, node) => sum + Math.max(0, node.contribution), 0);
  const blocker = nodes.find((node) => node.id === "risk")?.score || 0;
  const historicalBoost = clamp(history.scoreDelta * 0.8 + (history.liquidityDelta > 0 ? 4 : 0), -10, 12);
  const causalAlphaScore = Math.round(clamp(positive * 0.75 + historicalBoost + (100 - blocker) * 0.18));
  const confidenceScore = confidence(project, history);
  const drivers = nodes
    .filter((node) => node.type === "driver")
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);
  const blockers = nodes
    .filter((node) => node.type === "blocker" || node.score < 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const causalVerdict = verdict(causalAlphaScore, confidenceScore, blocker);
  const edges = buildEdges(nodes);
  const counterfactualAnalysis = counterfactuals(project, nodes, causalAlphaScore);

  return {
    ...project,
    causalAlphaScore,
    causalAlphaConfidenceScore: confidenceScore,
    causalAlphaConfidence:
      confidenceScore >= 72 ? "High" : confidenceScore >= 55 ? "Medium" : confidenceScore >= 38 ? "Developing" : "Low",
    causalAlphaVerdict: causalVerdict,
    causalAlphaDrivers: drivers,
    causalAlphaBlockers: blockers,
    causalSignalGraph: {
      nodes,
      edges,
      historicalDelta: history,
      primaryDriver: drivers[0] || null,
      primaryBlocker: blockers[0] || null,
    },
    causalCounterfactuals: counterfactualAnalysis,
    causalAlphaBrain: {
      score: causalAlphaScore,
      verdict: causalVerdict,
      confidenceScore,
      hypothesis: drivers[0]
        ? `${drivers[0].label} is the current primary driver, with ${blockers[0]?.label || "no major blocker"} as the main constraint.`
        : "No dominant causal driver is isolated yet.",
      history,
      nextProofNeeded:
        confidenceScore >= 62
          ? "Keep checking that the same driver remains active across future scans."
          : "Raise proof, source reliability, and data confidence before promotion.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Causal Alpha Brain",
        signal: "causal graph, counterfactual driver removal, and historical delta reasoning",
        score: causalAlphaScore,
        confidence: confidenceScore / 100,
        impact: causalAlphaScore >= 65 ? "Positive" : causalAlphaScore <= 38 ? "Negative" : "Neutral",
        reasons: [
          drivers[0] ? `Primary driver: ${drivers[0].label}.` : "No dominant driver found.",
          history.summary,
        ],
      },
    ],
  };
}

export function analyzeCausalAlphaBrainBatch(projects = []) {
  const scanMemory = loadScanMemory();
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeCausalAlphaBrain(project, { scanMemory })
  );
}

export function summarizeCausalAlphaBrain(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    strongBuyCandidates: safeProjects.filter((project) => project.causalAlphaVerdict === "Causal Strong Buy Candidate").length,
    priorityResearch: safeProjects.filter((project) => project.causalAlphaVerdict === "Causal Priority Research").length,
    blocked: safeProjects.filter((project) => project.causalAlphaVerdict === "Causal Block").length,
    topDrivers: safeProjects
      .flatMap((project) => project.causalAlphaDrivers || [])
      .reduce((counts, driver) => {
        counts[driver.label] = (counts[driver.label] || 0) + 1;
        return counts;
      }, {}),
    topProjects: [...safeProjects]
      .sort((a, b) => num(b.causalAlphaScore) - num(a.causalAlphaScore))
      .slice(0, 50)
      .map((project) => ({
        rank: project.pipelineRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.causalAlphaScore || 0,
        confidence: project.causalAlphaConfidence || "Unknown",
        verdict: project.causalAlphaVerdict || "Unknown",
        primaryDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
        primaryBlocker: project.causalSignalGraph?.primaryBlocker?.label || "None",
        counterfactuals: project.causalCounterfactuals || [],
      })),
  };
}
