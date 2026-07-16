import { NATIVE_EVENT_TYPES, normalizeNativeEvent } from "./NativePoolAdapter.js";
import { loadNativeEvents, recordNativeEvents, summarizeNativeEventStore } from "./nativeEventStore.js";
import { summarizeNativeProtocolCoverage } from "./nativePoolConfig.js";
import { getEvmFactoryEventCandidates } from "./evm/evmFactoryEventConnector.js";
import { getSolanaProgramEventCandidates } from "./solana/solanaProgramEventConnector.js";

const STAGE_ORDER = [
  NATIVE_EVENT_TYPES.TOKEN_DEPLOYED,
  NATIVE_EVENT_TYPES.POOL_CREATED,
  NATIVE_EVENT_TYPES.POOL_INITIALIZED,
  NATIVE_EVENT_TYPES.FIRST_LIQUIDITY_ADDED,
  NATIVE_EVENT_TYPES.FIRST_SWAP,
  NATIVE_EVENT_TYPES.FIRST_EXTERNAL_BUYER,
  NATIVE_EVENT_TYPES.BUYER_MILESTONE,
  NATIVE_EVENT_TYPES.LIQUIDITY_EXPANSION,
  NATIVE_EVENT_TYPES.SMART_WALLET_ARRIVAL,
];

