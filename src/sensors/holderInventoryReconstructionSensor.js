import { jsonRpc, jsonRpcBatch } from "./rpcJsonClient.js";
import { SELECTORS, callData, decodeUint, encodeAddressWord } from "./evmAbi.js";
import { chainProfileFor } from "./chainProfiles.js";

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function timestamp(event = {}) {
  const ms = new Date(event.eventTime || event.observedAt || 0).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function tokenAmount(raw, decimals) {
  if (raw === null || raw === undefined) return null;
  const parsed = typeof raw === "bigint" ? raw : BigInt(raw);
  const scale = 10 ** Number(decimals);
  const value = Number(parsed) / scale;
  return Number.isFinite(value) ? value : null;
}

function actorForEvent(event = {}, minConfidencePct = 60) {
  const confidence = finite(event.actorConfidencePct) ?? 0;
  const address = lower(event.economicActorAddress || (event.routerAdjusted ? event.actorAddress : ""));
  if (confidence < minConfidencePct || !/^0x[0-9a-f]{40}$/i.test(address)) return null;
  if (event.transactionInitiatorType && event.transactionInitiatorType !== "EOA") return null;
  if (event.economicActorRole && event.economicActorRole === "UNRESOLVED_CONTRACT_INITIATOR") return null;
  return address;
}

function economicSwaps(events = [], minConfidencePct = 60) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.eventType === "SWAP" && ["BUY", "SELL"].includes(event.side))
    .map((event) => ({ ...event, resolvedActor: actorForEvent(event, minConfidencePct) }))
    .filter((event) => event.resolvedActor && finite(event.targetTokenAmount) > 0)
    .sort((a, b) => (timestamp(a) || 0) - (timestamp(b) || 0));
}

function consumeLots(lots = [], sellQty = 0, sellPriceUsd = null) {
  let remaining = Math.max(0, Number(sellQty) || 0);
  let matchedQty = 0;
  let matchedCostUsd = 0;
  const saleMultiples = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    if (!(lot.remainingTokens > 0)) continue;
    const used = Math.min(remaining, lot.remainingTokens);
    lot.remainingTokens -= used;
    remaining -= used;
    matchedQty += used;
    matchedCostUsd += used * lot.unitCostUsd;
    if (sellPriceUsd !== null && lot.unitCostUsd > 0) saleMultiples.push(sellPriceUsd / lot.unitCostUsd);
  }
  return { matchedQty, matchedCostUsd, unmatchedQty: remaining, saleMultiples };
}

