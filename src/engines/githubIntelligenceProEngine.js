function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function daysSince(dateValue = "") {
  const time = dateValue ? new Date(dateValue).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.max(0, Math.round((Date.now() - time) / (24 * 60 * 60 * 1000)));
}

function repoText(project = {}) {
  return [
    project.github,
    project.githubUrl,
    project.repository,
    project.description,
    project.githubLanguage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasRepo(project = {}) {
  return Boolean(project.github || project.githubUrl || project.repository || project.githubStars || project.githubActivityScore);
}

function activityScore(project = {}) {
  const pushedDays = daysSince(project.githubPushedAt || project.githubUpdatedAt);
  const freshness = pushedDays === null ? 0 : pushedDays <= 7 ? 95 : pushedDays <= 30 ? 78 : pushedDays <= 90 ? 55 : 25;
  const stars = Math.min(100, Math.log10(Math.max(1, num(project.githubStars))) * 25);
  const forks = Math.min(100, Math.log10(Math.max(1, num(project.githubForks))) * 22);
  const commits = Math.min(100, num(project.commits30d) * 4);

  return Math.round(clamp(freshness * 0.38 + stars * 0.18 + forks * 0.16 + commits * 0.28));
}

function contributorScore(project = {}) {
  const contributors = num(project.contributors);
  const forks = num(project.githubForks);
  const openIssues = num(project.openIssues);
  const issuePenalty = openIssues > 500 ? 14 : openIssues > 150 ? 8 : 0;

  return Math.round(
    clamp(Math.min(100, contributors * 12) * 0.46 + Math.min(100, Math.log10(Math.max(1, forks)) * 26) * 0.34 + 28 - issuePenalty)
  );
}

function repoRisk(project = {}) {
  const text = repoText(project);
  const risks = [];

  if (!hasRepo(project)) risks.push("No public repository signal");
  if (daysSince(project.githubPushedAt || project.githubUpdatedAt) > 180) risks.push("Repository stale");
  if (num(project.githubStars) < 5 && num(project.githubForks) < 2 && hasRepo(project)) risks.push("Low repo adoption");
  if (text.includes("fork") || text.includes("copy")) risks.push("Possible fork/copy project");
  if (num(project.openIssues) > 300 && num(project.commits30d) < 5) risks.push("High issue load with low recent commits");

  return risks;
}

export function analyzeGithubIntelligencePro(project = {}) {
  if (!hasRepo(project)) {
    return {
      ...project,
      githubProScore: 0,
      githubProVerdict: "No Repo Signal",
      githubIntelligencePro: {
        score: 0,
        verdict: "No Repo Signal",
        risks: ["No public repository signal"],
        summary: "No GitHub repository fields were available for this project.",
      },
    };
  }

  const activity = activityScore(project);
  const contributors = contributorScore(project);
  const releaseScore = Math.min(100, num(project.releases) * 18 + (project.githubPushedAt ? 20 : 0));
  const repoQuality = Math.round(
    clamp(
      activity * 0.38 +
        contributors * 0.22 +
        releaseScore * 0.14 +
        num(project.developerActivityScore || project.githubQualityScore || project.githubScore) * 0.18 +
        num(project.sourceTruthScore) * 0.08
    )
  );
  const risks = repoRisk(project);
  const githubProScore = Math.round(clamp(repoQuality - Math.min(25, risks.length * 7)));

  return {
    ...project,
    githubProScore,
    githubProVerdict:
      githubProScore >= 78
        ? "Elite Builder Signal"
        : githubProScore >= 62
        ? "Healthy Builder Signal"
        : githubProScore >= 42
        ? "Developing Builder Signal"
        : "Weak Builder Signal",
    githubIntelligencePro: {
      score: githubProScore,
      activityScore: activity,
      contributorScore: contributors,
      releaseScore,
      repository: project.repository || project.github || project.githubUrl || null,
      stars: num(project.githubStars),
      forks: num(project.githubForks),
      commits30d: num(project.commits30d),
      contributors: num(project.contributors),
      pushedAt: project.githubPushedAt || null,
      risks,
      summary:
        risks.length > 0
          ? `GitHub Pro score ${githubProScore}; risks: ${risks.join(", ")}.`
          : `GitHub Pro score ${githubProScore}; builder activity looks clean.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "GitHub Intelligence Pro",
        signal: "repository activity, contributor breadth, release cadence, and repo risk",
        score: githubProScore,
        confidence: hasRepo(project) ? 0.7 : 0.25,
        impact: githubProScore >= 65 ? "Positive" : githubProScore <= 35 ? "Negative" : "Neutral",
        reasons: [
          `Activity ${activity}, contributors ${contributors}, releases ${releaseScore}.`,
          risks[0] || "No major repository risk found.",
        ],
      },
    ],
  };
}

export function analyzeGithubIntelligenceProBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeGithubIntelligencePro);
}

export function summarizeGithubIntelligencePro(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    repoProjects: safeProjects.filter(hasRepo).length,
    eliteBuilderSignals: safeProjects.filter((project) => project.githubProVerdict === "Elite Builder Signal").length,
    healthyBuilderSignals: safeProjects.filter((project) => project.githubProVerdict === "Healthy Builder Signal").length,
    topRepositories: [...safeProjects]
      .filter((project) => num(project.githubProScore) > 0)
      .sort((a, b) => num(b.githubProScore) - num(a.githubProScore))
      .slice(0, 50)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.githubProScore || 0,
        verdict: project.githubProVerdict || "Unknown",
        repository: project.repository || project.github || project.githubUrl || null,
        risks: project.githubIntelligencePro?.risks || [],
      })),
  };
}