const FAILURE_EVENTS = new Set([
  NATIVE_EVENT_TYPES.DEVELOPER_SELL,
  NATIVE_EVENT_TYPES.LP_REMOVAL,
  NATIVE_EVENT_TYPES.FAILURE,
]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function maxValue(events = [], field = "") {
  return Math.max(0, ...events.map((event) => num(event[field])));
}

function sumValue(events = [], field = "") {
  return events.reduce((sum, event) => sum + num(event[field]), 0);
}

function latestValue(events = [], field = "") {
  const found = [...events].reverse().find((event) => event[field] !== undefined && event[field] !== null && event[field] !== "");
  return found ? found[field] : undefined;
}

function projectKeyForEvent(event = {}) {
  return event.projectId || `${event.chain || "unknown"}:${event.tokenAddress || event.poolAddress || event.eventId}`;
}

function stageProgress(events = []) {
  const types = new Set(events.map((event) => event.eventType));
  const reached = STAGE_ORDER.filter((stage) => types.has(stage));
  const latestIndex = Math.max(-1, ...reached.map((stage) => STAGE_ORDER.indexOf(stage)));

  return {
    reached,
    latestStage: reached.at(-1) || "DISCOVERED",
    progressPct: latestIndex < 0 ? 8 : Math.round(((latestIndex + 1) / STAGE_ORDER.length) * 100),
  };
}

function liquidityState(events = []) {
  const displayed = Math.max(
    maxValue(events, "displayedLiquidityUsd"),
    maxValue(events, "initialLiquidityUsd"),
    maxValue(events, "activeLiquidityUsd")
  );
  const active = Math.max(maxValue(events, "activeLiquidityUsd"), displayed * 0.62);
  const stableExit = Math.max(maxValue(events, "stableExitLiquidityUsd"), active * 0.48);
  const liquidityExpansion = sumValue(
    events.filter((event) => event.eventType === NATIVE_EVENT_TYPES.LIQUIDITY_EXPANSION),
    "liquidityChange"
  );
  const lpRemoval = Math.abs(
    sumValue(
      events.filter((event) => event.eventType === NATIVE_EVENT_TYPES.LP_REMOVAL),
      "liquidityChange"
    )
  );

  return {
    displayedLiquidityUsd: Math.round(displayed),
    activeLiquidityUsd: Math.round(active),
    stableExitLiquidityUsd: Math.round(stableExit),
    liquidityExpansionUsd: Math.round(liquidityExpansion),
    lpRemovalUsd: Math.round(lpRemoval),
    usableLiquidityRatio: displayed > 0 ? Number((stableExit / displayed).toFixed(3)) : 0,
  };
}

function buyerState(events = []) {
  const buyers = Math.max(maxValue(events, "uniqueBuyers"), maxValue(events, "independentBuyers"));
  const independent = Math.max(maxValue(events, "independentBuyers"), buyers - maxValue(events, "sameFunderBuyers") - maxValue(events, "sniperBuyers"));
  const sameFunder = maxValue(events, "sameFunderBuyers");
  const snipers = maxValue(events, "sniperBuyers");
  const buyVolume = sumValue(events, "buyVolumeUsd");
  const sellVolume = sumValue(events, "sellVolumeUsd");
  const organicShare = buyers > 0 ? independent / buyers : 0;

  return {
    uniqueBuyers: Math.round(buyers),
    independentBuyers: Math.round(Math.max(0, independent)),
    sameFunderBuyers: Math.round(sameFunder),
    sniperBuyers: Math.round(snipers),
    buyVolumeUsd: Math.round(buyVolume),
    sellVolumeUsd: Math.round(sellVolume),
    buySellRatio: sellVolume > 0 ? Number((buyVolume / sellVolume).toFixed(2)) : buyVolume > 0 ? 9.99 : 0,
    organicBuyerShare: Number(clamp(organicShare * 100).toFixed(2)),
  };
}

function nativeScore(lifecycle = {}) {
  const buyers = lifecycle.buyerState || {};
  const liquidity = lifecycle.liquidityState || {};
  const failureCount = lifecycle.failureEvents?.length || 0;
  const stageScore = num(lifecycle.stageProgress?.progressPct) * 0.36;
  const buyerScore = clamp(
    Math.min(22, Math.log10(Math.max(1, num(buyers.independentBuyers))) * 11) +
      Math.min(10, num(buyers.organicBuyerShare) / 8)
  );
  const liquidityScore = clamp(
    Math.min(18, Math.log10(Math.max(10, num(liquidity.stableExitLiquidityUsd))) * 3.5) +
      Math.min(8, num(liquidity.usableLiquidityRatio) * 12)
  );
  const flowScore = clamp(num(buyers.buySellRatio) >= 1.5 ? 8 : num(buyers.buySellRatio) >= 1 ? 4 : 0);
  const confidenceScore = Math.min(10, num(lifecycle.evidenceConfidence) / 10);
  const failurePenalty = failureCount * 18 + (num(lifecycle.deployerNetFlow) < -10_000 ? 12 : 0);

  return Math.round(clamp(stageScore + buyerScore + liquidityScore + flowScore + confidenceScore - failurePenalty));
}

function normalizedPoolFromLifecycle(lifecycle = {}) {
  const liquidity = lifecycle.liquidityState || {};
  const buyers = lifecycle.buyerState || {};
  const currentLiquidity = num(liquidity.displayedLiquidityUsd || liquidity.activeLiquidityUsd);
  const initialLiquidity = Math.max(
    0,
    currentLiquidity - num(liquidity.liquidityExpansionUsd) + num(liquidity.lpRemovalUsd)
  );
  const liquidityGrowthRate =
    initialLiquidity > 0
      ? Number((((currentLiquidity - initialLiquidity) / initialLiquidity) * 100).toFixed(2))
      : currentLiquidity > 0
      ? 100
      : 0;
  const buySellImbalance =
    num(buyers.buyVolumeUsd) + num(buyers.sellVolumeUsd) > 0
      ? Number(
          (
            ((num(buyers.buyVolumeUsd) - num(buyers.sellVolumeUsd)) /
              (num(buyers.buyVolumeUsd) + num(buyers.sellVolumeUsd))) *
            100
          ).toFixed(2)
        )
      : 0;
  const lpConcentration = clamp(
    num(lifecycle.lpConcentration) ||
      num(latestValue(lifecycle.events || [], "lpConcentration")) ||
      (num(liquidity.usableLiquidityRatio) < 0.35 ? 78 : 38)
  );
  const estimatedSlippage =
    currentLiquidity > 0
      ? Number(Math.min(25, (100 / currentLiquidity) * 180).toFixed(3))
      : null;
  const contractRisk = clamp(
    (lifecycle.failureEvents || []).length * 28 +
      (num(lifecycle.deployerNetFlow) < -10_000 ? 22 : 0) +
      (lpConcentration >= 75 ? 18 : 0)
  );

  return {
    chainId: lifecycle.chainId || lifecycle.chain || "unknown",
    dex: lifecycle.dex || lifecycle.protocol || "unknown",
    factoryAddress: lifecycle.factoryAddress || latestValue(lifecycle.events || [], "factoryAddress") || "",
    poolAddress: lifecycle.poolAddress || "",
    tokenAddress: lifecycle.tokenAddress || "",
    quoteTokenAddress: lifecycle.quoteToken || "",
    creationBlock: latestValue(lifecycle.events || [], "creationBlock") || latestValue(lifecycle.events || [], "blockNumber") || null,
    creationTimestamp: lifecycle.firstSeenAt || null,
    initialLiquidityUsd: Math.round(initialLiquidity),
    currentLiquidityUsd: Math.round(currentLiquidity),
    liquidityGrowthRate,
    volumeAcceleration: Math.round(clamp(Math.log10(Math.max(1, num(buyers.buyVolumeUsd) + num(buyers.sellVolumeUsd))) * 15)),
    buySellImbalance,
    uniqueBuyerGrowth: buyers.independentBuyers || buyers.uniqueBuyers || 0,
    smartWalletParticipation: maxValue(lifecycle.events || [], "smartWalletParticipation"),
    lpConcentration: Math.round(lpConcentration),
    estimatedSlippage,
    contractRisk: Math.round(contractRisk),
    identityStatus: lifecycle.tokenAddress ? "TOKEN_CONTRACT_OBSERVED" : "POOL_ONLY",
  };
}

export function buildNativeLifecycle(events = []) {
  const normalized = (Array.isArray(events) ? events : [events]).filter(Boolean).map((event) => normalizeNativeEvent(event));
  const sorted = normalized.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  const first = sorted[0] || {};
  const latest = sorted.at(-1) || {};
  const progress = stageProgress(sorted);
  const liquidity = liquidityState(sorted);
  const buyers = buyerState(sorted);
  const failureEvents = sorted.filter((event) => FAILURE_EVENTS.has(event.eventType));
  const evidenceConfidence = Math.round(
    clamp(
      sorted.reduce((sum, event) => sum + num(event.evidenceConfidence), 0) / Math.max(1, sorted.length)
    )
  );
  const deployerNetFlow = sumValue(sorted, "deployerNetFlow");
  const lifecycle = {
    projectId: projectKeyForEvent(first),
    chain: first.chain || latest.chain || "unknown",
    chainId: first.chainId || latest.chainId || null,
    protocol: first.protocol || latest.protocol || "unknown",
    dex: first.dex || latest.dex || first.protocol || "unknown",
    factoryAddress: latestValue(sorted, "factoryAddress") || first.factoryAddress || "",
    tokenAddress: latestValue(sorted, "tokenAddress") || first.tokenAddress || "",
    poolAddress: latestValue(sorted, "poolAddress") || first.poolAddress || "",
    baseToken: latestValue(sorted, "baseToken") || first.baseToken || "",
    quoteToken: latestValue(sorted, "quoteToken") || first.quoteToken || "",
    deployer: latestValue(sorted, "deployer") || first.deployer || "",
    firstSeenAt: first.timestamp || first.observedAt || null,
    lastSeenAt: latest.timestamp || latest.observedAt || null,
    eventCount: sorted.length,
    stageProgress: progress,
    currentStage: progress.latestStage,
    stageProgressPct: progress.progressPct,
    liquidityState: liquidity,
    buyerState: buyers,
    failureEvents: failureEvents.map((event) => event.eventType),
    deployerNetFlow: Math.round(deployerNetFlow),
    evidenceConfidence,
    events: sorted,
  };

  return {
    ...lifecycle,
    nativeDiscoveryScore: nativeScore(lifecycle),
  };
}

export function nativeCandidateFromLifecycle(lifecycle = {}) {
  const token = lifecycle.tokenAddress || lifecycle.baseToken || lifecycle.poolAddress || lifecycle.projectId || "unknown";
  const shortToken = token && token !== "unknown" ? token.slice(0, 8).toUpperCase() : "NATIVE";
  const liquidity = lifecycle.liquidityState || {};
  const buyers = lifecycle.buyerState || {};
  const source = lifecycle.protocol || "native-discovery-mesh";
  const score = num(lifecycle.nativeDiscoveryScore);
  const normalizedPool = normalizedPoolFromLifecycle(lifecycle);

  return {
    id: lifecycle.projectId,
    projectId: lifecycle.projectId,
    name: lifecycle.name || `${source} Native Candidate`,
    symbol: lifecycle.symbol || shortToken,
    chain: lifecycle.chain,
    address: lifecycle.tokenAddress,
    tokenAddress: lifecycle.tokenAddress,
    pairAddress: lifecycle.poolAddress,
    poolAddress: lifecycle.poolAddress,
    source: "native-discovery-mesh",
    discoverySource: "native-discovery-mesh",
    discoverySources: ["native-discovery-mesh", lifecycle.chain, lifecycle.protocol].filter(Boolean),
    discoveryLane: "new-pool",
    discoveryPriorityScore: Math.round(clamp(score + num(lifecycle.stageProgressPct) * 0.25)),
    nativeDiscoveryScore: score,
    nativeLifecycle: lifecycle,
    normalizedNativePool: normalizedPool,
    nativeLifecycleStage: lifecycle.currentStage,
    nativeEvidenceConfidence: lifecycle.evidenceConfidence,
    liquidityUsd: liquidity.displayedLiquidityUsd,
    activeLiquidityUsd: liquidity.activeLiquidityUsd,
    stableExitLiquidityUsd: liquidity.stableExitLiquidityUsd,
    liquidityGrowthRate: normalizedPool.liquidityGrowthRate,
    volumeAcceleration: normalizedPool.volumeAcceleration,
    buySellImbalance: normalizedPool.buySellImbalance,
    uniqueBuyerGrowth: normalizedPool.uniqueBuyerGrowth,
    lpConcentration: normalizedPool.lpConcentration,
    estimatedSlippage: normalizedPool.estimatedSlippage,
    contractRisk: normalizedPool.contractRisk,
    identityStatus: normalizedPool.identityStatus,
    hardExitLiquidityUsd: liquidity.stableExitLiquidityUsd,
    volume24h: Math.max(num(buyers.buyVolumeUsd), num(buyers.sellVolumeUsd)),
    buyVolumeUsd: buyers.buyVolumeUsd,
    sellVolumeUsd: buyers.sellVolumeUsd,
    uniqueBuyers24h: buyers.uniqueBuyers,
    independentBuyers24h: buyers.independentBuyers,
    sameFunderBuyers24h: buyers.sameFunderBuyers,
    sniperBuyers24h: buyers.sniperBuyers,
    evidence: [
      `Native lifecycle: ${lifecycle.currentStage}`,
      `Independent buyers: ${buyers.independentBuyers}`,
      `Stable exit liquidity: $${liquidity.stableExitLiquidityUsd}`,
    ],
  };
}

function groupEvents(events = []) {
  const groups = new Map();

  for (const event of events) {
    const normalized = normalizeNativeEvent(event);
    const key = projectKeyForEvent(normalized);
    groups.set(key, [...(groups.get(key) || []), normalized]);
  }

  return groups;
}

export function summarizeNativeDiscoveryMesh(input = {}) {
  const candidates = Array.isArray(input) ? input : input.candidates || [];
  const lifecycles = Array.isArray(input.lifecycles) ? input.lifecycles : candidates.map((candidate) => candidate.nativeLifecycle).filter(Boolean);
  const byStage = lifecycles.reduce((acc, lifecycle) => {
    acc[lifecycle.currentStage || "DISCOVERED"] = (acc[lifecycle.currentStage || "DISCOVERED"] || 0) + 1;
    return acc;
  }, {});
  const byChain = lifecycles.reduce((acc, lifecycle) => {
    acc[lifecycle.chain || "unknown"] = (acc[lifecycle.chain || "unknown"] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    status: candidates.length ? "ACTIVE" : "WAITING_FOR_NATIVE_EVENTS",
    candidateCount: candidates.length,
    lifecycleCount: lifecycles.length,
    byStage,
    byChain,
    highConvictionNativeCandidates: candidates.filter((candidate) => num(candidate.nativeDiscoveryScore) >= 70).length,
    topCandidates: [...candidates]
      .sort((a, b) => num(b.nativeDiscoveryScore) - num(a.nativeDiscoveryScore))
      .slice(0, 10)
      .map((candidate, index) => ({
        rank: index + 1,
        symbol: candidate.symbol,
        chain: candidate.chain,
        protocol: candidate.nativeLifecycle?.protocol,
        score: candidate.nativeDiscoveryScore,
        stage: candidate.nativeLifecycleStage,
        independentBuyers: candidate.independentBuyers24h,
        stableExitLiquidityUsd: candidate.stableExitLiquidityUsd,
      })),
  };
}

export async function runNativeDiscoveryMesh(options = {}) {
  const providedEvents = (Array.isArray(options.events) ? options.events : []).map((event) => normalizeNativeEvent(event));
  const connectorEvents = [];
  const connectorReports = [];

  if (options.collectConnectors) {
    const [evm, solana] = await Promise.all([
      getEvmFactoryEventCandidates({ ...options, persist: false, collect: true }),
      getSolanaProgramEventCandidates({ ...options, persist: false }),
    ]);
    connectorEvents.push(...evm.events, ...solana.events);
    connectorReports.push(evm.report, solana.report);
  }

  const storedEvents = options.skipStore
    ? []
    : loadNativeEvents({
        confirmed: options.confirmed !== false,
        includeRaw: options.includeRaw !== false,
        limit: options.eventLimit,
        chain: options.chain,
        protocol: options.protocol,
      });
  const events = [...storedEvents, ...providedEvents, ...connectorEvents];

  if (options.persist !== false && providedEvents.length) {
    recordNativeEvents(providedEvents, { confirmed: Boolean(options.confirmed) });
  }
  if (options.persist !== false && connectorEvents.length) {
    recordNativeEvents(connectorEvents, { confirmed: Boolean(options.confirmed) });
  }

  const lifecycles = [...groupEvents(events).values()]
    .map((group) => buildNativeLifecycle(group))
    .filter((lifecycle) => lifecycle.tokenAddress || lifecycle.poolAddress)
    .sort((a, b) => num(b.nativeDiscoveryScore) - num(a.nativeDiscoveryScore));
  const candidates = lifecycles
    .map((lifecycle) => nativeCandidateFromLifecycle(lifecycle))
    .filter((candidate) => num(candidate.nativeDiscoveryScore) >= num(options.minScore || process.env.NATIVE_DISCOVERY_MIN_SCORE || 0))
    .slice(0, num(options.limit || process.env.NATIVE_DISCOVERY_LIMIT || 500) || undefined);
  const summary = summarizeNativeDiscoveryMesh({ candidates, lifecycles });

  return {
    candidates,
    lifecycles,
    report: {
      ...summary,
      eventCount: events.length,
      storedEventSummary: summarizeNativeEventStore(),
      protocolCoverage: summarizeNativeProtocolCoverage(options),
      connectorReports,
    },
  };
}

export async function getNativeDiscoveryMeshCandidates(options = {}) {
  const result = await runNativeDiscoveryMesh(options);
  return {
    candidates: result.candidates,
    report: result.report,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runNativeDiscoveryMesh({ collectConnectors: process.env.NATIVE_DISCOVERY_COLLECT === "true" });
  console.log(JSON.stringify(result.report, null, 2));
}
