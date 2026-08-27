import fs from "node:fs";
import path from "node:path";

import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const FILE = path.resolve("data", "edge-candidate-universe.json");
const DEFAULT_LIMIT = 500;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value) {
  const parsed = typeof value === "number" && value > 0
    ? (value < 10_000_000_000 ? value * 1000 : value)
    : Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function addresses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flat(Infinity)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => /^0x[0-9a-f]{40}$/.test(value)))];
}

function exactIdentity(project = {}) {
  const chain = normalizeChainId(
    project.chain || project.canonicalChain || project.network || project.chainId
  );
  const tokenAddress = normalizeTokenAddress(
    project.tokenAddress || project.contractAddress || project.canonicalAddress || project.address,
    chain
  );
  const poolAddress = normalizePoolAddress(
    project.poolAddress || project.pairAddress || project.primaryTradablePool,
    chain
  );
  if (!chain || !tokenAddress || !poolAddress) return null;
  return { chain, tokenAddress, poolAddress };
}

function boundedBuyEvents(project = {}, limit = 80) {
  const tape = project.ignitionRawSensors?.eventTape?.events ||
    project.lpEventTape?.events ||
    project.eventTape?.events ||
    [];
  return (Array.isArray(tape) ? tape : [])
    .filter((event) => event?.eventType === "SWAP" && event?.side === "BUY")
    .slice(-Math.max(1, Number(limit)))
    .map((event) => ({
      eventType: "SWAP",
      side: "BUY",
      economicActorAddress: event.economicActorAddress || event.resolvedEconomicActor || null,
      actorAddress: event.actorAddress || null,
      actorResolutionConfidencePct: finite(
        event.actorResolutionConfidencePct ?? event.economicActorConfidencePct
      ),
      eventTime: event.eventTime || event.blockTime || event.observedAt || null,
      txHash: event.txHash || null,
      usdNotional: finite(event.usdNotional ?? event.quoteAmountUsd ?? event.amountUsd),
    }));
}

export function buildEdgeCandidateDescriptor(project = {}) {
  const identity = exactIdentity(project);
  if (!identity) return null;
  const eventTape = boundedBuyEvents(project);
  return {
    schemaVersion: 1,
    canonicalProjectId: project.canonicalProjectId || `${identity.chain}:${identity.tokenAddress}`,
    ...identity,
    symbol: project.symbol || null,
    name: project.name || null,
    sourceObservedAt: isoOrNull(
      project.sourceObservedAt ??
      project.marketObservedAt ??
      project.priceObservedAt ??
      project.quoteTimestamp ??
      project.canonicalExecutionRoute?.quoteTimestamp ??
      project.canonicalExecutionRoute?.lastVerifiedAt ??
      project.routeLastVerifiedAt ??
      project.lastVerifiedAt ??
      project.sourceTimestamp ??
      project.observationTimestamp ??
      project.observedAt ??
      project.scannedAt
    ),
    narrative: project.narrative || project.primaryNarrative || project.category || null,
    sector: project.sector || project.projectSector || null,
    pairCreatedAt: isoOrNull(
      project.pairCreatedAt ?? project.pairCreatedAtMs ?? project.poolCreatedAt ?? project.launchedAt
    ),
    priceUsd: finite(project.priceUsd ?? project.price),
    liquidityUsd: finite(project.liquidityUsd ?? project.activeLiquidityUsd),
    volume24h: finite(project.volume24hUsd ?? project.volume24h ?? project.dexVolume24hUsd),
    volume24hUsd: finite(project.volume24hUsd ?? project.volume24h ?? project.dexVolume24hUsd),
    marketCap: finite(project.marketCapUsd ?? project.marketCap ?? project.circulatingMarketCapUsd),
    marketCapUsd: finite(project.marketCapUsd ?? project.marketCap ?? project.circulatingMarketCapUsd),
    evidenceCoveragePct: finite(
      project.evidenceCoveragePct ?? project.evidenceCoverageScore ?? project.dataConfidence
    ),
    riskScore: finite(project.riskScore ?? project.riskScorePct ?? project.trapRiskScore),
    priceChange24hPct: finite(project.priceChange24hPct ?? project.priceChange?.h24),
    roundTripExecutionCostBps: finite(
      project.roundTripExecutionCostBps ??
      project.executionAwareEV?.roundTripExecutionCostBps ??
      project.executionAwareEV?.estimatedRoundTripCostBps ??
      project.executionCosts?.roundTripBps
    ),
    executionReferenceSizeUsd: finite(
      project.executionReferenceSizeUsd ??
      project.executionAwareEV?.referenceSizeUsd ??
      project.executionCosts?.referenceSizeUsd ??
      project.tradeSizeUsd
    ),
    executionCostProvenance: project.executionCostProvenance ||
      project.executionReality?.provenance ||
      project.executionCostEvidence?.provenance ||
      project.executionCosts?.provenance ||
      null,
    executionProofEligibility: project.executionProofEligibility || {
      schemaVersion: 1,
      state: "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE",
      reason: "PAIRED_EXECUTABLE_ROUND_TRIP_QUOTE_UNAVAILABLE",
      pairedExecutableQuoteObserved: false,
      shadowOnly: true,
      rankingInfluence: false,
      automaticTrading: false,
    },
    buyPriceImpactPct: finite(
      project.buyPriceImpactPct ?? project.executionAwareEV?.buyPriceImpactPct
    ),
    sellPriceImpactPct: finite(
      project.sellPriceImpactPct ?? project.executionAwareEV?.sellPriceImpactPct
    ),
    routeQualityScore: finite(
      project.routeQualityScore ?? project.executionAwareEV?.routeQualityScore
    ),
    canonicalExecutionRoute: {
      routerAddress: project.canonicalExecutionRoute?.routerAddress || null,
      spenderAddress: project.canonicalExecutionRoute?.spenderAddress || null,
      aggregatorAddress: project.canonicalExecutionRoute?.aggregatorAddress || null,
    },
    routerAddresses: addresses([
      project.routerAddresses,
      project.purchaseRoute?.routerAddress,
      project.canonicalExecutionRoute?.routerAddress,
    ]),
    aggregatorAddresses: addresses([
      project.aggregatorAddresses,
      project.canonicalExecutionRoute?.aggregatorAddress,
    ]),
    targetSpecificExecutionContracts: addresses([
      project.targetSpecificExecutionContracts,
      project.targetExecutionContracts,
      project.protocolContracts,
      project.stakingContracts,
      project.vaultAddresses,
      project.migrationContracts,
      project.candidateSpecificContracts,
    ]),
    targetProximityWallets: addresses([
      project.targetProximityWallets,
      project.prePositioningTargetWallets,
    ]),
    lpEventTape: { events: eventTape },
    ignitionTwin: project.ignitionTwin ? {
      state: project.ignitionTwin.state || null,
      ignitionCapitalUsd: finite(project.ignitionTwin.ignitionCapitalUsd),
      evidenceCoveragePct: finite(project.ignitionTwin.evidenceCoveragePct),
      vacuumIntegrityState: project.ignitionTwin.vacuumIntegrityState || null,
    } : null,
    supplyLineageIntelligence: project.supplyLineageIntelligence ? {
      vacuumIntegrityState: project.supplyLineageIntelligence.vacuumIntegrityState || null,
    } : null,
  };
}

