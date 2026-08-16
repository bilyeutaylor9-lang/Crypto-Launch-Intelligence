import { jsonRpc, jsonRpcBatch } from "./rpcJsonClient.js";
import {
  ERC20_TRANSFER_TOPIC,
  SELECTORS,
  addressFromTopic,
  decodeUint,
  hexNumber,
} from "./evmAbi.js";
import { chainProfileFor } from "./chainProfiles.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEFAULT_LOOKBACK_HOURS = 36;

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validAddress(value = "") {
  return /^0x[0-9a-f]{40}$/i.test(String(value || ""));
}

function uniqueAddresses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map(lower)
    .filter(validAddress))];
}

function tokenAmount(raw, decimals = 18) {
  try {
    const value = Number(typeof raw === "bigint" ? raw : BigInt(raw));
    const scaled = value / 10 ** Number(decimals);
    return Number.isFinite(scaled) ? scaled : null;
  } catch {
    return null;
  }
}

function addAddresses(registry, type, values = [], source = "PROJECT_METADATA") {
  for (const address of uniqueAddresses(values)) {
    const existing = registry.get(address) || { address, labels: [], sources: [] };
    if (!existing.labels.includes(type)) existing.labels.push(type);
    if (!existing.sources.includes(source)) existing.sources.push(source);
    registry.set(address, existing);
  }
}

export function normalizeSupplyAddressRegistry(project = {}, options = {}) {
  const registry = new Map();
  const explicit = options.addressLabels || project.supplyLineageLabels || project.addressLabels;

  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      if (!item || !validAddress(item.address)) continue;
      const labels = Array.isArray(item.labels) ? item.labels : [item.type || item.label].filter(Boolean);
      for (const label of labels) addAddresses(registry, String(label).toUpperCase(), [item.address], item.source || "EXPLICIT_LABEL");
    }
  } else if (explicit && typeof explicit === "object") {
    for (const [address, raw] of Object.entries(explicit)) {
      if (!validAddress(address)) continue;
      const labels = Array.isArray(raw) ? raw : [raw];
      for (const label of labels.filter(Boolean)) addAddresses(registry, String(label).toUpperCase(), [address], "EXPLICIT_LABEL");
    }
  }

  addAddresses(registry, "TREASURY", options.treasuryAddresses || project.treasuryAddresses || project.tokenomics?.treasuryAddresses);
  addAddresses(registry, "TEAM", options.teamAddresses || project.teamAddresses || project.tokenomics?.teamAddresses);
  addAddresses(registry, "VESTING", options.vestingAddresses || project.vestingAddresses || project.tokenomics?.vestingAddresses);
  addAddresses(registry, "CEX", options.exchangeAddresses || project.exchangeAddresses || project.cexAddresses);
  addAddresses(registry, "BRIDGE", options.bridgeAddresses || project.bridgeAddresses || project.tokenomics?.bridgeAddresses);
  addAddresses(registry, "ROUTER", options.routerAddresses || project.routerAddresses || project.dexRouterAddresses);
  addAddresses(registry, "BURN", [ZERO, ...(project.burnAddresses || [])]);

  const pool = lower(options.poolAddress || project.poolAddress || project.pairAddress || project.primaryTradablePool);
  if (validAddress(pool)) addAddresses(registry, "DEX_POOL", [pool], "CANONICAL_POOL");

  return registry;
}

function labelSet(registry, address) {
  return new Set(registry.get(lower(address))?.labels || []);
}

function hasAnyLabel(registry, address, labels = []) {
  const set = labelSet(registry, address);
  return labels.some((label) => set.has(label));
}

function strategicType(registry, address) {
  const set = labelSet(registry, address);
  if (set.has("TREASURY")) return "TREASURY";
  if (set.has("TEAM")) return "TEAM";
  if (set.has("VESTING")) return "VESTING";
  return null;
}

async function transferLogs(rpcUrl, tokenAddress, fromBlock, toBlock, options = {}) {
  const chunkSize = Math.max(100, Math.min(1900, Number(options.logChunkSize || 1600)));
  const maxChunks = Math.max(1, Math.min(100, Number(options.maxLogChunks || 36)));
  const logs = [];
  const chunks = [];
  for (let start = fromBlock; start <= toBlock && chunks.length < maxChunks; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    chunks.push([start, end]);
    const result = await jsonRpc(rpcUrl, "eth_getLogs", [{
      fromBlock: hexNumber(start),
      toBlock: hexNumber(end),
      address: tokenAddress,
      topics: [ERC20_TRANSFER_TOPIC],
    }], options);
    if (Array.isArray(result)) logs.push(...result.filter((row) => row?.removed !== true));
  }
  return { logs, chunks, truncated: chunks.length >= maxChunks && chunks.at(-1)?.[1] < toBlock };
}