export function reconstructActorInventory(actor, events = [], currentBalanceTokens = null, currentPriceUsd = null, nowMs = Date.now()) {
  const address = lower(actor);
  const rows = economicSwaps(events, 0).filter((event) => event.resolvedActor === address);
  const lots = [];
  let observedBuyTokens = 0;
  let observedBuyUsd = 0;
  let observedSellTokens = 0;
  let observedSellUsd = 0;
  let matchedSellTokens = 0;
  let matchedSellCostUsd = 0;
  let unmatchedSellTokens = 0;
  const sellMultiples = [];
  let buyEvents = 0;
  let sellEvents = 0;
  let lastBuyAt = null;
  let lastSellAt = null;
  let firstTradeAt = null;
  let lastTradeAt = null;

  for (const event of rows) {
    const qty = finite(event.targetTokenAmount);
    const usd = finite(event.usdNotional);
    const px = finite(event.executionPriceUsd) ?? (qty && usd !== null ? usd / qty : null);
    const time = event.eventTime || event.observedAt || null;
    if (!(qty > 0)) continue;
    if (!firstTradeAt) firstTradeAt = time;
    lastTradeAt = time;
    if (event.side === "BUY") {
      buyEvents += 1;
      observedBuyTokens += qty;
      if (usd !== null) observedBuyUsd += usd;
      if (px !== null && px > 0) lots.push({ remainingTokens: qty, unitCostUsd: px, acquiredAt: time });
      lastBuyAt = time;
    } else if (event.side === "SELL") {
      sellEvents += 1;
      observedSellTokens += qty;
      if (usd !== null) observedSellUsd += usd;
      const consumed = consumeLots(lots, qty, px);
      matchedSellTokens += consumed.matchedQty;
      matchedSellCostUsd += consumed.matchedCostUsd;
      unmatchedSellTokens += consumed.unmatchedQty;
      sellMultiples.push(...consumed.saleMultiples);
      lastSellAt = time;
    }
  }

  const remainingKnownTokensBeforeBalance = lots.reduce((sum, lot) => sum + Math.max(0, lot.remainingTokens), 0);
  const remainingKnownCostBeforeBalance = lots.reduce((sum, lot) => sum + Math.max(0, lot.remainingTokens) * lot.unitCostUsd, 0);
  const balance = currentBalanceTokens === null ? null : Math.max(0, Number(currentBalanceTokens) || 0);
  const knownCostBasisTokens = balance === null
    ? remainingKnownTokensBeforeBalance
    : Math.min(balance, remainingKnownTokensBeforeBalance);
  const scale = remainingKnownTokensBeforeBalance > 0 ? knownCostBasisTokens / remainingKnownTokensBeforeBalance : 0;
  const knownCostBasisUsd = remainingKnownCostBeforeBalance * scale;
  const unknownBasisTokens = balance === null ? null : Math.max(0, balance - knownCostBasisTokens);
  const avgObservedAcquisitionPriceUsd = knownCostBasisTokens > 0 ? knownCostBasisUsd / knownCostBasisTokens : null;
  const currentBalanceUsd = balance !== null && currentPriceUsd !== null ? balance * currentPriceUsd : null;
  const knownCostBasisCoveragePct = balance !== null && balance > 0 ? clamp((knownCostBasisTokens / balance) * 100) : balance === 0 ? 100 : null;
  const realizedSellReturnPct = matchedSellCostUsd > 0 && observedSellUsd > 0
    ? ((observedSellUsd - matchedSellCostUsd) / matchedSellCostUsd) * 100
    : null;
  const currentUnrealizedReturnPct = avgObservedAcquisitionPriceUsd && currentPriceUsd !== null
    ? ((currentPriceUsd - avgObservedAcquisitionPriceUsd) / avgObservedAcquisitionPriceUsd) * 100
    : null;
  const lastMs = lastTradeAt ? new Date(lastTradeAt).getTime() : null;
  const dormancyHours = Number.isFinite(lastMs) ? Math.max(0, (nowMs - lastMs) / 3_600_000) : null;
  const observedSellToBuyPct = observedBuyTokens > 0 ? (observedSellTokens / observedBuyTokens) * 100 : null;

  let reconstructionState = "NO_OBSERVED_COST_BASIS";
  if (balance === null) reconstructionState = rows.length ? "BALANCE_UNRESOLVED" : "NO_OBSERVED_ACTIVITY";
  else if (balance === 0) reconstructionState = "ZERO_CURRENT_BALANCE";
  else if (knownCostBasisCoveragePct !== null && knownCostBasisCoveragePct >= 80 && unmatchedSellTokens <= observedBuyTokens * 0.05) reconstructionState = "HIGH_OBSERVED_BASIS_COVERAGE";
  else if (knownCostBasisCoveragePct !== null && knownCostBasisCoveragePct >= 35) reconstructionState = "PARTIAL_OBSERVED_BASIS_COVERAGE";
  else reconstructionState = "PRIOR_OR_TRANSFERRED_IN_INVENTORY_DOMINANT";

  const confidencePct = balance === null
    ? 20
    : clamp(
        25 +
        Math.min(25, rows.length * 2.5) +
        Math.min(35, (knownCostBasisCoveragePct ?? 0) * 0.35) -
        Math.min(20, observedBuyTokens > 0 ? (unmatchedSellTokens / observedBuyTokens) * 40 : unmatchedSellTokens > 0 ? 20 : 0),
        10,
        90
      );

  return {
    address,
    buyEvents,
    sellEvents,
    observedBuyTokens,
    observedBuyUsd: observedBuyUsd || null,
    observedSellTokens,
    observedSellUsd: observedSellUsd || null,
    matchedSellTokens,
    matchedSellCostUsd: matchedSellCostUsd || null,
    unmatchedSellTokens,
    observedSellToBuyPct,
    currentBalanceTokens: balance,
    currentBalanceUsd,
    knownCostBasisTokens,
    knownCostBasisUsd: knownCostBasisUsd || null,
    unknownBasisTokens,
    knownCostBasisCoveragePct,
    avgObservedAcquisitionPriceUsd,
    currentUnrealizedReturnPct,
    realizedSellReturnPct,
    medianObservedSellMultiple: median(sellMultiples),
    firstTradeAt,
    lastTradeAt,
    lastBuyAt,
    lastSellAt,
    dormancyHours,
    netObservedAccumulator: observedBuyTokens > observedSellTokens,
    reconstructionState,
    confidencePct: Math.round(confidencePct),
  };
}

