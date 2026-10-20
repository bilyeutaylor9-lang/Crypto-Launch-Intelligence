import { readBuyerEvidence } from "../data/buyerEvidence.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function buyerBreakdown(project = {}) {
  return readBuyerEvidence(project, { includeDerived: true });
}

export function analyzeWalletCluster(project = {}) {
  const breakdown = buyerBreakdown(project);
  const clustered = breakdown.knownClusteredBuyers;
  const clusteredShare = breakdown.totalBuyers > 0 ? clustered / breakdown.totalBuyers : 0;
  const independentShare = breakdown.totalBuyers > 0 ? breakdown.independentBuyers / breakdown.totalBuyers : 0;
  const walletClusterRiskScore = breakdown.totalBuyers > 0 && (breakdown.clusterEvidenceAvailable || clustered > 0)
    ? Math.round(clamp(clusteredShare * 100 + num(breakdown.deployerConnectedBuyers) * 0.45)) : null;
  const walletClusterScore = breakdown.clusterEvidenceAvailable && breakdown.totalBuyers > 0
    ? Math.round(clamp(35 + independentShare * 60 - walletClusterRiskScore * 0.45)) : null;

  return {
    ...project,
    walletClusterScore,
    walletClusterRiskScore,
    walletClusterVerdict:
      walletClusterRiskScore !== null && walletClusterRiskScore >= 70 ? "Manipulated Wallet Cluster"
        : walletClusterScore === null ? "Wallet Cluster Evidence Unknown"
          : walletClusterScore >= 70 ? "Distributed Buyers" : "Wallet Cluster Watch",
    walletCluster: {
      ...breakdown,
      clusteredBuyers: breakdown.clusterEvidenceAvailable ? clustered : null,
      clusteredSharePct: breakdown.clusterEvidenceAvailable ? Number((clusteredShare * 100).toFixed(2)) : null,
      independentSharePct: breakdown.totalBuyers > 0 && breakdown.independentBuyers !== null ? Number((independentShare * 100).toFixed(2)) : null,
    },
  };
}

export function analyzeWalletClusterBatch(projects = []) {
  return projects.map((project) => analyzeWalletCluster(project));
}