async function blockTimestampMap(rpcUrl, logs = [], options = {}) {
  const blockHexes = [...new Set(logs.map((log) => log.blockNumber).filter(Boolean))];
  const maxBlocks = Math.max(20, Math.min(800, Number(options.maxTimestampBlocks || 300)));
  const selected = blockHexes.slice(-maxBlocks);
  if (!selected.length) return new Map();
  const calls = selected.map((block) => ({ method: "eth_getBlockByNumber", params: [block, false] }));
  const rows = await jsonRpcBatch(rpcUrl, calls, options);
  const map = new Map();
  selected.forEach((block, index) => {
    const raw = rows[index]?.result?.timestamp;
    if (!raw) return;
    try {
      map.set(block, Number(BigInt(raw)) * 1000);
    } catch {
      // Ignore malformed block timestamps.
    }
  });
  return map;
}

export function parseSupplyTransfers(logs = [], decimals = 18, timestamps = new Map()) {
  return (Array.isArray(logs) ? logs : []).flatMap((log) => {
    const from = addressFromTopic(log.topics?.[1]);
    const to = addressFromTopic(log.topics?.[2]);
    if (!from || !to) return [];
    const amountTokens = tokenAmount(decodeUint(log.data || "0x", 0), decimals);
    if (!(amountTokens > 0)) return [];
    let blockNumber = null;
    try { blockNumber = Number(BigInt(log.blockNumber || "0x0")); } catch { blockNumber = null; }
    return [{
      txHash: lower(log.transactionHash),
      logIndex: log.logIndex || null,
      blockNumber,
      blockHex: log.blockNumber || null,
      eventTime: timestamps.has(log.blockNumber) ? new Date(timestamps.get(log.blockNumber)).toISOString() : null,
      from: lower(from),
      to: lower(to),
      amountTokens,
    }];
  }).sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));
}

function dormantActorMap(project = {}, options = {}) {
  const thresholdHours = Math.max(24, Number(options.dormantThresholdHours || 72));
  const rows = project.holderInventoryReconstruction?.actors || project.ignitionRawSensors?.holderInventory?.actors || [];
  return new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => validAddress(row.address) && finite(row.dormancyHours) !== null && row.dormancyHours >= thresholdHours)
    .map((row) => [lower(row.address), {
      dormancyHours: finite(row.dormancyHours),
      currentBalanceTokens: finite(row.currentBalanceTokens),
      confidencePct: finite(row.confidencePct),
    }]));
}

function sellTxSet(project = {}, options = {}) {
  const events = options.events || project.ignitionRawSensors?.eventTape?.events || [];
  return new Set((Array.isArray(events) ? events : [])
    .filter((event) => event?.eventType === "SWAP" && event.side === "SELL" && event.txHash)
    .map((event) => lower(event.txHash)));
}

function eventRole(transfer, registry, dormantActors, confirmedSellTxs) {
  const sourceStrategic = strategicType(registry, transfer.from);
  const sourceDormant = dormantActors.has(transfer.from);
  const toMarket = hasAnyLabel(registry, transfer.to, ["DEX_POOL", "ROUTER"]);
  const toCex = hasAnyLabel(registry, transfer.to, ["CEX"]);
  const toBridge = hasAnyLabel(registry, transfer.to, ["BRIDGE"]);
  const confirmedSell = confirmedSellTxs.has(transfer.txHash);

  if (confirmedSell) return { type: "CONFIRMED_DEX_SELL", confidencePct: 95, marketFacing: true, strategic: sourceStrategic, dormant: sourceDormant };
  if (toCex) return { type: "CEX_SUPPLY_STAGING", confidencePct: 68, marketFacing: false, cex: true, strategic: sourceStrategic, dormant: sourceDormant };
  if (toBridge) return { type: "CROSS_CHAIN_MOBILITY", confidencePct: 58, marketFacing: false, bridge: true, strategic: sourceStrategic, dormant: sourceDormant };
  if (toMarket && sourceStrategic) return { type: `${sourceStrategic}_TO_MARKET_ROUTE`, confidencePct: 78, marketFacing: true, strategic: sourceStrategic, dormant: false };
  if (toMarket && sourceDormant) return { type: "DORMANT_TO_MARKET_ROUTE", confidencePct: 72, marketFacing: true, strategic: null, dormant: true };
  if (toMarket) return { type: "UNCONFIRMED_MARKET_ROUTE_TRANSFER", confidencePct: 45, marketFacing: true, strategic: null, dormant: false };
  if (sourceStrategic) return { type: `${sourceStrategic}_STAGING_TRANSFER`, confidencePct: 58, marketFacing: false, strategic: sourceStrategic, dormant: false, staging: true };
  if (sourceDormant) return { type: "DORMANT_STAGING_TRANSFER", confidencePct: 55, marketFacing: false, strategic: null, dormant: true, staging: true };
  return { type: "OTHER_TRANSFER", confidencePct: 25, marketFacing: false, strategic: null, dormant: false };
}

