import fs from "fs";
import path from "path";
import { summarizeAutonomousCausalAlphaNetwork } from "../engines/autonomousCausalAlphaNetworkEngine.js";
import { summarizeCausalAlphaEventLake } from "../learning/causalAlphaEventLake.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactProject(project = {}, index = 0) {
  const network = project.autonomousCausalAlphaNetwork || {};

  return {
    rank: project.autonomousCausalNetworkRank || index + 1,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    pipelineRank: project.pipelineRank || null,
    pipelineScore: project.pipelineScore || project.opportunityScore || 0,
    state: project.autonomousCausalProjectState || "Unknown",
    score: project.autonomousCausalNetworkScore || 0,
    confidence: project.autonomousCausalNetworkConfidence || "Unknown",
    confidenceScore: project.autonomousCausalNetworkConfidenceScore || 0,
    verdict: project.autonomousCausalNetworkVerdict || "Unknown",
    causalPatternSuccessRate: project.causalPatternSuccessRate || 0,
    causalPatternSampleSize: project.causalPatternSampleSize || 0,
    evidenceFragility: project.causalEvidenceFragility || "Unknown",
    evidenceFragilityScore: project.causalEvidenceFragilityScore || 0,
    independentEvidenceFamilies: project.causalIndependentEvidenceFamilies || [],
    sniperGate: project.causalSniperIntegrityGate || {},
    graph: {
      nodes: network.graph?.coverage?.nodeCount || 0,
      edges: network.graph?.coverage?.edgeCount || 0,
      events: network.graph?.coverage?.eventCount || 0,
      sources: network.graph?.coverage?.sourceCount || 0,
      narratives: network.graph?.coverage?.narrativeCount || 0,
      relationshipTypes: network.graph?.coverage?.relationshipTypes || [],
    },
    primaryCausalSequence: network.causalSequence?.primarySequence || [],
    underrecognized: Boolean(network.causalSequence?.underrecognized),
    historicalPattern: network.causalSequence?.historicalPattern || {},
    counterfactual: network.counterfactual || {},
    researchAgents: network.researchAgents || [],
    hypothesis: network.hypothesis || {},
    transitionAlerts: network.transitionAlerts || [],
  };
}

export function buildAutonomousCausalAlphaNetworkReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const ranked = [...safeProjects]
    .filter((project) => project.autonomousCausalAlphaNetwork)
    .sort((a, b) => num(b.autonomousCausalNetworkScore) - num(a.autonomousCausalNetworkScore));
  const summary = summarizeAutonomousCausalAlphaNetwork(safeProjects);
  const eventLake = summarizeCausalAlphaEventLake();

  return {
    generatedAt: new Date().toISOString(),
    name: "Autonomous Causal Alpha Intelligence Network",
    description:
      "A point-in-time causal intelligence layer that converts scanner observations into events, entities, relationships, ordered sequences, counterfactual tests, research-agent verdicts, and retestable project hypotheses.",
    summary,
    eventLake,
    doctrine: [
      "Prefer event order over isolated high scores.",
      "Promote projects only when independent evidence families survive bear-case review.",
      "Treat price and social acceleration as fragile unless liquidity, builders, adoption, source truth, and catalysts confirm first.",
      "Keep every opportunity falsifiable with explicit confirmations and invalidations.",
      "Use stored point-in-time events to learn which sequences preceded real breakouts versus traps.",
    ],
    eventSchema: {
      eventId: "stable event id",
      projectId: "permanent project identity",
      eventType: "normalized causal event type",
      eventTimestamp: "when the event happened or was approximated",
      discoveredTimestamp: "when the scanner observed it",
      blockNumber: "optional chain block",
      source: "provider or engine source",
      sourceConfidence: "0-1 confidence",
      relatedEntities: "project, token, contract, pool, chain, repository, wallet, source nodes",
      rawEvidence: "source-specific fields",
      normalizedEvidence: "strength, family, direction, description",
      scannerVersion: "version of scanner that wrote the event",
    },
    commandMap: {
      runFullScan: "npm run scan:op",
      run39000Scan: "npm run scan:39000",
      report: "npm run causal-network",
      eventLake: "npm run event-lake",
    },
    topProjects: ranked.slice(0, 100).map(compactProject),
    armedCandidates: ranked
      .filter((project) => project.autonomousCausalProjectState === "ARMED")
      .map(compactProject),
    priorityResearch: ranked
      .filter((project) => project.autonomousCausalNetworkVerdict === "Causal Network Priority Research")
      .slice(0, 50)
      .map(compactProject),
    blocked: ranked
      .filter((project) => project.autonomousCausalProjectState === "BLOCKED")
      .slice(0, 50)
      .map(compactProject),
  };
}

export function writeAutonomousCausalAlphaNetworkReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildAutonomousCausalAlphaNetworkReport(projects);
  const filePath = path.join(reportsDir, "autonomous-causal-alpha-network.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
