import fs from "fs";
import path from "path";
import { summarizeSniperIntegrity } from "../engines/sniperIntegrityGateEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.finalChain || "unknown",
    contractAddress: project.finalContractAddress || project.contractAddress || project.address || project.tokenAddress || "",
    sniperState: project.sniperState || "UNKNOWN",
    sniperQualified: Boolean(project.sniperQualified),
    sniperScore: project.sniperScore || 0,
    confidenceAdjustedSniperScore: project.confidenceAdjustedSniperScore || 0,
    sniperConfidence: project.sniperConfidence || "Unknown",
    preConsensusGapScore: project.preConsensusGapScore || 0,
    preConsensusGapConfidence: project.preConsensusGapConfidence || 0,
    lifecycleState: project.sniperLifecycleState || "UNKNOWN",
    outcomeLabel: project.primarySniperOutcomeLabel || "INSUFFICIENT_HISTORY",
    pointInTimeStatus: project.pointInTimeStatus || "UNKNOWN",
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    evidenceFamilies: project.sniperEvidenceFamilySummary || {},
    topFamilies: (project.sniperEvidenceFamilyList || [])
      .slice()
      .sort((a, b) => num(b.effectiveFamilyScore) - num(a.effectiveFamilyScore))
      .slice(0, 6)
      .map((item) => ({
        family: item.family,
        score: item.familyScore,
        confidence: item.familyConfidence,
        effectiveScore: item.effectiveFamilyScore,
      })),
    signalSequence: project.sniperSignalSequence || {},
    reasons: project.sniperReasons || [],
    blockers: project.sniperBlockingReasons || [],
    warnings: project.sniperWarningReasons || [],
    invalidationConditions: project.sniperInvalidationConditions || [],
    calibration: project.sniperCalibration || {},
    explanation: project.sniperIntegrityGate?.explanation || {},
  };
}

function ranked(projects = []) {
  return [...projects].sort(
    (a, b) =>
      num(b.confidenceAdjustedSniperScore) - num(a.confidenceAdjustedSniperScore) ||
      num(b.sniperScore) - num(a.sniperScore)
  );
}

export function buildSniperReport(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const ordered = ranked(safe.filter((project) => project.sniperIntegrityGate));

  return {
    ...summarizeSniperIntegrity(safe),
    schema: {
      finalFields: [
        "sniperState",
        "sniperQualified",
        "sniperScore",
        "confidenceAdjustedSniperScore",
        "sniperConfidence",
        "sniperReasons",
        "sniperBlockingReasons",
        "sniperWarningReasons",
        "sniperEvidenceFamilies",
        "sniperInvalidationConditions",
      ],
      states: [
        "DISCOVERED",
        "IDENTITY_PENDING",
        "UNVERIFIED",
        "FORMING",
        "EARLY_BUILD",
        "LIQUIDITY_FORMING",
        "QUIET_ACCUMULATION",
        "FUNDAMENTALS_ACCELERATING",
        "ARMED",
        "BREAKOUT_STARTING",
        "CONFIRMED_EXPANSION",
        "LATE_CHASE",
        "FAILED_BREAKOUT",
        "DISTRIBUTION",
        "DISTRESSED",
        "RECOVERY_ATTEMPT",
        "INVALIDATED",
        "BLOCKED",
      ],
    },
    operatingRules: [
      "The scanner may return no ARMED candidates.",
      "No older supporting engine can override Sniper Integrity Gate.",
      "ARMED requires final selection integrity, verified identity, route, exit liquidity, persistence, confidence, and independent evidence families.",
      "Probability fields remain unavailable when comparable historical sample size is insufficient.",
    ],
    armedSniperCandidates: ordered.filter((project) => project.sniperQualified && project.sniperState === "ARMED").map(compact),
    quietAccumulation: ordered.filter((project) => project.sniperState === "QUIET_ACCUMULATION").slice(0, 25).map(compact),
    fundamentalsAccelerating: ordered.filter((project) => project.sniperState === "FUNDAMENTALS_ACCELERATING").slice(0, 25).map(compact),
    earlyDeveloperSignals: ordered.filter((project) => num(project.developerAccelerationScore || project.developerActivityScore) >= 60).slice(0, 25).map(compact),
    smartWalletAccumulation: ordered.filter((project) => num(project.smartWalletAccumulationScore) >= 60).slice(0, 25).map(compact),
    liquidityForming: ordered.filter((project) => num(project.liquidityFormationScore) >= 60).slice(0, 25).map(compact),
    verifiedUpcomingCatalysts: ordered.filter((project) => num(project.catalystQualityScore || project.liveCatalystRadarScore) >= 60).slice(0, 25).map(compact),
    prelaunchResearch: ordered.filter((project) => project.preConsensusCandidateType === "PRE_LAUNCH" || project.discoveryLane === "prelaunch").slice(0, 25).map(compact),
    neglectedReacceleration: ordered.filter((project) => project.preConsensusCandidateType === "NEGLECTED_REACCELERATION" || project.legitimateReacceleration).slice(0, 25).map(compact),
    developingSignals: ordered.filter((project) => ["FORMING", "EARLY_BUILD", "LIQUIDITY_FORMING"].includes(project.sniperState)).slice(0, 50).map(compact),
    lateChaseProjects: ordered.filter((project) => project.sniperState === "LATE_CHASE").slice(0, 50).map(compact),
    distressedProjects: ordered.filter((project) => ["DISTRESSED", "RECOVERY_ATTEMPT"].includes(project.sniperState)).slice(0, 50).map(compact),
    blockedProjects: ordered.filter((project) => (project.sniperBlockingReasons || []).length).slice(0, 75).map(compact),
    identityConflicts: ordered.filter((project) => project.finalSelectionState === "IDENTITY_CONFLICT" || project.identityConflict).slice(0, 50).map(compact),
    insufficientData: ordered.filter((project) => project.sniperDataStatus === "INSUFFICIENT").slice(0, 75).map(compact),
    topProjects: ordered.slice(0, 100).map(compact),
  };
}

export function writeSniperReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildSniperReport(projects);
  const filePath = path.join(reportsDir, "sniper-report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
