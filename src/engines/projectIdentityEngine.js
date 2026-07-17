import { attachDecisionIdentity } from "../identity/projectIdentityGraph.js";
import { attachCanonicalIdentity, attachCanonicalIdentityBatch } from "../identity/canonicalIdentityResolver.js";

export function analyzeProjectIdentity(project = {}) {
  return attachCanonicalIdentity(attachDecisionIdentity(project));
}

export function analyzeProjectIdentityBatch(projects = []) {
  return attachCanonicalIdentityBatch(projects.map((project) => attachDecisionIdentity(project)));
}

export function summarizeProjectIdentity(projects = []) {
  const analyzed = projects.map((project) => project.projectIdentityGraph ? project : analyzeProjectIdentity(project));

  return {
    projectCount: analyzed.length,
    resolvedIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Resolved").length,
    developingIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Developing").length,
    unverifiedIdentities: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Unverified").length,
    identityRiskBlocks: analyzed.filter((project) => project.projectIdentityVerdict === "Identity Risk").length,
    canonicalVerified: analyzed.filter((project) => project.identityStatus === "VERIFIED").length,
    canonicalReviewQueue: analyzed.filter((project) => project.canonicalIdentity?.requiresManualReview).length,
    trueContractConflicts: analyzed.filter((project) => project.identityStatus === "CONTRACT_CONFLICT").length,
    symbolCollisions: analyzed.filter((project) => project.identityStatus === "SYMBOL_COLLISION").length,
  };
}
