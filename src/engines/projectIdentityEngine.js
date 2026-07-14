import { attachDecisionIdentity } from "../identity/projectIdentityGraph.js";

export function analyzeProjectIdentity(project = {}) {
  return attachDecisionIdentity(project);
}

export function analyzeProjectIdentityBatch(projects = []) {
  return projects.map((project) => analyzeProjectIdentity(project));
}

export function summarizeProjectIdentity(projects = []) {
  const analyzed = projects.map((project) => project.projectIdentityGraph ? project : analyzeProjectIdentity(project));

  return {
    projectCount: analyzed.length,
    resolvedIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Resolved").length,
    developingIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Developing").length,
    unverifiedIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Unverified").length,
    identityRiskBlocks: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Risk").length,
  };
}
