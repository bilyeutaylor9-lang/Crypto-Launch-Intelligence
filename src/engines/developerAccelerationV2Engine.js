function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function typeText(project = {}) {
  return [project.projectType, project.category, project.narrative, project.description, project.websiteText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function requiresProductEvidence(project = {}) {
  return /gaming|ai|defi|infrastructure|depin|rwa|protocol|sdk|app|product|utility/.test(typeText(project));
}

export function analyzeDeveloperAccelerationV2(project = {}) {
  const repositoryCreationDate = project.repositoryCreationDate || project.githubRepoCreatedAt || null;
  const commitActivity = num(project.commitActivity ?? project.commits30d ?? project.githubCommits30d);
  const uniqueContributors = num(project.uniqueContributors ?? project.contributors30d ?? project.githubContributors);
  const releaseFrequency = num(project.releaseFrequency ?? project.releaseCount30d ?? project.releases30d);
  const codeAdditions = num(project.codeAdditions ?? project.githubAdditions30d);
  const codeDeletions = num(project.codeDeletions ?? project.githubDeletions30d);
  const issueActivity = num(project.issueActivity ?? project.issues30d);
  const pullRequestActivity = num(project.pullRequestActivity ?? project.pullRequests30d);
  const documentationChanges = num(project.documentationChanges ?? project.docsCommits30d);
  const packageReleases = num(project.packageReleases ?? project.packageReleases30d);
  const contractDeployments = num(project.contractDeployments ?? project.deployments30d);
  const applicationUsage = num(project.applicationUsage ?? project.productUsageScore);
  const repoLinked = Boolean(project.githubRepo || project.repository || project.githubUrl);
  const copiedRepository = project.copiedRepository === true || project.forkOnlyRepository === true;
  const commitSpam = commitActivity >= 80 && uniqueContributors <= 1 && releaseFrequency <= 1;
  const score = Math.round(clamp(
    clamp(commitActivity, 0, 80) * 0.2 +
      clamp(uniqueContributors, 0, 20) * 2 +
      clamp(releaseFrequency, 0, 10) * 3 +
      clamp(issueActivity, 0, 40) * 0.4 +
      clamp(pullRequestActivity, 0, 40) * 0.5 +
      clamp(documentationChanges, 0, 30) * 0.5 +
      clamp(packageReleases, 0, 8) * 3 +
      clamp(contractDeployments, 0, 8) * 3 +
      clamp(applicationUsage) * 0.15 -
      (copiedRepository ? 35 : 0) -
      (commitSpam ? 25 : 0)
  ));

  return {
    ...project,
    repositoryCreationDate,
    commitActivity,
    uniqueContributors,
    releaseFrequency,
    codeAdditions,
    codeDeletions,
    issueActivity,
    pullRequestActivity,
    documentationChanges,
    packageReleases,
    contractDeployments,
    testnetActivity: num(project.testnetActivity),
    mainnetActivity: num(project.mainnetActivity),
    applicationUsage,
    sdkDownloads: num(project.sdkDownloads),
    developerCommunityGrowth: num(project.developerCommunityGrowth),
    developerAccelerationV2Score: score,
    developerAccelerationV2Status:
      !repoLinked && !requiresProductEvidence(project)
        ? "NOT_REQUIRED_FOR_PROJECT_TYPE"
        : copiedRepository
          ? "UNVERIFIED_REPOSITORY_LINK"
          : commitSpam
            ? "COMMIT_SPAM_REVIEW"
            : score >= 65
              ? "REAL_DEVELOPMENT_ACCELERATION"
              : repoLinked
                ? "DEVELOPMENT_PRESENT_BUT_WEAK"
                : "PRODUCT_EVIDENCE_MISSING",
  };
}

export function analyzeDeveloperAccelerationV2Batch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeDeveloperAccelerationV2);
}
