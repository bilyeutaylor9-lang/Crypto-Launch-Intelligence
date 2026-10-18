import fs from "fs";
import path from "path";
import { chainKind, normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

const DEFAULT_STORE_PATH = path.resolve("data", "point-in-time-observations.json");

function ensureDir(filePath = DEFAULT_STORE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readStore(filePath = DEFAULT_STORE_PATH) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { version: "point-in-time-v1", projects: {} };
    throw error;
  }
  const parsed = JSON.parse(contents);
  if (!isRecord(parsed) || !isRecord(parsed.projects) || Object.values(parsed.projects).some((record) =>
    !isRecord(record) || !isRecord(record.firstSeen) ||
    typeof record.firstSeen.firstSeenAt !== "string" || !record.firstSeen.firstSeenAt ||
    !Array.isArray(record.observations) || record.observations.some((observation) => !isRecord(observation))
  )) {
    throw new Error(`Invalid point-in-time observation store: ${filePath}`);
  }
  return parsed;
}

function writeStore(store = {}, filePath = DEFAULT_STORE_PATH) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function declaredIdentity(project = {}) {
  const chain = project.canonicalChain || project.finalChain || project.chain || project.network || project.chainId;
  if (!chain) return null;
  const token = project.finalContractAddress || project.canonicalAddress || project.tokenAddress || project.contractAddress || project.address;
  const pool = project.primaryTradablePool || project.poolAddress || project.pairAddress;
  return token || pool ? { chain: String(chain), tokenAddress: token ? String(token) : null, poolAddress: pool ? String(pool) : null } : null;
}

function rawIdentity(project = {}) {
  const identity = declaredIdentity(project);
  if (!identity || !normalizeChainId(identity.chain)) return null;
  const tokenAddress = normalizeTokenAddress(identity.tokenAddress, identity.chain) ? identity.tokenAddress : null;
  const poolAddress = normalizeTokenAddress(identity.poolAddress, identity.chain) ? identity.poolAddress : null;
  return tokenAddress || poolAddress ? { chain: identity.chain, tokenAddress, poolAddress } : null;
}

function fallbackIdentityKey(identity) {
  const role = identity.tokenAddress ? "token" : "pool";
  const rawAddress = identity.tokenAddress || identity.poolAddress;
  const address = normalizeTokenAddress(rawAddress, identity.chain) || (chainKind(identity.chain) === "evm" ? rawAddress.toLowerCase() : rawAddress);
  return `${identity.chain.toLowerCase()}:${role}:${address}`;
}

function explicitIdentityConflicts(key, identity) {
  const match = String(key).match(/^([^:]+):(?:(token|pool):)?([^:]+)$/i);
  if (!match || !normalizeChainId(match[1])) return false;
  const address = normalizeTokenAddress(match[3], match[1]);
  const matchesFoldedAddress = [identity.tokenAddress, identity.poolAddress].some((candidate) =>
    candidate && candidate.trim().toLowerCase() === match[3].trim().toLowerCase()
  );
  if (!match[2] && !address && !matchesFoldedAddress) return false;
  if (normalizeChainId(match[1]) !== normalizeChainId(identity.chain)) return true;
  const candidates = match[2]
    ? [identity[`${match[2].toLowerCase()}Address`]]
    : [identity.tokenAddress, identity.poolAddress];
  return !address || !candidates.some((candidate) => candidate && normalizeTokenAddress(candidate, identity.chain) === address);
}

export function pointInTimeIdentityKey(project = {}) {
  const explicit = project.projectId || project.permanentProjectKey || project.finalProjectKey;
  const identity = rawIdentity(project);
  if (explicit && (!identity || !explicitIdentityConflicts(explicit, identity))) return explicit;
  const fallback = explicit ? identity : declaredIdentity(project);
  return fallback ? fallbackIdentityKey(fallback)
    : `${String(project.source || "unknown").toLowerCase()}:${String(project.symbol || project.name || "unknown").toLowerCase()}`;
}

function assertReusableIdentity(store, key, identity) {
  if (!identity) return;
  const previous = Object.hasOwn(store.projects, key) ? store.projects[key] : null;
  if (previous?.rawIdentity) {
    const saved = rawIdentity(previous.rawIdentity);
    const role = identity.tokenAddress ? "tokenAddress" : "poolAddress";
    if (!saved || normalizeChainId(saved.chain) !== normalizeChainId(identity.chain) ||
      normalizeTokenAddress(saved[role], saved.chain) !== normalizeTokenAddress(identity[role], identity.chain)) {
      throw new Error(`Conflicting point-in-time observation identity: ${key}`);
    }
  }
  if (chainKind(identity.chain) !== "solana" || !/^([^:]+):(token|pool):([^:]+)$/i.test(key)) return;
  // Old fallback keys lost Solana case; they cannot prove which mint/pool owns the history.
  const legacyKey = key.toLowerCase();
  const legacy = Object.hasOwn(store.projects, legacyKey) ? store.projects[legacyKey] : null;
  const legacyIdentity = legacy?.rawIdentity ? rawIdentity(legacy.rawIdentity) : null;
  if (legacy && (!legacyIdentity || fallbackIdentityKey(legacyIdentity) !== legacyKey)) {
    throw new Error(`Ambiguous legacy point-in-time observation identity: ${legacyKey}`);
  }
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

function updateObservation(store, project, meta) {
  const key = pointInTimeIdentityKey(project);
  const identity = rawIdentity(project);
  assertReusableIdentity(store, key, identity);
  const firstSeen = buildFirstSeenSnapshot(project, meta);
  const previous = Object.hasOwn(store.projects, key) ? store.projects[key] : null;
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

  const record = previous
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
        rawIdentity: identity,
        firstSeen,
        observations: [observation],
        lastObservedAt: observation.observedAt,
      };

  Object.defineProperty(store.projects, key, { value: record, enumerable: true, configurable: true, writable: true });
  return record;
}

export function recordPointInTimeObservations(projects = [], meta = {}, options = {}) {
  if (!Array.isArray(projects) || !projects.length) return [];
  const filePath = options.filePath || DEFAULT_STORE_PATH;
  const store = readStore(filePath);
  const records = projects.map((project) => updateObservation(store, project, meta));
  writeStore(store, filePath);
  return records;
}

export function recordPointInTimeObservation(project = {}, meta = {}, options = {}) {
  return recordPointInTimeObservations([project], meta, options)[0];
}

export function loadPointInTimeObservationStore(options = {}) {
  return readStore(options.filePath || DEFAULT_STORE_PATH);
}
