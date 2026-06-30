// src/engines/developerActivityEngine.js

/**
 * Developer Activity Engine
 *
 * Purpose:
 * Scores whether a crypto project shows real building activity.
 * This helps separate active projects from pure marketing launches.
 */

export function scoreDeveloperActivity(project = {}) {
  let score = 0;

  const commits30d = Number(project.commits30d || 0);
  const contributors = Number(project.contributors || 0);
  const releases = Number(project.releases || 0);
  const openIssues = Number(project.openIssues || 0);
  const closedIssues30d = Number(project.closedIssues30d || 0);

  if (project.github) score += 15;
  if (commits30d >= 5) score += 15;
  if (commits30d >= 25) score += 20;
  if (contributors >= 2) score += 10;
  if (contributors >= 5) score += 10;
  if (releases >= 1) score += 10;
  if (closedIssues30d >= 5) score += 10;
  if (openIssues > 100 && closedIssues30d < 3) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function classifyDeveloperActivity(score = 0) {
  if (score >= 80) return "very active";
  if (score >= 60) return "active";
  if (score >= 40) return "developing";
  if (score >= 20) return "limited";
  return "weak";
}

export function analyzeDeveloperActivity(project = {}) {
  const developerActivityScore = scoreDeveloperActivity(project);

  return {
    ...project,
    developerActivityScore,
    developerActivity: classifyDeveloperActivity(developerActivityScore),
    developerReason:
      developerActivityScore >= 60
        ? "Project shows meaningful development activity."
        : "Developer activity is limited or not yet visible."
  };
}

export function analyzeDeveloperActivityBatch(projects = []) {
  return projects
    .map(analyzeDeveloperActivity)
    .sort((a, b) => b.developerActivityScore - a.developerActivityScore);
}
