import { canonicalSourceId, getSourceManifest, SOURCE_STATUS } from "../config/sourceManifest.js";
import { evidenceFamiliesForProject } from "./discoveryCoverageEngine.js";
import { identityKeyForProject } from "./projectIdentityGraph.js";
import { summarizeNativeProtocolCoverage } from "../data/native/nativePoolConfig.js";

const NON_CONCRETE_CHAINS = new Set(["", "unknown", "multi-chain", "multi-evm", "prelaunch"]);

const CHAIN_ALIASES = new Map([
  ["eth", "ethereum"],
  ["ethereum-mainnet", "ethereum"],
  ["bnb", "bsc"],
  ["binance-smart-chain", "bsc"],
  ["matic", "polygon"],
  ["avax", "avalanche"],
]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function normalizeDiscoveryChain(chain = "") {
  const normalized = String(chain || "").trim().toLowerCase();
  return CHAIN_ALIASES.get(normalized) || normalized || "unknown";
}

function isConcreteChain(chain = "") {
  return !NON_CONCRETE_CHAINS.has(normalizeDiscoveryChain(chain));
}

function projectChain(project = {}) {
  return normalizeDiscoveryChain(project.chain || project.chainId || "unknown");
}

function projectSources(project = {}) {
  return [...new Set([
    project.source,
    project.discoverySource,
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
  ].filter(Boolean).map(canonicalSourceId))];
}

function reportCandidateCount(report = {}) {
  return num(report.scannedTokens || report.discoveredTokens || report.acceptedTokens);
}

function hasAttempted(report = {}) {
  const status = String(report.status || "").toUpperCase();
  return report.attempted === true || ["SUCCESS", "USED", "FAILED", "ERROR", "SKIPPED"].includes(status);
}

function successfulReport(report = {}) {
  const status = String(report.status || "").toUpperCase();
  return ["SUCCESS", "USED"].includes(status) && reportCandidateCount(report) > 0;
}

function failedReport(report = {}) {
  return ["FAILED", "ERROR"].includes(String(report.status || "").toUpperCase());
}

function reportsByCanonicalSource(sourceReports = {}) {
  return Object.entries(sourceReports).reduce((reports, [source, report]) => {
    const id = canonicalSourceId(source);
    reports[id] = reports[id] || [];
    reports[id].push(report || {});
    return reports;
  }, {});
}

function hasConfiguredNativeRoute(native = {}) {
  return num(native.configured) > 0;
}

function configuredRoutePct(native = {}) {
  const total = num(native.total);
  return total ? Math.round((num(native.configured) / total) * 100) : 0;
}

function sourceIdsForChain(sources = [], chain = "") {
  return sources
    .filter((source) => source.candidateGenerator && source.status !== SOURCE_STATUS.PLANNED)
    .filter((source) => {
      const chains = Array.isArray(source.chains) ? source.chains.map(normalizeDiscoveryChain) : [];
      return chains.includes(chain) || chains.includes("multi-chain");
    })
    .map((source) => source.id);
}

function stateForChain({ candidateCount, nativeCandidateCount, observedSources }) {
  if (!candidateCount) return "NO_LIVE_CANDIDATES";
  if (nativeCandidateCount > 0) return "NATIVE_OBSERVED";
  if (observedSources.length >= 2) return "MULTI_SOURCE_OBSERVED";
  return "SINGLE_SOURCE_OBSERVED";
}

function nextActionsForChain(chain, details) {
  const actions = [];
  if (!details.candidateCount) {
    actions.push(`No verified ${chain} candidate appeared in this run; inspect source failures and the native route before treating this chain as covered.`);
  }
  if (details.native.total > 0 && !hasConfiguredNativeRoute(details.native)) {
    actions.push(`Configure an actual ${chain} native event route; declared protocols do not count as live coverage.`);
  }
  if (details.native.total > 0 && details.candidateCount > 0 && !details.nativeCandidateCount) {
    actions.push(`No native ${chain} lifecycle event was observed; indexed discovery may be lagging new pools.`);
  }
  if (details.failedSources.length) {
    actions.push(`Review failed ${chain} discovery sources: ${details.failedSources.join(", ")}.`);
  }
  if (details.candidateCount && details.observedSources.length < 2) {
    actions.push(`Seek an independent ${chain} discovery source before treating this run as resilient to one provider failure.`);
  }
  return actions;
}

function criticalGapsForChain(chain, details) {
  const gaps = [];
  if (!details.candidateCount) {
    gaps.push({
      chain,
      severity: "HIGH",
      code: "NO_LIVE_CANDIDATES",
      reason: `No candidate with a verified ${chain} identity was observed in this run.`,
    });
  }
  if (details.native.total > 0 && !hasConfiguredNativeRoute(details.native)) {
    gaps.push({
      chain,
      severity: "MEDIUM",
      code: "NATIVE_ROUTE_UNCONFIGURED",
      reason: `${details.native.total} declared native ${chain} protocol route(s) are not configured.`,
    });
  }
  if (details.candidateCount && details.observedSources.length < 2) {
    gaps.push({
      chain,
      severity: "MEDIUM",
      code: "SINGLE_SOURCE_OBSERVATION",
      reason: `Only ${details.observedSources.length} observed discovery source(s) produced ${chain} candidates.`,
    });
  }
  return gaps;
}

export function buildDiscoveryFrontier({
  projects = [],
  sourceReports = {},
  sourceManifest = getSourceManifest(),
  nativeCoverage = null,
} = {}) {
  const safeProjects = Array.isArray(projects) ? projects.filter((project) => project && typeof project === "object") : [];
  const sources = Array.isArray(sourceManifest) ? sourceManifest : getSourceManifest();
  const native = nativeCoverage || summarizeNativeProtocolCoverage();
  const nativeByChain = native.byChain || {};
  const targetChains = new Set([
    ...sources.flatMap((source) => source.chains || []),
    ...Object.keys(nativeByChain),
    ...safeProjects.map(projectChain),
  ].map(normalizeDiscoveryChain).filter(isConcreteChain));
  const reports = reportsByCanonicalSource(sourceReports);

  const chains = [...targetChains].sort().map((chain) => {
    const chainProjects = safeProjects.filter((project) => projectChain(project) === chain);
    const identities = new Set(chainProjects.map(identityKeyForProject));
    const observedSources = [...new Set(chainProjects.flatMap(projectSources))].sort();
    const evidenceFamilies = [...new Set(chainProjects.flatMap(evidenceFamiliesForProject).filter((family) => family !== "unknown"))].sort();
    const nativeCandidateCount = chainProjects.filter((project) => projectSources(project).includes("nativeDiscoveryMesh")).length;
    const eligibleSourceIds = sourceIdsForChain(sources, chain);
    const attemptedSources = eligibleSourceIds.filter((id) => (reports[id] || []).some(hasAttempted));
    const successfulSources = eligibleSourceIds.filter((id) => (reports[id] || []).some(successfulReport));
    const failedSources = eligibleSourceIds.filter((id) => (reports[id] || []).some(failedReport));
    const nativeRoute = nativeByChain[chain] || { total: 0, configured: 0, protocols: [] };
    const state = stateForChain({
      candidateCount: chainProjects.length,
      nativeCandidateCount,
      observedSources,
    });
    const coverageScore = clamp(
      (chainProjects.length ? 35 : 0) +
        (identities.size > 1 ? 5 : 0) +
        Math.min(20, observedSources.length * 10) +
        Math.min(20, evidenceFamilies.length * 10) +
        Math.round(configuredRoutePct(nativeRoute) * 0.1) +
        (nativeCandidateCount ? 10 : 0) +
        (successfulSources.length > 1 ? 5 : 0)
    );
    const details = {
      candidateCount: chainProjects.length,
      nativeCandidateCount,
      observedSources,
      failedSources,
      native: nativeRoute,
    };

    return {
      chain,
      state,
      coverageScore,
      candidateCount: chainProjects.length,
      uniqueIdentityCount: identities.size,
      nativeCandidateCount,
      observedSources,
      observedEvidenceFamilies: evidenceFamilies,
      implementedCandidateSources: eligibleSourceIds,
      attemptedSources,
      successfulSources,
      failedSources,
      nativeProtocolCoverage: {
        total: num(nativeRoute.total),
        configured: num(nativeRoute.configured),
        configuredPct: configuredRoutePct(nativeRoute),
        protocols: Array.isArray(nativeRoute.protocols) ? nativeRoute.protocols : [],
      },
      nextActions: nextActionsForChain(chain, details),
      criticalGaps: criticalGapsForChain(chain, details),
    };
  });
  const observedChains = chains.filter((chain) => chain.candidateCount > 0);
  const criticalGaps = chains.flatMap((chain) => chain.criticalGaps).sort((a, b) => a.severity.localeCompare(b.severity) || a.chain.localeCompare(b.chain));

  return {
    generatedAt: new Date().toISOString(),
    policy: "Coverage is earned only by candidates observed with a concrete chain identity. This measures configured scan scope, not the percentage of all tokens that exist.",
    targetChainCount: chains.length,
    observedChainCount: observedChains.length,
    scopeCoveragePct: chains.length ? Math.round((observedChains.length / chains.length) * 100) : 0,
    nativeProtocolCoverage: {
      total: num(native.totalProtocols),
      configured: num(native.configuredProtocols),
      unconfigured: num(native.unconfiguredProtocols),
    },
    criticalGapCount: criticalGaps.length,
    criticalGaps,
    chains,
  };
}
