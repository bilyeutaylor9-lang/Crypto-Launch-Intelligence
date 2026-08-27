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
  const sourceReadiness = inputs.sourceReadiness || {};
  const artifactManifest = inputs.artifactManifest || {};
  const requiredConfidenceGates = ["RETURN_LOWER_BOUND", "HIT_RATE_LOWER_BOUND", "CATASTROPHIC_UPPER_BOUND"];
  const observedConfidenceGates = requiredConfidenceGates.map((name) =>
    challenger.gates?.find((gate) => gate.name === name),
  );

  const gates = [
    pass("LIVE_ENVIRONMENT", environment.state === "ENVIRONMENT_READY", environment.state, "ENVIRONMENT_READY"),
    pass(
      "LIVE_ARTIFACT_PROVENANCE",
      artifactManifest.status === "COMPLETE" &&
        artifactManifest.livePublishable === true &&
        /^[0-9a-f]{64}$/i.test(artifactManifest.provenanceFingerprint || ""),
      {
        status: artifactManifest.status || null,
        artifactClass: artifactManifest.artifactClass || null,
        livePublishable: artifactManifest.livePublishable === true,
        provenanceFingerprint: artifactManifest.provenanceFingerprint || null,
      },
      "COMPLETE live-publishable manifest with provenance fingerprint",
    ),
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
    pass("DATA_SOURCE_CODE_COVERAGE", sourceReadiness.criticalCodeComplete === true, sourceReadiness.state, "criticalCodeComplete=true"),
    pass("DATA_SOURCE_LIVE_HEALTH", sourceReadiness.liveReady === true, sourceReadiness.state, "DATA_SOURCES_LIVE"),
    pass("CHALLENGER_FORWARD_SAMPLE", Number(challenger.samples || 0) >= Number(options.minimumForwardSamples || 250), challenger.samples, ">=250"),
    pass("CHALLENGER_GOVERNANCE", challenger.state === "CHAMPION_ELIGIBLE", challenger.state, "CHAMPION_ELIGIBLE"),
    pass("CHALLENGER_FORWARD_ONLY", challenger.forwardOnly === true, challenger.forwardOnly, "true"),
    pass("CHALLENGER_FROZEN_BEFORE_OUTCOMES", challenger.frozenBeforeOutcomes === true, challenger.frozenBeforeOutcomes, "true"),
    pass("CHALLENGER_LEDGER_INTEGRITY", challenger.ledgerIntegrityPass === true, challenger.ledgerIntegrityPass, "true"),
    pass(
      "CHALLENGER_CONFIDENCE_BOUNDS",
      observedConfidenceGates.every((gate) => gate?.pass === true),
      challenger.confidenceBounds || null,
      "all conservative bounds pass",
    ),
    pass(
      "CHALLENGER_CANARY_EVIDENCE",
      challenger.canaryPassed === true &&
        Boolean(challenger.canaryEvidenceId) &&
        /^[0-9a-f]{64}$/i.test(challenger.canaryEvidenceFingerprint || ""),
      {
        canaryPassed: challenger.canaryPassed,
        canaryEvidenceId: challenger.canaryEvidenceId || null,
        canaryEvidenceFingerprint: challenger.canaryEvidenceFingerprint || null,
      },
      "verified canary evidence id and fingerprint",
    ),
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
