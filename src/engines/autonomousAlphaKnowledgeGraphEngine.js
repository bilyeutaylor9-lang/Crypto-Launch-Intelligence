import {
  alphaKnowledgeGraphProjectKey,
  extractAlphaGraphNarratives,
  extractAlphaGraphRepository,
  extractAlphaGraphSources,
  loadAlphaKnowledgeGraphMemory,
  summarizeAlphaKnowledgeGraphMemory,
} from "../learning/alphaKnowledgeGraphStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore)
  );
}

function cleanId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 160);
}

function sourceCoverageScore(sources = [], repository = "") {
  const sourceCount = new Set(sources).size;
  return Math.round(
    clamp(
      Math.min(60, sourceCount * 9) +
        (repository ? 12 : 0) +
        (sources.includes("github") ? 8 : 0) +
        (sources.includes("roadmap") ? 8 : 0) +
        (sources.some((source) => /defillama|coingecko|dexscreener|birdeye|coinpaprika/.test(source)) ? 8 : 0)
    )
  );
}

function topEngineSignals(project = {}) {
  return [
    ["source_truth", "Source Truth", project.sourceTruthScore],
    ["proof", "Evidence Proof", project.proofScore],
    ["github", "GitHub Builder Signal", project.githubProScore || project.githubScore],
    ["roadmap", "Roadmap Catalyst", project.roadmapProfitabilityScore],
    ["catalyst", "Live Catalyst", project.liveCatalystRadarScore || project.catalystCalendarScore],
    ["causal", "Causal Alpha", project.causalAlphaScore],
    ["simulation", "Simulation Brain", project.simulationBrainScore],
    ["breakout", "Breakout Brain", project.breakoutBrainScore],
    ["alpha_os", "Autonomous Alpha OS", project.autonomousAlphaOSScore],
    ["self_evolving", "Self-Evolving Alpha OS", project.selfEvolvingAlphaOSScore],
    ["contract", "Proof-Carrying Contract", project.proofCarryingAlphaContractScore],
  ]
    .map(([id, label, score]) => ({ id, label, score: Math.round(num(score)) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function findScanNeighbors(project = {}, projects = []) {
  const key = alphaKnowledgeGraphProjectKey(project);
  const narratives = new Set(extractAlphaGraphNarratives(project));
  const chain = cleanId(project.chain || "unknown");

  return (Array.isArray(projects) ? projects : [])
    .filter((other) => alphaKnowledgeGraphProjectKey(other) !== key)
    .map((other) => {
      const otherNarratives = extractAlphaGraphNarratives(other);
      const sharedNarratives = otherNarratives.filter((narrative) => narratives.has(narrative));
      const sameChain = cleanId(other.chain || "unknown") === chain;
      const strength = Math.round(
        clamp(
          sharedNarratives.length * 20 +
            (sameChain ? 25 : 0) +
            average([other.pipelineScore, other.confidenceAdjustedScore, other.sourceTruthScore]) * 0.25
        )
      );

      return {
        key: alphaKnowledgeGraphProjectKey(other),
        name: other.name || "Unknown",
        symbol: other.symbol || "UNKNOWN",
        chain: other.chain || "unknown",
        sharedNarratives,
        sameChain,
        score: strength,
      };
    })
    .filter((neighbor) => neighbor.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function memoryContext(project = {}, memory = {}) {
  const key = alphaKnowledgeGraphProjectKey(project);
  const profile = memory.projects?.[key] || null;
  const latest = profile?.latest || null;
  const history = profile?.history || [];
  const first = history[0] || latest;
  const scoreDelta = latest && first ? Math.round(num(latest.scores?.pipeline) - num(first.scores?.pipeline)) : 0;
  const riskDelta = latest && first ? Math.round(num(latest.scores?.risk) - num(first.scores?.risk)) : 0;

  return {
    key,
    known: Boolean(profile),
    scans: profile?.scans || 0,
    firstSeenAt: profile?.firstSeenAt || null,
    lastSeenAt: profile?.lastSeenAt || null,
    previousVerdict: latest?.verdicts?.causalMarketTwin || latest?.verdicts?.alphaKnowledgeGraph || "New",
    previousScore: latest?.scores?.causalMarketTwin || latest?.scores?.alphaKnowledgeGraph || latest?.scores?.pipeline || 0,
    scoreDelta,
    riskDelta,
    summary: profile
      ? `${project.name || project.symbol || "Project"} has ${profile.scans || 0} graph observations. Score delta ${scoreDelta}, risk delta ${riskDelta}.`
      : "New graph entity with no prior memory.",
  };
}

function relationMemory(project = {}, memory = {}) {
  const narratives = extractAlphaGraphNarratives(project);
  const sources = extractAlphaGraphSources(project);
  const chain = cleanId(project.chain || "unknown");
  const chainCluster = memory.indexes?.chains?.[chain]?.projects || [];
  const narrativeClusters = narratives.map((narrative) => ({
    narrative,
    count: memory.indexes?.narratives?.[narrative]?.count || 0,
    projects: memory.indexes?.narratives?.[narrative]?.projects || [],
  }));
  const sourceClusters = sources.map((source) => ({
    source,
    count: memory.indexes?.sources?.[source]?.count || 0,
  }));

  return {
    chainClusterSize: chainCluster.length,
    narrativeClusters: narrativeClusters.sort((a, b) => b.count - a.count).slice(0, 8),
    sourceClusters: sourceClusters.sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

function buildGraph(project = {}, projects = [], memory = {}) {
  const key = alphaKnowledgeGraphProjectKey(project);
  const narratives = extractAlphaGraphNarratives(project);
  const sources = extractAlphaGraphSources(project);
  const repository = extractAlphaGraphRepository(project);
  const engines = topEngineSignals(project);
  const neighbors = findScanNeighbors(project, projects);
  const memoryRelations = relationMemory(project, memory);
  const nodes = [
    {
      id: `project:${key}`,
      type: "project",
      label: project.name || project.symbol || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      score: Math.round(num(project.pipelineScore || project.confidenceAdjustedScore)),
    },
    {
      id: `chain:${cleanId(project.chain || "unknown")}`,
      type: "chain",
      label: project.chain || "unknown",
      memoryLinks: memoryRelations.chainClusterSize,
    },
    ...narratives.map((narrative) => ({
      id: `narrative:${narrative}`,
      type: "narrative",
      label: narrative,
      memoryLinks: memory.indexes?.narratives?.[narrative]?.count || 0,
    })),
    ...sources.slice(0, 12).map((source) => ({
      id: `source:${source}`,
      type: "source",
      label: source,
      trustHint: /github|roadmap|defillama|coingecko|dexscreener|birdeye|official/.test(source) ? "higher" : "unknown",
    })),
    ...(repository
      ? [
          {
            id: `repo:${cleanId(repository)}`,
            type: "repository",
            label: repository,
            score: num(project.githubProScore || project.githubScore),
          },
        ]
      : []),
    ...engines.map((engine) => ({
      id: `engine:${engine.id}`,
      type: "engine",
      label: engine.label,
      score: engine.score,
    })),
    {
      id: "risk:composite",
      type: "risk",
      label: "Composite Risk",
      score: maxRisk(project),
    },
  ];
  const edges = [
    {
      from: `project:${key}`,
      to: `chain:${cleanId(project.chain || "unknown")}`,
      type: "belongs_to_chain",
      strength: 70,
      polarity: "context",
    },
    ...narratives.map((narrative) => ({
      from: `project:${key}`,
      to: `narrative:${narrative}`,
      type: "has_narrative",
      strength: 60 + Math.min(35, (memory.indexes?.narratives?.[narrative]?.count || 0) * 3),
      polarity: "positive",
    })),
    ...sources.slice(0, 12).map((source) => ({
      from: `project:${key}`,
      to: `source:${source}`,
      type: "seen_in_source",
      strength: /github|roadmap|defillama|coingecko|dexscreener|birdeye|official/.test(source) ? 76 : 52,
      polarity: "evidence",
    })),
    ...engines.map((engine) => ({
      from: `engine:${engine.id}`,
      to: `project:${key}`,
      type: "engine_supports_project",
      strength: engine.score,
      polarity: engine.score >= 65 ? "positive" : "mixed",
    })),
    {
      from: "risk:composite",
      to: `project:${key}`,
      type: "risk_constrains_project",
      strength: maxRisk(project),
      polarity: "negative",
    },
    ...neighbors.slice(0, 8).map((neighbor) => ({
      from: `project:${key}`,
      to: `project:${neighbor.key}`,
      type: neighbor.sameChain ? "same_chain_or_narrative_neighbor" : "shared_narrative_neighbor",
      strength: neighbor.score,
      polarity: "context",
    })),
  ];

  return {
    key,
    nodes,
    edges,
    narratives,
    sources,
    repository,
    scanNeighbors: neighbors,
    memoryRelations,
  };
}

function moduleScores(project = {}, graph = {}, memory = {}) {
  const sources = graph.sources || [];
  const repository = graph.repository || "";
  const memoryInfo = memoryContext(project, memory);
  const sourceCoverage = sourceCoverageScore(sources, repository);
  const evidenceQuality = average([
    project.sourceTruthScore,
    project.proofScore,
    project.dataConfidenceScore,
    project.evidenceQualityScore,
    Math.min(100, (project.evidence || []).length * 4),
  ]);
  const relationStrength = Math.round(
    clamp(
      average((graph.scanNeighbors || []).map((neighbor) => neighbor.score)) * 0.55 +
        Math.min(35, graph.memoryRelations?.chainClusterSize || 0) +
        average((graph.memoryRelations?.narrativeClusters || []).map((cluster) => cluster.count * 8)) * 0.25
    )
  );
  const engineAgreement = average(topEngineSignals(project).map((engine) => engine.score));
  const catalystContext = average([
    project.liveCatalystRadarScore,
    project.roadmapProfitabilityScore,
    project.catalystCalendarScore,
    project.exchangeProbabilityScore,
  ]);
  const memoryScore = clamp(
    Math.min(50, memoryInfo.scans * 8) +
      Math.max(-12, Math.min(18, memoryInfo.scoreDelta)) +
      (memoryInfo.riskDelta < 0 ? 8 : memoryInfo.riskDelta > 15 ? -8 : 0)
  );
  const riskIntegrity = clamp(100 - maxRisk(project));

  return {
    sourceCoverage,
    evidenceQuality,
    relationStrength,
    engineAgreement,
    catalystContext,
    memoryScore: Math.round(memoryScore),
    riskIntegrity: Math.round(riskIntegrity),
  };
}

function graphScore(scores = {}) {
  return Math.round(
    clamp(
      scores.sourceCoverage * 0.14 +
        scores.evidenceQuality * 0.2 +
        scores.relationStrength * 0.14 +
        scores.engineAgreement * 0.18 +
        scores.catalystContext * 0.12 +
        scores.memoryScore * 0.08 +
        scores.riskIntegrity * 0.14
    )
  );
}

function graphConfidence(scores = {}, project = {}) {
  return Math.round(
    clamp(
      scores.evidenceQuality * 0.32 +
        scores.sourceCoverage * 0.24 +
        num(project.sourceReliabilityScore) * 0.16 +
        num(project.dataConfidenceScore) * 0.14 +
        scores.memoryScore * 0.08 +
        (project.aiDisagreement?.level === "High" ? -8 : 4)
    )
  );
}

function missingProof(project = {}, graph = {}, scores = {}) {
  const gaps = [];
  const sources = graph.sources || [];

  if (scores.sourceCoverage < 45) gaps.push("Add more independent sources to the graph.");
  if (!graph.repository && num(project.githubProScore || project.githubScore) < 45) {
    gaps.push("Find and verify the official GitHub repository.");
  }
  if (!sources.includes("roadmap") && num(project.roadmapProfitabilityScore) < 45) {
    gaps.push("Attach roadmap, docs, or catalyst proof.");
  }
  if (scores.evidenceQuality < 50) gaps.push("Raise evidence quality with source-truth and proof checks.");
  if (scores.riskIntegrity < 45) gaps.push("Resolve risk, sell pressure, unlock, or trap warnings before promotion.");
  if (!(graph.scanNeighbors || []).length) gaps.push("No strong scan neighbors yet; compare against similar projects manually.");

  return gaps.slice(0, 7);
}

function verdict(score = 0, confidence = 0, scores = {}) {
  if (scores.riskIntegrity < 28) return "Knowledge Graph Risk Block";
  if (score >= 78 && confidence >= 62) return "Knowledge Graph Alpha Candidate";
  if (score >= 64 && confidence >= 50) return "Knowledge Graph Priority Research";
  if (score >= 48) return "Knowledge Graph Watch";
  return "Knowledge Graph Thin";
}

function dominantRelation(graph = {}) {
  const narrative = (graph.memoryRelations?.narrativeClusters || [])[0];
  if (narrative?.narrative) return `narrative:${narrative.narrative}`;
  const neighbor = (graph.scanNeighbors || [])[0];
  if (neighbor?.symbol) return `neighbor:${neighbor.symbol}`;
  if (graph.repository) return "repository:github";
  return "source:evidence";
}

export function analyzeAutonomousAlphaKnowledgeGraph(project = {}, context = {}) {
  const projects = Array.isArray(context.projects) ? context.projects : [project];
  const memory = context.memory || loadAlphaKnowledgeGraphMemory();
  const graph = buildGraph(project, projects, memory);
  const memoryInfo = memoryContext(project, memory);
  const scores = moduleScores(project, graph, memory);
  const score = graphScore(scores);
  const confidenceScore = graphConfidence(scores, project);
  const gaps = missingProof(project, graph, scores);
  const graphVerdict = verdict(score, confidenceScore, scores);
  const relation = dominantRelation(graph);

  return {
    ...project,
    alphaKnowledgeGraphScore: score,
    alphaKnowledgeGraphConfidenceScore: confidenceScore,
    alphaKnowledgeGraphConfidence:
      confidenceScore >= 72 ? "High" : confidenceScore >= 55 ? "Medium" : confidenceScore >= 38 ? "Developing" : "Low",
    alphaKnowledgeGraphVerdict: graphVerdict,
    alphaKnowledgeGraph: {
      name: "Autonomous Alpha Knowledge Graph",
      score,
      confidenceScore,
      verdict: graphVerdict,
      graph,
      moduleScores: scores,
      memoryContext: memoryInfo,
      dominantRelation: relation,
      missingProof: gaps,
      researchQueue: gaps.map((gap, index) => ({
        priority: index < 2 ? "High" : "Medium",
        task: gap,
      })),
      summary:
        `${project.name || project.symbol || "Project"} maps to ${graph.nodes.length} nodes and ${graph.edges.length} relationships. Dominant relation: ${relation}. ${memoryInfo.summary}`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Alpha Knowledge Graph",
        signal: graphVerdict,
        score,
        confidence: confidenceScore / 100,
        impact: graphVerdict.includes("Risk Block") ? "Negative" : score >= 64 ? "Positive" : "Neutral",
        reasons: [
          `Graph nodes ${graph.nodes.length}, edges ${graph.edges.length}, source coverage ${scores.sourceCoverage}.`,
          memoryInfo.summary,
          gaps[0] || "No major graph proof gap detected.",
        ],
      },
    ],
  };
}

export function analyzeAutonomousAlphaKnowledgeGraphBatch(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const memory = loadAlphaKnowledgeGraphMemory();
  return safeProjects.map((project) =>
    analyzeAutonomousAlphaKnowledgeGraph(project, {
      projects: safeProjects,
      memory,
    })
  );
}

export function summarizeAutonomousAlphaKnowledgeGraph(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const graphed = safeProjects.filter((project) => project.alphaKnowledgeGraph);
  const memory = summarizeAlphaKnowledgeGraphMemory();

  return {
    generatedAt: new Date().toISOString(),
    name: "Autonomous Alpha Knowledge Graph",
    totalProjects: safeProjects.length,
    graphedProjects: graphed.length,
    alphaCandidates: graphed.filter((project) => project.alphaKnowledgeGraphVerdict === "Knowledge Graph Alpha Candidate").length,
    priorityResearch: graphed.filter((project) => project.alphaKnowledgeGraphVerdict === "Knowledge Graph Priority Research").length,
    riskBlocks: graphed.filter((project) => project.alphaKnowledgeGraphVerdict === "Knowledge Graph Risk Block").length,
    memory,
    topRelations: graphed
      .flatMap((project) => project.alphaKnowledgeGraph?.graph?.memoryRelations?.narrativeClusters || [])
      .reduce((counts, relation) => {
        counts[relation.narrative] = (counts[relation.narrative] || 0) + 1;
        return counts;
      }, {}),
    topProjects: [...graphed]
      .sort((a, b) => num(b.alphaKnowledgeGraphScore) - num(a.alphaKnowledgeGraphScore))
      .slice(0, 50)
      .map((project, index) => ({
        rank: index + 1,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        score: project.alphaKnowledgeGraphScore || 0,
        confidence: project.alphaKnowledgeGraphConfidence || "Unknown",
        verdict: project.alphaKnowledgeGraphVerdict || "Unknown",
        dominantRelation: project.alphaKnowledgeGraph?.dominantRelation || "Unknown",
        nodes: project.alphaKnowledgeGraph?.graph?.nodes?.length || 0,
        edges: project.alphaKnowledgeGraph?.graph?.edges?.length || 0,
        missingProof: project.alphaKnowledgeGraph?.missingProof || [],
        topNeighbors: (project.alphaKnowledgeGraph?.graph?.scanNeighbors || []).slice(0, 5),
      })),
  };
}
