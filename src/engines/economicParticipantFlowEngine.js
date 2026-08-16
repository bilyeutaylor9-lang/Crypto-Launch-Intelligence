function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function timestamp(event = {}) {
  const ms = new Date(event.eventTime || event.observedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function resolvedActor(event = {}, minConfidencePct = 60) {
  const confidence = num(event.actorConfidencePct) ?? 0;
  if (confidence < minConfidencePct) return null;
  return event.economicActorAddress || (event.routerAdjusted ? event.actorAddress : null) || null;
}

function swapsInRange(events = [], fromMs, toMs) {
  return events.filter((event) => {
    if (event.eventType !== "SWAP") return false;
    const ms = timestamp(event);
    return ms !== null && ms >= fromMs && ms < toMs;
  });
}

function setFor(events = [], side, minConfidencePct) {
  return new Set(events.filter((event) => event.side === side).map((event) => resolvedActor(event, minConfidencePct)).filter(Boolean));
}

function volumeFor(events = [], side) {
  const priced = events.filter((event) => event.side === side && num(event.usdNotional) !== null);
  if (!priced.length) return null;
  return Number(priced.reduce((sum, event) => sum + num(event.usdNotional), 0).toFixed(2));
}

function priceDelta(events = []) {
  const priced = events.filter((event) => num(event.executionPriceUsd) !== null).sort((a, b) => timestamp(a) - timestamp(b));
  if (priced.length < 2) return null;
  const first = num(priced[0].executionPriceUsd);
  const last = num(priced.at(-1).executionPriceUsd);
  if (!(first > 0) || last === null) return null;
  return ((last - first) / first) * 100;
}

function windowMetrics(allEvents = [], key, seconds, nowMs, minConfidencePct) {
  const currentStart = nowMs - seconds * 1000;
  const priorStart = currentStart - seconds * 1000;
  const current = swapsInRange(allEvents, currentStart, nowMs + 1);
  const prior = swapsInRange(allEvents, priorStart, currentStart);
  const earlier = swapsInRange(allEvents, 0, currentStart);
  const currentBuyers = setFor(current, "BUY", minConfidencePct);
  const currentSellers = setFor(current, "SELL", minConfidencePct);
  const priorBuyers = setFor(prior, "BUY", minConfidencePct);
  const priorSellers = setFor(prior, "SELL", minConfidencePct);
  const historicalBuyers = setFor(earlier, "BUY", minConfidencePct);
  const newToObservedHistoryBuyers = [...currentBuyers].filter((actor) => !historicalBuyers.has(actor));
  const repeatObservedBuyers = [...currentBuyers].filter((actor) => historicalBuyers.has(actor));
  const resolvedSwaps = current.filter((event) => resolvedActor(event, minConfidencePct)).length;
  const resolutionCoveragePct = current.length ? (resolvedSwaps / current.length) * 100 : null;
  const buyVolumeUsd = volumeFor(current, "BUY");
  const sellVolumeUsd = volumeFor(current, "SELL");
  const priorSellVolumeUsd = volumeFor(prior, "SELL");
  const netFlowUsd = buyVolumeUsd !== null || sellVolumeUsd !== null ? (buyVolumeUsd || 0) - (sellVolumeUsd || 0) : null;
  const newBuyerSharePct = currentBuyers.size ? (newToObservedHistoryBuyers.length / currentBuyers.size) * 100 : null;
  const priorSellerCount = priorSellers.size || null;
  const currentSellerCount = currentSellers.size || null;
  const sellerCountChangePct = priorSellerCount && currentSellerCount !== null
    ? ((currentSellerCount - priorSellerCount) / priorSellerCount) * 100
    : null;
  const sellVolumeChangePct = priorSellVolumeUsd && sellVolumeUsd !== null
    ? ((sellVolumeUsd - priorSellVolumeUsd) / priorSellVolumeUsd) * 100
    : null;
  const priceDeltaPct = priceDelta(current);
  const sellerThinning = sellerCountChangePct !== null && sellerCountChangePct <= -25;
  const sellFlowThinning = sellVolumeChangePct !== null && sellVolumeChangePct <= -20;
  const positiveFlow = netFlowUsd !== null && netFlowUsd > 0;
  const priceQuiet = priceDeltaPct !== null && Math.abs(priceDeltaPct) <= 7;

  let sellerExhaustionState = "UNOBSERVED";
  let sellerExhaustionScore = null;
  if ((resolutionCoveragePct ?? 0) >= 60 && current.length >= 3 && prior.length >= 2 && (sellerCountChangePct !== null || sellVolumeChangePct !== null)) {
    sellerExhaustionScore = clamp(
      45 + Math.max(0, -(sellerCountChangePct ?? 0)) * 0.7 + Math.max(0, -(sellVolumeChangePct ?? 0)) * 0.35,
      0,
      100
    );
    sellerExhaustionState = sellerExhaustionScore >= 75
      ? "OBSERVED_SELLER_EXHAUSTION"
      : sellerExhaustionScore >= 58
        ? "SELLER_BASE_THINNING"
        : (sellerCountChangePct ?? 0) > 25 || (sellVolumeChangePct ?? 0) > 35
          ? "SELL_SUPPLY_REPLENISHING"
          : "SELLER_STATE_MIXED";
  }

  let absorptionState = "UNOBSERVED";
  if ((resolutionCoveragePct ?? 0) >= 60 && current.length >= 3) {
    if (positiveFlow && priceQuiet && (sellerThinning || sellFlowThinning)) absorptionState = "BUY_SIDE_ABSORPTION_WITH_SELLER_THINNING";
    else if (positiveFlow && priceQuiet && (sellerCountChangePct ?? 0) > 20) absorptionState = "BUYING_ABSORBED_BY_REPLENISHING_SELLERS";
    else if (positiveFlow && priceDeltaPct !== null && priceDeltaPct > 7) absorptionState = "DEMAND_REPRICING";
    else if (netFlowUsd !== null && netFlowUsd < 0 && priceQuiet) absorptionState = "POTENTIAL_DISTRIBUTION_ABSORPTION";
  }

  return {
    window: key,
    windowSeconds: seconds,
    swaps: current.length,
    resolvedSwaps,
    participantResolutionCoveragePct: resolutionCoveragePct === null ? null : Number(resolutionCoveragePct.toFixed(2)),
    uniqueEconomicBuyers: currentBuyers.size || null,
    uniqueEconomicSellers: currentSellers.size || null,
    priorUniqueEconomicBuyers: priorBuyers.size || null,
    priorUniqueEconomicSellers: priorSellers.size || null,
    newToObservedHistoryBuyers: newToObservedHistoryBuyers.length || null,
    repeatObservedBuyers: repeatObservedBuyers.length || null,
    newToObservedHistoryBuyerSharePct: newBuyerSharePct === null ? null : Number(newBuyerSharePct.toFixed(2)),
    buyVolumeUsd,
    sellVolumeUsd,
    priorSellVolumeUsd,
    netFlowUsd: netFlowUsd === null ? null : Number(netFlowUsd.toFixed(2)),
    priceDeltaPct: priceDeltaPct === null ? null : Number(priceDeltaPct.toFixed(3)),
    sellerCountChangePct: sellerCountChangePct === null ? null : Number(sellerCountChangePct.toFixed(2)),
    sellVolumeChangePct: sellVolumeChangePct === null ? null : Number(sellVolumeChangePct.toFixed(2)),
    sellerExhaustionState,
    sellerExhaustionScore: sellerExhaustionScore === null ? null : Math.round(sellerExhaustionScore),
    absorptionState,
    identityMode: "EVM_TRANSACTION_INITIATOR_NOT_BENEFICIAL_OWNER",
  };
}

export function analyzeEconomicParticipantFlow(project = {}, options = {}) {
  const liveEvents = Array.isArray(options.events)
    ? options.events
    : Array.isArray(project.ignitionRawSensors?.eventTape?.events)
      ? project.ignitionRawSensors.eventTape.events
      : [];
  const historicalEvents = Array.isArray(options.history) ? options.history : [];
  const byKey = new Map();
  for (const event of [...historicalEvents, ...liveEvents]) {
    const key = event.eventKey || `${event.txHash || ""}:${event.logIndex ?? ""}:${event.eventTime || ""}`;
    if (key) byKey.set(key, event);
  }
  const events = [...byKey.values()].sort((a, b) => (timestamp(a) || 0) - (timestamp(b) || 0));
  const nowMs = Number.isFinite(Number(options.nowMs))
    ? Number(options.nowMs)
    : Math.max(Date.now(), ...liveEvents.map(timestamp).filter((value) => value !== null));
  const minConfidencePct = Math.max(0, Math.min(100, Number(options.minConfidencePct || 60)));
  const windows = Object.fromEntries([
    ["5m", 300],
    ["15m", 900],
    ["1h", 3600],
    ["6h", 21600],
  ].map(([key, seconds]) => [key, windowMetrics(events, key, seconds, nowMs, minConfidencePct)]));
  const oneHour = windows["1h"];
  const status = Object.values(windows).some((window) => (window.resolvedSwaps || 0) > 0)
    ? "OBSERVED_ECONOMIC_PARTICIPANT_FLOW"
    : "PARTICIPANT_FLOW_UNOBSERVED";

  return {
    ...project,
    economicParticipantFlow: {
      status,
      source: "RESOLVED_EVM_TRANSACTION_INITIATORS",
      observedAt: new Date(nowMs).toISOString(),
      minConfidencePct,
      windows,
      buyerReplacementState: oneHour?.newToObservedHistoryBuyerSharePct === null
        ? "UNOBSERVED"
        : oneHour.newToObservedHistoryBuyerSharePct >= 60
          ? "BUYER_REPLACEMENT_EXPANDING"
          : oneHour.newToObservedHistoryBuyerSharePct >= 35
            ? "BUYER_REPLACEMENT_HEALTHY"
            : "BUYER_BASE_RECYCLING",
      sellerExhaustionState: oneHour?.sellerExhaustionState || "UNOBSERVED",
      sellerExhaustionScore: oneHour?.sellerExhaustionScore ?? null,
      absorptionState: oneHour?.absorptionState || "UNOBSERVED",
      beneficialOwnerResolved: false,
      policy: "Wallet counts refer to resolved transaction initiators, never asserted beneficial owners. New-to-history means new to the locally observed event history, not first-ever buyers.",
      shadowOnly: true,
      rankingInfluence: false,
    },
    observedNewBuyerInitiators1h: oneHour?.newToObservedHistoryBuyers ?? null,
    observedRepeatBuyerInitiators1h: oneHour?.repeatObservedBuyers ?? null,
    resolvedUniqueSellers1h: oneHour?.uniqueEconomicSellers ?? null,
    priorResolvedUniqueSellers1h: oneHour?.priorUniqueEconomicSellers ?? null,
    resolvedSellerExhaustionScore: oneHour?.sellerExhaustionScore ?? null,
    resolvedAbsorptionState: oneHour?.absorptionState || null,
  };
}

export function analyzeEconomicParticipantFlowBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeEconomicParticipantFlow(project, options));
}

export const __economicParticipantFlowTestHooks = {
  resolvedActor,
  windowMetrics,
  priceDelta,
};

export default analyzeEconomicParticipantFlow;
