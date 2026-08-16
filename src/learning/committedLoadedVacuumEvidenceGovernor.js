import fs from "node:fs";
import path from "node:path";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-evidence-governor.json");

function stateOf(report = {}) {
  return String(report?.state || report?.promotion?.state || report?.readiness?.state || "UNKNOWN");
}

export function buildCommittedLoadedVacuumEvidenceGovernor(inputs = {}) {
  const validationState = stateOf(inputs.validation);
  const attributionState = stateOf(inputs.attribution);
  const replicationState = stateOf(inputs.replication);
  const regimeState = stateOf(inputs.regimeRobustness);
  const executionState = stateOf(inputs.executionReality);

  const blockers = [];
  if (validationState !== "REVIEW_FOR_INDEPENDENT_REPLICATION") blockers.push("DISCOVERY_VALIDATION_NOT_READY");
  if (attributionState !== "ATTRIBUTION_READY_FOR_REPLICATION_REVIEW") blockers.push("ATTRIBUTION_NOT_READY");
  if (replicationState !== "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW") blockers.push("INDEPENDENT_REPLICATION_NOT_SUPPORTED");
  if (regimeState !== "REGIME_ROBUSTNESS_SUPPORTED_SHADOW") blockers.push("REGIME_ROBUSTNESS_NOT_SUPPORTED");
  if (executionState !== "EXECUTION_REALITY_SUPPORTED_SHADOW") blockers.push("EXECUTION_REALITY_NOT_SUPPORTED");

  let state = "SHADOW_EVIDENCE_STACK_INCOMPLETE";
  if (!blockers.length) state = "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW";
  else if (replicationState === "INDEPENDENT_REPLICATION_FAILED") state = "EDGE_REPLICATION_FAILED_STOP";
  else if (regimeState === "REGIME_FRAGILE_SHADOW") state = "EDGE_REGIME_FRAGILE_STOP";
  else if (executionState === "EXECUTION_REALITY_NOT_SUPPORTED_SHADOW") state = "EDGE_NOT_NET_EXECUTABLE_STOP";

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state,
    evidenceStates: {
      discoveryValidation: validationState,
      attribution: attributionState,
      independentReplication: replicationState,
      regimeRobustness: regimeState,
      executionReality: executionState,
    },
    blockers,
    canaryDesignReviewEligible: state === "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW",
    rankingInfluence: false,
    automaticProductionPromotion: false,
    automaticCanaryLaunch: false,
    policy: "V13 can only declare that the shadow evidence stack is strong enough for human canary-design review. It cannot change ranking, thresholds, position sizing, or launch a live trading experiment. Any failed replication, regime fragility, or lack of net executability is a stop state, not a retuning invitation.",
  };
}

export function runCommittedLoadedVacuumEvidenceGovernor(inputs = {}, options = {}) {
  const report = buildCommittedLoadedVacuumEvidenceGovernor(inputs);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_EVIDENCE_GOVERNOR_REPORT = REPORT;
export const __committedLoadedVacuumEvidenceGovernorHooks = { stateOf };
