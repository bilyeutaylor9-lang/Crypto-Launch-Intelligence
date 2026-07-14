import fs from "fs";
import path from "path";
import { summarizeDiscoveryDecision } from "../engines/discoveryDecisionEngine.js";
import { summarizeProjectIdentity } from "../engines/projectIdentityEngine.js";
import { analyzeMissedWinnerLab } from "../engines/missedWinnerLabEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}, index = 0) {
  return {
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || "unknown",
    score: project.discoveryDecisionScore || 0,
    tier: project.discoveryDecisionTier || "UNVERIFIED",
    lifecycleStage: project.candidateLifecycleStage || "unknown",
    safety: project.instantSafetyStatus || "UNVERIFIED",
    organicFirewall: project.organicDemandFirewallStatus || "UNVERIFIED",
    identity: project.projectIdentityVerdict || "Unknown",
    whyRanked: project.discoveryDecision?.whyRanked || [],
    risks: project.discoveryDecision?.risks || project.riskFlags || [],
  };
}

function feed(projects = [], predicate = () => true, limit = 25) {
  return projects
    .filter(predicate)
    .sort((a, b) => num(b.discoveryDecisionScore) - num(a.discoveryDecisionScore))
    .slice(0, limit)
    .map(compact);
}

export function buildDiscoveryDecisionReport(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const decision = summarizeDiscoveryDecision(safeProjects);
  const identity = summarizeProjectIdentity(safeProjects);
  const missedWinnerLab = analyzeMissedWinnerLab(safeProjects, options.missedWinnerLab || {});
  const newDiscoveryStages = new Set(["CONTRACT_DETECTED", "PRE_POOL", "POOL_CREATED", "INITIAL_LIQUIDITY", "PRICE_DISCOVERY", "EARLY_TRACTION"]);
  const riskStatuses = new Set(["CRITICAL", "RESTRICTED"]);

  return {
    generatedAt: new Date().toISOString(),
    name: "Discovery Decision Engine v1",
    summary: {
      ...decision,
      identity,
      missedWinnerLab: {
        evaluatedBreakouts: missedWinnerLab.evaluatedBreakouts,
        detectedBreakouts: missedWinnerLab.detectedBreakouts,
        legitimateBreakoutRecallPct: missedWinnerLab.legitimateBreakoutRecallPct,
      },
    },
    feeds: {
      newDiscoveries: feed(safeProjects, (project) => newDiscoveryStages.has(project.candidateLifecycleStage), 30),
      verifiedEarlyOpportunities: feed(
        safeProjects,
        (project) =>
          ["PASS", "WATCH"].includes(project.instantSafetyStatus) &&
          ["PASS", "WATCH"].includes(project.organicDemandFirewallStatus) &&
          ["PASS", "WATCH"].includes(project.discoveryDecisionTier),
        20
      ),
      acceleratingProjects: feed(
        safeProjects,
        (project) =>
          ["accelerating", "improving"].includes(project.projectChangeState) ||
          num(project.accelerationScore) >= 65 ||
          num(project.liquidityExpansionScore) >= 65 ||
          num(project.buyerRetentionScore) >= 65,
        20
      ),
      criticalRisks: feed(
        safeProjects,
        (project) =>
          riskStatuses.has(project.instantSafetyStatus) ||
          riskStatuses.has(project.discoveryDecisionTier) ||
          riskStatuses.has(project.organicDemandFirewallStatus) ||
          num(project.deployerRiskScore) >= 75 ||
          num(project.liquidityControlRisk) >= 75,
        30
      ),
    },
    missedWinnerLab,
    operatingRules: [
      "Critical contract or sell-simulation failures cap the candidate before final ranking.",
      "Organic demand is separated into independent, same-funder, suspected bot, deployer-connected, and unclassified buyer groups.",
      "New pools are judged by lifecycle-specific requirements instead of mature-project requirements.",
      "Discovery score is split into discovery strength, organic demand, project quality, liquidity/execution, and catalyst potential.",
      "Missed-winner recall is the key learning metric: legitimate breakouts detected before their first 100% move.",
    ],
  };
}

export function writeDiscoveryDecisionReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildDiscoveryDecisionReport(projects, meta);
  const filePath = path.join(reportsDir, "discovery-decision-engine.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return { filePath, report };
}
