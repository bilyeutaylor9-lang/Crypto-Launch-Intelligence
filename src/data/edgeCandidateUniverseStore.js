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
    priceUsd: finite(project.priceUsd ?? project.price),
    liquidityUsd: finite(project.liquidityUsd ?? project.activeLiquidityUsd),
    volume24h: finite(project.volume24h ?? project.dexVolume24hUsd),
    marketCap: finite(project.marketCap ?? project.circulatingMarketCapUsd),
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
    scanRunId: projects.find((project) => project?.scanRunId || project?.runId)?.scanRunId || null,
    codeCommitSha: process.env.GITHUB_SHA || null,
    exactCandidates: descriptors.length,
    candidates: descriptors,
    policy: "Bounded exact chain-token-pool descriptors for read-only edge acquisition. No symbol-only candidate is persisted.",
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, saved: descriptors.length, payload };
}

export function loadEdgeCandidateUniverse(options = {}) {
  const file = options.file || FILE;
  if (!fs.existsSync(file)) return { schemaVersion: 1, candidates: [], exactCandidates: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...parsed,
      candidates: (Array.isArray(parsed?.candidates) ? parsed.candidates : [])
        .map(buildEdgeCandidateDescriptor)
        .filter(Boolean),
    };
  } catch {
    return { schemaVersion: 1, candidates: [], exactCandidates: 0 };
  }
}

export const EDGE_CANDIDATE_UNIVERSE_FILE = FILE;
export const __edgeCandidateUniverseHooks = { exactIdentity, addresses, boundedBuyEvents };
