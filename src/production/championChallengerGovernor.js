import { finite } from "./productionMath.js";

function metric(report, path, fallback = null) {
  let value = report;
  for (const key of path.split(".")) value = value?.[key];
  return finite(value) ?? fallback;
}

function gate(name, pass, observed, required) {
  return { name, pass: pass === true, observed, required };
}

function firstFinite(values = []) {
  for (const value of values) {
    const parsed = finite(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function compareChampionChallenger(champion = {}, challenger = {}, options = {}) {
  const championReturn = metric(champion, "averageReturnPct", 0);
  const challengerReturn = metric(challenger, "averageReturnPct", 0);
  const championHit = metric(champion, "plus25HitRate", metric(champion, "precision", 0));
  const challengerHit = metric(challenger, "plus25HitRate", metric(challenger, "precision", 0));
  const championLoss = metric(champion, "catastrophicLossRate", 1);
  const challengerLoss = metric(challenger, "catastrophicLossRate", 1);
  const samples = metric(challenger, "samples", metric(challenger, "selections", 0));
  const uniqueProjects = metric(challenger, "uniqueProjects", 0);
  const independentCohorts = metric(challenger, "independentCohorts", metric(challenger, "cohorts", 0));
  const outcomeCaptureRate = metric(challenger, "outcomeCaptureRate", metric(challenger, "captureRate", null));

  const returnDelta = challengerReturn - championReturn;
  const hitDelta = challengerHit - championHit;
  const catastrophicDelta = challengerLoss - championLoss;
  const returnDeltaLower95Pct = firstFinite([
    challenger.returnDeltaLower95Pct,
    challenger.confidenceBounds?.returnDeltaLower95Pct,
    options.returnDeltaLower95Pct,
  ]);
  const hitRateDeltaLower95 = firstFinite([
    challenger.hitRateDeltaLower95,
    challenger.confidenceBounds?.hitRateDeltaLower95,
    options.hitRateDeltaLower95,
  ]);
  const catastrophicDeltaUpper95 = firstFinite([
    challenger.catastrophicDeltaUpper95,
    challenger.confidenceBounds?.catastrophicDeltaUpper95,
    options.catastrophicDeltaUpper95,
  ]);
  const championFingerprint = String(
    champion.strategyFingerprint || champion.fingerprint || options.championStrategyFingerprint || "",
  ).trim();
  const challengerFingerprint = String(
    challenger.strategyFingerprint || challenger.fingerprint || options.challengerStrategyFingerprint || "",
  ).trim();
  const forwardOnly =
    challenger.forwardOnly === true ||
    challenger.validationClass === "FROZEN_PROSPECTIVE_MATCHED_COHORTS_V1" ||
    options.forwardOnly === true;
  const ledgerIntegrityPass = challenger.ledgerIntegrityPass === true || options.ledgerIntegrityPass === true;
  const frozenBeforeOutcomes = challenger.frozenBeforeOutcomes === true || options.frozenBeforeOutcomes === true;
  const canaryEvidence = { ...(challenger.canaryEvidence || {}), ...(options.canaryEvidence || {}) };
  const canaryEvidenceId = String(
    canaryEvidence.id || canaryEvidence.receiptId || options.canaryEvidenceId || challenger.canaryEvidenceId || "",
  ).trim() || null;
  const canaryEvidenceFingerprint = String(
    canaryEvidence.evidenceFingerprint || canaryEvidence.receiptHash || options.canaryEvidenceFingerprint || "",
  ).trim() || null;
  const canaryStrategyFingerprint = String(
    canaryEvidence.challengerStrategyFingerprint || canaryEvidence.strategyFingerprint || "",
  ).trim() || null;
  const canaryPassClaim =
    canaryEvidence.status === "PASS" || options.canaryPassed === true || challenger.canaryPassed === true;
  const canaryPassed = Boolean(
    canaryPassClaim &&
    canaryEvidenceId &&
    /^[0-9a-f]{64}$/i.test(canaryEvidenceFingerprint || "") &&
    canaryStrategyFingerprint &&
    canaryStrategyFingerprint === challengerFingerprint,
  );

  const minimumSamples = Number(options.minimumSamples || 250);
  const minimumUniqueProjects = Number(options.minimumUniqueProjects || 80);
  const minimumCohorts = Number(options.minimumCohorts || 30);
  const minimumCaptureRate = Number(options.minimumCaptureRate || 0.95);
  const minimumReturnImprovementPct = Number(options.minimumReturnImprovementPct || 3);
  const minimumHitRateImprovement = Number(options.minimumHitRateImprovement || 0.03);
  const maximumCatastrophicDelta = Number(options.maximumCatastrophicDelta || 0.02);

  const gates = [
    gate("FORWARD_ONLY", forwardOnly, forwardOnly, true),
    gate("FROZEN_BEFORE_OUTCOMES", frozenBeforeOutcomes, frozenBeforeOutcomes, true),
    gate("LEDGER_INTEGRITY", ledgerIntegrityPass, ledgerIntegrityPass, true),
    gate("SAMPLES", samples >= minimumSamples, samples, `>=${minimumSamples}`),
    gate("UNIQUE_PROJECTS", uniqueProjects >= minimumUniqueProjects, uniqueProjects, `>=${minimumUniqueProjects}`),
    gate("INDEPENDENT_COHORTS", independentCohorts >= minimumCohorts, independentCohorts, `>=${minimumCohorts}`),
    gate(
      "OUTCOME_CAPTURE",
      outcomeCaptureRate !== null && outcomeCaptureRate >= minimumCaptureRate,
      outcomeCaptureRate,
      `>=${minimumCaptureRate}`,
    ),
    gate(
      "STRATEGY_FINGERPRINTS",
      Boolean(championFingerprint && challengerFingerprint && championFingerprint !== challengerFingerprint),
      { championFingerprint: championFingerprint || null, challengerFingerprint: challengerFingerprint || null },
      "distinct immutable champion and challenger fingerprints",
    ),
    gate("POINT_RETURN_DELTA", returnDelta >= minimumReturnImprovementPct, returnDelta, `>=${minimumReturnImprovementPct}`),
    gate("POINT_HIT_DELTA", hitDelta >= minimumHitRateImprovement, hitDelta, `>=${minimumHitRateImprovement}`),
    gate("POINT_CATASTROPHIC_DELTA", catastrophicDelta <= maximumCatastrophicDelta, catastrophicDelta, `<=${maximumCatastrophicDelta}`),
    gate(
      "RETURN_LOWER_BOUND",
      returnDeltaLower95Pct !== null && returnDeltaLower95Pct >= minimumReturnImprovementPct,
      returnDeltaLower95Pct,
      `>=${minimumReturnImprovementPct}`,
    ),
    gate(
      "HIT_RATE_LOWER_BOUND",
      hitRateDeltaLower95 !== null && hitRateDeltaLower95 >= minimumHitRateImprovement,
      hitRateDeltaLower95,
      `>=${minimumHitRateImprovement}`,
    ),
    gate(
      "CATASTROPHIC_UPPER_BOUND",
      catastrophicDeltaUpper95 !== null && catastrophicDeltaUpper95 <= maximumCatastrophicDelta,
      catastrophicDeltaUpper95,
      `<=${maximumCatastrophicDelta}`,
    ),
  ];

  const blockers = gates.filter((item) => !item.pass).map((item) => item.name);
  const adequate = blockers.length === 0;
  let state = adequate ? "CANARY_ELIGIBLE" : "SHADOW";
  if (state === "CANARY_ELIGIBLE" && canaryPassed && canaryEvidenceId) state = "CHAMPION_ELIGIBLE";

  return {
    schemaVersion: 2,
    state,
    adequate,
    samples,
    uniqueProjects,
    independentCohorts,
    outcomeCaptureRate,
    returnDeltaPct: returnDelta,
    hitRateDelta: hitDelta,
    catastrophicLossRateDelta: catastrophicDelta,
    confidenceBounds: {
      returnDeltaLower95Pct,
      hitRateDeltaLower95,
      catastrophicDeltaUpper95,
    },
    strategyFingerprints: {
      champion: championFingerprint || null,
      challenger: challengerFingerprint || null,
    },
    forwardOnly,
    frozenBeforeOutcomes,
    ledgerIntegrityPass,
    canaryPassed,
    canaryEvidenceId,
    canaryEvidenceFingerprint,
    canaryReceipt: {
      status: canaryPassed ? "VERIFIED" : "UNVERIFIED",
      evidenceId: canaryEvidenceId,
      evidenceFingerprint: canaryEvidenceFingerprint,
      challengerStrategyFingerprint: canaryStrategyFingerprint,
    },
    gates,
    blockers,
    automaticPromotion: false,
    governedReleaseRequired: true,
    governedReleaseDecision: "NOT_REQUESTED",
    rollbackRequired: catastrophicDelta > Number(options.rollbackCatastrophicDelta || 0.05),
  };
}
