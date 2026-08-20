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
const OBSERVED_CHAIN_STATES = new Set([
  "OBSERVED_CHAIN_CAPITAL_RADAR",
  "OBSERVED_WITH_LOG_CAP",
  "NO_QUALIFYING_FUNDING",
]);

export function chainCapitalRadarObservationAvailable(row = {}) {
  return OBSERVED_CHAIN_STATES.has(row.status);
}

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

function uniqueAddresses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flat(Infinity)
    .map(address)
    .filter(Boolean))];
}

function chainName(project = {}) {
  return lower(project.chain || project.canonicalChain || project.network || project.chainId || "");
}

export function capitalRadarProjectKey(project = {}, index = 0) {
  const chain = chainName(project) || "unknown";
  const token = address(project.tokenAddress || project.contractAddress || project.address);
  const pool = address(project.poolAddress || project.pairAddress);
  if (project.canonicalProjectId) return String(project.canonicalProjectId);
  if (token) return `${chain}:${token}`;
  if (pool) return `${chain}:pool:${pool}`;
  return `${chain}:symbol:${String(project.symbol || project.name || index).toLowerCase()}`;
}

function topicAddress(value = "") {
  const normalized = address(value);
  return normalized ? `0x${strip0x(normalized).padStart(64, "0")}` : null;
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

function envAddresses(name = "") {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stablecoinDefinitions(profile = {}, options = {}) {
  const explicit = Array.isArray(options.stablecoins) ? options.stablecoins : [];
  if (explicit.length) {
    return explicit.flatMap((item) => {
      if (typeof item === "string") {
        const tokenAddress = address(item);
        if (!tokenAddress) return [];
        const px = quoteUsdFor(profile, tokenAddress, options);
        if (!px?.priceUsd) return [];
        return [{ address: tokenAddress, priceUsd: Number(px.priceUsd), symbol: px.symbol || null, confidencePct: finite(px.confidencePct) ?? 80 }];
      }
      const tokenAddress = address(item?.address);
      const priceUsd = finite(item?.priceUsd);
      if (!tokenAddress || priceUsd === null || priceUsd <= 0) return [];
      return [{ address: tokenAddress, priceUsd, symbol: item.symbol || null, confidencePct: finite(item.confidencePct) ?? 80 }];
    });
  }
  return Object.keys(profile?.quoteUsd || {}).flatMap((tokenAddress) => {
    const px = quoteUsdFor(profile, tokenAddress, options);
    return px?.priceUsd
      ? [{ address: lower(tokenAddress), priceUsd: Number(px.priceUsd), symbol: px.symbol || null, confidencePct: finite(px.confidencePct) ?? 90 }]
      : [];
  });
}

function genericExecutionContracts(project = {}, options = {}) {
  return uniqueAddresses([
    project.routerAddresses,
    project.aggregatorAddresses,
    project.executionContracts,
    project.canonicalExecutionRoute?.routerAddress,
    project.canonicalExecutionRoute?.spenderAddress,
    project.canonicalExecutionRoute?.aggregatorAddress,
    project.purchaseRoute?.routerAddress,
    options.executionContracts,
    options.routerAddresses,
    options.aggregatorAddresses,
    envAddresses("IGNITION_EXECUTION_CONTRACTS"),
  ]);
}

function targetSpecificContracts(project = {}, options = {}) {
  return uniqueAddresses([
    project.targetSpecificExecutionContracts,
    project.targetExecutionContracts,
    project.protocolContracts,
    project.stakingContracts,
    project.vaultAddresses,
    project.migrationContracts,
    project.candidateSpecificContracts,
    options.targetSpecificContractsByProject?.[capitalRadarProjectKey(project)] || [],
  ]);
}

function priorTargetWallets(project = {}) {
  const found = [];
  const temporal = Array.isArray(project.walletTemporalEvents) ? project.walletTemporalEvents : [];
  for (const event of temporal) {
    if (!["TARGET_BUY", "TARGET_PROTOCOL_INTERACTION", "CANDIDATE_PROXIMITY"].includes(event?.type)) continue;
    found.push(event.wallet || event.address || event.owner);
  }
  const eventTape = project.ignitionRawSensors?.eventTape?.events || project.lpEventTape?.events || [];
  for (const event of Array.isArray(eventTape) ? eventTape : []) {
    if (event?.eventType !== "SWAP" || event?.side !== "BUY") continue;
    found.push(event.economicActorAddress || event.actorAddress);
  }
  found.push(project.targetProximityWallets, project.prePositioningTargetWallets);
  return uniqueAddresses(found);
}

function candidateDescriptors(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project, index) => ({
    index,
    key: capitalRadarProjectKey(project, index),
    chain: chainName(project),
    symbol: project.symbol || null,
    name: project.name || null,
    tokenAddress: address(project.tokenAddress || project.contractAddress || project.address),
    poolAddress: address(project.poolAddress || project.pairAddress),
    genericExecutionContracts: genericExecutionContracts(project, options),
    targetSpecificContracts: targetSpecificContracts(project, options),
    priorTargetWallets: priorTargetWallets(project),
  }));
}

