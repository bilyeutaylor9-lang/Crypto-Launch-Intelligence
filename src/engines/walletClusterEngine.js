function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function buyerBreakdown(project = {}) {
  const graph = project.projectIdentityGraph?.walletGraph || {};
  const graphBreakdown = graph.buyerBreakdown || {};
  const classifier = project.organicBuyerClassifier || {};
  const totalBuyers = Math.max(
    num(graphBreakdown.totalBuyers),
    num(classifier.uniqueBuyers),
    num(project.uniqueBuyers24h)
  );
  const independentBuyers = Math.max(
    num(graphBreakdown.independentBuyers),
    num(classifier.independentBuyers),
    num(project.independentBuyers24h)
  );
  const sameFunderBuyers = Math.max(num(graphBreakdown.sameFunderBuyers), num(classifier.sameFunderBuyers), num(project.sameFunderBuyers24h));
  const sniperBuyers = Math.max(num(graphBreakdown.sniperBuyers), num(classifier.sniperBuyers), num(project.sniperBuyers24h));
  const deployerConnectedBuyers = Math.max(num(graphBreakdown.deployerConnectedBuyers), num(project.deployerConnectedBuyers));
  const unclassifiedBuyers = Math.max(0, totalBuyers - independentBuyers - sameFunderBuyers - sniperBuyers - deployerConnectedBuyers);

  return {
    totalBuyers,
    independentBuyers,
    sameFunderBuyers,
    sniperBuyers,
    deployerConnectedBuyers,
    unclassifiedBuyers,
  };
}

export function analyzeWalletCluster(project = {}) {
  const breakdown = buyerBreakdown(project);
  const clustered = breakdown.sameFunderBuyers + breakdown.sniperBuyers + breakdown.deployerConnectedBuyers;
  const clusteredShare = breakdown.totalBuyers > 0 ? clustered / breakdown.totalBuyers : 0;
  const independentShare = breakdown.totalBuyers > 0 ? breakdown.independentBuyers / breakdown.totalBuyers : 0;
  const walletClusterRiskScore = Math.round(clamp(clusteredShare * 100 + breakdown.deployerConnectedBuyers * 0.45));
  const walletClusterScore = Math.round(clamp(35 + independentShare * 60 - walletClusterRiskScore * 0.45));

  return {
    ...project,
    walletClusterScore,
    walletClusterRiskScore,
    walletClusterVerdict:
      walletClusterRiskScore >= 70 ? "Manipulated Wallet Cluster" : walletClusterScore >= 70 ? "Distributed Buyers" : "Wallet Cluster Watch",
    walletCluster: {
      ...breakdown,
      clusteredBuyers: clustered,
      clusteredSharePct: Number((clusteredShare * 100).toFixed(2)),
      independentSharePct: Number((independentShare * 100).toFixed(2)),
    },
  };
}

export function analyzeWalletClusterBatch(projects = []) {
  return projects.map((project) => analyzeWalletCluster(project));
}