export function buildSupplyLineage(transfers = [], registry = new Map(), dormantActors = new Map(), confirmedSellTxs = new Set(), options = {}) {
  const stagingWindowBlocks = Math.max(10, Number(options.stagingWindowBlocks || 9_000));
  const rows = transfers.map((transfer) => ({ ...transfer, ...eventRole(transfer, registry, dormantActors, confirmedSellTxs) }));
  const relevant = rows.filter((row) => row.type !== "OTHER_TRANSFER");
  const byFrom = new Map();
  for (const row of rows) {
    if (!byFrom.has(row.from)) byFrom.set(row.from, []);
    byFrom.get(row.from).push(row);
  }

  const oneHop = [];
  let unresolvedStagedTokens = 0;
  for (const first of relevant.filter((row) => row.staging)) {
    const followUps = (byFrom.get(first.to) || []).filter((second) =>
      second.blockNumber !== null && first.blockNumber !== null &&
      second.blockNumber >= first.blockNumber &&
      second.blockNumber - first.blockNumber <= stagingWindowBlocks &&
      (second.marketFacing || second.cex)
    );
    const forwarded = followUps.reduce((sum, second) => sum + second.amountTokens, 0);
    const matched = Math.min(first.amountTokens, forwarded);
    if (matched > 0) {
      oneHop.push({
        type: first.strategic ? `STAGED_${first.strategic}_TO_MARKET` : first.dormant ? "STAGED_DORMANT_TO_MARKET" : "STAGED_TO_MARKET",
        source: first.from,
        intermediary: first.to,
        amountTokens: matched,
        sourceTxHash: first.txHash,
        firstBlock: first.blockNumber,
        sinkTypes: [...new Set(followUps.map((row) => row.type))],
        confidencePct: first.strategic ? 76 : 68,
      });
    }
    unresolvedStagedTokens += Math.max(0, first.amountTokens - matched);
  }

  const sum = (predicate) => relevant.filter(predicate).reduce((total, row) => total + row.amountTokens, 0);
  const confirmedSellSupplyTokens = sum((row) => row.type === "CONFIRMED_DEX_SELL");
  const marketFacingPotentialSupplyTokens = sum((row) => row.marketFacing);
  const cexDirectedSupplyTokens = sum((row) => row.cex);
  const bridgeMobilityTokens = sum((row) => row.bridge);
  const dormantWakeupTokens = sum((row) => row.dormant);
  const dormantMarketFacingTokens = sum((row) => row.dormant && row.marketFacing);
  const strategicMarketFacingTokens = sum((row) => Boolean(row.strategic) && row.marketFacing);
  const stagedOneHopSupplyTokens = oneHop.reduce((total, row) => total + row.amountTokens, 0);
  const strategicStagedTokens = sum((row) => Boolean(row.strategic) && row.staging);

  return {
    relevantEvents: relevant,
    oneHopPaths: oneHop,
    confirmedSellSupplyTokens,
    marketFacingPotentialSupplyTokens,
    cexDirectedSupplyTokens,
    bridgeMobilityTokens,
    dormantWakeupTokens,
    dormantMarketFacingTokens,
    strategicMarketFacingTokens,
    stagedOneHopSupplyTokens,
    strategicStagedTokens,
    unresolvedStagedTokens,
  };
}

function toUsd(tokens, priceUsd) {
  return finite(tokens) !== null && finite(priceUsd) !== null ? tokens * priceUsd : null;
}