function executionRegistry(descriptors = []) {
  const generic = new Map();
  const targetSpecific = new Map();
  const add = (map, contract, descriptor) => {
    const key = address(contract);
    if (!key) return;
    const rows = map.get(key) || [];
    if (!rows.some((row) => row.key === descriptor.key)) rows.push(descriptor);
    map.set(key, rows);
  };
  for (const descriptor of descriptors) {
    for (const contract of descriptor.genericExecutionContracts) add(generic, contract, descriptor);
    for (const contract of descriptor.targetSpecificContracts) add(targetSpecific, contract, descriptor);
  }
  return { generic, targetSpecific };
}

function priorWalletSet(history = []) {
  const set = new Set();
  for (const observation of Array.isArray(history) ? history : []) {
    for (const row of observation?.wallets || []) {
      const key = address(row?.address);
      if (key) set.add(key);
    }
  }
  return set;
}

function blockValue(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = typeof value === "string" && value.startsWith("0x")
      ? Number(BigInt(value))
      : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function continuityRange(blockNumber, profile = {}, history = [], options = {}) {
  const lookbackMinutes = Math.max(
    1,
    Number(options.lookbackMinutes || process.env.IGNITION_CAPITAL_RADAR_LOOKBACK_MINUTES || 20)
  );
  const theoreticalBlocks = Math.ceil(
    (lookbackMinutes * 60) / Math.max(1, Number(profile.blockTimeSeconds || 2))
  );
  const maxLookbackBlocks = Math.max(
    10,
    Number(options.maxLookbackBlocks || process.env.IGNITION_CAPITAL_RADAR_MAX_LOOKBACK_BLOCKS || 600)
  );
  const nominalLookbackBlocks = Math.min(theoreticalBlocks, maxLookbackBlocks);
  const nominalFromBlock = Math.max(0, blockNumber - nominalLookbackBlocks);
  const continuityMaxLookbackBlocks = Math.max(
    maxLookbackBlocks,
    Number(
      options.continuityMaxLookbackBlocks ||
      process.env.IGNITION_CAPITAL_RADAR_CONTINUITY_MAX_LOOKBACK_BLOCKS ||
      12_000
    )
  );
  const latestCoveredBlock = (Array.isArray(history) ? history : [])
    .filter((row) => chainCapitalRadarObservationAvailable(row))
    .map((row) => blockValue(row.coveredThroughBlock ?? row.blockNumber))
    .filter((value) => value !== null && value <= blockNumber)
    .sort((left, right) => right - left)[0] ?? null;

  if (latestCoveredBlock === null) {
    return {
      fromBlock: nominalFromBlock,
      lookbackBlocks: blockNumber - nominalFromBlock,
      lookbackMinutes,
      latestCoveredBlock: null,
      continuityGapBlocks: 0,
      continuityStatus: "INITIAL_WINDOW",
    };
  }

  const desiredFromBlock = latestCoveredBlock + 1;
  if (desiredFromBlock > blockNumber) {
    return {
      fromBlock: blockNumber,
      lookbackBlocks: 0,
      lookbackMinutes,
      latestCoveredBlock,
      continuityGapBlocks: 0,
      continuityStatus: "HEAD_NOT_ADVANCED",
    };
  }

  const continuityFloor = Math.max(0, blockNumber - continuityMaxLookbackBlocks);
  const fromBlock = Math.max(desiredFromBlock, continuityFloor);
  return {
    fromBlock,
    lookbackBlocks: blockNumber - fromBlock,
    lookbackMinutes,
    latestCoveredBlock,
    continuityGapBlocks: Math.max(0, fromBlock - desiredFromBlock),
    continuityStatus: fromBlock === desiredFromBlock
      ? "CONTIGUOUS_FROM_HISTORY"
      : "BOUNDED_GAP_BACKFILL",
  };
}

function eventKey(row = {}) {
  return [
    row.txHash || row.transactionHash || "",
    row.logIndex ?? "",
    row.tokenAddress || "",
    row.from || row.owner || "",
    row.to || row.spender || "",
  ].join("|");
}

function mergeEvents(...groups) {
  const rows = new Map();
  for (const row of groups.flat().filter(Boolean)) {
    const key = eventKey(row);
    if (key !== "||||") rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => {
    const leftBlock = blockValue(left.blockNumber) ?? 0;
    const rightBlock = blockValue(right.blockNumber) ?? 0;
    if (leftBlock !== rightBlock) return leftBlock - rightBlock;
    return (blockValue(left.logIndex) ?? 0) - (blockValue(right.logIndex) ?? 0);
  });
}

function trackedWalletRows(history = [], options = {}) {
  const nowMs = Date.parse(options.observedAt || new Date().toISOString());
  const maxAgeMs = Math.max(
    1,
    Number(options.trackedWalletHours || process.env.IGNITION_CAPITAL_RADAR_TRACKED_WALLET_HOURS || 72)
  ) * 3_600_000;
  const latest = new Map();
  for (const observation of Array.isArray(history) ? history : []) {
    const observedMs = Date.parse(observation?.observedAt || "");
    if (!Number.isFinite(observedMs) || (Number.isFinite(nowMs) && nowMs - observedMs > maxAgeMs)) continue;
    for (const wallet of observation?.wallets || []) {
      const walletAddress = address(wallet?.address);
      if (!walletAddress) continue;
      const activeCapital = Math.max(
        finite(wallet.currentStablecoinBalanceUsd) ?? 0,
        finite(wallet.freshAvailableCapitalUsd) ?? 0,
        finite(wallet.executionReadyCapitalUsd) ?? 0
      );
      if (activeCapital <= 0) continue;
      const prior = latest.get(walletAddress);
      if (!prior || observedMs >= prior.observedMs) {
        latest.set(walletAddress, { ...wallet, address: walletAddress, observedMs });
      }
    }
  }
  return [...latest.values()]
    .sort((left, right) =>
      Math.max(finite(right.executionReadyCapitalUsd) ?? 0, finite(right.freshAvailableCapitalUsd) ?? 0) -
      Math.max(finite(left.executionReadyCapitalUsd) ?? 0, finite(left.freshAvailableCapitalUsd) ?? 0)
    )
    .slice(0, Math.max(1, Number(options.maxTrackedWallets || process.env.IGNITION_CAPITAL_RADAR_MAX_TRACKED_WALLETS || 160)));
}

async function metadataForStablecoins(rpcUrl, safeBlockNumber, stablecoins, rpcOptions) {
  const rows = await jsonRpcBatch(
    rpcUrl,
    stablecoins.map((token) => ({ method: "eth_call", params: [{ to: token.address, data: SELECTORS.decimals }, safeBlockNumber] })),
    rpcOptions
  );
  return stablecoins.map((token, index) => ({
    ...token,
    decimals: rows[index]?.result ? Number(decodeUint(rows[index].result, 0)) : null,
  })).filter((token) => Number.isFinite(token.decimals) && token.decimals >= 0 && token.decimals <= 36);
}

function blockChunks(fromBlock, toBlock, chunkSize) {
  const rows = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    rows.push([start, Math.min(toBlock, start + chunkSize - 1)]);
  }
  return rows;
}

