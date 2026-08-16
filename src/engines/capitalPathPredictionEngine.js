function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectKey(project = {}, index = 0) {
  if (project.canonicalProjectId) return String(project.canonicalProjectId);
  const chain = String(project.chain || project.canonicalChain || project.network || project.chainId || "unknown").toLowerCase();
  const token = String(project.tokenAddress || project.contractAddress || project.address || "").toLowerCase();
  const pool = String(project.poolAddress || project.pairAddress || "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(token)) return `${chain}:${token}`;
  if (/^0x[0-9a-f]{40}$/.test(pool)) return `${chain}:pool:${pool}`;
  return `${chain}:symbol:${String(project.symbol || project.name || index).toLowerCase()}`;
}

export function aggregateCapitalPathPredictions(predictionRows = [], projects = []) {
  const aggregate = new Map();
  for (const [index, project] of (Array.isArray(projects) ? projects : []).entries()) {
    aggregate.set(projectKey(project, index), {
      projectKey: projectKey(project, index),
      predictedWalletCount: 0,
      inferredProbabilityWeightedCapitalUsd: 0,
      rawCapitalBehindPredictionsUsd: 0,
      predictions: [],
    });
  }
  for (const row of Array.isArray(predictionRows) ? predictionRows : []) {
    if (row?.prediction?.state !== "PREDICTED_DESTINATION_SHADOW") continue;
    const key = row.prediction.predictedProjectKey;
    const target = aggregate.get(key);
    if (!target) continue;
    const capital = finite(row.feature?.executionReadyCapitalUsd) ?? 0;
    const probability = (finite(row.prediction.empiricalProbabilityPct) ?? 0) / 100;
    target.predictedWalletCount += 1;
    target.rawCapitalBehindPredictionsUsd += capital;
    target.inferredProbabilityWeightedCapitalUsd += capital * probability;
    target.predictions.push({
      walletAddress: row.feature?.walletAddress || null,
      executionReadyCapitalUsd: capital,
      empiricalProbabilityPct: row.prediction.empiricalProbabilityPct,
      support: row.prediction.support,
      signatureLevel: row.prediction.signatureLevel,
      confidencePct: row.prediction.confidencePct,
    });
  }
  return aggregate;
}

export function analyzeCapitalPathPrediction(project = {}, options = {}) {
  const row = options.aggregate || null;
  if (!row || row.predictedWalletCount <= 0) {
    return {
      ...project,
      capitalPathPrediction: {
        state: "NO_VALIDATED_PATH_PREDICTION",
        predictedWalletCount: 0,
        inferredProbabilityWeightedCapitalUsd: 0,
        shadowOnly: true,
        rankingInfluence: false,
        loadedVacuumInfluence: false,
      },
    };
  }
  const capital = Number((row.inferredProbabilityWeightedCapitalUsd || 0).toFixed(2));
  return {
    ...project,
    capitalPathPrediction: {
      state: "PROBABILISTIC_DESTINATION_SHADOW",
      predictedWalletCount: row.predictedWalletCount,
      rawCapitalBehindPredictionsUsd: Number((row.rawCapitalBehindPredictionsUsd || 0).toFixed(2)),
      inferredProbabilityWeightedCapitalUsd: capital,
      predictions: row.predictions || [],
      evidenceClass: "EXPERIMENTAL_INFERRED",
      source: "LEAKAGE_SAFE_CAPITAL_PATH_MODEL",
      warning: "Probability-weighted capital is inferred from historical path analogs. It is not observed target demand and is intentionally excluded from Loaded Vacuum, Ignition phase, and production ranking decisions in v9.",
      shadowOnly: true,
      rankingInfluence: false,
      loadedVacuumInfluence: false,
    },
    capitalPathInferredUsd: project.capitalPathInferredUsd ?? capital,
  };
}

export function attachCapitalPathPredictions(projects = [], predictionRows = []) {
  const aggregate = aggregateCapitalPathPredictions(predictionRows, projects);
  return (Array.isArray(projects) ? projects : []).map((project, index) => analyzeCapitalPathPrediction(project, { aggregate: aggregate.get(projectKey(project, index)) }));
}

export const __capitalPathPredictionEngineTestHooks = { projectKey };
