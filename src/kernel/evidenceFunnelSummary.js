import { hasVerifiedBuyQuote, hasVerifiedSellQuote, hasVerifiedRouteDepth, hasVerifiedRouteSlippage,
  isLiveExecutionReady, routeQuoteFresh } from "../execution/routeTruthV2.js";
import { buildCandidateProofState, deterministicCandidateBlocks } from "./candidateTruthState.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function average(values = []) {
  const measured = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  return measured.length
    ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length)
    : 0;
}

export function isDeferredBeforeDeep(project = {}) {
  return project.deepEvaluationState === "DEFERRED_BEFORE_DEEP";
}

export function coreEvidenceState(project = {}) {
  if (isDeferredBeforeDeep(project)) return "DEFERRED_BEFORE_DEEP";
  if (project.engineDataReadiness?.coreDataStarved === true) return "CORE_DATA_STARVED";

  const status = String(
    project.coreEvidenceState ||
      project.engineDataReadinessStatus ||
      project.engineDataReadiness?.status ||
      ""
  ).toUpperCase();
  if (status === "CORE_DATA_STARVED") return "CORE_DATA_STARVED";
  if (["CORE_PARTIAL", "CORE_EVIDENCE_PARTIAL"].includes(status)) {
    return "CORE_EVIDENCE_PARTIAL";
  }
  if (["CORE_READY", "CORE_EVIDENCE_READY"].includes(status)) {
    return "CORE_EVIDENCE_READY";
  }
  return "CORE_EVIDENCE_UNKNOWN";
}

export function advisoryEvidenceState(project = {}) {
  if (isDeferredBeforeDeep(project)) return "DEFERRED_BEFORE_DEEP";
  const hasGaps =
    project.advisoryDataGaps === true ||
    project.engineDataReadiness?.advisoryDataGaps === true ||
    num(project.engineDataReadiness?.advisoryGapCount) > 0;
  return hasGaps ? "ADVISORY_DATA_GAPS" : "ADVISORY_EVIDENCE_READY";
}

export function hasVerifiedExecutionRoute(project = {}) {
  const proof = project.executionProof;
  if (proof && typeof proof === "object" && !Array.isArray(proof) && Object.keys(proof).length) {
    // The current producer's result outranks flags retained from an earlier recovery pass.
    return isLiveExecutionReady(project);
  }
  const state = String(
    project.routeTruthStatus ||
      project.executionProofState ||
      project.executionStatus ||
      project.candidateProofState?.globalRoute?.status ||
      ""
  ).toUpperCase();
  return Boolean(
    project.executionProofVerified === true ||
      project.liveExecutionReady === true ||
      project.executionReady === true ||
      isLiveExecutionReady(project) ||
      ["LIVE_EXECUTION_READY", "ROUTE_VERIFIED", "EXECUTION_READY"].includes(state)
  );
}

export function decisionProofAssessment(project = {}) {
  const state = String(project.finalSelectionState || "").toUpperCase();
  const proof = project.executionProof || {};
  const proofStatus = String(proof.executionStatus || proof.executionProofState || "").toUpperCase();
  const conclusivelyRejected = ["BLOCKED", "IDENTITY_CONFLICT"].includes(state) ||
    deterministicCandidateBlocks(project).length > 0 ||
    ["CONTRACT_MISMATCH", "CHAIN_MISMATCH", "HONEYPOT_RISK", "REJECTED"].includes(proofStatus);
  if (conclusivelyRejected) return { conclusivelyRejected: true, missingFields: [] };
  const snapshot = buildCandidateProofState(project);
  const missingFields = [];
  if (snapshot.identity.exactIdentityVerified !== true) missingFields.push("IDENTITY");
  if (proof.safetyVerified === false ||
    (proof.safetyVerified !== true && snapshot.safety.status !== "VERIFIED_SAFE")) missingFields.push("SAFETY");
  if (!hasVerifiedBuyQuote(project)) missingFields.push("BUY_QUOTE");
  if (!hasVerifiedSellQuote(project)) missingFields.push("SELL_QUOTE");
  if (!routeQuoteFresh(project)) missingFields.push("QUOTE_FRESHNESS");
  if (!hasVerifiedRouteDepth(project)) missingFields.push("ROUTE_DEPTH");
  if (!hasVerifiedRouteSlippage(project)) missingFields.push("VERIFIED_SLIPPAGE");
  if (proof.transferTaxEvidenceRequired === true && proof.transferTaxEvidenceVerified !== true) missingFields.push("TRANSFER_TAX");
  if (proof.authorityEvidenceRequired === true &&
    (proof.authorityEvidenceVerified !== true || proof.authoritySafetyClean !== true)) missingFields.push("TOKEN_AUTHORITY");
  if (proof.userAccessEvidenceRequired === true && proof.userAccessVerified !== true) missingFields.push("USER_ACCESS");
  if (!isLiveExecutionReady(project) && !missingFields.length) missingFields.push("LIVE_EXECUTION_PROOF");
  return { conclusivelyRejected: false, missingFields };
}

