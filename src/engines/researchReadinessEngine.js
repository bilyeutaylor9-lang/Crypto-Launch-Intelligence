import { isLiveExecutionReady } from "../execution/routeTruthV2.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function hardSafetyBlocked(project = {}) {
  return (
    project.honeypotDetected === true ||
    project.sellRestricted === true ||
    project.identityConflict === true ||
    project.instantSafetyStatus === "CRITICAL" ||
    project.discoveryDecisionTier === "CRITICAL" ||
    num(project.washTradingRiskScore) >= 90 ||
    num(project.walletClusterRiskScore) >= 90
  );
}

export function analyzeResearchReadiness(project = {}) {
  const safetyBlocked = hardSafetyBlocked(project);
  const evidenceCoverage = clamp(project.earlyAsymmetryCoveragePct ?? project.coreEvidenceCoveragePct ?? project.engineDataReadinessScore ?? project.preRecoveryCoreEvidenceCoveragePct ?? project.preIntelligenceConfidence);
  const identity = clamp(project.identityResolutionScore ?? project.identityConfidence ?? (project.identityRescueStatus === "DISTINGUISHABLE_IDENTITY" ? 60 : 20));
  const sourceTruth = clamp(project.sourceTruthScore ?? project.sourceReliabilityScore ?? 40);
  const opportunity = clamp(project.earlyAsymmetryResearchPriorityScore ?? project.preIntelligenceOpportunityScore);
  const recoverable = project.starvationRecoveryPlan?.items?.filter((item) => item.recoverable).length || 0;
  const researchReadinessScore = Math.round(clamp(
    opportunity * 0.42 +
      evidenceCoverage * 0.2 +
      identity * 0.18 +
      sourceTruth * 0.14 +
      Math.min(100, recoverable * 12) * 0.06 -
      (safetyBlocked ? 100 : 0)
  ));
  const executionReady = isLiveExecutionReady(project);
  const researchEligible = !safetyBlocked && (researchReadinessScore >= 35 || project.starvationRescueEligible === true);
  const qualityQualified = !safetyBlocked && researchReadinessScore >= 65 && evidenceCoverage >= 45;

  return {
    ...project,
    researchReadinessScore,
    researchEligible,
    qualityQualified,
    executionReady,
    researchReadinessState: safetyBlocked
      ? "BLOCKED"
      : qualityQualified
        ? "READY_FOR_VERIFIED_RESEARCH"
        : researchEligible
          ? "RESEARCH_ELIGIBLE"
          : "INSUFFICIENT_RESEARCH_EVIDENCE",
    researchReadinessWarnings: [
      ...(executionReady ? [] : ["Execution readiness remains separate from research quality."]),
      ...(evidenceCoverage < 50 ? ["Evidence coverage is still low; do not qualify as a pick."] : []),
    ],
  };
}

export function analyzeResearchReadinessBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeResearchReadiness);
}
