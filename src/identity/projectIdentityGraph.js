import { attachProjectIdentity } from "../discovery/projectIdentityGraph.js";
import { resolveWalletRelationshipGraph } from "./walletRelationshipGraph.js";
import { resolveCrossChainIdentity } from "./crossChainIdentityResolver.js";
import { resolveSocialDomainIdentity } from "./socialDomainResolver.js";
import { resolveBytecodeLineage } from "./bytecodeLineageResolver.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function avg(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : 0;
}

export function resolveProjectIdentityGraph(project = {}) {
  const base = attachProjectIdentity(project);
  const walletGraph = resolveWalletRelationshipGraph(base);
  const crossChain = resolveCrossChainIdentity(base);
  const socialDomain = resolveSocialDomainIdentity(base);
  const bytecodeLineage = resolveBytecodeLineage(base);
  const identityEvidenceCount =
    (base.projectIdentity?.evidence || []).length +
    (base.projectIdentity?.exchangeAssetIds || []).length +
    (base.projectIdentity?.externalAssetIds || []).length +
    walletGraph.nodes.length +
    crossChain.contracts.length +
    socialDomain.domains.length +
    socialDomain.socialAccounts.length +
    (bytecodeLineage.bytecodeHash ? 1 : 0) +
    (bytecodeLineage.factory ? 1 : 0);
  const identityResolutionScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        avg([
          identityEvidenceCount * 9,
          walletGraph.walletRelationshipScore,
          crossChain.crossChainIdentityScore,
          socialDomain.socialDomainScore,
          bytecodeLineage.bytecodeLineageScore,
        ])
      )
    )
  );
  const identityRiskScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        avg([
          walletGraph.clusterRiskScore,
          socialDomain.socialDomainRiskScore,
          bytecodeLineage.reusedBytecodeRisk,
          identityResolutionScore < 35 ? 55 : 0,
        ])
      )
    )
  );

  return {
    projectId: base.projectId,
    canonicalName: base.name || base.symbol || "Unknown",
    baseIdentity: base.projectIdentity,
    walletGraph,
    crossChain,
    socialDomain,
    bytecodeLineage,
    identityEvidenceCount,
    identityResolutionScore,
    identityRiskScore,
    warnings: [
      ...walletGraph.warnings,
      ...crossChain.warnings,
      ...socialDomain.warnings,
      ...bytecodeLineage.warnings,
    ],
  };
}

export function attachDecisionIdentity(project = {}) {
  const graph = resolveProjectIdentityGraph(project);

  return {
    ...project,
    projectId: graph.projectId,
    projectIdentityGraph: graph,
    identityResolutionScore: graph.identityResolutionScore,
    identityRiskScore: graph.identityRiskScore,
    projectIdentityVerdict:
      graph.identityRiskScore >= 70
        ? "Identity Risk"
        : graph.identityResolutionScore >= 70
        ? "Identity Resolved"
        : graph.identityResolutionScore >= 45
        ? "Identity Developing"
        : "Identity Unverified",
  };
}