export function attachCandidateEvidenceState(project = {}) {
  const coreState = coreEvidenceState(project);
  const advisoryState = advisoryEvidenceState(project);
  const finalState = String(project.finalSelectionState || "").toUpperCase();
  const deterministicBlocked =
    finalState === "BLOCKED" || deterministicCandidateBlocks(project).length > 0;
  const proof = project.executionProof;
  const hasCurrentProof = proof && typeof proof === "object" && !Array.isArray(proof) && Object.keys(proof).length > 0;
  const qualified = (finalState === "QUALIFIED" || project.finalSelectionQualified === true) &&
    !deterministicBlocked && (!hasCurrentProof || isLiveExecutionReady(project));
  const candidateEvidenceState = qualified
    ? "QUALIFIED"
    : deterministicBlocked
      ? "FINAL_BLOCKED"
      : coreState;

  return {
    ...project,
    coreEvidenceState: coreState,
    advisoryEvidenceState: advisoryState,
    advisoryDataGaps: advisoryState === "ADVISORY_DATA_GAPS",
    candidateEvidenceState,
  };
}

export function summarizeEvidenceFunnel(projects = []) {
  const safeProjects = (Array.isArray(projects) ? projects : []).map(
    attachCandidateEvidenceState
  );
  const progressive = safeProjects.some((project) =>
    ["DEEP_EVALUATED", "DEFERRED_BEFORE_DEEP", "SELECTED_FOR_DEEP"].includes(
      project.deepEvaluationState
    )
  );
  const deepDeferred = progressive
    ? safeProjects.filter(isDeferredBeforeDeep).length
    : 0;
  const deepProjects = progressive
    ? safeProjects.filter((project) => project.deepEvaluationState === "DEEP_EVALUATED")
    : safeProjects;
  const byCoreState = (state) =>
    deepProjects.filter((project) => project.coreEvidenceState === state).length;
  const coreEvidenceReady = byCoreState("CORE_EVIDENCE_READY");
  const coreEvidencePartial = byCoreState("CORE_EVIDENCE_PARTIAL");
  const coreDataStarved = byCoreState("CORE_DATA_STARVED");
  const coreEvidenceUnknown = byCoreState("CORE_EVIDENCE_UNKNOWN");
  const advisoryDataGaps = deepProjects.filter(
    (project) => project.advisoryEvidenceState === "ADVISORY_DATA_GAPS"
  ).length;
  const verifiedRoutes = deepProjects.filter(hasVerifiedExecutionRoute).length;
  const fullyQualified = deepProjects.filter(
    (project) => project.candidateEvidenceState === "QUALIFIED"
  ).length;
  const deterministicallyBlocked = deepProjects.filter(
    (project) =>
      project.finalSelectionState === "BLOCKED" ||
      deterministicCandidateBlocks(project).length > 0
  ).length;
  const coreEvidenceCoveragePct = average(
    deepProjects.map((project) =>
      project.coreEvidenceCoveragePct ??
      project.engineDataReadiness?.coreEvidenceCoveragePct
    )
  );
  const advisoryEvidenceCoveragePct = average(
    deepProjects.map((project) =>
      project.advisoryEvidenceCoveragePct ??
      project.engineDataReadiness?.advisoryEvidenceCoveragePct
    )
  );
  const coreDataStarvedPct = deepProjects.length
    ? Math.round((coreDataStarved / deepProjects.length) * 10_000) / 100
    : 0;
  const decisions = deepProjects.map((project) => ({ project, ...decisionProofAssessment(project) }));
  const unresolvedDecisionEvidence = decisions.filter((item) => item.missingFields.length > 0).length;
  const decisionProofMissingFields = {};
  for (const item of decisions) for (const field of item.missingFields) {
    decisionProofMissingFields[field] = (decisionProofMissingFields[field] || 0) + 1;
  }
  const insufficientEvidenceCandidates = decisions.filter((item) => item.missingFields.length > 0 ||
    ["CORE_DATA_STARVED", "CORE_EVIDENCE_PARTIAL", "CORE_EVIDENCE_UNKNOWN"].includes(item.project.coreEvidenceState)).length;
  const healthyDecisionEvidence = deepProjects.length > 0 && unresolvedDecisionEvidence === 0;
  const healthyCoreEvidence =
    deepProjects.length > 0 &&
    coreEvidenceCoveragePct >= 85 &&
    coreDataStarvedPct < 20;
  const selectionOutcome = fullyQualified > 0
    ? "EDGE_FOUND"
    : healthyCoreEvidence && healthyDecisionEvidence
      ? "NO_EDGE_FOUND"
      : "DATA_DEGRADED";

  return {
    standardCandidates: safeProjects.length,
    deepDeferred,
    deepEvaluated: deepProjects.length,
    coreEvidenceReady,
    coreEvidencePartial,
    coreDataStarved,
    coreEvidenceUnknown,
    advisoryDataGaps,
    verifiedRoutes,
    fullyQualified,
    deterministicallyBlocked,
    coreEvidenceCoveragePct,
    advisoryEvidenceCoveragePct,
    coreDataStarvedPct,
    healthyCoreEvidence,
    healthyDecisionEvidence,
    decisionEvidenceComplete: decisions.filter((item) => !item.conclusivelyRejected && !item.missingFields.length).length,
    conclusivelyRejected: decisions.filter((item) => item.conclusivelyRejected).length,
    unresolvedDecisionEvidence,
    decisionProofMissingFields,
    insufficientEvidenceCandidates,
    selectionOutcome,
    emptyResultLabel:
      fullyQualified > 0
        ? "QUALIFIED_MOVE_AVAILABLE"
        : verifiedRoutes > 0
          ? "NO_FULLY_QUALIFIED_MOVE"
          : "NO_VERIFIED_ROUTE",
    policy:
      "Deferred candidates are excluded from deep evidence denominators. Advisory gaps stay visible but cannot create core starvation or qualification.",
  };
}
