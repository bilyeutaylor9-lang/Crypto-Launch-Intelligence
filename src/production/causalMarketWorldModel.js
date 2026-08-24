import { clamp, finite, identityKey, mean, stableHash, timestamp } from "./productionMath.js";

function asArray(value) { return Array.isArray(value) ? value : []; }
function atOrBefore(row = {}, asOfMs) {
  const at = timestamp(row.observedAt || row.generatedAt || row.timestamp || row.at);
  return at === null || asOfMs === null || at <= asOfMs;
}
function nodeId(type, value) { return `${String(type).toUpperCase()}:${String(value || "UNKNOWN")}`; }
function normalizeNarratives(project = {}) {
  return [...new Set(asArray(project.narratives || project.tags || project.themes || project.categories)
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}
function edgeKey(from, to, relation) { return `${from}|${relation}|${to}`; }
function mergeEdge(map, edge) {
  const key = edgeKey(edge.from, edge.to, edge.relation);
  const current = map.get(key);
  if (!current) { map.set(key, { ...edge, evidenceCount: 1 }); return; }
  const count = current.evidenceCount + 1;
  map.set(key, {
    ...current,
    strength: Number((((current.strength || 0) * current.evidenceCount + (edge.strength || 0)) / count).toFixed(4)),
    confidence: Number((((current.confidence || 0) * current.evidenceCount + (edge.confidence || 0)) / count).toFixed(4)),
    lagHours: edge.lagHours ?? current.lagHours,
    persistenceHours: Math.max(current.persistenceHours || 0, edge.persistenceHours || 0),
    evidenceCount: count,
  });
}

export function buildCausalMarketWorldModel(input = {}, options = {}) {
  const asOf = options.asOf || input.generatedAt || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  const projects = asArray(input.projects).filter((row) => atOrBefore(row, asOfMs));
  const nodes = new Map(); const edges = new Map();
  const regime = input.regime || input.globalRegime || {};
  const regimeState = String(regime.state || regime.globalMarketRegimeState || "UNKNOWN");
  const regimeNode = nodeId("REGIME", regimeState);
  nodes.set(regimeNode, { id: regimeNode, type: "REGIME", label: regimeState });

  for (const project of projects) {
    const key = identityKey(project); const projectNode = nodeId("PROJECT", key);
    const chain = String(project.chain || project.canonicalChain || "unknown").toLowerCase();
    const chainNode = nodeId("CHAIN", chain);
    nodes.set(projectNode, { id: projectNode, type: "PROJECT", identityKey: key, symbol: project.symbol || null, label: project.name || project.symbol || key });
    nodes.set(chainNode, { id: chainNode, type: "CHAIN", label: chain });
    const migration = clamp((finite(project.capitalMigrationScore ?? project.capitalMigration?.score) ?? 0) / 100);
    const regimeCompatibility = clamp((finite(project.regimeCompatibilityScore) ?? 50) / 100);
    mergeEdge(edges, { from: regimeNode, to: chainNode, relation: "REGIME_SUPPORTS_CHAIN", direction: 1, strength: regimeCompatibility, confidence: clamp((finite(regime.confidencePct ?? regime.confidence) ?? 50) / 100), lagHours: 0, persistenceHours: 6 });
    mergeEdge(edges, { from: chainNode, to: projectNode, relation: "CHAIN_CAPITAL_TO_PROJECT", direction: 1, strength: migration, confidence: clamp((finite(project.evidenceCoveragePct ?? project.observationCoveragePct) ?? 50) / 100), lagHours: finite(project.capitalMigration?.estimatedLeadHours) ?? 2, persistenceHours: 6 });

    for (const narrative of normalizeNarratives(project)) {
      const narrativeNode = nodeId("NARRATIVE", narrative); nodes.set(narrativeNode, { id: narrativeNode, type: "NARRATIVE", label: narrative });
      const propagation = clamp((finite(project.narrativePropagationScore ?? project.narrative?.narrativePropagationScore) ?? 0) / 100);
      mergeEdge(edges, { from: chainNode, to: narrativeNode, relation: "CHAIN_ROTATION_TO_NARRATIVE", direction: 1, strength: Math.max(migration * 0.7, propagation * 0.5), confidence: 0.55, lagHours: 1.5, persistenceHours: 8 });
      mergeEdge(edges, { from: narrativeNode, to: projectNode, relation: "NARRATIVE_TO_PROJECT", direction: 1, strength: propagation, confidence: clamp((finite(project.narrative?.confidencePct) ?? 50) / 100), lagHours: finite(project.narrative?.estimatedLagHours) ?? 1, persistenceHours: 6 });
    }

    for (const entityId of asArray(project.walletEntityIds)) {
      const entityNode = nodeId("WALLET_ENTITY", entityId); nodes.set(entityNode, { id: entityNode, type: "WALLET_ENTITY", label: entityId });
      const walletScore = clamp((finite(project.walletEntityScore) ?? 0) / 100);
      mergeEdge(edges, { from: entityNode, to: projectNode, relation: "ENTITY_CAPITAL_TO_PROJECT", direction: 1, strength: walletScore, confidence: clamp((finite(project.walletEntityConfidencePct) ?? 50) / 100), lagHours: 0.5, persistenceHours: 3 });
    }

    const liquidityNode = nodeId("MECHANISM", `${key}:liquidity`); nodes.set(liquidityNode, { id: liquidityNode, type: "MECHANISM", label: "liquidity" });
    const sellerNode = nodeId("MECHANISM", `${key}:seller_inventory`); nodes.set(sellerNode, { id: sellerNode, type: "MECHANISM", label: "seller_inventory" });
    const priceNode = nodeId("MECHANISM", `${key}:price`); nodes.set(priceNode, { id: priceNode, type: "MECHANISM", label: "price" });
    mergeEdge(edges, { from: projectNode, to: liquidityNode, relation: "PROJECT_TO_LIQUIDITY_STATE", direction: 1, strength: clamp((finite(project.liquidityConvexityIndex) ?? finite(project.liquidityExpansionScore) ?? 0) / 100), confidence: 0.55, lagHours: 0, persistenceHours: 2 });
    mergeEdge(edges, { from: sellerNode, to: priceNode, relation: "SELLER_INVENTORY_TO_PRICE", direction: -1, strength: clamp((finite(project.sellerExhaustionScore) ?? 0) / 100), confidence: 0.6, lagHours: 0.5, persistenceHours: 2 });
    mergeEdge(edges, { from: liquidityNode, to: priceNode, relation: "LIQUIDITY_TO_PRICE", direction: 1, strength: clamp((finite(project.liquidityConvexityIndex) ?? 0) / 100), confidence: 0.55, lagHours: 0.5, persistenceHours: 2 });
  }

  const eventRows = asArray(input.events).filter((row) => atOrBefore(row, asOfMs));
  for (const event of eventRows) {
    const from = event.fromNode || event.from; const to = event.toNode || event.to;
    if (!from || !to) continue;
    const fromId = String(from), toId = String(to); nodes.set(fromId, nodes.get(fromId) || { id: fromId, type: event.fromType || "EVENT_NODE", label: fromId }); nodes.set(toId, nodes.get(toId) || { id: toId, type: event.toType || "EVENT_NODE", label: toId });
    mergeEdge(edges, { from: fromId, to: toId, relation: event.relation || "OBSERVED_ASSOCIATION", direction: Number(event.direction || 1) >= 0 ? 1 : -1, strength: clamp(event.strength ?? 0.5), confidence: clamp(event.confidence ?? 0.5), lagHours: finite(event.lagHours), persistenceHours: finite(event.persistenceHours) ?? 1 });
  }

  const edgeRows = [...edges.values()];
  return {
    schemaVersion: 1, modelVersion: "causal-market-world-model-v1", generatedAt: asOf,
    graphId: stableHash({ asOf, nodes: [...nodes.keys()].sort(), edges: edgeRows.map((e) => edgeKey(e.from,e.to,e.relation)).sort() }).slice(0,24),
    nodes: [...nodes.values()], edges: edgeRows,
    summary: { nodes: nodes.size, edges: edgeRows.length, projects: projects.length, observedEvents: eventRows.length },
    policy: { observedAssociationsOnly: true, causalClaimAllowed: false, futureEvidenceAllowed: false, automaticTrading: false, productionRankingInfluence: false },
  };
}

export function strongestPaths(model = {}, targetNode, options = {}) {
  const maxDepth = Math.max(1, Math.min(6, Number(options.maxDepth || 4))); const topK = Math.max(1, Number(options.topK || 8));
  const incoming = new Map(); for (const edge of asArray(model.edges)) { if (!incoming.has(edge.to)) incoming.set(edge.to, []); incoming.get(edge.to).push(edge); }
  const results = [];
  function walk(node, path, strength, confidence, depth, seen) {
    if (depth >= maxDepth) return;
    for (const edge of incoming.get(node) || []) {
      if (seen.has(edge.from)) continue;
      const nextStrength = strength * clamp(edge.strength); const nextConfidence = confidence * clamp(edge.confidence);
      const nextPath = [edge, ...path]; results.push({ from: edge.from, to: targetNode, path: nextPath, pathStrength: nextStrength, pathConfidence: nextConfidence, totalLagHours: nextPath.reduce((s,e)=>s+(finite(e.lagHours)??0),0) });
      const nextSeen = new Set(seen); nextSeen.add(edge.from); walk(edge.from, nextPath, nextStrength, nextConfidence, depth + 1, nextSeen);
    }
  }
  walk(targetNode, [], 1, 1, 0, new Set([targetNode]));
  return results.sort((a,b)=>(b.pathStrength*b.pathConfidence)-(a.pathStrength*a.pathConfidence)).slice(0,topK);
}
