function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(v) || 0)); }
function curveProbability(commitment = {}, horizonHours = 6) {
  const rows = Array.isArray(commitment.arrivalCurve) ? commitment.arrivalCurve : [];
  if (!rows.length) return null;
  const exact = rows.find((row) => Number(row.horizonHours) === Number(horizonHours));
  const candidate = exact || rows.filter((row) => Number(row.horizonHours) <= horizonHours).at(-1) || rows[0];
  return finite(candidate?.deploymentProbabilityPct) !== null ? clamp(candidate.deploymentProbabilityPct / 100) : null;
}
function predictionDistribution(pathPrediction = {}) {
  if (pathPrediction?.state !== "PREDICTED_DESTINATION_SHADOW") return [];
  const rows = Array.isArray(pathPrediction.probabilities) ? pathPrediction.probabilities : [];
  return rows.map((row) => ({ projectKey: row.projectKey, probability: clamp(finite(row.probability) ?? ((finite(row.probabilityPct) ?? 0) / 100)) }))
    .filter((row) => row.projectKey && row.probability > 0);
}

export function buildCapitalConservationLedger(commitmentRows = [], pathPredictionRows = [], options = {}) {
  const horizonHours = Number(options.horizonHours || 6);
  const pathBySnapshot = new Map((Array.isArray(pathPredictionRows) ? pathPredictionRows : []).map((row) => [row?.feature?.snapshotId, row?.prediction]));
  const groups = new Map();
  for (const row of Array.isArray(commitmentRows) ? commitmentRows : []) {
    const key = row.feature?.fundingSourceFingerprint || `wallet:${row.feature?.walletAddress || row.feature?.snapshotId}`;
    const list = groups.get(key) || []; list.push(row); groups.set(key, list);
  }
  const wallets = [];
  const candidateTotals = new Map();
  let observedCapitalUsd = 0;
  let probabilityMassCapitalUsd = 0;

  for (const row of Array.isArray(commitmentRows) ? commitmentRows : []) {
    const capital = Math.max(0, finite(row.feature?.executionReadyCapitalUsd) ?? 0);
    observedCapitalUsd += capital;
    const deploymentProbability = curveProbability(row.commitment, horizonHours);
    const deploymentFraction = finite(row.commitment?.expectedDeploymentFraction);
    const correlationKey = row.feature?.fundingSourceFingerprint || `wallet:${row.feature?.walletAddress || row.feature?.snapshotId}`;
    const groupSize = groups.get(correlationKey)?.length || 1;
    const correlationWeight = groupSize > 1 ? 1 / Math.sqrt(groupSize) : 1;
    const deployable = deploymentProbability === null || deploymentFraction === null
      ? 0
      : capital * deploymentProbability * clamp(deploymentFraction) * correlationWeight;
    const path = pathBySnapshot.get(row.feature?.snapshotId);
    const distribution = predictionDistribution(path);
    const destinationMass = Math.min(1, distribution.reduce((sum, item) => sum + item.probability, 0));
    const allocations = distribution.map((item) => {
      const usd = deployable * item.probability;
      candidateTotals.set(item.projectKey, (candidateTotals.get(item.projectKey) || 0) + usd);
      return { projectKey: item.projectKey, probabilityPct: Number((item.probability * 100).toFixed(2)), expectedArrivingCapitalUsd: Number(usd.toFixed(2)) };
    });
    const assignedUsd = allocations.reduce((sum, item) => sum + item.expectedArrivingCapitalUsd, 0);
    const outsideOrUnassignedUsd = Math.max(0, deployable * (1 - destinationMass));
    const noDeploymentOrUncommittedUsd = Math.max(0, capital - deployable);
    probabilityMassCapitalUsd += assignedUsd + outsideOrUnassignedUsd + noDeploymentOrUncommittedUsd;
    wallets.push({
      walletAddress: row.feature?.walletAddress || null,
      snapshotId: row.feature?.snapshotId || null,
      observedCapitalUsd: capital,
      deploymentProbabilityPct: deploymentProbability === null ? null : Number((deploymentProbability * 100).toFixed(2)),
      expectedDeploymentFraction: deploymentFraction,
      fundingCorrelationGroupSize: groupSize,
      correlationWeight: Number(correlationWeight.toFixed(4)),
      independenceAdjustedDeployableUsd: Number(deployable.toFixed(2)),
      allocations,
      outsideOrUnassignedUsd: Number(outsideOrUnassignedUsd.toFixed(2)),
      noDeploymentOrUncommittedUsd: Number(noDeploymentOrUncommittedUsd.toFixed(2)),
      conserved: assignedUsd + outsideOrUnassignedUsd + noDeploymentOrUncommittedUsd <= capital + 0.05,
    });
  }

  return {
    horizonHours,
    observedCapitalUsd: Number(observedCapitalUsd.toFixed(2)),
    probabilityMassCapitalUsd: Number(probabilityMassCapitalUsd.toFixed(2)),
    conservationSatisfied: probabilityMassCapitalUsd <= observedCapitalUsd + 0.05,
    candidateExpectedArrivalUsd: Object.fromEntries([...candidateTotals.entries()].map(([key, value]) => [key, Number(value.toFixed(2))])),
    wallets,
    shadowOnly: true,
    rankingInfluence: false,
    loadedVacuumInfluence: false,
    warning: "Shared funding-source fingerprints trigger a conservative correlation discount but are not treated as proof of common ownership.",
  };
}

export const __capitalConservationLedgerHooks = { curveProbability, predictionDistribution };
