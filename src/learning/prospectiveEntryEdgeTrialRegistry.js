import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

export const PROSPECTIVE_ENTRY_EDGE_TRIALS = Object.freeze([Object.freeze({
  trialId: "LIVE_CATALYST_AVOID_RICH_V1",
  schemaVersion: 1,
  declaredAt: "2026-08-20T14:53:15.000Z",
  horizonHours: 168,
  discoveryClass: "POST_HOC_DISCOVERY_REQUIRES_PROSPECTIVE_CONFIRMATION",
  treatmentDefinition: "liveCatalystRadarScore >= 60 AND 0 < richTokenScore < 60",
  controlDefinition: "0 < liveCatalystRadarScore < 60 AND 0 < richTokenScore < 60",
  rationale: "Combine a time-local catalyst signal with the independently verified Rich Token avoidance boundary.",
  thresholds: Object.freeze({
    liveCatalystRadarScore: 60,
    richTokenAvoidanceCeiling: 60,
  }),
  verificationPolicy: Object.freeze({
    minimumResolvedTreatments: 30,
    minimumResolvedControls: 45,
    minimumTreatmentProjects: 20,
    minimumControlProjects: 30,
    minimumCohorts: 5,
    minimumCaptureSpanDays: 14,
    minimumMeanNetReturnPct: 3,
    minimumMatchedEffectPct: 5,
    minimumPositiveCohortRatio: 0.8,
    minimumBootstrapProbabilityPositive: 0.975,
  }),
})]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactIdentity(record = {}) {
  const chain = normalizeChainId(
    record.chain || record.pointInTime?.identity?.chain
  );
  const tokenAddress = normalizeTokenAddress(
    record.tokenAddress || record.pointInTime?.identity?.tokenAddress,
    chain
  );
  const poolAddress = normalizePoolAddress(
    record.poolAddress || record.pointInTime?.identity?.poolAddress,
    chain
  );
  if (!chain || !tokenAddress || !poolAddress) return null;
  return {
    chain,
    tokenAddress,
    poolAddress,
    identityKey: `${chain}:${tokenAddress}`,
  };
}

function executableAtSignal(record = {}) {
  const identity = record.pointInTime?.identity || {};
  const safety = record.pointInTime?.safety || {};
  const execution = record.pointInTime?.execution || {};
  return Boolean(
    identity.resolved === true &&
    safety.status === "SAFETY_VERIFIED_CLEAN" &&
    !(safety.deterministicBlocks || []).length &&
    execution.buyQuoteVerified === true &&
    execution.sellQuoteVerified === true &&
    execution.quoteTimestamp
  );
}

export function classifyProspectiveEntryTrialRecord(record = {}, trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0]) {
  const identity = exactIdentity(record);
  const scannedAtMs = Date.parse(record.scannedAt || "");
  const declaredAtMs = Date.parse(trial.declaredAt);
  const liveCatalystRadarScore = finite(record.scores?.liveCatalystRadar);
  const richTokenScore = finite(record.scores?.richToken);
  if (
    !identity ||
    !Number.isFinite(scannedAtMs) ||
    scannedAtMs < declaredAtMs ||
    liveCatalystRadarScore === null ||
    richTokenScore === null ||
    liveCatalystRadarScore <= 0 ||
    richTokenScore <= 0 ||
    richTokenScore >= trial.thresholds.richTokenAvoidanceCeiling
  ) return null;

  const role = liveCatalystRadarScore >= trial.thresholds.liveCatalystRadarScore
    ? "TREATMENT"
    : "CONTROL_POOL";
  return {
    trialId: trial.trialId,
    trialSchemaVersion: trial.schemaVersion,
    declaredAt: trial.declaredAt,
    signalObservedAt: record.scannedAt,
    role,
    ...identity,
    liveCatalystRadarScore,
    richTokenScore,
    executableAtSignal: executableAtSignal(record),
    safetyState: record.pointInTime?.safety?.status || null,
    identityState: record.pointInTime?.identity?.status || null,
    routeTruthStatus: record.pointInTime?.execution?.routeTruthStatus || null,
    estimatedRoundTripSlippagePct: finite(
      record.pointInTime?.execution?.estimatedRoundTripSlippagePct
    ),
  };
}

export const __prospectiveEntryTrialRegistryHooks = { finite, exactIdentity, executableAtSignal };
