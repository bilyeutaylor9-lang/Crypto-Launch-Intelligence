import { stableHash, strictIdentityKey } from "./productionMath.js";

function nodeId(type, value) {
  return `${type}:${stableHash(String(value)).slice(0, 18)}`;
}

export function buildAlphaMemoryGraph(input = {}, options = {}) {
  const nodes = new Map();
  const edges = [];
  let rejectedIdentityRows = 0;
  const addNode = (type, key, data = {}) => {
    if (!key) return null;
    const id = nodeId(type, key);
    if (!nodes.has(id)) nodes.set(id, { id, type, key, ...data });
    return id;
  };
  const link = (from, to, type, data = {}) => {
    if (from && to) edges.push({ from, to, type, ...data });
  };

  for (const project of input.projects || []) {
    const identity = strictIdentityKey(project);
    if (!identity) {
      rejectedIdentityRows += 1;
      continue;
    }
    const projectId = addNode("project", identity, { symbol: project.symbol || null });
    const regimeId = addNode("regime", project.regimeState || project.globalMarketRegimeState);
    link(projectId, regimeId, "OBSERVED_IN_REGIME");
    for (const signal of project.verifiedSignals || project.signals || []) {
      const signalId = addNode("signal", signal);
      link(projectId, signalId, "HAS_SIGNAL");
    }
    for (const entity of project.entityIds || []) {
      const entityId = addNode("entity", entity);
      link(entityId, projectId, "PARTICIPATED_IN");
    }
  }

  for (const prediction of input.predictions || []) {
    const identity = strictIdentityKey(prediction);
    if (!identity) {
      rejectedIdentityRows += 1;
      continue;
    }
    const predictionId = addNode("prediction", prediction.predictionId || stableHash(prediction));
    const projectId = addNode("project", identity);
    const modelId = addNode("model", prediction.modelVersion || prediction.modelId);
    link(modelId, predictionId, "GENERATED");
    link(predictionId, projectId, "PREDICTED_PROJECT");
  }

  for (const hypothesis of input.hypotheses || []) {
    const hypothesisId = addNode("hypothesis", hypothesis.experimentId || hypothesis.hypothesisId);
    for (const signal of hypothesis.definition?.signals || hypothesis.signals || []) {
      link(hypothesisId, addNode("signal", signal), "USES_SIGNAL");
    }
  }

  for (const outcome of input.outcomes || []) {
    const identity = strictIdentityKey(outcome);
    if (!identity) {
      rejectedIdentityRows += 1;
      continue;
    }
    const outcomeId = addNode("outcome", outcome.observationId || outcome.outcomeId || stableHash(outcome));
    const projectId = addNode("project", identity);
    link(projectId, outcomeId, "RESOLVED_AS");
  }

  const maxNodes = Math.max(100, Number(options.maxNodes || 20_000));
  const maxEdges = Math.max(100, Number(options.maxEdges || 50_000));
  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    nodes: [...nodes.values()].slice(-maxNodes),
    edges: edges.slice(-maxEdges),
    rejectedIdentityRows,
    policy: {
      boundedGraph: true,
      researchMemoryOnly: true,
      exactIdentityRequired: true,
      automaticTrading: false,
    },
  };
}
