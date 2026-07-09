// src/engines/narrativeHeatIndexEngine.js

import { loadScanMemory } from "../learning/scanMemoryStore.js";

const NARRATIVES = {
  aiAgents: ["ai", "agent", "agents", "llm", "inference", "compute"],
  rwa: ["rwa", "real world asset", "tokenized", "treasury", "credit"],
  depin: ["depin", "gpu", "storage", "wireless", "node network"],
  stablecoins: ["stablecoin", "payments", "settlement", "remittance"],
  prediction: ["prediction", "forecast", "odds", "infofi"],
  zkPrivacy: ["zk", "zero knowledge", "privacy", "identity"],
  perps: ["perp", "perpetual", "derivatives", "onchain trading"],
  modular: ["modular", "rollup", "appchain", "data availability"],
  restaking: ["restaking", "avs", "shared security", "lrt"],
  launchpads: ["launchpad", "ido", "ico", "presale", "fair launch", "token sale"],
  base: ["base", "base ecosystem"],
  solana: ["solana", "sol ecosystem"],
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function textOf(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.alphaTags || []),
    ...(project.externalIntelligence?.narrativeHits || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchNarratives(project = {}) {
  const text = textOf(project);

  return Object.entries(NARRATIVES)
    .map(([key, terms]) => ({
      key,
      hits: terms.filter((term) => text.includes(term)),
    }))
    .filter((item) => item.hits.length > 0);
}

function memoryNarrativeCounts() {
  const counts = {};
  const memory = loadScanMemory().slice(-2500);

  for (const record of memory) {
    const text = [
      record.name,
      record.symbol,
      record.chain,
      ...(record.signals?.alphaTags || []),
      record.signals?.opportunityThesis,
      record.signals?.externalIntelligence?.narrativeHits || [],
    ]
      .flat()
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const [key, terms] of Object.entries(NARRATIVES)) {
      if (terms.some((term) => text.includes(term))) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  return counts;
}

function buildHeatMap(projects = []) {
  const currentCounts = {};
  const total = Math.max(1, projects.length);
  const historicalCounts = memoryNarrativeCounts();

  for (const project of projects) {
    for (const match of matchNarratives(project)) {
      currentCounts[match.key] = (currentCounts[match.key] || 0) + 1;
    }
  }

  return Object.keys(NARRATIVES)
    .map((key) => {
      const currentShare = (num(currentCounts[key]) / total) * 100;
      const historical = num(historicalCounts[key]);
      const heatScore = Math.round(
        clamp(currentShare * 2.2 + Math.log10(1 + historical) * 12)
      );
      const momentum = Math.round(clamp(currentShare - Math.min(45, Math.log10(1 + historical) * 8), -100, 100));

      return {
        key,
        currentCount: num(currentCounts[key]),
        historicalCount: historical,
        currentSharePct: Number(currentShare.toFixed(2)),
        heatScore,
        momentum,
        state:
          heatScore >= 70 && momentum >= 10
            ? "Hot Rotation"
            : heatScore >= 55
            ? "Active"
            : momentum >= 10
            ? "Emerging"
            : "Quiet",
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore || b.momentum - a.momentum);
}

export function analyzeNarrativeHeatIndexBatch(projects = []) {
  const heatMap = buildHeatMap(projects);
  const heatByKey = new Map(heatMap.map((item) => [item.key, item]));

  return projects.map((project) => {
    const matches = matchNarratives(project).map((match) => ({
      ...match,
      heat: heatByKey.get(match.key) || null,
    }));
    const strongest = [...matches]
      .sort((a, b) => num(b.heat?.heatScore) - num(a.heat?.heatScore))[0] || null;
    const score = Math.round(
      clamp(
        matches.reduce((sum, match) => sum + num(match.heat?.heatScore), 0) /
          Math.max(1, matches.length)
      )
    );

    return {
      ...project,
      narrativeHeatScore: score,
      narrativeHeatState: strongest?.heat?.state || "No Heat",
      narrativeHeatMatches: matches.slice(0, 6),
      narrativeHeatIndex: {
        score,
        state: strongest?.heat?.state || "No Heat",
        strongestNarrative: strongest?.key || null,
        marketHeatMap: heatMap.slice(0, 12),
      },
      evidence: [
        ...(project.evidence || []),
        ...(score > 0
          ? [
              {
                engine: "Narrative Heat Index",
                signal: "market narrative rotation",
                score,
                confidence: 0.58,
                impact: score >= 65 ? "Positive" : "Neutral",
                reasons: [
                  strongest
                    ? `${strongest.key} narrative heat is ${strongest.heat?.heatScore}.`
                    : "No strong narrative heat match.",
                ],
              },
            ]
          : []),
      ],
    };
  });
}
