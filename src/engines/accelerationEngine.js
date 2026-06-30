// src/engines/accelerationEngine.js

/**
 * Acceleration Engine
 *
 * Purpose:
 * Detects whether project growth is speeding up.
 * Velocity measures change.
 * Acceleration measures whether that change is increasing.
 */

function calculateAcceleration(currentVelocity = 0, previousVelocity = 0) {
  return currentVelocity - previousVelocity;
}

export function analyzeAcceleration(project = {}) {
  const velocity = project.velocity || {};

  const acceleration = {
    volumeAcceleration: calculateAcceleration(
      Number(velocity.volumeVelocity || 0),
      Number(project.previousVolumeVelocity || 0)
    ),

    liquidityAcceleration: calculateAcceleration(
      Number(velocity.liquidityVelocity || 0),
      Number(project.previousLiquidityVelocity || 0)
    ),

    holderAcceleration: calculateAcceleration(
      Number(velocity.holderVelocity || 0),
      Number(project.previousHolderVelocity || 0)
    ),

    followerAcceleration: calculateAcceleration(
      Number(velocity.followerVelocity || 0),
      Number(project.previousFollowerVelocity || 0)
    ),

    developerAcceleration: calculateAcceleration(
      Number(velocity.developerVelocity || 0),
      Number(project.previousDeveloperVelocity || 0)
    ),

    smartWalletAcceleration: calculateAcceleration(
      Number(velocity.smartWalletVelocity || 0),
      Number(project.previousSmartWalletVelocity || 0)
    )
  };

  let score = 0;

  Object.values(acceleration).forEach(value => {
    if (value > 0) score += 10;
    if (value > 10) score += 5;
  });

  score = Math.max(0, Math.min(100, score));

  return {
    ...project,
    acceleration,
    accelerationScore: score,
    accelerationLevel:
      score >= 85 ? "explosive acceleration" :
      score >= 65 ? "strong acceleration" :
      score >= 45 ? "early acceleration" :
      "stable",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Acceleration Engine",
        signal: "Growth acceleration",
        confidence: Math.min(score / 100, 1),
        impact: score >= 60 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(score >= 75 ? ["Acceleration spike detected."] : [])
    ]
  };
}

export function analyzeAccelerationBatch(projects = []) {
  return projects
    .map(analyzeAcceleration)
    .sort((a, b) => b.accelerationScore - a.accelerationScore);
}
