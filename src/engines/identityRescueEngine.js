function hasIdentityConflict(project = {}) {
  return (
    project.identityConflict === true ||
    project.projectIdentityVerdict === "Identity Risk" ||
    (Array.isArray(project.identityConflicts) && project.identityConflicts.length > 0) ||
    (project.canonicalAliasConflicts && Object.keys(project.canonicalAliasConflicts).some((field) => ["tokenAddress", "poolAddress", "chain"].includes(field)))
  );
}

export function analyzeIdentityRescue(project = {}) {
  const identityFields = ["chain", "tokenAddress", "poolAddress", "projectId", "website", "githubRepo"];
  const missing = (project.dataStarvationMissingEvidence || []).filter((item) => identityFields.includes(item.canonicalField));
  const recoverable = missing.filter((item) => item.recoverable && item.rootCause !== "NOT_APPLICABLE");
  const conflict = hasIdentityConflict(project);
  const enoughToDistinguish = Boolean(
    (project.chain || project.canonicalAliases?.chain) &&
      (project.tokenAddress || project.poolAddress || project.projectId || project.website || project.githubRepo)
  );

  return {
    ...project,
    identityRescueNeeded: !conflict && !enoughToDistinguish && recoverable.length > 0,
    identityRescueStatus: conflict
      ? "IDENTITY_CONFLICT_BLOCKS_RESCUE"
      : enoughToDistinguish
        ? "DISTINGUISHABLE_IDENTITY"
        : recoverable.length
          ? "IDENTITY_RECOVERY_NEEDED"
          : "IDENTITY_UNRESOLVED_UNRECOVERABLE",
    identityRescueTargets: recoverable.slice(0, 6),
  };
}

export function analyzeIdentityRescueBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeIdentityRescue);
}
