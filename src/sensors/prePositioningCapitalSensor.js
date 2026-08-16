import { jsonRpc, jsonRpcBatch } from "./rpcJsonClient.js";
import {
  ERC20_TRANSFER_TOPIC,
  SELECTORS,
  addressFromTopic,
  callData,
  decodeUint,
  encodeAddressWord,
  hexNumber,
  strip0x,
} from "./evmAbi.js";
import { keccak256Hex } from "./keccak256.js";
import { chainProfileFor, quoteUsdFor } from "./chainProfiles.js";

const ERC20_APPROVAL_TOPIC = keccak256Hex("Approval(address,address,uint256)");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function address(value = "") {
  const normalized = lower(value);
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function topicAddress(value = "") {
  const normalized = address(value);
  return normalized ? `0x${strip0x(normalized).padStart(64, "0")}` : null;
}

function uniqueAddresses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flat(Infinity)
    .map(address)
    .filter(Boolean))];
}

function envAddresses(name = "") {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function walletCandidates(project = {}, options = {}) {
  const temporal = Array.isArray(project.walletTemporalEvents)
    ? project.walletTemporalEvents.map((event) => event?.wallet || event?.address || event?.owner)
    : [];
  const graphNodes = Array.isArray(project.capitalIntentGraph?.graph?.nodes) ? project.capitalIntentGraph.graph.nodes : [];
  const explicit = [
    options.wallets,
    options.watchWallets,
    project.prePositioningWalletCandidates,
    project.prePositioningWallets,
    project.smartWalletAddresses,
    project.walletWatchlist,
    project.smartWallets,
    project.walletCluster?.wallets,
    project.chainCapitalRadarCandidate?.candidateWallets,
    temporal,
    graphNodes,
    envAddresses("IGNITION_CAPITAL_WATCHLIST"),
  ];
  const maxWallets = Math.max(1, Number(options.maxWallets || process.env.IGNITION_PREPOSITION_MAX_WALLETS || 10));
  return uniqueAddresses(explicit).slice(0, maxWallets);
}

function executionContracts(project = {}, options = {}) {
  return uniqueAddresses([
    options.executionContracts,
    options.routerAddresses,
    options.aggregatorAddresses,
    project.routerAddresses,
    project.aggregatorAddresses,
    project.executionContracts,
    project.targetSpecificExecutionContracts,
    project.targetExecutionContracts,
    project.protocolContracts,
    project.stakingContracts,
    project.vaultAddresses,
    project.migrationContracts,
    project.canonicalExecutionRoute?.routerAddress,
    project.canonicalExecutionRoute?.spenderAddress,
    project.canonicalExecutionRoute?.aggregatorAddress,
    project.purchaseRoute?.routerAddress,
    envAddresses("IGNITION_EXECUTION_CONTRACTS"),
  ]);
}

function targetProximityWallets(project = {}, options = {}) {
  return new Set(uniqueAddresses([
    options.targetProximityWallets,
    project.targetProximityWallets,
    project.prePositioningTargetWallets,
    project.chainCapitalRadarCandidate?.targetProximityWallets,
  ]));
}

function addressLabels(project = {}, options = {}) {
  const map = new Map();
  const add = (values, label) => {
    for (const item of uniqueAddresses(values)) {
      const row = map.get(item) || new Set();
      row.add(label);
      map.set(item, row);
    }
  };
  add([options.exchangeAddresses, project.exchangeAddresses, project.cexAddresses, envAddresses("IGNITION_CEX_ADDRESSES")], "CEX");
  add([options.bridgeAddresses, project.bridgeAddresses, envAddresses("IGNITION_BRIDGE_ADDRESSES")], "BRIDGE");
  add([options.executionContracts, executionContracts(project, options)], "EXECUTION_CONTRACT");
  return map;
}

function stablecoinDefinitions(profile = {}, options = {}) {
  const explicit = Array.isArray(options.stablecoins) ? options.stablecoins : [];
  if (explicit.length) {
    return explicit.flatMap((item) => {
      if (typeof item === "string") {
        const tokenAddress = address(item);
        if (!tokenAddress) return [];
        const price = quoteUsdFor(profile, tokenAddress, options);
        return [{ address: tokenAddress, priceUsd: finite(price?.priceUsd), symbol: price?.symbol || null, confidencePct: finite(price?.confidencePct) }];
      }
      const tokenAddress = address(item?.address);
      const priceUsd = finite(item?.priceUsd);
      if (!tokenAddress || priceUsd === null || priceUsd <= 0) return [];
      return [{ address: tokenAddress, priceUsd, symbol: item.symbol || null, confidencePct: finite(item.confidencePct) ?? 80 }];
    });
  }
  return Object.keys(profile?.quoteUsd || {}).flatMap((tokenAddress) => {
    const px = quoteUsdFor(profile, tokenAddress, options);
    return px?.priceUsd ? [{ address: lower(tokenAddress), priceUsd: Number(px.priceUsd), symbol: px.symbol || null, confidencePct: finite(px.confidencePct) ?? 90 }] : [];
  });
}

function previousWalletMap(history = []) {
  const latest = (Array.isArray(history) ? history : []).at(-1) || null;
  return new Map((latest?.wallets || []).flatMap((row) => {
    const key = address(row?.address);
    return key ? [[key, row]] : [];
  }));
}

function amountFromData(data = "0x", decimals = 18) {
  try {
    const raw = decodeUint(data, 0);
    const scale = 10 ** Number(decimals);
    const value = Number(raw) / scale;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function blockTimes(rpcUrl, logs = [], rpcOptions = {}) {
  const blocks = [...new Set(logs.map((row) => row.blockNumber).filter(Boolean))];
  if (!blocks.length) return new Map();
  const rows = await jsonRpcBatch(rpcUrl, blocks.map((blockNumber) => ({ method: "eth_getBlockByNumber", params: [blockNumber, false] })), rpcOptions);
  return new Map(blocks.map((blockNumber, index) => {
    const seconds = rows[index]?.result?.timestamp ? Number(BigInt(rows[index].result.timestamp)) : null;
    return [blockNumber, Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null];
  }));
}

function classifyFundingSource(from, labels) {
  const key = address(from);
  if (!key) return "UNKNOWN_SOURCE";
  const set = labels.get(key);
  if (set?.has("CEX")) return "CEX";
  if (set?.has("BRIDGE")) return "BRIDGE";
  if (set?.has("EXECUTION_CONTRACT")) return "EXECUTION_CONTRACT";
  return "UNLABELED_ADDRESS";
}

function targetBuyEvidence(project = {}, wallets = []) {
  const set = new Set(wallets);
  const events = project.ignitionRawSensors?.eventTape?.events || project.lpEventTape?.events || [];
  const byWallet = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.eventType !== "SWAP" || event?.side !== "BUY") continue;
    const actor = address(event.economicActorAddress || event.actorAddress);
    if (!actor || !set.has(actor)) continue;
    const row = byWallet.get(actor) || { buyUsd: 0, buys: 0, firstBuyAt: null };
    row.buyUsd += finite(event.usdNotional) ?? 0;
    row.buys += 1;
    row.firstBuyAt = row.firstBuyAt || event.eventTime || event.observedAt || null;
    byWallet.set(actor, row);
  }
  return byWallet;
}

function convergenceFor(walletRows = []) {
  const prepared = walletRows.filter((row) => row.executionPrepared && (finite(row.executionReadyCapitalUsd) ?? 0) > 0);
  const sourceTotals = new Map();
  for (const row of prepared) {
    for (const source of row.fundingSourceAmounts || []) {
      const key = source.address || source.type || "unknown";
      sourceTotals.set(key, (sourceTotals.get(key) || 0) + (finite(source.amountUsd) ?? 0));
    }
  }
  const total = [...sourceTotals.values()].reduce((sum, value) => sum + value, 0);
  const largest = [...sourceTotals.values()].reduce((max, value) => Math.max(max, value), 0);
  const largestShare = total > 0 ? (largest / total) * 100 : null;
  const distinctSources = sourceTotals.size;
  let state = "NO_CONVERGENCE";
  if (prepared.length >= 2) {
    state = distinctSources >= 2 && (largestShare === null || largestShare < 70)
      ? "DISTINCT_SOURCE_CAPITAL_CONVERGENCE"
      : "COMMON_SOURCE_CLUSTER";
  }
  return {
    state,
    preparedWalletCount: prepared.length,
    distinctFundingSourceCount: distinctSources,
    largestFundingSourceSharePct: largestShare,
    note: "Distinct funding addresses are not asserted to represent distinct beneficial owners.",
  };
}

export async function observePrePositioningCapital(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const wallets = walletCandidates(project, options);
  const execution = executionContracts(project, options);
  const targetWallets = targetProximityWallets(project, options);
  const labels = addressLabels(project, options);
  const stablecoins = stablecoinDefinitions(profile, options);
  const history = Array.isArray(options.history) ? options.history : [];
  const prior = previousWalletMap(history);
  const observedAt = new Date().toISOString();

  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", state: "UNOBSERVED", observedAt, source: "PRE_POSITIONING_CAPITAL_SENSOR", shadowOnly: true, rankingInfluence: false };
  if (!wallets.length) return { status: "NO_TRACKED_WALLETS", state: "UNOBSERVED", observedAt, source: "PRE_POSITIONING_CAPITAL_SENSOR", observedFreshCapitalUsd: null, executionReadyCapitalUsd: null, targetProximityCapitalUsd: null, visibleDeployedToTargetUsd: null, wallets: [], shadowOnly: true, rankingInfluence: false };
  if (!stablecoins.length) return { status: "NO_USD_STABLECOIN_CONFIGURATION", state: "UNOBSERVED", observedAt, source: "PRE_POSITIONING_CAPITAL_SENSOR", wallets: [], shadowOnly: true, rankingInfluence: false };

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 10_000, retries: options.retries ?? 1 };
  const lookbackHours = Math.max(0.05, Number(options.lookbackHours || process.env.IGNITION_PREPOSITION_LOOKBACK_HOURS || 6));
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const blockNumber = safeBlock?.number ? Number(BigInt(safeBlock.number)) : null;
    if (!Number.isFinite(blockNumber)) throw new Error("Safe block number unavailable.");
    const lookbackBlocks = Math.max(1, Math.ceil((lookbackHours * 3600) / Math.max(1, Number(profile?.blockTimeSeconds || 2))));
    const fromBlock = Math.max(0, blockNumber - lookbackBlocks);

    const decimalsRows = await jsonRpcBatch(rpcUrl, stablecoins.map((token) => ({ method: "eth_call", params: [{ to: token.address, data: SELECTORS.decimals }, safeBlock.number] })), rpcOptions);
    const tokens = stablecoins.map((token, index) => ({
      ...token,
      decimals: decimalsRows[index]?.result ? Number(decodeUint(decimalsRows[index].result, 0)) : null,
    })).filter((token) => Number.isFinite(token.decimals));
    if (!tokens.length) return { status: "STABLECOIN_METADATA_UNRESOLVED", state: "UNOBSERVED", observedAt, source: "PRE_POSITIONING_CAPITAL_SENSOR", wallets: [], shadowOnly: true, rankingInfluence: false };

    const balanceCalls = [];
    for (const wallet of wallets) {
      balanceCalls.push({ kind: "code", wallet, method: "eth_getCode", params: [wallet, safeBlock.number] });
      balanceCalls.push({ kind: "native", wallet, method: "eth_getBalance", params: [wallet, safeBlock.number] });
      for (const token of tokens) {
        balanceCalls.push({ kind: "stable", wallet, token, method: "eth_call", params: [{ to: token.address, data: callData(SELECTORS.balanceOf, [encodeAddressWord(wallet)]) }, safeBlock.number] });
      }
    }
    const balanceResponses = await jsonRpcBatch(rpcUrl, balanceCalls.map(({ method, params }) => ({ method, params })), rpcOptions);
    const current = new Map(wallets.map((wallet) => [wallet, { address: wallet, actorType: "UNKNOWN", nativeBalanceWei: null, stable: new Map() }]));
    balanceCalls.forEach((call, index) => {
      const result = balanceResponses[index]?.result;
      const row = current.get(call.wallet);
      if (!row) return;
      if (call.kind === "code") row.actorType = result === "0x" || result === "0x0" ? "EOA" : result ? "CONTRACT" : "UNKNOWN";
      if (call.kind === "native" && result) row.nativeBalanceWei = BigInt(result).toString();
      if (call.kind === "stable" && result) {
        const units = amountFromData(result, call.token.decimals);
        row.stable.set(call.token.address, { units, usd: units === null ? null : units * call.token.priceUsd, token: call.token });
      }
    });

    const logCalls = [];
    for (const wallet of wallets) {
      const walletTopic = topicAddress(wallet);
      for (const token of tokens) {
        logCalls.push({ kind: "transferIn", wallet, token, method: "eth_getLogs", params: [{ address: token.address, fromBlock: hexNumber(fromBlock), toBlock: safeBlock.number, topics: [ERC20_TRANSFER_TOPIC, null, walletTopic] }] });
        logCalls.push({ kind: "approval", wallet, token, method: "eth_getLogs", params: [{ address: token.address, fromBlock: hexNumber(fromBlock), toBlock: safeBlock.number, topics: [ERC20_APPROVAL_TOPIC, walletTopic] }] });
      }
    }
    const logResponses = await jsonRpcBatch(rpcUrl, logCalls.map(({ method, params }) => ({ method, params })), { ...rpcOptions, timeoutMs: options.logTimeoutMs || 15_000 });
    const rawLogs = [];
    logCalls.forEach((call, index) => {
      for (const log of Array.isArray(logResponses[index]?.result) ? logResponses[index].result : []) rawLogs.push({ ...log, __kind: call.kind, __wallet: call.wallet, __token: call.token });
    });
    const times = await blockTimes(rpcUrl, rawLogs, rpcOptions);
    const targetBuys = targetBuyEvidence(project, wallets);

    const walletRows = [];
    const temporalEvents = [];
    for (const wallet of wallets) {
      const cur = current.get(wallet);
      const prev = prior.get(wallet) || {};
      let currentStableUsd = 0;
      let stableResolved = 0;
      for (const token of tokens) {
        const usd = finite(cur?.stable?.get(token.address)?.usd);
        if (usd !== null) { currentStableUsd += usd; stableResolved += 1; }
      }
      const previousStableUsd = finite(prev.currentStablecoinBalanceUsd);
      const positiveDeltaUsd = previousStableUsd !== null ? Math.max(0, currentStableUsd - previousStableUsd) : null;
      const walletLogs = rawLogs.filter((log) => log.__wallet === wallet);
      const funding = [];
      const approvals = [];
      for (const log of walletLogs) {
        const token = log.__token;
        if (log.__kind === "transferIn") {
          const from = addressFromTopic(log.topics?.[1]);
          if (!from || from === ZERO_ADDRESS) continue;
          const units = amountFromData(log.data, token.decimals);
          const amountUsd = units === null ? null : units * token.priceUsd;
          if (amountUsd === null || amountUsd <= 0) continue;
          const eventTime = times.get(log.blockNumber) || null;
          const sourceType = classifyFundingSource(from, labels);
          funding.push({ address: from, type: sourceType, amountUsd, token: token.symbol || token.address, txHash: log.transactionHash || null, eventTime });
          temporalEvents.push({ type: sourceType === "BRIDGE" ? "BRIDGE_FUNDING" : sourceType === "CEX" ? "CEX_FUNDING" : "STABLECOIN_FUNDING", wallet, counterparty: from, amountUsd, token: token.symbol || token.address, txHash: log.transactionHash || null, timestamp: eventTime, source: "PRE_POSITIONING_CAPITAL_SENSOR" });
        } else if (log.__kind === "approval") {
          const spender = addressFromTopic(log.topics?.[2]);
          const units = amountFromData(log.data, token.decimals);
          const amountUsd = units === null ? null : units * token.priceUsd;
          const knownExecution = spender ? execution.includes(spender) : false;
          const eventTime = times.get(log.blockNumber) || null;
          approvals.push({ spender, knownExecution, allowanceUsd: amountUsd, token: token.symbol || token.address, txHash: log.transactionHash || null, eventTime });
          temporalEvents.push({ type: knownExecution ? "EXECUTION_APPROVAL" : "UNCLASSIFIED_APPROVAL", wallet, counterparty: spender, amountUsd, token: token.symbol || token.address, txHash: log.transactionHash || null, timestamp: eventTime, source: "PRE_POSITIONING_CAPITAL_SENSOR" });
        }
      }
      const recentStablecoinInflowUsd = funding.reduce((sum, row) => sum + (finite(row.amountUsd) ?? 0), 0);
      const freshObservedUsd = Math.max(recentStablecoinInflowUsd, positiveDeltaUsd ?? 0);
      const freshAvailableCapitalUsd = Math.min(currentStableUsd, freshObservedUsd);
      const executionPrepared = cur?.actorType === "EOA" && approvals.some((row) => row.knownExecution && (finite(row.allowanceUsd) ?? 0) > 0);
      const executionReadyCapitalUsd = executionPrepared ? freshAvailableCapitalUsd : 0;
      const targetProximity = targetWallets.has(wallet);
      const targetProximityCapitalUsd = targetProximity && executionPrepared ? executionReadyCapitalUsd : 0;
      const buy = targetBuys.get(wallet) || { buyUsd: 0, buys: 0, firstBuyAt: null };
      if (buy.buyUsd > 0) temporalEvents.push({ type: "TARGET_BUY", wallet, counterparty: address(project.poolAddress || project.pairAddress), amountUsd: buy.buyUsd, token: project.symbol || null, txHash: null, timestamp: buy.firstBuyAt, source: "IGNITION_EVENT_TAPE" });
      const previousNative = prev.nativeBalanceWei ? BigInt(prev.nativeBalanceWei) : null;
      const currentNative = cur?.nativeBalanceWei ? BigInt(cur.nativeBalanceWei) : null;
      const nativeDelta = previousNative !== null && currentNative !== null && currentNative > previousNative ? currentNative - previousNative : null;
      const sources = new Map();
      for (const row of funding) {
        const key = row.address || row.type;
        const existing = sources.get(key) || { address: row.address, type: row.type, amountUsd: 0 };
        existing.amountUsd += row.amountUsd;
        sources.set(key, existing);
      }
      const confidencePct = Math.round(clamp(
        (cur?.actorType === "EOA" ? 30 : cur?.actorType === "CONTRACT" ? 5 : 15) +
        (stableResolved === tokens.length ? 25 : 10) +
        (funding.length ? 20 : positiveDeltaUsd !== null ? 10 : 0) +
        (execution.length ? 15 : 0) +
        (executionPrepared ? 10 : 0),
        10,
        95
      ));
      walletRows.push({
        address: wallet,
        actorType: cur?.actorType || "UNKNOWN",
        currentStablecoinBalanceUsd: currentStableUsd,
        previousStablecoinBalanceUsd: previousStableUsd,
        positiveStablecoinBalanceDeltaUsd: positiveDeltaUsd,
        recentStablecoinInflowUsd,
        freshAvailableCapitalUsd,
        nativeBalanceWei: cur?.nativeBalanceWei ?? null,
        previousNativeBalanceWei: prev.nativeBalanceWei ?? null,
        nativeBalanceDeltaWei: nativeDelta !== null ? nativeDelta.toString() : null,
        executionPrepared,
        executionReadyCapitalUsd,
        targetProximity,
        targetProximityCapitalUsd,
        targetBuyUsd: buy.buyUsd || 0,
        targetBuyCount: buy.buys || 0,
        distinctFundingSources: [...sources.keys()],
        fundingSourceAmounts: [...sources.values()],
        fundingEvents: funding,
        approvalEvents: approvals,
        confidencePct,
      });
    }

    const observedFreshCapitalUsd = walletRows.reduce((sum, row) => sum + (finite(row.freshAvailableCapitalUsd) ?? 0), 0);
    const executionReadyCapitalUsd = walletRows.reduce((sum, row) => sum + (finite(row.executionReadyCapitalUsd) ?? 0), 0);
    const targetProximityCapitalUsd = walletRows.reduce((sum, row) => sum + (finite(row.targetProximityCapitalUsd) ?? 0), 0);
    const visibleDeployedToTargetUsd = walletRows.reduce((sum, row) => sum + (finite(row.targetBuyUsd) ?? 0), 0);
    const convergence = convergenceFor(walletRows);
    const targetBuyWallets = walletRows.filter((row) => row.targetBuyUsd > 0).length;
    const minCapitalUsd = Math.max(0, Number(options.minCapitalUsd || process.env.IGNITION_PREPOSITION_MIN_CAPITAL_USD || 1_000));
    let state = "NO_OBSERVED_PREPOSITIONING";
    if (observedFreshCapitalUsd >= minCapitalUsd) state = "CAPITAL_FUNDED";
    if (executionReadyCapitalUsd >= minCapitalUsd) state = "EXECUTION_PREPARED";
    if (convergence.preparedWalletCount >= 2) state = convergence.state === "DISTINCT_SOURCE_CAPITAL_CONVERGENCE" ? "CLUSTER_PREPOSITIONING" : "COMMON_SOURCE_PREPOSITIONING";
    if (targetProximityCapitalUsd >= minCapitalUsd) state = "TARGET_PROXIMITY";
    if (targetBuyWallets >= 1) state = "FIRST_BUY";
    if (targetBuyWallets >= 2) state = "CONFIRMED_FLOW";

    const confidencePct = walletRows.length
      ? Math.round(walletRows.reduce((sum, row) => sum + row.confidencePct, 0) / walletRows.length)
      : 0;
    const targetingEvidenceMode = targetProximityCapitalUsd > 0
      ? "EXPLICIT_TARGET_PROXIMITY_WALLET"
      : visibleDeployedToTargetUsd > 0
        ? "OBSERVED_TARGET_BUY"
        : "ECOSYSTEM_EXECUTION_PREPARATION_ONLY";

    return {
      status: "OBSERVED_PRE_POSITIONING",
      state,
      observedAt,
      source: "PRE_POSITIONING_CAPITAL_SENSOR",
      chain: chain || null,
      blockNumber,
      fromBlock,
      lookbackHours,
      trackedWalletCount: wallets.length,
      executionContractCount: execution.length,
      stablecoinCount: tokens.length,
      observedFreshCapitalUsd,
      executionReadyCapitalUsd,
      targetProximityCapitalUsd,
      visibleDeployedToTargetUsd,
      capitalConvergence: convergence,
      targetingEvidenceMode,
      wallets: walletRows,
      walletTemporalEvents: temporalEvents.filter((event) => event.timestamp),
      confidencePct,
      policy: "Confirmed public-chain observations only. Funding addresses and transaction initiators are not asserted beneficial owners. Execution-ready capital is fresh observed stablecoin inventory in sampled EOAs with a recent approval to an explicitly known execution contract. Target proximity is never inferred from generic router preparation.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      state: "UNOBSERVED",
      observedAt,
      source: "PRE_POSITIONING_CAPITAL_SENSOR",
      error: error.message,
      observedFreshCapitalUsd: null,
      executionReadyCapitalUsd: null,
      targetProximityCapitalUsd: null,
      visibleDeployedToTargetUsd: null,
      wallets: [],
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __prePositioningCapitalSensorTestHooks = {
  walletCandidates,
  executionContracts,
  targetProximityWallets,
  addressLabels,
  stablecoinDefinitions,
  convergenceFor,
};

export { ERC20_APPROVAL_TOPIC };
