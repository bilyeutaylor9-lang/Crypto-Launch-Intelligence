import { readBuyerEvidence } from "../data/buyerEvidence.js";

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
  const evidence = readBuyerEvidence(project, { includeDerived: true });
  const { totalBuyers, independentBuyers, sameFunderBuyers, sniperBuyers: suspectedBots,
    deployerConnectedBuyers: deployerConnected, unclassifiedBuyers: unclassified } = evidence;
  const knownRisk = Math.round(
    clamp(
      num(project.walletClusterRiskScore) * 0.35 +
        num(project.bundledLaunchRiskScore) * 0.25 +
        num(project.washTradingRiskScore) * 0.3 +
        (deployerConnected > 0 ? 12 : 0)
    )
  );
  const risk = evidence.clusterEvidenceAvailable || knownRisk > 0 ? knownRisk : null;
  const score = evidence.clusterEvidenceAvailable ? Math.round(
    clamp(
      num(project.organicBuyerScore) * 0.34 +
        num(project.walletClusterScore) * 0.22 +
        num(project.buyerRetentionScore) * 0.18 +
        num(project.smartWalletArrivalScore) * 0.16 +
        num(project.washTradingScore) * 0.1 -
        knownRisk * 0.3
    )
  ) : null;
  const status = knownRisk >= 80 ? "CRITICAL" : knownRisk >= 60 ? "RESTRICTED"
    : statusFor(score, knownRisk, evidence.clusterEvidenceAvailable && totalBuyers > 0);

  return {
    ...project,
    organicDemandFirewallScore: score,
    organicDemandFirewallRisk: risk,
    organicDemandFirewallStatus: status,
    organicBuyerEngine: {
      dataStatus: evidence.dataStatus,
      classificationEvidenceAvailable: evidence.clusterEvidenceAvailable,
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
        `${totalBuyers ?? "UNKNOWN"} total buyers`,
        `${independentBuyers ?? "UNKNOWN"} independently funded`,
        `${sameFunderBuyers ?? "UNKNOWN"} same-funder cluster`,
        `${suspectedBots ?? "UNKNOWN"} suspected bots/snipers`,
        `${deployerConnected ?? "UNKNOWN"} deployer-connected`,
        `${unclassified ?? "UNKNOWN"} unclassified`,
      ],
    },
  };
}

export function analyzeOrganicBuyerBatch(projects = []) {
  return projects.map((project) => analyzeOrganicBuyer(project));
}