async function globalTokenLogs(rpcUrl, tokens, fromBlock, toBlock, options = {}) {
  const chunkSize = Math.max(1, Number(options.logChunkBlocks || process.env.IGNITION_CAPITAL_RADAR_LOG_CHUNK_BLOCKS || 120));
  const chunks = blockChunks(fromBlock, toBlock, chunkSize);
  const calls = [];
  for (const token of tokens) {
    for (const [start, end] of chunks) {
      calls.push({ kind: "TRANSFER", token, method: "eth_getLogs", params: [{ address: token.address, fromBlock: hexNumber(start), toBlock: hexNumber(end), topics: [ERC20_TRANSFER_TOPIC] }] });
      calls.push({ kind: "APPROVAL", token, method: "eth_getLogs", params: [{ address: token.address, fromBlock: hexNumber(start), toBlock: hexNumber(end), topics: [ERC20_APPROVAL_TOPIC] }] });
    }
  }
  const responses = await jsonRpcBatch(
    rpcUrl,
    calls.map(({ method, params }) => ({ method, params })),
    { timeoutMs: options.logTimeoutMs || 20_000, retries: options.retries ?? 1 }
  );
  const rows = [];
  calls.forEach((call, index) => {
    for (const log of Array.isArray(responses[index]?.result) ? responses[index].result : []) {
      rows.push({ ...log, __kind: call.kind, __token: call.token });
    }
  });
  rows.sort((a, b) => {
    const blockA = a.blockNumber ? Number(BigInt(a.blockNumber)) : 0;
    const blockB = b.blockNumber ? Number(BigInt(b.blockNumber)) : 0;
    if (blockA !== blockB) return blockA - blockB;
    const logA = a.logIndex ? Number(BigInt(a.logIndex)) : 0;
    const logB = b.logIndex ? Number(BigInt(b.logIndex)) : 0;
    return logA - logB;
  });
  const maxLogs = Math.max(100, Number(options.maxLogs || process.env.IGNITION_CAPITAL_RADAR_MAX_LOGS || 50_000));
  const capped = rows.length > maxLogs;
  return {
    rows: capped ? rows.slice(-maxLogs) : rows,
    returnedLogs: Math.min(rows.length, maxLogs),
    rawLogCount: rows.length,
    capped,
    chunkCount: chunks.length,
  };
}