export function saveEdgeCandidateUniverse(projects = [], options = {}) {
  const file = options.file || FILE;
  const limit = Math.max(1, Number(options.limit || process.env.EDGE_CANDIDATE_UNIVERSE_LIMIT || DEFAULT_LIMIT));
  const descriptors = (Array.isArray(projects) ? projects : [])
    .map(buildEdgeCandidateDescriptor)
    .filter(Boolean)
    .slice(0, limit);
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    scanRunId: projects.find((project) => project?.scanRunId || project?.runId)?.scanRunId ||
      projects.find((project) => project?.runId)?.runId ||
      null,
    workflowRunId: options.workflowRunId ?? process.env.GITHUB_RUN_ID ?? null,
    codeCommitSha: options.codeCommitSha ?? process.env.GITHUB_SHA ?? null,
    exactCandidates: descriptors.length,
    exactCandidatesWithSourceTimestamp: descriptors.filter((row) => row.sourceObservedAt).length,
    candidates: descriptors,
    policy: "Bounded exact chain-token-pool descriptors with explicit candidate source timestamps for read-only edge acquisition. No symbol-only candidate is persisted.",
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, saved: descriptors.length, payload };
}

export function loadEdgeCandidateUniverse(options = {}) {
  const file = options.file || FILE;
  if (!fs.existsSync(file)) {
    return {
      schemaVersion: 1,
      availabilityState: "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE",
      availabilityReason: "FILE_MISSING",
      candidates: [],
      exactCandidates: 0,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...parsed,
      availabilityState: "EDGE_CANDIDATE_UNIVERSE_AVAILABLE",
      availabilityReason: null,
      candidates: (Array.isArray(parsed?.candidates) ? parsed.candidates : [])
        .map(buildEdgeCandidateDescriptor)
        .filter(Boolean),
    };
  } catch {
    return {
      schemaVersion: 1,
      availabilityState: "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE",
      availabilityReason: "FILE_UNREADABLE",
      candidates: [],
      exactCandidates: 0,
    };
  }
}

export const EDGE_CANDIDATE_UNIVERSE_FILE = FILE;
export const __edgeCandidateUniverseHooks = { exactIdentity, addresses, boundedBuyEvents, isoOrNull };
