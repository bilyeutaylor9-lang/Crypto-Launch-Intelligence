import fs from "fs";
import path from "path";
import { summarizeAutonomousAlphaKnowledgeGraph } from "../engines/autonomousAlphaKnowledgeGraphEngine.js";
import { summarizeCausalMarketTwin } from "../engines/causalMarketTwinEngine.js";
import { summarizeAlphaKnowledgeGraphMemory } from "../learning/alphaKnowledgeGraphStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactGraphProject(project = {}, index = 0) {
  return {
    rank: index + 1,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    graphScore: project.alphaKnowledgeGraphScore || 0,
    graphConfidence: project.alphaKnowledgeGraphConfidence || "Unknown",
    graphVerdict: project.alphaKnowledgeGraphVerdict || "Unknown",
    twinScore: project.causalMarketTwinScore || 0,
    twinConfidence: project.causalMarketTwinConfidence || "Unknown",
    twinVerdict: project.causalMarketTwinVerdict || "Unknown",
    expectedReturnPct: project.causalMarketTwinExpectedReturnPct || 0,
    upsideProbability: project.causalMarketTwinUpsideProbability || 0,
    downsideProbability: project.causalMarketTwinDownsideProbability || 0,
    dominantRelation: project.alphaKnowledgeGraph?.dominantRelation || "Unknown",
    primaryCausalDriver: project.causalMarketTwin?.primaryCausalDriver || "Unknown",
    memoryScans: project.alphaKnowledgeGraph?.memoryContext?.scans || 0,
    graphSize: {
      nodes: project.alphaKnowledgeGraph?.graph?.nodes?.length || 0,
      edges: project.alphaKnowledgeGraph?.graph?.edges?.length || 0,
      sources: project.alphaKnowledgeGraph?.graph?.sources?.length || 0,
      narratives: project.alphaKnowledgeGraph?.graph?.narratives?.length || 0,
      neighbors: project.alphaKnowledgeGraph?.graph?.scanNeighbors?.length || 0,
    },
    moduleScores: project.alphaKnowledgeGraph?.moduleScores || {},
    bestScenario: project.causalMarketTwin?.bestScenario || null,
    worstScenario: project.causalMarketTwin?.worstScenario || null,
    missingProof: project.alphaKnowledgeGraph?.missingProof || [],
    experiments: project.causalMarketTwin?.experiments || [],
  };
}

export function buildKnowledgeGraphTwinReports(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const knowledgeGraph = summarizeAutonomousAlphaKnowledgeGraph(safeProjects);
  const marketTwin = summarizeCausalMarketTwin(safeProjects);
  const memory = summarizeAlphaKnowledgeGraphMemory();
  const ranked = [...safeProjects]
    .filter((project) => project.alphaKnowledgeGraph || project.causalMarketTwin)
    .sort(
      (a, b) =>
        num(b.causalMarketTwinScore || b.alphaKnowledgeGraphScore) -
        num(a.causalMarketTwinScore || a.alphaKnowledgeGraphScore)
    );

  const shared = {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    memory,
    operatingDoctrine: [
      "Use the graph to remember identity, source, roadmap, GitHub, narrative, and peer relationships across scans.",
      "Use the twin to test what happens next under bull, base, bear, delay, listing, drain, rotation, and invalidation paths.",
      "Promote only when evidence quality, graph coverage, causal scenario value, and risk firewall agree.",
      "Treat best-available candidates as research until real outcomes confirm the thesis.",
    ],
    commandMap: {
      graph: "npm run alpha:graph",
      twin: "npm run causal:twin",
      memory: "npm run graph-memory",
      opScan: "npm run scan:op",
    },
  };

  return {
    knowledgeGraph: {
      ...shared,
      ...knowledgeGraph,
      name: "Autonomous Alpha Knowledge Graph",
      description:
        "Persistent project-memory graph linking identity, sources, narratives, chains, repositories, catalysts, engine support, risk, and historical scan behavior.",
      topProjects: ranked.slice(0, 50).map(compactGraphProject),
    },
    marketTwin: {
      ...shared,
      ...marketTwin,
      name: "Causal Market Twin",
      description:
        "Scenario engine that uses graph, causal, simulation, catalyst, liquidity, source, and risk evidence to model what can happen next.",
      topProjects: ranked.slice(0, 50).map(compactGraphProject),
    },
  };
}

export function writeKnowledgeGraphTwinReports(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const reports = buildKnowledgeGraphTwinReports(projects);
  const alphaKnowledgeGraphPath = path.join(reportsDir, "alpha-knowledge-graph.json");
  const causalMarketTwinPath = path.join(reportsDir, "causal-market-twin.json");

  fs.writeFileSync(alphaKnowledgeGraphPath, JSON.stringify(reports.knowledgeGraph, null, 2));
  fs.writeFileSync(causalMarketTwinPath, JSON.stringify(reports.marketTwin, null, 2));

  return {
    alphaKnowledgeGraphPath,
    causalMarketTwinPath,
    knowledgeGraph: reports.knowledgeGraph,
    marketTwin: reports.marketTwin,
  };
}