async function blockTimes(rpcUrl, logs = [], rpcOptions = {}) {
  const blocks = [...new Set((Array.isArray(logs) ? logs : []).map((row) => row.blockNumber).filter(Boolean))];
  if (!blocks.length) return new Map();
  const maxBlocks = 500;
  const selected = blocks.slice(-maxBlocks);
  const rows = await jsonRpcBatch(rpcUrl, selected.map((blockNumber) => ({ method: "eth_getBlockByNumber", params: [blockNumber, false] })), rpcOptions);
  return new Map(selected.map((blockNumber, index) => {
    const seconds = rows[index]?.result?.timestamp ? Number(BigInt(rows[index].result.timestamp)) : null;
    return [blockNumber, Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null];
  }));
}

function fundingRows(logs = [], minTransferUsd = 5_000) {
  const transfers = [];
  for (const log of logs) {
    if (log.__kind !== "TRANSFER") continue;
    const from = addressFromTopic(log.topics?.[1]);
    const to = addressFromTopic(log.topics?.[2]);
    if (!from || !to || from === ZERO_ADDRESS || to === ZERO_ADDRESS || from === to) continue;
    const units = amountFromData(log.data, log.__token.decimals);
    const amountUsd = units === null ? null : units * log.__token.priceUsd;
    if (amountUsd === null || amountUsd < minTransferUsd) continue;
    transfers.push({
      from,
      to,
      amountUsd,
      tokenAddress: log.__token.address,
      tokenSymbol: log.__token.symbol || null,
      txHash: log.transactionHash || null,
      blockNumber: log.blockNumber || null,
      logIndex: log.logIndex || null,
    });
  }
  return transfers;
}

function approvalRows(logs = [], fundedWallets = new Set(), registry = { generic: new Map(), targetSpecific: new Map() }) {
  const approvals = [];
  for (const log of logs) {
    if (log.__kind !== "APPROVAL") continue;
    const owner = addressFromTopic(log.topics?.[1]);
    const spender = addressFromTopic(log.topics?.[2]);
    if (!owner || !spender || !fundedWallets.has(owner)) continue;
    const genericCandidates = registry.generic.get(spender) || [];
    const targetCandidates = registry.targetSpecific.get(spender) || [];
    if (!genericCandidates.length && !targetCandidates.length) continue;
    const units = amountFromData(log.data, log.__token.decimals);
    const allowanceUsd = units === null ? null : units * log.__token.priceUsd;
    approvals.push({
      owner,
      spender,
      allowanceUsd,
      tokenAddress: log.__token.address,
      tokenSymbol: log.__token.symbol || null,
      genericCandidateKeys: genericCandidates.map((row) => row.key),
      targetCandidateKeys: targetCandidates.map((row) => row.key),
      txHash: log.transactionHash || null,
      blockNumber: log.blockNumber || null,
      logIndex: log.logIndex || null,
    });
  }
  return approvals;
}

