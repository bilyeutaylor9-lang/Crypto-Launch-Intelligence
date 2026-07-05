// src/engines/accelerationEngine.js

/**
 * Acceleration Engine v2
 *
 * Detects whether project growth is speeding up across:
 * - volume
 * - liquidity
 * - holders
 * - followers
 * - developer activity
 * - smart wallet activity
 */

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function calculateAcceleration(currentVelocity = 0, previousVelocity = 0) {
  return num(currentVelocity) - num(previousVelocity);
}

function scoreAcceleration(value = 0, weight = 1) {
  const n = num(value);

  if (n <= 0) return 0;
  if (n >= 50) return 20 * weight;
  if (n >= 25) return 16 * weight;
  if (n >= 10) return 12 * weight;
  if (n >= 5) return 8 * weight;

  return 4 * weight;
}

function accelerationLabel(score = 0) {
  if (score >= 85) return "explosive acceleration";
  if (score >= 70) return "strong acceleration";
  if (score >= 50) return "early acceleration";
  if (score >= 30) return "mild acceleration";
  return "stable";
}

function buildReasons(acceleration = {}) {
  const reasons = [];

  if (acceleration.volumeAcceleration > 0) {
    reasons.push("Volume velocity is increasing.");
  }

  if (acceleration.liquidityAcceleration > 0) {
    reasons.push("Liquidity growth is accelerating.");
  }

  if (acceleration.holderAcceleration > 0) {
    reasons.push("Holder growth is speeding up.");
  }

  if (acceleration.followerAcceleration > 0) {
    reasons.push("Social follower growth is accelerating.");
  }

  if (acceleration.developerAcceleration > 0) {
    reasons.push("Developer activity is increasing.");
  }

  if (acceleration.smartWalletAcceleration > 0) {
    reasons.push("Smart wallet activity is accelerating.");
  }

  return reasons;
}

export function analyzeAcceleration(project = {}) {
  const velocity = project.velocity || {};

  const acceleration = {
    volumeAcceleration: calculateAcceleration(
      velocity.volumeVelocity,
      project.previousVolumeVelocity
    ),

    liquidityAcceleration: calculateAcceleration(
      velocity.liquidityVelocity,
      project.previousLiquidityVelocity
    ),

    holderAcceleration: calculateAcceleration(
      velocity.holderVelocity,
      project.previousHolderVelocity
    ),

    followerAcceleration: calculateAcceleration(
      velocity.followerVelocity,
      project.previousFollowerVelocity
    ),

    developerAcceleration: calculateAcceleration(
      velocity.developerVelocity,
      project.previousDeveloperVelocity
    ),

    smartWalletAcceleration: calculateAcceleration(
      velocity.smartWalletVelocity,
      project.previousSmartWalletVelocity
    ),
  };

  const score = clamp(
    scoreAcceleration(acceleration.volumeAcceleration, 1.25) +
      scoreAcceleration(acceleration.liquidityAcceleration, 1.15) +
      scoreAcceleration(acceleration.holderAcceleration, 1.1) +
      scoreAcceleration(acceleration.followerAcceleration, 0.85) +
      scoreAcceleration(acceleration.developerAcceleration, 1.0) +
      scoreAcceleration(acceleration.smartWalletAcceleration, 1.35)
  );

  const reasons = buildReasons(acceleration);
  const level = accelerationLabel(score);

  return {
    ...project,

    acceleration,
    accelerationScore: score,
    accelerationLevel: level,
    accelerationReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      acceleration: {
        score,
        level,
        reasons,
        acceleration,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Acceleration Engine",
        signal: "Growth acceleration",
        score,
        confidence: clamp(score / 100, 0, 1),
        impact: score >= 70 ? "Strong Positive" : score >= 45 ? "Positive" : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(score >= 85
        ? ["Explosive acceleration detected."]
        : score >= 70
        ? ["Strong acceleration detected."]
        : []),
    ],
  };
}

export function analyzeAccelerationBatch(projects = []) {
  return projects
    .map(analyzeAcceleration)
    .sort((a, b) => Number(b.accelerationScore || 0) - Number(a.accelerationScore || 0));
}
