import fs from "fs";
import path from "path";

const DEFAULT_STORE_PATH = path.resolve("data", "point-in-time-observations.json");

function ensureDir(filePath = DEFAULT_STORE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readStore(filePath = DEFAULT_STORE_PATH) {
  if (!fs.existsSync(filePath)) return { version: "point-in-time-v1", projects: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? { version: "point-in-time-v1", projects: {}, ...parsed } : { version: "point-in-time-v1", projects: {} };
  } catch {
    return { version: "point-in-time-v1", projects: {} };
  }
}

function writeStore(store = {}, filePath = DEFAULT_STORE_PATH) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function pointInTimeIdentityKey(project = {}) {
  return (
    project.projectId ||
    project.permanentProjectKey ||
    project.finalProjectKey ||
    ((project.canonicalChain || project.finalChain || project.chain || project.network || project.chainId) && (project.finalContractAddress || project.canonicalAddress || project.tokenAddress || project.contractAddress || project.address)
      ? `${String(project.canonicalChain || project.finalChain || project.chain || project.network || project.chainId).toLowerCase()}:token:${String(project.finalContractAddress || project.canonicalAddress || project.tokenAddress || project.contractAddress || project.address).toLowerCase()}`
      : null) ||
    ((project.canonicalChain || project.finalChain || project.chain || project.network || project.chainId) && (project.primaryTradablePool || project.poolAddress || project.pairAddress)
      ? `${String(project.canonicalChain || project.finalChain || project.chain || project.network || project.chainId).toLowerCase()}:pool:${String(project.primaryTradablePool || project.poolAddress || project.pairAddress).toLowerCase()}`
      : null) ||
    `${String(project.source || "unknown").toLowerCase()}:${String(project.symbol || project.name || "unknown").toLowerCase()}`
  );
}

export function buildFirstSeenSnapshot(project = {}, meta = {}) {
  return {
    firstSeenAt: meta.observedAt || project.observationTimestamp || project.discoveredAt || new Date().toISOString(),
    firstSeenPrice: project.priceUsd ?? project.canonicalAliases?.priceUsd ?? null,
    firstSeenMarketCap: project.circulatingMarketCapUsd ?? project.marketCap ?? project.canonicalAliases?.circulatingMarketCapUsd ?? null,
    firstSeenLiquidity: project.liquidityUsd ?? project.dexLiquidityUsd ?? project.canonicalAliases?.liquidityUsd ?? null,
    firstSeenVolume: project.volume24hUsd ?? project.volume24h ?? project.canonicalAliases?.volume24hUsd ?? null,
    firstSeenBuyerCount: project.uniqueBuyers24h ?? project.buyers24h ?? project.canonicalAliases?.uniqueBuyers24h ?? null,
    firstSeenHolderCount: project.holderCount ?? project.holders ?? project.canonicalAliases?.holderCount ?? null,
    firstSeenPoolAge: project.poolAgeHours ?? project.poolAge ?? null,
    firstSeenSources: [...new Set([project.source, ...(project.discoverySources || []), ...(project.evidenceSources || [])].filter(Boolean))],
    firstSeenIdentityState: project.identityStatus || project.projectIdentityVerdict || "UNKNOWN",
    firstSeenSafetyState: project.instantSafetyStatus || project.safetyStatus || "UNKNOWN",
    firstSeenResearchPriority: project.earlyAsymmetryResearchPriorityScore ?? project.preIntelligenceOpportunityScore ?? null,
    firstSeenOpportunityRank: project.opportunityRank ?? project.marketOpportunityRank ?? null,
    firstSeenCoverage: project.earlyAsymmetryCoveragePct ?? project.preIntelligenceConfidence ?? null,
    firstSeenMissingEvidence: project.dataStarvationMissingEvidence || project.preIntelligenceMissingEvidence || [],
    firstSeenReasonNotSelected: project.reasonNotQualified || project.finalBlockingReasons || project.standardSelectionState || null,
    firstSeenFunnelStage: project.standardSelectionState || project.funnelStage || null,
    firstSeenRouteState: project.executionStatus || project.accessibilityLane || "UNKNOWN",
    firstSeenCodeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    firstSeenScanRunId: meta.scanRunId || process.env.GITHUB_RUN_ID || null,
  };
}

export function recordPointInTimeObservation(project = {}, meta = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_STORE_PATH;
  const store = readStore(filePath);
  const key = pointInTimeIdentityKey(project);
  const firstSeen = buildFirstSeenSnapshot(project, meta);
  const previous = store.projects[key] || null;
  const observation = {
    observedAt: meta.observedAt || new Date().toISOString(),
    scanRunId: meta.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    priceUsd: firstSeen.firstSeenPrice,
    marketCapUsd: firstSeen.firstSeenMarketCap,
    liquidityUsd: firstSeen.firstSeenLiquidity,
    volume24hUsd: firstSeen.firstSeenVolume,
    buyerCount: firstSeen.firstSeenBuyerCount,
    holderCount: firstSeen.firstSeenHolderCount,
    researchPriority: firstSeen.firstSeenResearchPriority,
    timingState: project.preBreakoutTimingState || null,
    safetyState: firstSeen.firstSeenSafetyState,
  };

  store.projects[key] = previous
    ? {
        ...previous,
        observations: [...(previous.observations || []), observation].slice(-250),
        lastObservedAt: observation.observedAt,
      }
    : {
        identityKey: key,
        symbol: project.symbol || "UNKNOWN",
        name: project.name || "Unknown",
        chain: project.chain || project.canonicalAliases?.chain || null,
        firstSeen,
        observations: [observation],
        lastObservedAt: observation.observedAt,
      };

  writeStore(store, filePath);
  return store.projects[key];
}

export function loadPointInTimeObservationStore(options = {}) {
  return readStore(options.filePath || DEFAULT_STORE_PATH);
}