function candidateEvidenceForWallet(wallet, approvals, descriptors) {
  const evidence = new Map();
  const descriptorByKey = new Map(descriptors.map((row) => [row.key, row]));
  const add = (key, score, type, details = {}) => {
    if (!descriptorByKey.has(key)) return;
    const row = evidence.get(key) || { score: 0, evidence: [] };
    row.score = Math.max(row.score, score);
    row.evidence.push({ type, score, ...details });
    evidence.set(key, row);
  };

  for (const descriptor of descriptors) {
    if (descriptor.priorTargetWallets.includes(wallet)) add(descriptor.key, 55, "PRIOR_TARGET_ACTIVITY");
  }
  for (const approval of approvals.filter((row) => row.owner === wallet)) {
    for (const key of approval.targetCandidateKeys || []) {
      const unique = approval.targetCandidateKeys.length === 1;
      add(key, unique ? 82 : 65, unique ? "UNIQUE_TARGET_SPECIFIC_APPROVAL" : "AMBIGUOUS_TARGET_SPECIFIC_APPROVAL", { spender: approval.spender });
    }
    // Generic routers are recorded as ecosystem execution preparation only; they never identify a token target.
  }
  return [...evidence.entries()].map(([key, row]) => ({ key, ...row })).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function assignDestination(wallet, approvals, descriptors) {
  const ranked = candidateEvidenceForWallet(wallet, approvals, descriptors);
  if (!ranked.length) return { state: "CHAIN_LEVEL_ONLY", assignedProjectKey: null, confidencePct: 0, matches: [] };
  const top = ranked[0];
  const second = ranked[1] || null;
  const margin = second ? top.score - second.score : top.score;
  if (top.score >= 70 && (!second || margin >= 15)) {
    return { state: "CANDIDATE_PROXIMITY", assignedProjectKey: top.key, confidencePct: top.score, matches: ranked.slice(0, 5) };
  }
  if (top.score >= 50 && !second) {
    return { state: "CANDIDATE_PROXIMITY_WEAK", assignedProjectKey: top.key, confidencePct: top.score, matches: ranked.slice(0, 5) };
  }
  return { state: "AMBIGUOUS_DESTINATION", assignedProjectKey: null, confidencePct: Math.min(49, top.score), matches: ranked.slice(0, 5) };
}

function convergenceFor(wallets = []) {
  const sourceTotals = new Map();
  for (const row of wallets) {
    for (const source of row.fundingSources || []) {
      const key = source.address || "unknown";
      sourceTotals.set(key, (sourceTotals.get(key) || 0) + (finite(source.amountUsd) ?? 0));
    }
  }
  const total = [...sourceTotals.values()].reduce((sum, value) => sum + value, 0);
  const largest = [...sourceTotals.values()].reduce((max, value) => Math.max(max, value), 0);
  const largestSharePct = total > 0 ? (largest / total) * 100 : null;
  const distinctSources = sourceTotals.size;
  let state = "NO_CONVERGENCE";
  if (wallets.length >= 2) {
    state = distinctSources >= 2 && (largestSharePct === null || largestSharePct < 70)
      ? "INDEPENDENT_CAPITAL_CONVERGENCE"
      : "COMMON_SOURCE_CLUSTER";
  }
  return {
    state,
    walletCount: wallets.length,
    distinctFundingSourceCount: distinctSources,
    largestFundingSourceSharePct: largestSharePct,
    note: "Distinct funding addresses are not asserted to represent distinct beneficial owners.",
  };
}

function candidateSummaries(walletRows, descriptors) {
  const byKey = new Map(descriptors.map((descriptor) => [descriptor.key, {
    projectKey: descriptor.key,
    projectIndex: descriptor.index,
    symbol: descriptor.symbol,
    name: descriptor.name,
    tokenAddress: descriptor.tokenAddress,
    poolAddress: descriptor.poolAddress,
    candidateWallets: [],
    targetProximityWallets: [],
    executionReadyCapitalUsd: 0,
    candidateAdjustedRadarCapitalUsd: 0,
    newlyDiscoveredWalletCount: 0,
  }]));

  for (const wallet of walletRows) {
    if (!wallet.destination?.assignedProjectKey) continue;
    const row = byKey.get(wallet.destination.assignedProjectKey);
    if (!row) continue;
    row.candidateWallets.push(wallet.address);
    if ((wallet.destination.confidencePct ?? 0) >= 70) row.targetProximityWallets.push(wallet.address);
    const ready = finite(wallet.executionReadyCapitalUsd) ?? 0;
    row.executionReadyCapitalUsd += ready;
    row.candidateAdjustedRadarCapitalUsd += ready * ((wallet.destination.confidencePct ?? 0) / 100);
    if (wallet.newlyDiscovered) row.newlyDiscoveredWalletCount += 1;
  }

  return [...byKey.values()].map((row) => {
    const matchedWallets = walletRows.filter((wallet) => wallet.destination?.assignedProjectKey === row.projectKey);
    const convergence = convergenceFor(matchedWallets);
    let state = "NO_DESTINATION_SIGNAL";
    if (row.candidateWallets.length) state = "CANDIDATE_PROXIMITY";
    if (convergence.state === "INDEPENDENT_CAPITAL_CONVERGENCE" && row.candidateWallets.length >= 2) state = "CANDIDATE_CAPITAL_CONVERGENCE";
    return {
      ...row,
      candidateWallets: [...new Set(row.candidateWallets)],
      targetProximityWallets: [...new Set(row.targetProximityWallets)],
      executionReadyCapitalUsd: Number(row.executionReadyCapitalUsd.toFixed(2)),
      candidateAdjustedRadarCapitalUsd: Number(row.candidateAdjustedRadarCapitalUsd.toFixed(2)),
      convergence,
      state,
      confidencePct: matchedWallets.length
        ? Math.round(matchedWallets.reduce((sum, wallet) => sum + (wallet.destination?.confidencePct || 0), 0) / matchedWallets.length)
        : null,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }).filter((row) => row.candidateWallets.length > 0);
}

export async function observeChainWideCapitalRadar(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const observedAt = options.observedAt || new Date().toISOString();
  const descriptors = candidateDescriptors(safeProjects, options);
  const groups = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor.chain) continue;
    const rows = groups.get(descriptor.chain) || [];
    rows.push(descriptor);
    groups.set(descriptor.chain, rows);
  }
  const observations = [];
  for (const [chain, chainDescriptors] of groups.entries()) {
    const profile = options.chainProfiles?.[chain] || chainProfileFor(chain);
    const rpcUrl = options.rpcUrls?.[chain] || options.rpcUrl || profile?.rpcUrl;
    if (!rpcUrl || !profile) {
      observations.push({ status: "UNSUPPORTED_CHAIN", chain, observedAt, wallets: [], candidateSummaries: [], shadowOnly: true, rankingInfluence: false });
      continue;
    }

    try {
      const rpcOptions = { timeoutMs: options.timeoutMs || 10_000, retries: options.retries ?? 1 };
      const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile.safeBlockTag || "safe", false], rpcOptions);
      const blockNumber = safeBlock?.number ? Number(BigInt(safeBlock.number)) : null;
      if (!Number.isFinite(blockNumber)) throw new Error("Safe block number unavailable.");
      const history = options.historyByChain?.[chain] || options.history || [];
      const range = continuityRange(blockNumber, profile, history, options);
      const { fromBlock, lookbackBlocks, lookbackMinutes } = range;
      const stablecoins = stablecoinDefinitions(profile, options);
      const tokens = await metadataForStablecoins(rpcUrl, safeBlock.number, stablecoins, rpcOptions);
      if (!tokens.length) {
        observations.push({ status: "STABLECOIN_METADATA_UNRESOLVED", chain, observedAt, blockNumber, fromBlock, wallets: [], candidateSummaries: [], shadowOnly: true, rankingInfluence: false });
        continue;
      }

      const registry = executionRegistry(chainDescriptors);
      const logs = await globalTokenLogs(rpcUrl, tokens, fromBlock, blockNumber, options);
      const minTransferUsd = Math.max(1, Number(options.minTransferUsd || process.env.IGNITION_CAPITAL_RADAR_MIN_TRANSFER_USD || 5_000));
      const transfers = fundingRows(logs.rows, minTransferUsd);
      const fundingByWallet = new Map();
      for (const transfer of transfers) {
        const existing = fundingByWallet.get(transfer.to) || [];
        existing.push(transfer);
        fundingByWallet.set(transfer.to, existing);
      }
      const maxWallets = Math.max(1, Number(options.maxWallets || process.env.IGNITION_CAPITAL_RADAR_MAX_WALLETS || 80));
      const carriedWallets = trackedWalletRows(history, { ...options, observedAt });
      const carriedByAddress = new Map(carriedWallets.map((row) => [row.address, row]));
      const walletAddresses = new Set([...fundingByWallet.keys(), ...carriedByAddress.keys()]);
      const walletsByInflow = [...walletAddresses]
        .map((wallet) => {
          const prior = carriedByAddress.get(wallet) || null;
          const rows = mergeEvents(prior?.fundingEvents || [], fundingByWallet.get(wallet) || []);
          return {
            wallet,
            prior,
            rows,
            totalUsd: rows.reduce((sum, row) => sum + (finite(row.amountUsd) ?? 0), 0),
          };
        })
        .sort((a, b) => b.totalUsd - a.totalUsd)
        .slice(0, maxWallets);
      const fundedSet = new Set(walletsByInflow.map((row) => row.wallet));
      const currentApprovals = approvalRows(logs.rows, fundedSet, registry);
      const times = await blockTimes(rpcUrl, [...transfers, ...currentApprovals], rpcOptions);

      const balanceCalls = [];
      for (const { wallet, prior } of walletsByInflow) {
        balanceCalls.push({ kind: "code", wallet, method: "eth_getCode", params: [wallet, safeBlock.number] });
        balanceCalls.push({ kind: "native", wallet, method: "eth_getBalance", params: [wallet, safeBlock.number] });
        for (const token of tokens) {
          balanceCalls.push({ kind: "stable", wallet, token, method: "eth_call", params: [{ to: token.address, data: callData(SELECTORS.balanceOf, [encodeAddressWord(wallet)]) }, safeBlock.number] });
        }
        const candidateApprovals = mergeEvents(
          prior?.approvalEvents || [],
          currentApprovals.filter((row) => row.owner === wallet)
        );
        for (const approval of candidateApprovals) {
          const token = tokens.find((row) => row.address === approval.tokenAddress);
          if (!token || !address(approval.spender)) continue;
          balanceCalls.push({
            kind: "allowance",
            wallet,
            token,
            approval,
            method: "eth_call",
            params: [{
              to: token.address,
              data: callData(SELECTORS.allowance, [encodeAddressWord(wallet), encodeAddressWord(approval.spender)]),
            }, safeBlock.number],
          });
        }
      }
      const balanceRows = await jsonRpcBatch(rpcUrl, balanceCalls.map(({ method, params }) => ({ method, params })), rpcOptions);
      const current = new Map(walletsByInflow.map(({ wallet }) => [wallet, {
        actorType: "UNKNOWN",
        nativeBalanceWei: null,
        stableBalances: new Map(),
        allowances: new Map(),
      }]));
      balanceCalls.forEach((call, index) => {
        const result = balanceRows[index]?.result;
        const row = current.get(call.wallet);
        if (!row) return;
        if (call.kind === "code") row.actorType = result === "0x" || result === "0x0" ? "EOA" : result ? "CONTRACT" : "UNKNOWN";
        if (call.kind === "native" && result) row.nativeBalanceWei = BigInt(result).toString();
        if (call.kind === "stable" && result) {
          const units = amountFromData(result, call.token.decimals);
          row.stableBalances.set(call.token.address, units === null ? null : units * call.token.priceUsd);
        }
        if (call.kind === "allowance" && result) {
          const units = amountFromData(result, call.token.decimals);
          const key = eventKey(call.approval);
          row.allowances.set(key, units === null ? null : units * call.token.priceUsd);
        }
      });

      const priorSeen = priorWalletSet(options.historyByChain?.[chain] || options.history || []);
      const walletRows = [];
      let contractRecipientCount = 0;
      let zeroBalanceWalletCount = 0;
      let gasNotReadyWalletCount = 0;
      let noActiveApprovalWalletCount = 0;
      for (const funded of walletsByInflow) {
        const cur = current.get(funded.wallet);
        if (cur?.actorType !== "EOA") {
          contractRecipientCount += 1;
          continue;
        }
        const priorApprovals = funded.prior?.approvalEvents || [];
        const walletApprovals = mergeEvents(
          priorApprovals,
          currentApprovals.filter((row) => row.owner === funded.wallet)
        ).flatMap((approval) => {
          const activeAllowanceUsd = cur.allowances.get(eventKey(approval));
          if (!(finite(activeAllowanceUsd) > 0)) return [];
          return [{ ...approval, allowanceUsd: Number(activeAllowanceUsd.toFixed(2)), allowanceVerifiedAtBlock: blockNumber }];
        });
        const currentStablecoinBalanceUsd = [...(cur?.stableBalances?.values() || [])].reduce((sum, value) => sum + (finite(value) ?? 0), 0);
        const freshAvailableCapitalUsd = Math.min(funded.totalUsd, currentStablecoinBalanceUsd);
        const nativeGasReady = cur?.nativeBalanceWei ? BigInt(cur.nativeBalanceWei) > 0n : false;
        const executionPrepared = nativeGasReady && walletApprovals.length > 0;
        const executionReadyCapitalUsd = executionPrepared ? freshAvailableCapitalUsd : 0;
        if (freshAvailableCapitalUsd <= 0) zeroBalanceWalletCount += 1;
        if (!nativeGasReady) gasNotReadyWalletCount += 1;
        if (!walletApprovals.length) noActiveApprovalWalletCount += 1;
        const destination = assignDestination(funded.wallet, walletApprovals, chainDescriptors);
        const sourceMap = new Map();
        for (const source of funded.rows) {
          const row = sourceMap.get(source.from) || { address: source.from, amountUsd: 0, transfers: 0 };
          row.amountUsd += source.amountUsd;
          row.transfers += 1;
          sourceMap.set(source.from, row);
        }
        const fundingEvents = funded.rows.map((row) => ({ ...row, eventTime: row.eventTime || times.get(row.blockNumber) || null }));
        const approvalEvents = walletApprovals.map((row) => ({ ...row, eventTime: row.eventTime || times.get(row.blockNumber) || null }));
        const confidencePct = Math.round(clamp(
          25 +
          (nativeGasReady ? 15 : 0) +
          (currentStablecoinBalanceUsd > 0 ? 20 : 0) +
          (walletApprovals.length ? 20 : 0) +
          (destination.confidencePct >= 70 ? 15 : destination.confidencePct >= 50 ? 8 : 0) -
          (logs.capped ? 10 : 0),
          10,
          95
        ));
        walletRows.push({
          address: funded.wallet,
          actorType: cur?.actorType || "UNKNOWN",
          newlyDiscovered: !priorSeen.has(funded.wallet),
          carriedForward: Boolean(funded.prior),
          observedStablecoinInflowUsd: Number(funded.totalUsd.toFixed(2)),
          currentStablecoinBalanceUsd: Number(currentStablecoinBalanceUsd.toFixed(2)),
          freshAvailableCapitalUsd: Number(freshAvailableCapitalUsd.toFixed(2)),
          nativeBalanceWei: cur?.nativeBalanceWei ?? null,
          nativeGasReady,
          executionPrepared,
          executionReadyCapitalUsd: Number(executionReadyCapitalUsd.toFixed(2)),
          fundingSources: [...sourceMap.values()].map((row) => ({ ...row, amountUsd: Number(row.amountUsd.toFixed(2)) })),
          fundingEvents,
          approvalEvents,
          destination,
          confidencePct,
        });
      }

      const preparedWallets = walletRows.filter((row) => row.executionPrepared && row.executionReadyCapitalUsd > 0);
      const chainConvergence = convergenceFor(preparedWallets);
      const summaries = candidateSummaries(walletRows, chainDescriptors);
      const totalFreshCapitalUsd = walletRows.reduce((sum, row) => sum + row.freshAvailableCapitalUsd, 0);
      const executionReadyCapitalUsd = preparedWallets.reduce((sum, row) => sum + row.executionReadyCapitalUsd, 0);
      const assignedExecutionReadyCapitalUsd = summaries.reduce((sum, row) => sum + row.executionReadyCapitalUsd, 0);
      const unassignedExecutionReadyCapitalUsd = Math.max(0, executionReadyCapitalUsd - assignedExecutionReadyCapitalUsd);
      const status = walletRows.length
        ? logs.capped ? "OBSERVED_WITH_LOG_CAP" : "OBSERVED_CHAIN_CAPITAL_RADAR"
        : "NO_QUALIFYING_FUNDING";

      observations.push({
        status,
        chain,
        chainId: profile.chainId ?? null,
        observedAt,
        source: "CHAIN_WIDE_CAPITAL_RADAR_SENSOR",
        blockNumber,
        fromBlock,
        coveredThroughBlock: blockNumber,
        lookbackMinutes,
        lookbackBlocks,
        coveredMinutesEstimate: Number(((lookbackBlocks * Number(profile.blockTimeSeconds || 2)) / 60).toFixed(2)),
        continuityStatus: logs.capped ? "LOG_CAP_PARTIAL" : range.continuityStatus,
        latestCoveredBlock: range.latestCoveredBlock,
        continuityGapBlocks: range.continuityGapBlocks,
        coverageComplete: !logs.capped && range.continuityGapBlocks === 0,
        stablecoinCount: tokens.length,
        minTransferUsd,
        rawLogCount: logs.rawLogCount,
        returnedLogs: logs.returnedLogs,
        logCapReached: logs.capped,
        qualifyingTransferCount: transfers.length,
        fundedRecipientCount: fundingByWallet.size,
        carriedWalletCount: carriedWallets.length,
        candidateWalletCount: walletsByInflow.length,
        contractRecipientCount,
        zeroBalanceWalletCount,
        gasNotReadyWalletCount,
        noActiveApprovalWalletCount,
        discoveredWalletCount: walletRows.length,
        newlyDiscoveredWalletCount: walletRows.filter((row) => row.newlyDiscovered).length,
        preparedWalletCount: preparedWallets.length,
        totalFreshCapitalUsd: Number(totalFreshCapitalUsd.toFixed(2)),
        executionReadyCapitalUsd: Number(executionReadyCapitalUsd.toFixed(2)),
        assignedExecutionReadyCapitalUsd: Number(assignedExecutionReadyCapitalUsd.toFixed(2)),
        unassignedExecutionReadyCapitalUsd: Number(unassignedExecutionReadyCapitalUsd.toFixed(2)),
        capitalConvergence: chainConvergence,
        candidateSummaries: summaries,
        wallets: walletRows,
        confidencePct: walletRows.length
          ? Math.round(walletRows.reduce((sum, row) => sum + row.confidencePct, 0) / walletRows.length)
          : null,
        policy: "Confirmed finalized/safe public-chain observations only. The radar discovers fresh stablecoin recipients before choosing a token target. Generic router approvals establish execution readiness only; they never identify a destination. Candidate assignment requires explicit target-specific contract evidence or prior target activity. Distinct funding addresses are not asserted to be distinct beneficial owners. Pending transactions are never used.",
        shadowOnly: true,
        rankingInfluence: false,
      });
    } catch (error) {
      observations.push({
        status: "SENSOR_FAILED",
        chain,
        observedAt,
        source: "CHAIN_WIDE_CAPITAL_RADAR_SENSOR",
        error: error.message,
        wallets: [],
        candidateSummaries: [],
        shadowOnly: true,
        rankingInfluence: false,
      });
    }
  }

  return {
    status: observations.some(chainCapitalRadarObservationAvailable)
      ? "OBSERVED"
      : observations.length
        ? "NO_OBSERVED_CHAIN"
        : "NO_SUPPORTED_CHAINS",
    observedAt,
    source: "CHAIN_WIDE_CAPITAL_RADAR_SENSOR",
    chains: observations,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export function capitalRadarCandidateMatch(radar = {}, project = {}, index = 0) {
  const key = capitalRadarProjectKey(project, index);
  for (const chain of radar?.chains || []) {
    const match = (chain.candidateSummaries || []).find((row) => row.projectKey === key);
    if (match) return { ...match, chain: chain.chain, chainRadarStatus: chain.status, chainObservedAt: chain.observedAt };
  }
  return null;
}

export const __chainWideCapitalRadarTestHooks = {
  stablecoinDefinitions,
  genericExecutionContracts,
  targetSpecificContracts,
  priorTargetWallets,
  candidateDescriptors,
  executionRegistry,
  fundingRows,
  approvalRows,
  candidateEvidenceForWallet,
  assignDestination,
  convergenceFor,
  candidateSummaries,
  continuityRange,
  trackedWalletRows,
  mergeEvents,
};

export { ERC20_APPROVAL_TOPIC };
