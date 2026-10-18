import { analyzeExecutionProof } from "../engines/executionProofEngine.js";
import { analyzeFinalSelectionIntegrity, FINAL_SELECTION_STATES } from "../engines/finalSelectionIntegrityEngine.js";
import { attachCandidateTruthState } from "../kernel/candidateTruthState.js";
import { isDeferredBeforeDeep } from "../kernel/evidenceFunnelSummary.js";
import { executionTruthState, hasFreshTokenAuthorityEvidence, isLiveExecutionReady, routeQuoteFresh } from "./routeTruthV2.js";

const SELECTION_FLAGS = [
  "smallCapHunterSelected", "proofOfAlphaExecutionTwinSelected", "executionVerifiedSelected",
  "strongBuySelected", "researchPickSelected", "preConsensusCandidateSelected", "finalCandidateSelected",
];
const EXECUTION_FLAGS = ["liveExecutionReady", "executionReady", "executionRouteAvailable", "executionProofVerified"];
const FINAL_FIELDS = [
  "finalSelectionState", "finalSelectionReasons", "finalBlockingReasons", "finalWarningReasons",
  "finalIntegrityScore", "finalIntegrityVerdict", "selectionAuditTrail", "deselectedBy", "deselectionReasons",
  "finalSelectionInvariantViolations", "finalSelectionInvariantStatus", "criticalIntegrityWarning", "finalAuthorityEngine",
];

function hasPositiveExecution(source = {}) {
  if (!source) return false;
  return EXECUTION_FLAGS.some((key) => source[key] === true) ||
    [source.executionProofState, source.routeTruthStatus, source.executionProofActionability].includes("LIVE_EXECUTION_READY") ||
    source.routeExecutionReadiness === "ROUTE_EXECUTION_READY" ||
    source.finalProjectExecutionReadiness === "FINAL_PROJECT_EXECUTION_READY";
}

function demoteExecution(source, state, status, actionability) {
  const output = { ...source };
  for (const key of EXECUTION_FLAGS) if (source[key] === true) output[key] = false;
  for (const key of ["executionProofState", "routeTruthStatus"]) {
    if (source[key] === "LIVE_EXECUTION_READY") output[key] = state;
  }
  if (source.executionStatus === "VERIFIED") output.executionStatus = status;
  if (source.routeExecutionReadiness === "ROUTE_EXECUTION_READY") output.routeExecutionReadiness = "ROUTE_NOT_READY";
  if (source.executionProofActionability === "LIVE_EXECUTION_READY") output.executionProofActionability = actionability;
  return output;
}

function demoteFinalReadiness(source) {
  return source.finalProjectExecutionReadiness === "FINAL_PROJECT_EXECUTION_READY"
    ? { ...source, finalProjectExecutionReadiness: "FINAL_PROJECT_NOT_READY" } : source;
}

