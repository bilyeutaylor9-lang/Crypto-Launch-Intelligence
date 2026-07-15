import fs from "fs";
import path from "path";
import { summarizePreConsensusBreakoutHunter } from "../engines/preConsensusBreakoutHunterEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  const hunter = project.preConsensusBreakoutHunter || {};

  return {
    rank: project.preConsensusRank || hunter.rank || null,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    contractAddress: project.finalContractAddress || project.contractAddress || project.address || project.tokenAddress || "",
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
    candidateType: project.preConsensusCandidateType || hunter.candidateType || "UNKNOWN",
    tier: project.preConsensusTier || "Unknown",
    consensusStage: project.estimatedConsensusStage || hunter.consensusStage || "UNKNOWN",
    preConsensusOpportunityScore: project.preConsensusOpportunityScore || 0,
    regimeAdjustedOpportunityScore: project.regimeAdjustedOpportunityScore || 0,
    informationAdvantageScore: project.informationAdvantageScore || 0,
    breakoutReadinessScore: project.breakoutReadinessScore || 0,
    quietAccumulationScore: project.quietAccumulationScore || 0,
    preBreakoutMomentumStage: project.preBreakoutMomentumStage || "UNKNOWN",
    antiManipulationConfidenceScore: project.antiManipulationConfidenceScore || 0,
    signalPersistenceScore: project.signalPersistenceScore || 0,
    topBullishSignals: project.topBullishSignals || [],
    topLeadingIndicators: project.topLeadingIndicators || [],
    topRisks: project.preConsensusTopRisks || project.finalBlockingReasons || [],
    hardBlockers: project.preConsensusHardBlockers || [],
    catalystTimeline: project.catalystTimeline || [],
    upsideScenarios: project.upsideScenarios || {},
    explanation: hunter.explanation || {},
  };
}

export function buildPreConsensusBreakoutReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.filter((project) => project.preConsensusBreakoutHunter);
  const ranked = [...analyzed].sort(
    (a, b) =>
      num(b.regimeAdjustedOpportunityScore) - num(a.regimeAdjustedOpportunityScore) ||
      num(b.informationAdvantageScore) - num(a.informationAdvantageScore)
  );

  return {
    ...summarizePreConsensusBreakoutHunter(safeProjects),
    schema: {
      candidateTypes: ["PRE_LAUNCH", "EARLY_LAUNCH", "NEGLECTED_REACCELERATION"],
      consensusStages: [
        "UNKNOWN",
        "TECHNICAL_EARLY",
        "SMART_MONEY_EARLY",
        "ECOSYSTEM_EARLY",
        "CRYPTO_NATIVE_DISCOVERY",
        "INFLUENCER_DISCOVERY",
        "RETAIL_DISCOVERY",
        "MAINSTREAM",
        "SATURATED",
      ],
      tiers: [
        "Exceptional Pre-Consensus Candidate",
        "High-Conviction Research Candidate",
        "Strong Early Watchlist",
        "Developing Signal",
        "Speculative Research Only",
        "Reject",
      ],
    },
    operatingRules: [
      "Hunt for improving fundamentals before broad price, social, exchange, or influencer recognition.",
      "Do not promote already-pumped, late-chase, blocked, unverified, or insufficient-data projects as actionable candidates.",
      "Use finalSelectionState and finalSelectionQualified as the final source of truth.",
      "Treat upside scenarios as research estimates, not predictions or financial advice.",
    ],
    exceptionalCandidates: ranked
      .filter((project) => project.preConsensusTier === "Exceptional Pre-Consensus Candidate" && project.finalSelectionQualified)
      .map(compact),
    highConvictionResearchCandidates: ranked
      .filter((project) => project.preConsensusTier === "High-Conviction Research Candidate" && project.finalSelectionQualified)
      .map(compact),
    quietAccumulation: ranked.filter((project) => project.quietAccumulationDetected).slice(0, 25).map(compact),
    upcomingCatalysts: ranked.filter((project) => (project.catalystTimeline || []).length).slice(0, 25).map(compact),
    newNativePools: ranked.filter((project) => project.normalizedNativePool || project.nativeLifecycle).slice(0, 25).map(compact),
    developerAcceleration: ranked
      .filter((project) => num(project.developerActivityScore ?? project.developerScore) >= 60 || num(project.githubProScore) >= 60)
      .slice(0, 25)
      .map(compact),
    smartWalletAccumulation: ranked
      .filter((project) => num(project.smartWalletAccumulationScore || project.smartMoneyAccumulationScore) >= 60)
      .slice(0, 25)
      .map(compact),
    narrativesForming: ranked
      .filter((project) => num(project.narrativeHeatScore || project.narrativeForecastScore) >= 60)
      .slice(0, 25)
      .map(compact),
    neglectedReacceleration: ranked
      .filter((project) => project.preConsensusCandidateType === "NEGLECTED_REACCELERATION")
      .slice(0, 25)
      .map(compact),
    researchOnly: ranked
      .filter((project) => !project.finalSelectionQualified && !["BLOCKED", "IDENTITY_CONFLICT"].includes(project.finalSelectionState))
      .slice(0, 50)
      .map(compact),
    blockedCandidates: ranked
      .filter((project) => project.finalSelectionState === "BLOCKED" || (project.preConsensusHardBlockers || []).length)
      .slice(0, 50)
      .map(compact),
    alreadyPumped: ranked
      .filter((project) => project.preBreakoutMomentumStage === "ALREADY_PUMPED" || project.preBreakoutMomentumStage === "LATE_CHASE")
      .slice(0, 50)
      .map(compact),
    identityConflicts: ranked
      .filter((project) => project.finalSelectionState === "IDENTITY_CONFLICT" || project.finalIdentityState === "CONFLICTED_IDENTITY")
      .slice(0, 50)
      .map(compact),
    topProjects: ranked.slice(0, 100).map(compact),
  };
}

export function writePreConsensusBreakoutReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildPreConsensusBreakoutReport(projects);
  const filePath = path.join(reportsDir, "pre-consensus-breakout-hunter.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