function actorPriority(events = [], minConfidencePct = 60) {
  const map = new Map();
  for (const event of economicSwaps(events, minConfidencePct)) {
    const actor = event.resolvedActor;
    const row = map.get(actor) || { address: actor, turnoverUsd: 0, tokenTurnover: 0, events: 0, lastMs: 0 };
    row.turnoverUsd += finite(event.usdNotional) ?? 0;
    row.tokenTurnover += finite(event.targetTokenAmount) ?? 0;
    row.events += 1;
    row.lastMs = Math.max(row.lastMs, timestamp(event) || 0);
    map.set(actor, row);
  }
  return [...map.values()].sort((a, b) => b.turnoverUsd - a.turnoverUsd || b.events - a.events || b.lastMs - a.lastMs);
}

function acquisitionCostBands(rows = [], currentPriceUsd = null) {
  const defs = [
    ["DEEP_PROFIT", 0, 0.5],
    ["PROFIT", 0.5, 0.8],
    ["NEAR_COST", 0.8, 1.2],
    ["UNDERWATER", 1.2, 2],
    ["DEEP_UNDERWATER", 2, Number.POSITIVE_INFINITY],
  ];
  const out = defs.map(([state, minRatio, maxRatio]) => ({ state, inventoryTokens: 0, inventoryUsd: 0, actors: 0 }));
  let unknownTokens = 0;
  let unknownUsd = 0;
  let unknownActors = 0;
  for (const row of rows) {
    const known = finite(row.knownCostBasisTokens) ?? 0;
    const unknown = finite(row.unknownBasisTokens) ?? 0;
    if (known > 0 && currentPriceUsd !== null && row.avgObservedAcquisitionPriceUsd > 0) {
      const basisToCurrentRatio = row.avgObservedAcquisitionPriceUsd / currentPriceUsd;
      const index = defs.findIndex(([, minRatio, maxRatio]) => basisToCurrentRatio >= minRatio && basisToCurrentRatio < maxRatio);
      if (index >= 0) {
        out[index].inventoryTokens += known;
        out[index].inventoryUsd += known * currentPriceUsd;
        out[index].actors += 1;
      }
    }
    if (unknown > 0) {
      unknownTokens += unknown;
      unknownUsd += currentPriceUsd === null ? 0 : unknown * currentPriceUsd;
      unknownActors += 1;
    }
  }
  return [
    ...out.map((row) => ({ ...row, inventoryTokens: Number(row.inventoryTokens.toFixed(6)), inventoryUsd: currentPriceUsd === null ? null : Number(row.inventoryUsd.toFixed(2)) })),
    { state: "UNKNOWN_BASIS", inventoryTokens: Number(unknownTokens.toFixed(6)), inventoryUsd: currentPriceUsd === null ? null : Number(unknownUsd.toFixed(2)), actors: unknownActors },
  ];
}

