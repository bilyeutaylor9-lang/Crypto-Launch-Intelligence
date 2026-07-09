function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function words(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const NARRATIVES = {
  ai: ["ai", "agent", "bittensor", "compute"],
  rwa: ["rwa", "real world", "tokenized", "treasury"],
  depin: ["depin", "wireless", "sensor", "infrastructure"],
  base: ["base", "coinbase"],
  solana: ["solana", "sol"],
  restaking: ["restaking", "avs", "eigen"],
  stablecoin: ["stablecoin", "payments", "settlement"],
  privacy: ["privacy", "zk", "zero knowledge"],
};

function detectNarratives(project = {}) {
  const text = words(project);

  return Object.entries(NARRATIVES)
    .filter(([, terms]) => terms.some((term) => text.includes(term)))
    .map(([name]) => name);
}

function relationGraph(project = {}, projects = []) {
  const narratives = detectNarratives(project);
  const chain = String(project.chain || "unknown").toLowerCase();
  const relatedProjects = projects
    .filter((other) => other !== project)
    .filter((other) => {
      const otherNarratives = detectNarratives(other);
      return (
        String(other.chain || "").toLowerCase() === chain ||
        narratives.some((narrative) => otherNarratives.includes(narrative))
      );
    })
    .slice(0, 8)
    .map((other) => ({
      name: other.name || other.symbol || "Unknown",
      symbol: other.symbol || "UNKNOWN",
      chain: other.chain || "unknown",
      score: other.confidenceAdjustedScore || other.pipelineScore || 0,
    }));

  return {
    nodes: {
      project: project.name || project.symbol || "Unknown",
      chain,
      narratives,
      sources: project.discoverySources || [],
    },
    relatedProjects,
  };
}

function marketRegimeGovernor(project = {}, projects = []) {
  const avgTrap =
    projects.length === 0
      ? 0
      : projects.reduce((sum, item) => sum + num(item.trapRiskScore), 0) / projects.length;
  const avgHeat =
    projects.length === 0
      ? 0
      : projects.reduce((sum, item) => sum + num(item.narrativeHeatScore), 0) / projects.length;
  const avgLiquidity =
    projects.length === 0
      ? 0
      : projects.reduce((sum, item) => sum + num(item.liquidityScore), 0) / projects.length;
  const regime =
    avgTrap >= 45
      ? "Risk-Off"
      : avgHeat >= 65 && avgLiquidity >= 45
      ? "Narrative Risk-On"
      : avgHeat >= 65
      ? "Narrative-Only"
      : "Selective";

  return {
    regime,
    avgTrap: Math.round(avgTrap),
    avgHeat: Math.round(avgHeat),
    avgLiquidity: Math.round(avgLiquidity),
    scoringBias:
      regime === "Risk-Off"
        ? "Boost proof, risk, and liquidity discipline."
        : regime === "Narrative Risk-On"
        ? "Allow narrative and momentum to carry more weight after risk clearance."
        : regime === "Narrative-Only"
        ? "Require liquidity confirmation before promotion."
        : "Use balanced scoring.",
  };
}

export function analyzeWorldModelBrainBatch(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const regime = marketRegimeGovernor({}, safeProjects);
  const narrativeCounts = {};

  for (const project of safeProjects) {
    for (const narrative of detectNarratives(project)) {
      narrativeCounts[narrative] = (narrativeCounts[narrative] || 0) + 1;
    }
  }

  return safeProjects.map((project) => {
    const narratives = detectNarratives(project);
    const graph = relationGraph(project, safeProjects);
    const contagionBoost = graph.relatedProjects.reduce((sum, item) => sum + num(item.score), 0) / Math.max(1, graph.relatedProjects.length);
    const worldModelScore = Math.round(
      clamp(
        num(project.confidenceAdjustedScore) * 0.28 +
          num(project.narrativeHeatScore) * 0.18 +
          contagionBoost * 0.16 +
          num(project.sourceReliabilityScore) * 0.12 +
          (regime.regime === "Risk-Off" ? num(project.proofScore) * 0.16 : num(project.alphaLabScore) * 0.16) -
          num(project.trapRiskScore) * 0.18
      )
    );

    return {
      ...project,
      worldModelScore,
      knowledgeGraph: graph,
      narrativeRotation: {
        activeNarratives: narratives,
        marketNarrativeCounts: narrativeCounts,
        rotationState:
          narratives.length && narratives.some((narrative) => (narrativeCounts[narrative] || 0) >= 2)
            ? "Clustered Rotation"
            : narratives.length
            ? "Isolated Narrative"
            : "No Clear Narrative",
      },
      marketRegimeGovernor: regime,
      contagionMap: {
        relatedProjects: graph.relatedProjects,
        contagionScore: Math.round(clamp(contagionBoost)),
        summary: graph.relatedProjects.length
          ? "Project has related market neighbors that can influence attention and liquidity."
          : "No strong relationship cluster found in this scan.",
      },
      evidence: [
        ...(project.evidence || []),
        {
          engine: "World Model Brain",
          signal: "knowledge graph and market regime reasoning",
          score: worldModelScore,
          confidence: 0.6,
          impact: worldModelScore >= 65 ? "Positive" : "Neutral",
          reasons: [
            `Regime: ${regime.regime}. Narratives: ${narratives.join(", ") || "none"}.`,
            `Related projects: ${graph.relatedProjects.length}.`,
          ],
        },
      ],
    };
  });
}
