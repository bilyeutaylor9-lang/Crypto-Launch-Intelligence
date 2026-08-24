import { finite } from "./productionMath.js";

function metric(report, path, fallback = null) {
  let value = report;
  for (const key of path.split(".")) value = value?.[key];
  return finite(value) ?? fallback;
}

export function compareChampionChallenger(champion = {}, challenger = {}, options = {}) {
  const championReturn = metric(champion, "averageReturnPct", 0);
  const challengerReturn = metric(challenger, "averageReturnPct", 0);
  const championHit = metric(champion, "plus25HitRate", metric(champion, "precision", 0));
  const challengerHit = metric(challenger, "plus25HitRate", metric(challenger, "precision", 0));
  const championLoss = metric(champion, "catastrophicLossRate", 1);
  const challengerLoss = metric(challenger, "catastrophicLossRate", 1);
  const samples = metric(challenger, "samples", metric(challenger, "selections", 0));

  const returnDelta = challengerReturn - championReturn;
  const hitDelta = challengerHit - championHit;
  const catastrophicDelta = challengerLoss - championLoss;

  const adequate =
    samples >= Number(options.minimumSamples || 200) &&
    catastrophicDelta <= Number(options.maximumCatastrophicDelta || 0.02);

  let state = "SHADOW";
  if (adequate &&
      returnDelta >= Number(options.minimumReturnImprovementPct || 3) &&
      hitDelta >= Number(options.minimumHitRateImprovement || 0.03)) {
    state = "CANARY_ELIGIBLE";
  }
  if (options.canaryPassed === true && state === "CANARY_ELIGIBLE") {
    state = "CHAMPION_ELIGIBLE";
  }

  return {
    state,
    adequate,
    samples,
    returnDeltaPct: returnDelta,
    hitRateDelta: hitDelta,
    catastrophicLossRateDelta: catastrophicDelta,
    automaticPromotion: false,
    rollbackRequired: catastrophicDelta > Number(options.rollbackCatastrophicDelta || 0.05),
  };
}
