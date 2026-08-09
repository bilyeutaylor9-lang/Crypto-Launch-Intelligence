import { evidenceFamilyForSource } from "../config/sourceManifest.js";
import { buildProjectIdentityGraph } from "./projectIdentityGraph.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ageHours(project = {}) {
  const createdAt = project.pairCreatedAt || project.createdAt || project.launchDate || project.firstSeenAt;
  if (!createdAt) return null;
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / 36e5);
}

function prelaunchEvidenceText(project = {}) {
  return [
    project.lifecycleStage,
    project.stage,
    project.launchStatus,
    project.category,
    project.description,
    project.narrative,
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function hasExplicitPrelaunchEvidence(project = {}) {
  if (project.prelaunch === true || project.testnet === true) return true;
  return /\b(pre[- ]?launch|testnet|tge(?:\s+pending)?|token generation event|upcoming (?:ido|ico|launch)|(?:ido|ico|launch|mainnet) pending|before launch|not live yet)\b/i.test(
    prelaunchEvidenceText(project)
  );
}

export function hasConcreteMarketEvidence(project = {}) {
  return Boolean(
    num(project.priceUsd ?? project.price) > 0 ||
      num(project.liquidityUsd ?? project.liquidity) > 0 ||
      num(project.volume24h ?? project.volume) > 0 ||
      project.pairAddress ||
      project.poolAddress ||
      project.marketKey ||
      project.verifiedExchangeAssetId
  );
}

export function discoveryLaneForProject(project = {}) {
  const age = ageHours(project);
  const marketEvidence = hasConcreteMarketEvidence(project);

  if (!marketEvidence && hasExplicitPrelaunchEvidence(project)) return "prelaunch";
  if (marketEvidence && age !== null && age <= 72) return "new-pool";
  if (marketEvidence) return "established-emerging";
  return "identity-only";
}

export function evidenceFamiliesForProject(project = {}) {
  const sources = [
    project.source,
    ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
  ].filter(Boolean);
  return [...new Set(sources.map(evidenceFamilyForSource).filter(Boolean))];
}

export function independentEvidenceScore(project = {}) {
  const families = evidenceFamiliesForProject(project).filter((family) => family !== "unknown");
  return Math.min(100, Math.round(families.length * 17));
}

export function buildDiscoveryCoverage({
  rawPool = [],
  dedupedPool = [],
  accepted = [],
  rejected = [],
  limited = [],
  sourceReports = {},
} = {}) {
  const all = Array.isArray(dedupedPool) ? dedupedPool : [];
  const acceptedProjects = Array.isArray(accepted) ? accepted : [];
  const rejectedProjects = Array.isArray(rejected) ? rejected : [];
  const limitedProjects = Array.isArray(limited) ? limited : [];
  const lanes = all.reduce((acc, project) => {
    const lane = project.discoveryLane || discoveryLaneForProject(project);
    acc[lane] = (acc[lane] || 0) + 1;
    return acc;
  }, {});
  const familyCounts = all.reduce((acc, project) => {
    for (const family of evidenceFamiliesForProject(project)) {
      acc[family] = (acc[family] || 0) + 1;
    }
    return acc;
  }, {});
  const shadowRejected = rejectedProjects.slice(0, 250).map((project) => ({
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    discoveryLane: project.discoveryLane || discoveryLaneForProject(project),
    liquidityUsd: project.liquidityUsd || 0,
    volume24h: project.volume24h || 0,
    circulatingMarketCap: project.circulatingMarketCap || project.marketCap || null,
    fdv: project.fdv || project.fullyDilutedValue || null,
    discoveryPriorityScore: project.discoveryPriorityScore || 0,
    discoverySources: project.discoverySources || [],
    evidenceFamilies: evidenceFamiliesForProject(project),
  }));

  return {
    generatedAt: new Date().toISOString(),
    rawCandidates: Array.isArray(rawPool) ? rawPool.length : 0,
    dedupedCandidates: all.length,
    acceptedBeforeLimit: acceptedProjects.length,
    acceptedAfterLimit: limitedProjects.length,
    rejectedByQualityGate: rejectedProjects.length,
    lanes,
    evidenceFamilies: familyCounts,
    independentEvidenceAverage: all.length
      ? Math.round(all.reduce((sum, project) => sum + independentEvidenceScore(project), 0) / all.length)
      : 0,
    sourceReports: Object.fromEntries(
      Object.entries(sourceReports).map(([source, report]) => [
        source,
        {
          status: report.status || "UNKNOWN",
          scannedTokens: report.scannedTokens || 0,
          enabled: Boolean(report.enabled ?? true),
          error: report.error || null,
        },
      ])
    ),
    identityGraph: buildProjectIdentityGraph(all),
    shadowRejected,
  };
}