export function revalidateExecutionAtPublication(project = {}) {
  if (isDeferredBeforeDeep(project)) return project;
  const proof = project.executionProof;
  const selected = project.finalSelectionQualified === true || project.finalSelectionState === "QUALIFIED" ||
    SELECTION_FLAGS.some((key) => project[key] === true);
  if (!selected && !hasPositiveExecution(project) && !hasPositiveExecution(proof)) return project;

  const truth = attachCandidateTruthState(project);
  const hasCurrentSafety = ["safetyProofStatus", "safetyProofLane", "instantSafetyStatus", "contractSafetyVerified"]
    .some((key) => Object.hasOwn(project, key)) || Boolean(project.securityEvidence?.status);
  const analyzed = analyzeExecutionProof(project);
  const ready = isLiveExecutionReady(project) && routeQuoteFresh(project) &&
    hasFreshTokenAuthorityEvidence(project) && truth.candidateProofState.safety.status !== "BLOCKED" &&
    (!hasCurrentSafety || analyzed.executionProof.safetyVerified === true) &&
    (!proof || !Object.hasOwn(proof, "liveExecutionReady") || proof.liveExecutionReady === true);
  let output = project;
  if (!ready) {
    // Reuse the producer for demotion labels only, never its replacement proof,
    // verifiedAt, normalized legs, or source/authority timestamps.
    const currentState = proof?.executionProofState || proof?.routeTruthStatus;
    const fallbackState = executionTruthState(project);
    const state = currentState && currentState !== "LIVE_EXECUTION_READY" ? currentState
      : analyzed.executionProofState !== "LIVE_EXECUTION_READY" ? analyzed.executionProofState
        : truth.candidateProofState.safety.status === "BLOCKED" ? "SAFETY_PROOF_REQUIRED"
          : fallbackState === "LIVE_EXECUTION_READY" ? "NO_VERIFIED_ROUTE" : fallbackState;
    const status = analyzed.executionStatus === "VERIFIED" ? "UNKNOWN" : analyzed.executionStatus;
    const actionability = analyzed.executionProof.executionProofActionability === "LIVE_EXECUTION_READY"
      ? "MARKET_OBSERVED_RESEARCH_ONLY" : analyzed.executionProof.executionProofActionability;
    output = demoteExecution(project, state, status, actionability);
    if (project.purchaseRouteConfirmed === true) output.purchaseRouteConfirmed = false;
    if (proof) output.executionProof = demoteExecution(proof, state, status, actionability);
    if (project.executionReadinessState === "READY") {
      output.executionReadinessState = truth.executionReadinessState === "READY" ? "EXECUTION_REVIEW" : truth.executionReadinessState;
    }
    if (project.tradabilityState === "EXECUTION_READY") {
      output.tradabilityState = truth.tradabilityState === "EXECUTION_READY" ? "ROUTE_QUOTED" : truth.tradabilityState;
    }
    if (project.candidateProofState) {
      const globalRoute = project.candidateProofState.globalRoute || {};
      const previousSafety = project.candidateProofState.safety || {};
      const currentSafety = truth.candidateProofState.safety;
      const demoteSafety = currentSafety.status === "BLOCKED" ||
        (previousSafety.status === "VERIFIED_SAFE" && currentSafety.status !== "VERIFIED_SAFE");
      output.candidateProofState = {
        ...project.candidateProofState,
        ...(demoteSafety ? {safety: {...previousSafety, ...currentSafety}} : {}),
        globalRoute: { ...globalRoute,
          ...(globalRoute.status === "ROUTE_VERIFIED" ? { status: truth.candidateProofState.globalRoute.status } : {}),
          ...(globalRoute.quoteFresh === true ? { quoteFresh: truth.candidateProofState.globalRoute.quoteFresh } : {}) },
      };
    }
  }

  if (selected) {
    const final = analyzeFinalSelectionIntegrity(output);
    const readinessDenied = !ready ||
      (Object.hasOwn(project, "liveExecutionReady") && project.liveExecutionReady !== true) ||
      (Object.hasOwn(project, "finalSelectionQualified") && project.finalSelectionQualified !== true);
    if (readinessDenied || final.finalSelectionQualified !== true) {
      output = { ...output };
      for (const key of FINAL_FIELDS) output[key] = final[key];
      if (final.finalSelectionQualified === true) {
        output.finalSelectionState = FINAL_SELECTION_STATES.INSUFFICIENT_DATA;
        output.finalSelectionReasons = [];
        output.finalWarningReasons = [...final.finalWarningReasons, "Execution readiness is not confirmed at publication."];
        output.finalIntegrityVerdict = "Research Only - Insufficient Data";
      }
      if (["BLOCKED", "IDENTITY_CONFLICT", "UNKNOWN"].includes(project.finalSelectionState)) {
        output.finalSelectionState = project.finalSelectionState;
      }
      output.finalSelectionQualified = false;
      for (const key of SELECTION_FLAGS) if (project[key] === true) output[key] = false;
      for (const [key, flag, rank] of [
        ["smallCapHunter", "smallCapHunterSelected", "selectionRank"],
        ["proofOfAlphaExecutionTwin", "proofOfAlphaExecutionTwinSelected", "rank"],
        ["preConsensusBreakoutHunter", "preConsensusCandidateSelected", null],
      ]) {
        if (project[key]) output[key] = { ...project[key], selected: false,
          finalSelectionState: output.finalSelectionState, finalIntegrityVerdict: output.finalIntegrityVerdict,
          ...(rank ? { [rank]: null } : {}),
          ...(key === "preConsensusBreakoutHunter" ? { finalSelectionQualified: false } : {}) };
        if (project[flag] === true && flag === "smallCapHunterSelected") output.smallCapHunterSelectionRank = null;
        if (project[flag] === true && flag === "proofOfAlphaExecutionTwinSelected") output.proofOfAlphaExecutionTwinRank = null;
      }
      if (Object.hasOwn(project, "finalCandidateRank")) output.finalCandidateRank = null;
    }
  }

  if (!ready || output.finalSelectionQualified !== true) {
    output = demoteFinalReadiness(output);
    if (output.executionProof) {
      const finalProof = demoteFinalReadiness(output.executionProof);
      if (finalProof !== output.executionProof) output = { ...output, executionProof: finalProof };
    }
  }
  return output;
}

export function revalidateExecutionPublicationBoundary(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(revalidateExecutionAtPublication);
}
