// src/engines/developerActivityEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function scoreCommits(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 250) return 28 * weight;
  if (n >= 100) return 24 * weight;
  if (n >= 50) return 20 * weight;
  if (n >= 25) return 16 * weight;
  if (n >= 5) return 10 * weight;
  if (n > 0) return 5 * weight;

  return 0;
}

function scoreContributors(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 25) return 22 * weight;
  if (n >= 10) return 18 * weight;
  if (n >= 5) return 12 * weight;
  if (n >= 2) return 8 * weight;
  if (n >= 1) return 4 * weight;

  return 0;
}

export function classifyDeveloperActivity(score = 0) {
  if (score >= 85) return "institutional-grade development";
  if (score >= 70) return "very active";
  if (score >= 55) return "active";
  if (score >= 35) return "developing";
  if (score >= 20) return "limited";
  return "weak";
}

function buildReasons(metrics = {}) {
  const reasons = [];

  if (metrics.github) reasons.push("GitHub repository is visible.");
  if (metrics.commits30d >= 25) reasons.push("Recent commit activity is strong.");
  if (metrics.contributors >= 5) reasons.push("Multiple contributors are active.");
  if (metrics.releases >= 1) reasons.push("Recent release activity detected.");
  if (metrics.closedIssues30d >= 5) reasons.push("Issues are being resolved.");
  if (metrics.openIssues > 100 && metrics.closedIssues30d < 3) {
    reasons.push("Large unresolved issue backlog may indicate maintenance risk.");
  }

  if (!reasons.length) reasons.push("Developer activity is limited or not yet visible.");

  return reasons;
}

export function scoreDeveloperActivity(project = {}) {
  const commits30d = num(project.commits30d);
  const contributors = num(project.contributors);
  const releases = num(project.releases);
  const openIssues = num(project.openIssues);
  const closedIssues30d = num(project.closedIssues30d);
  const githubQualityScore = num(project.githubQualityScore);

  let score = 0;

  if (project.github || project.githubUrl || project.repository) score += 12;

  score += scoreCommits(commits30d, 1.15);
  score += scoreContributors(contributors, 1.05);

  if (releases >= 5) score += 14;
  else if (releases >= 1) score += 9;

  if (closedIssues30d >= 25) score += 14;
  else if (closedIssues30d >= 10) score += 10;
  else if (closedIssues30d >= 5) score += 6;

  if (githubQualityScore >= 80) score += 12;
  else if (githubQualityScore >= 60) score += 8;
  else if (githubQualityScore >= 40) score += 4;

  if (openIssues > 100 && closedIssues30d < 3) score -= 12;
  if (commits30d === 0 && contributors === 0 && !project.github) score -= 10;

  return clamp(Math.round(score));
}

export function analyzeDeveloperActivity(project = {}) {
  const developerMetrics = {
    github: Boolean(project.github || project.githubUrl || project.repository),
    commits30d: num(project.commits30d),
    contributors: num(project.contributors),
    releases: num(project.releases),
    openIssues: num(project.openIssues),
    closedIssues30d: num(project.closedIssues30d),
    githubQualityScore: num(project.githubQualityScore),
  };

  const developerActivityScore = scoreDeveloperActivity(project);
  const developerActivity = classifyDeveloperActivity(developerActivityScore);
  const reasons = buildReasons(developerMetrics);

  return {
    ...project,

    developerMetrics,
    developerActivityScore,
    developerScore: developerActivityScore,
    developerActivity,
    developerReason:
      developerActivityScore >= 55
        ? "Project shows meaningful development activity."
        : "Developer activity is limited or not yet visible.",
    developerReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      developerActivity: {
        score: developerActivityScore,
        level: developerActivity,
        metrics: developerMetrics,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Developer Activity Engine",
        signal: "Builder activity and repository maintenance",
        score: developerActivityScore,
        confidence: clamp(developerActivityScore / 100, 0, 1),
        impact:
          developerActivityScore >= 70
            ? "Strong Positive"
            : developerActivityScore >= 55
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(developerActivityScore >= 85
        ? ["Institutional-grade development activity detected."]
        : developerActivityScore >= 70
        ? ["Strong developer activity detected."]
        : []),
    ],
  };
}

export function analyzeDeveloperActivityBatch(projects = []) {
  return projects
    .map(analyzeDeveloperActivity)
    .sort(
      (a, b) =>
        Number(b.developerActivityScore || 0) -
        Number(a.developerActivityScore || 0)
    );
}
