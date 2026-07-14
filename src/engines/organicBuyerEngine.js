function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function statusFor(score = 0, risk = 0, hasBuyers = false) {
  if (!hasBuyers) return "UNVERIFIED";
  if (risk >= 80) return "CRITICAL";
  if (risk >= 60) return "RESTRICTED";
  if (score >= 65 && risk < 45) return "PASS";
  return "WATCH";
}

export function analyzeOrganicBuyer(project = {}) {
  const cluster = project.walletCluster || {};
  const classifier = project.organicBuyerClassifier || {};
  const totalBuyers = Math.max(num(cluster.totalBuyers), num(classifier.uniqueBuyers), num(project.uniqueBuyers24h));
  const independentBuyers = Math.max(num(cluster.independentBuyers), num(classifier.independentBuyers), num(project.independentBuyers24h));
  const sameFunderBuyers = Math.max(num(cluster.sameFunderBuyers), num(classifier.sameFunderBuyers), num(project.sameFunderBuyers24h));
  const suspectedBots = Math.max(num(cluster.sniperBuyers), num(classifier.sniperBuyers), num(project.sniperBuyers24h));
  const deployerConnected = Math.max(num(cluster.deployerConnectedBuyers), num(project.deployerConnectedBuyers));
  const unclassified = Math.max(0, totalBuyers - independentBuyers - sameFunderBuyers - suspectedBots - deployerConnected);
  const risk = Math.round(
    clamp(
      num(project.walletClusterRiskScore) * 0.35 +
        num(project.bundledLaunchRiskScore) * 0.25 +
        num(project.washTradingRiskScore) * 0.3 +
        (deployerConnected > 0 ? 12 : 0)
    )
  );
  const score = Math.round(
    clamp(
      num(project.organicBuyerScore) * 0.34 +
        num(project.walletClusterScore) * 0.22 +
        num(project.buyerRetentionScore) * 0.18 +
        num(project.smartWalletArrivalScore) * 0.16 +
        num(project.washTradingScore) * 0.1 -
        risk * 0.3
    )
  );
  const status = statusFor(score, risk, totalBuyers > 0);

  return {
    ...project,
    organicDemandFirewallScore: score,
    organicDemandFirewallRisk: risk,
    organicDemandFirewallStatus: status,
    organicBuyerEngine: {
      totalBuyers,
      independentBuyers,
      sameFunderBuyers,
      suspectedBots,
      deployerConnectedBuyers: deployerConnected,
      unclassifiedBuyers: unclassified,
      score,
      risk,
      status,
      explanation: [
        `${totalBuyers} total buyers`,
        `${independentBuyers} independently funded`,
        `${sameFunderBuyers} same-funder cluster`,
        `${suspectedBots} suspected bots/snipers`,
        `${deployerConnected} deployer-connected`,
        `${unclassified} unclassified`,
      ],
    },
  };
}

export function analyzeOrganicBuyerBatch(projects = []) {
  return projects.map((project) => analyzeOrganicBuyer(project));
}