export async function observeSupplyLineage(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address || options.tokenAddress);
  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", source: "SUPPLY_LINEAGE", shadowOnly: true, rankingInfluence: false };
  if (!validAddress(tokenAddress)) return { status: "MISSING_TOKEN_ADDRESS", source: "SUPPLY_LINEAGE", shadowOnly: true, rankingInfluence: false };

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 8_000, retries: options.retries ?? 1, ...options };
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const blockTag = safeBlock?.number || "latest";
    const currentBlock = Number(BigInt(safeBlock?.number || await jsonRpc(rpcUrl, "eth_blockNumber", [], rpcOptions)));
    const decimalsHex = await jsonRpc(rpcUrl, "eth_call", [{ to: tokenAddress, data: SELECTORS.decimals }, blockTag], rpcOptions);
    const decimals = Number(decodeUint(decimalsHex, 0));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Unsupported token decimals: ${decimals}`);

    const blockTimeSeconds = Number(profile?.blockTimeSeconds || options.blockTimeSeconds || 2);
    const blocksPerHour = 3600 / blockTimeSeconds;
    const lookbackHours = Math.max(4, Math.min(96, Number(options.lookbackHours || DEFAULT_LOOKBACK_HOURS)));
    const fromBlock = Math.max(0, Math.floor(currentBlock - lookbackHours * blocksPerHour));
    const fetched = await transferLogs(rpcUrl, tokenAddress, fromBlock, currentBlock, rpcOptions);
    const timestamps = await blockTimestampMap(rpcUrl, fetched.logs, rpcOptions);
    const parsed = parseSupplyTransfers(fetched.logs, decimals, timestamps);
    const registry = normalizeSupplyAddressRegistry(project, options);
    const dormant = dormantActorMap(project, options);
    const sells = sellTxSet(project, options);
    const lineage = buildSupplyLineage(parsed, registry, dormant, sells, {
      stagingWindowBlocks: options.stagingWindowBlocks || Math.round(blocksPerHour * Math.max(1, Number(options.stagingWindowHours || 6))),
    });
    const priceUsd = finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
    const usd = Object.fromEntries([
      "confirmedSellSupplyTokens",
      "marketFacingPotentialSupplyTokens",
      "cexDirectedSupplyTokens",
      "bridgeMobilityTokens",
      "dormantWakeupTokens",
      "dormantMarketFacingTokens",
      "strategicMarketFacingTokens",
      "stagedOneHopSupplyTokens",
      "strategicStagedTokens",
      "unresolvedStagedTokens",
    ].map((key) => [key.replace(/Tokens$/, "Usd"), toUsd(lineage[key], priceUsd)]));

    const labelCount = [...registry.values()].length;
    const strategicLabels = [...registry.values()].filter((row) => row.labels.some((label) => ["TREASURY", "TEAM", "VESTING"].includes(label))).length;
    const marketSinkLabels = [...registry.values()].filter((row) => row.labels.some((label) => ["DEX_POOL", "ROUTER", "CEX"].includes(label))).length;
    const observedRelevant = lineage.relevantEvents.length;
    const labelCoveragePct = Math.min(100, (strategicLabels > 0 ? 35 : 0) + (marketSinkLabels > 0 ? 35 : 0) + (dormant.size > 0 ? 15 : 0) + (sells.size > 0 ? 15 : 0));
    const confidencePct = Math.round(Math.max(20, Math.min(92,
      25 + labelCoveragePct * 0.45 + Math.min(20, observedRelevant * 1.5) - (fetched.truncated ? 15 : 0)
    )));

    return {
      status: fetched.truncated ? "PARTIAL_SUPPLY_LINEAGE_LOOKBACK" : parsed.length ? "OBSERVED_SUPPLY_LINEAGE" : "NO_TRANSFER_ACTIVITY",
      source: "ERC20_TRANSFER_LINEAGE_AND_RESOLVED_SWAP_CONTEXT",
      observedAt: new Date().toISOString(),
      chainId: profile?.chainId || chain,
      tokenAddress,
      blockNumber: blockTag,
      lookbackHours,
      transferLogCount: fetched.logs.length,
      parsedTransferCount: parsed.length,
      logRangeTruncated: fetched.truncated,
      addressRegistrySize: labelCount,
      strategicLabelCount: strategicLabels,
      marketSinkLabelCount: marketSinkLabels,
      dormantActorCount: dormant.size,
      confirmedSellTxCount: sells.size,
      ...lineage,
      ...usd,
      confidencePct,
      labelCoveragePct,
      policy: "Only explicitly supplied or canonically known address labels are treated as treasury/team/vesting/CEX/bridge/router identities. DEX-pool/router transfers are market-facing potential supply, not automatic sales. Bridge deposits are mobility, not bearish sell pressure. One-hop staging is a risk context, not a prediction of intent.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "SUPPLY_LINEAGE",
      tokenAddress,
      error: error.message,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __supplyLineageSensorTestHooks = {
  normalizeSupplyAddressRegistry,
  parseSupplyTransfers,
  buildSupplyLineage,
  eventRole,
  dormantActorMap,
};

export default observeSupplyLineage;
