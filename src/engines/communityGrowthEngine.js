// src/engines/communityGrowthEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function scoreSize(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 250000) return 24 * weight;
  if (n >= 100000) return 20 * weight;
  if (n >= 50000) return 16 * weight;
  if (n >= 10000) return 12 * weight;
  if (n >= 1000) return 8 * weight;
  if (n >= 250) return 4 * weight;

  return 0;
}

function scoreGrowthPct(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 100) return 24 * weight;
  if (n >= 50) return 20 * weight;
  if (n >= 25) return 16 * weight;
  if (n >= 10) return 12 * weight;
  if (n >= 5) return 6 * weight;
  if (n < 0) return -8 * weight;

  return 0;
}

function scoreEngagement(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 10) return 20 * weight;
  if (n >= 5) return 16 * weight;
  if (n >= 2) return 10 * weight;
  if (n >= 1) return 5 * weight;
  if (n <= 0) return 0;

  return 2 * weight;
}

export function classifyCommunity(score = 0) {
  if (score >= 85) return "explosive";
  if (score >= 70) return "strong";
  if (score >= 50) return "growing";
  if (score >= 30) return "early";
  return "weak";
}

function buildReasons(metrics = {}) {
  const reasons = [];

  if (metrics.followers >= 10000) reasons.push("X/Twitter audience has meaningful scale.");
  if (metrics.telegramMembers >= 1000) reasons.push("Telegram community has traction.");
  if (metrics.discordMembers >= 1000) reasons.push("Discord community has traction.");
  if (metrics.followerGrowth7d >= 10) reasons.push("Follower growth is accelerating over 7 days.");
  if (metrics.engagementRate >= 2) reasons.push("Engagement rate is healthy.");
  if (metrics.communityVelocityScore >= 50) reasons.push("Community velocity is confirming traction.");

  if (!reasons.length) reasons.push("Community growth is still limited or early.");

  return reasons;
}

export function scoreCommunityGrowth(project = {}) {
  const followers = num(project.followers ?? project.xFollowers);
  const telegramMembers = num(project.telegramMembers);
  const discordMembers = num(project.discordMembers);
  const followerGrowth7d = num(project.followerGrowth7d);
  const engagementRate = num(project.engagementRate);
  const communityVelocityScore = num(project.communityVelocityScore);

  let score = 0;

  score += scoreSize(followers, 0.9);
  score += scoreSize(telegramMembers, 0.55);
  score += scoreSize(discordMembers, 0.55);
  score += scoreGrowthPct(followerGrowth7d, 1.2);
  score += scoreEngagement(engagementRate, 1.15);

  if (communityVelocityScore >= 70) score += 12;
  else if (communityVelocityScore >= 50) score += 8;
  else if (communityVelocityScore >= 30) score += 4;

  return clamp(Math.round(score));
}

export function analyzeCommunityGrowth(project = {}) {
  const communityMetrics = {
    followers: num(project.followers ?? project.xFollowers),
    telegramMembers: num(project.telegramMembers),
    discordMembers: num(project.discordMembers),
    followerGrowth7d: num(project.followerGrowth7d),
    engagementRate: num(project.engagementRate),
    communityVelocityScore: num(project.communityVelocityScore),
  };

  const communityGrowthScore = scoreCommunityGrowth(project);
  const communityStrength = classifyCommunity(communityGrowthScore);
  const reasons = buildReasons(communityMetrics);

  return {
    ...project,

    communityMetrics,
    communityGrowthScore,
    communityScore: communityGrowthScore,
    communityStrength,
    communityReason:
      communityGrowthScore >= 70
        ? "Community traction is accelerating."
        : "Community growth is still limited or early.",
    communityReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      communityGrowth: {
        score: communityGrowthScore,
        level: communityStrength,
        metrics: communityMetrics,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Community Growth Engine",
        signal: "Community traction and social audience growth",
        score: communityGrowthScore,
        confidence: clamp(communityGrowthScore / 100, 0, 1),
        impact:
          communityGrowthScore >= 70
            ? "Strong Positive"
            : communityGrowthScore >= 50
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(communityGrowthScore >= 85
        ? ["Explosive community growth detected."]
        : communityGrowthScore >= 70
        ? ["Strong community traction detected."]
        : []),
    ],
  };
}

export function analyzeCommunityGrowthBatch(projects = []) {
  return projects
    .map(analyzeCommunityGrowth)
    .sort(
      (a, b) =>
        Number(b.communityGrowthScore || 0) -
        Number(a.communityGrowthScore || 0)
    );
}
