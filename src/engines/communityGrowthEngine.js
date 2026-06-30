// src/engines/communityGrowthEngine.js

/**
 * Community Growth Engine
 *
 * Purpose:
 * Scores whether a project is gaining real community traction
 * across social platforms.
 */

export function scoreCommunityGrowth(project = {}) {
  let score = 0;

  const followers = Number(project.followers || project.xFollowers || 0);
  const telegramMembers = Number(project.telegramMembers || 0);
  const discordMembers = Number(project.discordMembers || 0);
  const followerGrowth7d = Number(project.followerGrowth7d || 0);
  const engagementRate = Number(project.engagementRate || 0);

  if (followers >= 1000) score += 15;
  if (followers >= 10000) score += 15;
  if (telegramMembers >= 1000) score += 10;
  if (discordMembers >= 1000) score += 10;
  if (followerGrowth7d >= 10) score += 20;
  if (followerGrowth7d >= 50) score += 15;
  if (engagementRate >= 2) score += 10;
  if (engagementRate >= 5) score += 15;

  return Math.max(0, Math.min(100, score));
}

export function classifyCommunity(score = 0) {
  if (score >= 85) return "explosive";
  if (score >= 70) return "strong";
  if (score >= 50) return "growing";
  if (score >= 30) return "early";
  return "weak";
}

export function analyzeCommunityGrowth(project = {}) {
  const communityGrowthScore = scoreCommunityGrowth(project);

  return {
    ...project,
    communityGrowthScore,
    communityStrength: classifyCommunity(communityGrowthScore),
    communityReason:
      communityGrowthScore >= 70
        ? "Community traction is accelerating."
        : "Community growth is still limited or early."
  };
}

export function analyzeCommunityGrowthBatch(projects = []) {
  return projects
    .map(analyzeCommunityGrowth)
    .sort((a, b) => b.communityGrowthScore - a.communityGrowthScore);
}
