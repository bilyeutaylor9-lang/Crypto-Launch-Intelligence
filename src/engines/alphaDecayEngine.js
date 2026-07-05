/**
 * Crypto Launch Intelligence
 * Alpha Decay Engine
 *
 * Purpose:
 * Detects whether a crypto opportunity is still early, active,
 * late-stage, exhausted, or too risky to chase.
 *
 * This engine helps avoid buying after the move has already happened.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getSignal(project = {}, keys = []) {
  for (const key of keys) {
    if (project[key] !== undefined && project[key] !== null) {
      return clamp(project[key]);
    }
  }

  return 0;
}

function getPct(project = {}, keys = []) {
  for (const key of keys) {
    if (project[key] !== undefined && project[key] !== null) {
      return num(project[key]);
    }
  }

  return 0;
}

function scorePositiveAlpha(project = {}) {
  const scoreTrend = getSignal(project, [
    "scoreTrend",
    "opportunityScoreTrend",
    "momentumTrendScore"
  ]);

  const volumeGrowth = getSignal(project, [
    "volumeGrowthScore",
    "volumeAccelerationScore",
    "volumeMomentumScore"
  ]);

  const liquidityGrowth = getSignal(project, [
    "liquidityGrowthScore",
    "liquidityExpansionScore"
  ]);

  const narrative = getSignal(project, [
    "narrativeScore",
    "narrativeStrengthScore",
    "socialAccelerationScore"
  ]);

  const smartMoney = getSignal(project, [
    "smartMoneyScore",
    "smartWalletScore",
    "smartWalletAccumulationScore"
  ]);

  return clamp(
    scoreTrend * 0.2 +
      volumeGrowth * 0.25 +
      liquidityGrowth * 0.2 +
      narrative * 0.2 +
      smartMoney * 0.15
  );
}

function scoreDecayPressure(project = {}) {
  const priceChange24h = getPct(project, [
    "priceChange24h",
    "priceChangeH24",
    "priceChangePct24h"
  ]);

  const priceChange7d = getPct(project, [
    "priceChange7d",
    "priceChangePct7d"
  ]);

  const sellPressure = getSignal(project, [
    "sellPressureScore",
    "exitPressureScore"
  ]);

  const pumpRisk = getSignal(project, [
    "pumpExhaustionScore",
    "alreadyPumpedScore",
    "overextensionScore"
  ]);

  const liquidityDrop = getSignal(project, [
    "liquidityDropScore",
    "liquidityOutflowScore"
  ]);

  let overextensionPenalty = 0;

  if (priceChange24h >= 300) overextensionPenalty += 45;
  else if (priceChange24h >= 150) overextensionPenalty += 30;
  else if (priceChange24h >= 75) overextensionPenalty += 18;

  if (priceChange7d >= 700) overextensionPenalty += 45;
  else if (priceChange7d >= 300) overextensionPenalty += 30;
  else if (priceChange7d >= 120) overextensionPenalty += 18;

  return clamp(
    overextensionPenalty +
      sellPressure * 0.25 +
      pumpRisk * 0.3 +
      liquidityDrop * 0.2
  );
}

function labelAlphaStage(alphaScore = 0, decayScore = 0) {
  if (decayScore >= 80) return "Exhausted / Avoid Chase";
  if (decayScore >= 65) return "Late Stage";
  if (alphaScore >= 75 && decayScore < 45) return "Early Alpha Window";
  if (alphaScore >= 60 && decayScore < 60) return "Active Alpha Window";
  if (alphaScore >= 45 && decayScore < 65) return "Watchlist Only";
  return "No Clear Alpha";
}

function actionFromStage(stage = "") {
  switch (stage) {
    case "Early Alpha Window":
      return "Deep Research Now";
    case "Active Alpha Window":
      return "Research / Watch Pullbacks";
    case "Late Stage":
      return "Avoid Chase";
    case "Exhausted / Avoid Chase":
      return "Skip";
    case "Watchlist Only":
      return "Monitor";
    default:
      return "Skip";
  }
}

function buildReasons(project = {}, alphaScore = 0, decayScore = 0) {
  const reasons = [];

  const priceChange24h = getPct(project, [
    "priceChange24h",
    "priceChangeH24",
    "priceChangePct24h"
  ]);

  const priceChange7d = getPct(project, [
    "priceChange7d",
    "priceChangePct7d"
  ]);

  if (alphaScore >= 70) {
    reasons.push("Positive alpha signals are building across momentum, liquidity, narrative, or smart-wallet behavior.");
  }

  if (alphaScore >= 55 && decayScore < 55) {
    reasons.push("Opportunity may still be inside a usable research window.");
  }

  if (priceChange24h >= 150) {
    reasons.push(`24h price move is already extended at approximately ${priceChange24h.toFixed(2)}%.`);
  }

  if (priceChange7d >= 300) {
    reasons.push(`7d price move is heavily extended at approximately ${priceChange7d.toFixed(2)}%.`);
  }

  if (decayScore >= 65) {
    reasons.push("Decay pressure is elevated, meaning the opportunity may be late or crowded.");
  }

  if (project.alreadyPumped || project.pumpExhaustion) {
    reasons.push("Existing pump-exhaustion flag suggests avoiding the chase.");
  }

  if (reasons.length === 0) {
    reasons.push("Alpha timing is unclear because trend, liquidity, and overextension data are mixed or limited.");
  }

  return reasons;
}

function analyzeAlphaDecay(project = {}) {
  const alphaScore = scorePositiveAlpha(project);
  const decayScore = scoreDecayPressure(project);
  const stage = labelAlphaStage(alphaScore, decayScore);

  return {
    ...project,
    alphaDecay: {
      alphaScore,
      decayScore,
      stage,
      suggestedAction: actionFromStage(stage),
      reasons: buildReasons(project, alphaScore, decayScore),
      summary:
        decayScore >= 65
          ? "Opportunity may be late-stage or already crowded."
          : alphaScore >= 60
            ? "Opportunity may still be inside an active research window."
            : "No clear alpha window detected yet."
    },
    alphaStage: stage,
    alphaDecayScore: decayScore
  };
}

export function analyzeAlphaDecayBatch(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.map((project) => analyzeAlphaDecay(project));
}

export default {
  analyzeAlphaDecayBatch
};