function dormancyBands(rows = [], currentPriceUsd = null) {
  const defs = [
    ["ACTIVE_LT_1H", 0, 1],
    ["ACTIVE_1H_6H", 1, 6],
    ["QUIET_6H_24H", 6, 24],
    ["DORMANT_24H_72H", 24, 72],
    ["DORMANT_72H_PLUS", 72, Number.POSITIVE_INFINITY],
  ];
  const out = defs.map(([state]) => ({ state, inventoryTokens: 0, inventoryUsd: 0, actors: 0 }));
  let unknown = { state: "DORMANCY_UNKNOWN", inventoryTokens: 0, inventoryUsd: 0, actors: 0 };
  for (const row of rows) {
    const balance = finite(row.currentBalanceTokens) ?? 0;
    if (!(balance > 0)) continue;
    const hours = finite(row.dormancyHours);
    if (hours === null) {
      unknown.inventoryTokens += balance;
      if (currentPriceUsd !== null) unknown.inventoryUsd += balance * currentPriceUsd;
      unknown.actors += 1;
      continue;
    }
    const index = defs.findIndex(([, min, max]) => hours >= min && hours < max);
    if (index >= 0) {
      out[index].inventoryTokens += balance;
      if (currentPriceUsd !== null) out[index].inventoryUsd += balance * currentPriceUsd;
      out[index].actors += 1;
    }
  }
  return [...out, unknown].map((row) => ({
    ...row,
    inventoryTokens: Number(row.inventoryTokens.toFixed(6)),
    inventoryUsd: currentPriceUsd === null ? null : Number(row.inventoryUsd.toFixed(2)),
  }));
}

