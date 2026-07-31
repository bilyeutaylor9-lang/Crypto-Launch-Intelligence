// src/engines/socialAccelerationEngine.js

/**
 * Social Acceleration Engine
 *
 * Purpose:
 * Detects early increases in social attention before
 * price or volume fully reacts.
 */

function measured(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

export function calculateSocialAcceleration(project = {}) {
  const mentionsNow = Number(project.socialMentionsNow || 0);
  const mentionsPrevious = Number(project.socialMentionsPrevious || 0);
  const followersNow = Number(project.followersNow || project.xFollowers || 0);
  const followersPrevious = Number(project.followersPrevious || 0);

  const mentionDelta = mentionsNow - mentionsPrevious;
  const followerDelta = followersNow - followersPrevious;

  const mentionGrowthRate =
    mentionsPrevious > 0 ? (mentionDelta / mentionsPrevious) * 100 : 0;

  const followerGrowthRate =
    followersPrevious > 0 ? (followerDelta / followersPrevious) * 100 : 0;

  return {
    mentionDelta,
    followerDelta,
    mentionGrowthRate,
    followerGrowthRate
  };
}

export function scoreSocialAcceleration(project = {}) {
  const acceleration = calculateSocialAcceleration(project);

  let score = 0;

  if (acceleration.mentionGrowthRate >= 25) score += 25;
  if (acceleration.mentionGrowthRate >= 75) score += 25;
  if (acceleration.followerGrowthRate >= 10) score += 20;
  if (acceleration.followerGrowthRate >= 30) score += 20;
  if (project.influencerMentions >= 3) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeSocialAcceleration(project = {}) {
  const expectedFields = [
    "socialMentionsNow",
    "socialMentionsPrevious",
    "followersNow",
    "followersPrevious",
    "xFollowers",
    "influencerMentions",
  ];
  const observedFields = expectedFields.filter((field) => measured(project[field]));
  const socialAccelerationCoverage = {
    observedComponentCount: observedFields.length,
    expectedComponentCount: expectedFields.length,
    coveragePct: Math.round((observedFields.length / expectedFields.length) * 100),
    observedValues: Object.fromEntries(observedFields.map((field) => [field, Number(project[field])])),
    missingValues: expectedFields.filter((field) => !observedFields.includes(field)),
    sourceFamilies: observedFields.length ? ["social"] : [],
  };

  if (!observedFields.length) {
    return {
      ...project,
      socialAcceleration: null,
      socialAccelerationScore: null,
      socialAccelerationLevel: "unmeasured",
      socialAccelerationReason: "Social acceleration remains unknown until timestamped observations are recovered.",
      socialAccelerationCoverage,
    };
  }

  const socialAcceleration = calculateSocialAcceleration(project);
  const socialAccelerationScore = scoreSocialAcceleration(project);

  return {
    ...project,
    socialAcceleration,
    socialAccelerationScore,
    socialAccelerationCoverage,
    socialAccelerationLevel:
      socialAccelerationScore >= 80 ? "explosive" :
      socialAccelerationScore >= 60 ? "accelerating" :
      socialAccelerationScore >= 40 ? "emerging" :
      "quiet",
    socialAccelerationReason:
      socialAccelerationScore >= 60
        ? "Social attention is accelerating meaningfully."
        : "No major social acceleration detected yet."
  };
}

export function analyzeSocialAccelerationBatch(projects = []) {
  return projects
    .map(analyzeSocialAcceleration)
    .sort((a, b) => b.socialAccelerationScore - a.socialAccelerationScore);
}
