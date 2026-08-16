import { jsonRpc } from "./rpcJsonClient.js";
import {
  ERC20_TRANSFER_TOPIC,
  SELECTORS,
  addressFromTopic,
  callData,
  decodeUint,
  encodeAddressWord,
  hexNumber,
} from "./evmAbi.js";
import { chainProfileFor } from "./chainProfiles.js";

const ZERO = "0x0000000000000000000000000000000000000000";

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTokenAmount(raw, decimals) {
  const scale = 10 ** decimals;
  return Number(raw) / scale;
}

async function ethCall(rpcUrl, to, data, blockTag, options = {}) {
  return jsonRpc(rpcUrl, "eth_call", [{ to, data }, blockTag], options);
}

async function getTransferLogs(rpcUrl, tokenAddress, fromBlock, toBlock, options = {}) {
  const chunkSize = Math.max(100, Math.min(1900, Number(options.logChunkSize || 1800)));
  const maxChunks = Math.max(1, Math.min(80, Number(options.maxLogChunks || 24)));
  const chunks = [];
  for (let start = fromBlock; start <= toBlock && chunks.length < maxChunks; start += chunkSize) {
    chunks.push([start, Math.min(toBlock, start + chunkSize - 1)]);
  }
  const logs = [];
  for (const [start, end] of chunks) {
    const result = await jsonRpc(rpcUrl, "eth_getLogs", [{
      fromBlock: hexNumber(start),
      toBlock: hexNumber(end),
      address: tokenAddress,
      topics: [ERC20_TRANSFER_TOPIC],
    }], options);
    if (Array.isArray(result)) logs.push(...result.filter((item) => item?.removed !== true));
  }
  return { logs, chunks, truncated: chunks.length >= maxChunks && chunks.at(-1)?.[1] < toBlock };
}

function buildLedger(logs = [], decimals = 18, excluded = new Set()) {
  const ledger = new Map();
  let directPoolInTokens = 0;
  let directPoolOutTokens = 0;

  function row(address) {
    if (!ledger.has(address)) {
      ledger.set(address, {
        address,
        inboundTokens: 0,
        outboundTokens: 0,
        firstInboundBlock: null,
        lastInboundBlock: null,
        firstOutboundBlock: null,
        lastOutboundBlock: null,
      });
    }
    return ledger.get(address);
  }

  for (const log of logs) {
    const from = addressFromTopic(log.topics?.[1]);
    const to = addressFromTopic(log.topics?.[2]);
    if (!from || !to) continue;
    const amountTokens = toTokenAmount(decodeUint(log.data || "0x", 0), decimals);
    if (!Number.isFinite(amountTokens) || amountTokens <= 0) continue;
    const block = Number(BigInt(log.blockNumber || "0x0"));

    if (excluded.has(to)) directPoolInTokens += amountTokens;
    if (excluded.has(from)) directPoolOutTokens += amountTokens;

    if (from !== ZERO && !excluded.has(from)) {
      const item = row(from);
      item.outboundTokens += amountTokens;
      item.firstOutboundBlock = item.firstOutboundBlock === null ? block : Math.min(item.firstOutboundBlock, block);
      item.lastOutboundBlock = item.lastOutboundBlock === null ? block : Math.max(item.lastOutboundBlock, block);
    }
    if (to !== ZERO && !excluded.has(to)) {
      const item = row(to);
      item.inboundTokens += amountTokens;
      item.firstInboundBlock = item.firstInboundBlock === null ? block : Math.min(item.firstInboundBlock, block);
      item.lastInboundBlock = item.lastInboundBlock === null ? block : Math.max(item.lastInboundBlock, block);
    }
  }

  return { ledger, directPoolInTokens, directPoolOutTokens };
}

async function enrichBalances(rpcUrl, tokenAddress, rows, blockTag, options = {}) {
  const maxAddresses = Math.max(4, Math.min(40, Number(options.maxCohortAddresses || 18)));
  const selected = [...rows]
    .sort((a, b) => (b.inboundTokens + b.outboundTokens) - (a.inboundTokens + a.outboundTokens))
    .slice(0, maxAddresses);

  return Promise.all(selected.map(async (item) => {
    try {
      const [balanceHex, code] = await Promise.all([
        ethCall(rpcUrl, tokenAddress, callData(SELECTORS.balanceOf, [encodeAddressWord(item.address)]), blockTag, options),
        jsonRpc(rpcUrl, "eth_getCode", [item.address, blockTag], options),
      ]);
      return {
        ...item,
        currentBalanceRaw: decodeUint(balanceHex, 0),
        isContract: typeof code === "string" && code !== "0x" && code !== "0x0",
      };
    } catch {
      return { ...item, currentBalanceRaw: null, isContract: null };
    }
  }));
}

function weightedRetention(rows = [], currentBlock, blocksPerHour, minAgeHours, maxAgeHours, decimals) {
  let inbound = 0;
  let retained = 0;
  let wallets = 0;
  for (const item of rows) {
    if (item.isContract === true || item.currentBalanceRaw === null || item.firstInboundBlock === null || item.inboundTokens <= 0) continue;
    const ageHours = (currentBlock - item.firstInboundBlock) / blocksPerHour;
    if (ageHours < minAgeHours || ageHours > maxAgeHours) continue;
    const balance = toTokenAmount(item.currentBalanceRaw, decimals);
    inbound += item.inboundTokens;
    retained += Math.min(item.inboundTokens, Math.max(0, balance));
    wallets += 1;
  }
  return {
    wallets,
    inboundTokens: inbound,
    retainedTokens: retained,
    retentionPct: inbound > 0 ? Math.max(0, Math.min(100, (retained / inbound) * 100)) : null,
  };
}

