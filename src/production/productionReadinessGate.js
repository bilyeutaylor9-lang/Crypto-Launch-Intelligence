import { finite } from "./productionMath.js";

function pass(name, condition, observed, required) {
  return { name, pass: Boolean(condition), observed, required };
}

export function evaluateProductionReadiness(inputs = {}, options = {}) {
  const environment = inputs.environment || {};
  const remotePersistence = inputs.remotePersistence || {};
  const remoteBackup = inputs.remoteBackup || {};
  const security = inputs.security || {};
  const edgeVerification = inputs.edgeVerification || {};
  const alphaLab = inputs.alphaLab || {};
  const leakage = inputs.leakageAudit?.status || inputs.backtest?.leakageAudit?.status;
  const walkForward = inputs.walkForward?.audit?.status || inputs.backtest?.walkForward?.audit?.status;
  const observability = inputs.observability || {};
  const calibration = inputs.calibration || {};
  const challenger = inputs.challenger || {};
  const outcomeCapture = finite(inputs.outcomeHealth?.captureRate);
  const identityIntegrity = finite(inputs.identityHealth?.exactIdentityRate);
  const reproducible = inputs.reproducibility?.pass === true;
  const restore = inputs.backupRestore?.pass === true;
  const faultInjection = inputs.faultInjection?.pass === true;

  const gates = [
    pass("LIVE_ENVIRONMENT", environment.state === "ENVIRONMENT_READY", environment.state, "ENVIRONMENT_READY"),
    pass("REMOTE_PERSISTENCE_READ", remotePersistence.state === "REMOTE_READ_HEALTHY", remotePersistence.state, "REMOTE_READ_HEALTHY"),
    pass("REMOTE_PERSISTENCE_WRITE_CAPABLE", remotePersistence.serverWriteCapable === true, remotePersistence.serverWriteCapable, "true"),
    pass("REMOTE_BACKUP", remoteBackup.pass === true, remoteBackup.state, "REMOTE_BACKUP_ATTESTED"),
    pass("SECURITY_AUDIT", security.pass === true, security.state, "SECURITY_AUDIT_PASS"),
    pass("FORWARD_EDGE_VERIFIED", edgeVerification.verified === true && edgeVerification.edgeState === "VERIFIED_FORWARD_EDGE", edgeVerification.edgeState, "VERIFIED_FORWARD_EDGE"),
    pass("ALPHA_LAB_GOVERNANCE", alphaLab.policy?.prospectiveFreezeRequired === true && alphaLab.policy?.discoverySampleCannotValidateSameHypothesis === true && alphaLab.policy?.automaticPromotion === false, alphaLab.policy || null, "prospective/future-only/no-auto-promotion"),
    pass("POINT_IN_TIME_LEAKAGE", leakage === "PASS", leakage, "PASS"),
    pass("WALK_FORWARD_AUDIT", walkForward === "PASS", walkForward, "PASS"),
    pass("OBSERVABILITY_HEALTH", Number(observability.healthScore || 0) >= 90, observability.healthScore, ">=90"),
    pass("CALIBRATION", calibration.state === "CALIBRATED", calibration.state, "CALIBRATED"),
    pass("OUTCOME_CAPTURE", outcomeCapture !== null && outcomeCapture >= Number(options.minimumOutcomeCapture || 0.95), outcomeCapture, ">=0.95"),
    pass("EXACT_IDENTITY", identityIntegrity !== null && identityIntegrity >= Number(options.minimumIdentityIntegrity || 0.99), identityIntegrity, ">=0.99"),
    pass("REPRODUCIBILITY", reproducible, reproducible, true),
    pass("BACKUP_RESTORE", restore, restore, true),
    pass("FAULT_INJECTION", faultInjection, faultInjection, true),
    pass("CHALLENGER_FORWARD_SAMPLE", Number(challenger.samples || 0) >= Number(options.minimumForwardSamples || 200), challenger.samples, ">=200"),
    pass("CHALLENGER_GOVERNANCE", challenger.state === "CHAMPION_ELIGIBLE", challenger.state, "CHAMPION_ELIGIBLE"),
    pass("NO_AUTOMATIC_PROMOTION", challenger.automaticPromotion !== true, challenger.automaticPromotion, "false"),
  ];

  const blockers = gates.filter((gate) => !gate.pass).map((gate) => gate.name);
  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state: blockers.length ? "NOT_PRODUCTION_READY" : "PRODUCTION_READY_INTELLIGENCE",
    gates,
    blockers,
    automaticTradingApproved: false,
  };
}
