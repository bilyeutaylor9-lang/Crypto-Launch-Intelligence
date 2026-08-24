import { clamp, finite, identityKey, mean, stableHash, timestamp } from "./productionMath.js";

function list(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function buildNarrativeEvidenceGraph(projects = [], options = {}) {
  const nodes = new Map();
  const edges = [];
  const addNode = (id, type, label, data = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, type, label, ...data });
  };
  const addEdge = (from, to, type, evidence = {}) => edges.push({ edgeId: stableHash({from,to,type,evidence}).slice(0,20), from, to, type, evidence });

  for (const project of Array.isArray(projects) ? projects : []) {
    const projectId = `project:${identityKey(project)}`;
    addNode(projectId, "PROJECT", project.symbol || project.name || identityKey(project));
    const narratives = list(project, ["narratives", "tags", "categories"]);
    for (const raw of narratives) {
      const name = String(raw).trim().toLowerCase(); if (!name) continue;
      const id = `narrative:${name}`; addNode(id, "NARRATIVE", name); addEdge(projectId, id, "BELONGS_TO");
    }
    const catalysts = list(project, ["catalysts", "verifiedCatalysts", "events"]);
    for (const catalyst of catalysts) {
      const label = String(catalyst.title || catalyst.name || catalyst.type || catalyst).slice(0,160);
      const at = timestamp(catalyst.announcedAt || catalyst.observedAt || catalyst.timestamp);
      const id = `catalyst:${stableHash({projectId,label,at}).slice(0,16)}`;
      addNode(id, "CATALYST", label, { observedAt: at === null ? null : new Date(at).toISOString(), verified: catalyst.verified === true });
      addEdge(id, projectId, "CATALYST_FOR", { verified: catalyst.verified === true, observedAt: at === null ? null : new Date(at).toISOString() });
    }
    const developers = list(project, ["developers", "contributors", "maintainers"]);
    for (const developer of developers) {
      const name = String(developer.login || developer.name || developer).trim(); if (!name) continue;
      const id = `developer:${name.toLowerCase()}`; addNode(id, "DEVELOPER", name); addEdge(id, projectId, "DEVELOPS");
    }
    const chain = String(project.chain || project.canonicalChain || "unknown").toLowerCase();
    const chainId = `chain:${chain}`; addNode(chainId, "CHAIN", chain); addEdge(projectId, chainId, "ON_CHAIN");
  }
  return { schemaVersion: 1, generatedAt: options.now || new Date().toISOString(), nodes: [...nodes.values()], edges, policy: { graphSupportsCausalHypothesesOnly: true, causalClaimAllowed: false } };
}

export function scoreNarrativePropagation(candidate = {}, graph = {}, options = {}) {
  const projectId = `project:${identityKey(candidate)}`;
  const incoming = (graph.edges || []).filter((edge) => edge.to === projectId);
  const narratives = (graph.edges || []).filter((edge) => edge.from === projectId && edge.type === "BELONGS_TO");
  const verifiedCatalysts = incoming.filter((edge) => edge.type === "CATALYST_FOR" && edge.evidence?.verified === true);
  const capitalScore = finite(candidate.capitalMigrationForecastScore ?? candidate.capitalMigrationScore) ?? 0;
  const attentionGap = finite(candidate.attentionGapScore ?? candidate.repricingGapScore) ?? 50;
  const priceMove = Math.abs(finite(candidate.priceChange24hPct) ?? 0);
  const upstream = clamp(verifiedCatalysts.length / 3);
  const capitalConfirmation = clamp(capitalScore / 100);
  const unpriced = clamp((attentionGap - priceMove) / 100 + 0.5);
  const propagation = clamp(upstream * 0.35 + capitalConfirmation * 0.35 + unpriced * 0.20 + clamp(narratives.length / 3) * 0.10);
  return {
    narrativePropagationScore: Number((propagation * 100).toFixed(2)),
    verifiedCatalystCount: verifiedCatalysts.length,
    narrativeCount: narratives.length,
    state: propagation >= 0.72 ? "CATALYST_TO_CAPITAL_PROPAGATION" : propagation >= 0.55 ? "NARRATIVE_PROPAGATION_DEVELOPING" : "NO_STRONG_PROPAGATION",
    causalClaimAllowed: false,
    policy: "Observed temporal/structural evidence only; this is not proof of causation.",
  };
}
