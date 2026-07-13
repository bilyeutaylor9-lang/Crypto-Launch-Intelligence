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

function firstValue(project = {}, keys = []) {
  for (const key of keys) {
    const value = project[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return null;
}

function repoIdentity(project = {}) {
  const direct = firstValue(project, [
    "github",
    "githubUrl",
    "repositoryUrl",
    "html_url",
    "url",
    "clone_url",
    "svn_url",
  ]);

  if (direct) return String(direct);

  const fullName = firstValue(project, ["repository", "full_name", "repoFullName", "repo"]);
  if (!fullName) return null;

  const text = String(fullName);
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w.-]+\/[\w.-]+$/i.test(text)) return `https://github.com/${text}`;

  return text;
}

function repoName(project = {}) {
  return firstValue(project, ["repository", "full_name", "repoFullName", "repo"]) || repoIdentity(project);
}

function repoNumber(project = {}, keys = []) {
  return num(firstValue(project, keys));
}

function repoDate(project = {}) {
  return firstValue(project, [
    "githubPushedAt",
    "githubUpdatedAt",
    "pushed_at",
    "updated_at",
    "pushedAt",
    "updatedAt",
  ]);
}

function repoText(project = {}) {
  return [
    repoIdentity(project),
    repoName(project),
    project.description,
    firstValue(project, ["githubLanguage", "language", "primaryLanguage"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasRepo(project = {}) {
  return Boolean(
    repoIdentity(project) ||
      repoName(project) ||
      repoNumber(project, ["githubStars", "stargazers_count", "stars", "watchers_count"]) ||
      repoNumber(project, ["githubForks", "forks_count", "forks"]) ||
      project.githubActivityScore
  );
}

function activityScore(project = {}) {
  const pushedDays = daysSince(repoDate(project));
  const freshness = pushedDays === null ? 0 : pushedDays <= 7 ? 95 : pushedDays <= 30 ? 78 : pushedDays <= 90 ? 55 : 25;
  const stars = Math.min(100, Math.log10(Math.max(1, repoNumber(project, ["githubStars", "stargazers_count", "stars", "watchers_count"]))) * 25);
  const forks = Math.min(100, Math.log10(Math.max(1, repoNumber(project, ["githubForks", "forks_count", "forks"]))) * 22);
  const commits = Math.min(100, repoNumber(project, ["commits30d", "recentCommits", "commit_count_30d"]) * 4);

  return Math.round(clamp(freshness * 0.38 + stars * 0.18 + forks * 0.16 + commits * 0.28));
}

function contributorScore(project = {}) {
  const contributors = repoNumber(project, ["contributors", "contributorsCount", "contributor_count"]);
  const forks = repoNumber(project, ["githubForks", "forks_count", "forks"]);
  const openIssues = repoNumber(project, ["openIssues", "open_issues_count", "openIssuesCount"]);
  const issuePenalty = openIssues > 500 ? 14 : openIssues > 150 ? 8 : 0;

  return Math.round(
    clamp(Math.min(100, contributors * 12) * 0.46 + Math.min(100, Math.log10(Math.max(1, forks)) * 26) * 0.34 + 28 - issuePenalty)
  );
}

function repoRisk(project = {}) {
  const text = repoText(project);
  const risks = [];

  if (!hasRepo(project)) risks.push("No public repository signal");
  if (daysSince(repoDate(project)) > 180) risks.push("Repository stale");
  if (
    repoNumber(project, ["githubStars", "stargazers_count", "stars", "watchers_count"]) < 5 &&
    repoNumber(project, ["githubForks", "forks_count", "forks"]) < 2 &&
    hasRepo(project)
  ) {
    risks.push("Low repo adoption");
  }
  if (text.includes("fork") || text.includes("copy")) risks.push("Possible fork/copy project");
  if (
    repoNumber(project, ["openIssues", "open_issues_count", "openIssuesCount"]) > 300 &&
    repoNumber(project, ["commits30d", "recentCommits", "commit_count_30d"]) < 5
  ) {
    risks.push("High issue load with low recent commits");
  }

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
  const releaseScore = Math.min(100, repoNumber(project, ["releases", "releaseCount"]) * 18 + (repoDate(project) ? 20 : 0));
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
      repository: repoIdentity(project),
      repositoryName: repoName(project),
      stars: repoNumber(project, ["githubStars", "stargazers_count", "stars", "watchers_count"]),
      forks: repoNumber(project, ["githubForks", "forks_count", "forks"]),
      commits30d: repoNumber(project, ["commits30d", "recentCommits", "commit_count_30d"]),
      contributors: repoNumber(project, ["contributors", "contributorsCount", "contributor_count"]),
      openIssues: repoNumber(project, ["openIssues", "open_issues_count", "openIssuesCount"]),
      pushedAt: repoDate(project),
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
  const repoProjects = safeProjects.filter(hasRepo);
  const missingRepoProjects = safeProjects.length - repoProjects.length;

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    repoProjects: repoProjects.length,
    missingRepoProjects,
    repoCoveragePct: safeProjects.length
      ? Math.round((repoProjects.length / safeProjects.length) * 100)
      : 0,
    eliteBuilderSignals: safeProjects.filter((project) => project.githubProVerdict === "Elite Builder Signal").length,
    healthyBuilderSignals: safeProjects.filter((project) => project.githubProVerdict === "Healthy Builder Signal").length,
    diagnostics: {
      status: repoProjects.length ? "REPO_SIGNALS_FOUND" : "NO_REPO_SIGNALS_FOUND",
      message: repoProjects.length
        ? "GitHub Pro found repository fields and scored builder quality."
        : "No repository fields were found. Run GitHub discovery or provide repository/githubUrl/html_url fields before GitHub Pro scoring.",
      acceptedRepoFields: [
        "github",
        "githubUrl",
        "repositoryUrl",
        "html_url",
        "repository",
        "full_name",
        "githubStars",
        "stargazers_count",
        "githubForks",
        "forks_count",
        "githubPushedAt",
        "pushed_at",
      ],
    },
    topRepositories: [...safeProjects]
      .filter((project) => num(project.githubProScore) > 0)
      .sort((a, b) => num(b.githubProScore) - num(a.githubProScore))
      .slice(0, 50)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.githubProScore || 0,
        verdict: project.githubProVerdict || "Unknown",
        repository: project.githubIntelligencePro?.repository || repoIdentity(project),
        repositoryName: project.githubIntelligencePro?.repositoryName || repoName(project),
        risks: project.githubIntelligencePro?.risks || [],
      })),
  };
}