export async function observeErc20HolderCohorts(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address || options.tokenAddress);
  const poolAddress = lower(project.poolAddress || project.pairAddress || project.primaryTradablePool || options.poolAddress);
  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", source: "ERC20_TRANSFER_COHORT", shadowOnly: true };
  if (!/^0x[0-9a-f]{40}$/i.test(tokenAddress)) return { status: "MISSING_TOKEN_ADDRESS", source: "ERC20_TRANSFER_COHORT", shadowOnly: true };

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 8_000, retries: options.retries ?? 1 };
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const blockTag = safeBlock?.number || "latest";
    const currentBlock = Number(BigInt(safeBlock?.number || await jsonRpc(rpcUrl, "eth_blockNumber", [], rpcOptions)));
    const decimalsHex = await ethCall(rpcUrl, tokenAddress, SELECTORS.decimals, blockTag, rpcOptions);
    const decimals = Number(decodeUint(decimalsHex, 0));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Unsupported token decimals: ${decimals}`);

    const blockTimeSeconds = Number(profile?.blockTimeSeconds || options.blockTimeSeconds || 2);
    const blocksPerHour = 3600 / blockTimeSeconds;
    const lookbackHours = Math.max(2, Math.min(48, Number(options.lookbackHours || 12)));
    const fromBlock = Math.max(0, Math.floor(currentBlock - lookbackHours * blocksPerHour));
    const transfers = await getTransferLogs(rpcUrl, tokenAddress, fromBlock, currentBlock, { ...rpcOptions, ...options });
    const excluded = new Set([ZERO, tokenAddress]);
    if (/^0x[0-9a-f]{40}$/i.test(poolAddress)) excluded.add(poolAddress);
    const { ledger, directPoolInTokens, directPoolOutTokens } = buildLedger(transfers.logs, decimals, excluded);
    const enriched = await enrichBalances(rpcUrl, tokenAddress, [...ledger.values()], blockTag, { ...rpcOptions, ...options });

    const cohort6h = weightedRetention(enriched, currentBlock, blocksPerHour, 6, Math.min(lookbackHours, 12), decimals);
    const cohort1h = weightedRetention(enriched, currentBlock, blocksPerHour, 1, Math.min(lookbackHours, 4), decimals);
    const priceUsd = finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
    const eoaRows = enriched.filter((item) => item.isContract === false);
    const netAccumulators = eoaRows.filter((item) => item.inboundTokens > item.outboundTokens).length;
    const activeDistributors = eoaRows.filter((item) => item.outboundTokens > 0).length;
    const activeDistributorInventoryTokens = eoaRows
      .filter((item) => item.outboundTokens > 0 && item.currentBalanceRaw !== null)
      .reduce((sum, item) => sum + toTokenAmount(item.currentBalanceRaw, decimals), 0);

    return {
      status: transfers.truncated ? "PARTIAL_LOOKBACK" : transfers.logs.length ? "OBSERVED_TRANSFER_COHORT" : "NO_TRANSFER_ACTIVITY",
      source: "ERC20_TRANSFER_LOGS_AND_BALANCEOF",
      observedAt: new Date().toISOString(),
      chainId: profile?.chainId || chain,
      blockNumber: blockTag,
      tokenAddress,
      lookbackHours,
      transferLogCount: transfers.logs.length,
      logChunkCount: transfers.chunks.length,
      logRangeTruncated: transfers.truncated,
      holderCohorts: {
        mode: "RECENT_TRANSFER_COHORT_NOT_FIRST_EVER_BUYERS",
        sampledWallets: enriched.length,
        sampledEoaWallets: eoaRows.length,
        recentAcquisitionRetention1hPct: cohort1h.retentionPct,
        recentAcquisitionRetention1hWallets: cohort1h.wallets,
        recentAcquisitionRetention6hPct: cohort6h.retentionPct,
        recentAcquisitionRetention6hWallets: cohort6h.wallets,
        netAccumulatorCount: netAccumulators,
        activeDistributorCount: activeDistributors,
        activeDistributorInventoryTokens,
        activeDistributorInventoryUsd: priceUsd === null ? null : activeDistributorInventoryTokens * priceUsd,
        directPoolInTokens,
        directPoolOutTokens,
        confidencePct: transfers.truncated ? 45 : enriched.length >= 8 ? 68 : enriched.length >= 3 ? 52 : 30,
      },
      warning: "This sensor uses public ERC-20 Transfer logs plus point-in-time balances. A first receipt inside the lookback is not proof of a wallet's first-ever acquisition, and token transfers to a pool/router are not automatically classified as sales.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "ERC20_TRANSFER_COHORT",
      error: error.message,
      tokenAddress,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __erc20HolderCohortSensorTestHooks = {
  buildLedger,
  weightedRetention,
  toTokenAmount,
};

export default observeErc20HolderCohorts;