export async function observeHolderInventoryReconstruction(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address || options.tokenAddress);
  const priceUsd = finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  const liveEvents = Array.isArray(options.events) ? options.events : project.ignitionRawSensors?.eventTape?.events || [];
  const historicalEvents = Array.isArray(options.history) ? options.history : [];
  const byKey = new Map();
  for (const event of [...historicalEvents, ...liveEvents]) {
    const key = event.eventKey || `${event.txHash || ""}:${event.logIndex ?? ""}:${event.eventTime || ""}`;
    if (key) byKey.set(key, event);
  }
  const events = [...byKey.values()];
  const minConfidencePct = Math.max(0, Math.min(100, Number(options.minConfidencePct || 60)));
  const candidates = actorPriority(events, minConfidencePct);
  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", source: "HOLDER_INVENTORY_RECONSTRUCTION", shadowOnly: true, rankingInfluence: false };
  if (!/^0x[0-9a-f]{40}$/i.test(tokenAddress)) return { status: "MISSING_TOKEN_ADDRESS", source: "HOLDER_INVENTORY_RECONSTRUCTION", shadowOnly: true, rankingInfluence: false };
  if (!candidates.length) return { status: "NO_RESOLVED_ACTOR_HISTORY", source: "HOLDER_INVENTORY_RECONSTRUCTION", observedAt: new Date().toISOString(), actors: [], shadowOnly: true, rankingInfluence: false };

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 10_000, retries: options.retries ?? 1 };
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const blockTag = safeBlock?.number || "latest";
    const decimalsHex = await jsonRpc(rpcUrl, "eth_call", [{ to: tokenAddress, data: SELECTORS.decimals }, blockTag], rpcOptions);
    const decimals = Number(decodeUint(decimalsHex, 0));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Unsupported token decimals: ${decimals}`);

    const maxActors = Math.max(4, Math.min(48, Number(options.maxActors || process.env.IGNITION_HOLDER_INVENTORY_MAX_ACTORS || 24)));
    const selected = candidates.slice(0, maxActors);
    const calls = selected.map((item) => ({
      method: "eth_call",
      params: [{ to: tokenAddress, data: callData(SELECTORS.balanceOf, [encodeAddressWord(item.address)]) }, blockTag],
    }));
    const balances = await jsonRpcBatch(rpcUrl, calls, rpcOptions);
    const nowMs = new Date(safeBlock?.timestamp ? Number(BigInt(safeBlock.timestamp)) * 1000 : Date.now()).getTime();
    const rows = selected.map((item, index) => {
      const result = balances[index];
      let balanceTokens = null;
      try {
        if (!result?.error && result?.result) balanceTokens = tokenAmount(decodeUint(result.result, 0), decimals);
      } catch {
        balanceTokens = null;
      }
      return reconstructActorInventory(item.address, events, balanceTokens, priceUsd, nowMs);
    });

    const balanceResolved = rows.filter((row) => row.currentBalanceTokens !== null);
    const sampledInventoryTokens = balanceResolved.reduce((sum, row) => sum + (row.currentBalanceTokens || 0), 0);
    const knownCostBasisTokens = balanceResolved.reduce((sum, row) => sum + (row.knownCostBasisTokens || 0), 0);
    const knownCostBasisInventoryUsd = priceUsd === null ? null : knownCostBasisTokens * priceUsd;
    const sampledInventoryUsd = priceUsd === null ? null : sampledInventoryTokens * priceUsd;
    const unknownBasisInventoryUsd = priceUsd === null ? null : Math.max(0, sampledInventoryTokens - knownCostBasisTokens) * priceUsd;
    const actorBalanceCoveragePct = selected.length ? (balanceResolved.length / selected.length) * 100 : null;
    const knownCostBasisCoveragePct = sampledInventoryTokens > 0 ? (knownCostBasisTokens / sampledInventoryTokens) * 100 : sampledInventoryTokens === 0 && balanceResolved.length ? 100 : null;

    return {
      status: balanceResolved.length === selected.length ? "OBSERVED_HOLDER_INVENTORY" : balanceResolved.length ? "PARTIAL_HOLDER_INVENTORY" : "BALANCES_UNRESOLVED",
      source: "RESOLVED_SWAP_HISTORY_PLUS_POINT_IN_TIME_BALANCEOF",
      observedAt: new Date().toISOString(),
      chainId: profile?.chainId || chain,
      blockNumber: blockTag,
      tokenAddress,
      priceUsd,
      minActorConfidencePct: minConfidencePct,
      actorHistoryCount: candidates.length,
      sampledActors: selected.length,
      balanceResolvedActors: balanceResolved.length,
      actorBalanceCoveragePct: actorBalanceCoveragePct === null ? null : Number(actorBalanceCoveragePct.toFixed(2)),
      knownCostBasisCoveragePct: knownCostBasisCoveragePct === null ? null : Number(knownCostBasisCoveragePct.toFixed(2)),
      sampledInventoryTokens: Number(sampledInventoryTokens.toFixed(6)),
      sampledInventoryUsd: sampledInventoryUsd === null ? null : Number(sampledInventoryUsd.toFixed(2)),
      knownCostBasisInventoryUsd: knownCostBasisInventoryUsd === null ? null : Number(knownCostBasisInventoryUsd.toFixed(2)),
      unknownBasisInventoryUsd: unknownBasisInventoryUsd === null ? null : Number(unknownBasisInventoryUsd.toFixed(2)),
      acquisitionCostBands: acquisitionCostBands(rows, priceUsd),
      dormancyBands: dormancyBands(rows, priceUsd),
      actors: rows,
      beneficialOwnerResolved: false,
      policy: "Inventory reconstruction is limited to resolved transaction initiators observed in the local swap history plus point-in-time ERC-20 balances. Cost basis covers only inventory traceable to observed buys; prior holdings, transfers, CEX activity, and unobserved venues remain unknown.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "HOLDER_INVENTORY_RECONSTRUCTION",
      error: error.message,
      observedAt: new Date().toISOString(),
      actors: [],
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __holderInventoryReconstructionTestHooks = {
  actorForEvent,
  economicSwaps,
  reconstructActorInventory,
  acquisitionCostBands,
  dormancyBands,
  consumeLots,
};

export default observeHolderInventoryReconstruction;
