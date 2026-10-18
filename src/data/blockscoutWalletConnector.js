import {
  BLOCKSCOUT_DEFAULTS,
  chainKey,
  fetchJson as defaultFetchJson,
  isEvmAddress,
} from "./security/securityEvidenceUtils.js";
import { chainKind } from "../identity/strictIdentityValidators.js";
import { createEvmWalletParticipantFilter } from "./walletParticipantPolicy.js";

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function numberOrNull(value) {
  if (typeof value !== "number" &&
      (typeof value !== "string" || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function supplied(values = []) {
  return values.filter((value) => value !== null && value !== undefined);
}

function consistent(values, parse) {
  const parsed = supplied(values).map(parse);
  return parsed.length && parsed.every((value) => value !== null && value === parsed[0])
    ? parsed[0] : null;
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unsignedInteger(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed < 2n ** 256n ? parsed : null;
}

function safeInteger(value) {
  const parsed = unsignedInteger(value);
  return parsed !== null && parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null;
}

function exactEvmChain(value) {
  return ["string", "number"].includes(typeof value) && chainKind(value) === "evm";
}

function baseUrlForChain(chain = "", env = process.env) {
  const normalized = chainKey(chain);
  const key = `${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BLOCKSCOUT_URL`;
  return env[key] || env.BLOCKSCOUT_BASE_URL || BLOCKSCOUT_DEFAULTS[normalized] || null;
}

function addressOf(value) {
  if (typeof value === "string") return isEvmAddress(value) ? lower(value) : null;
  if (!record(value)) return null;
  return consistent([value.hash, value.address, value.address_hash], (address) =>
    typeof address === "string" && isEvmAddress(address) ? lower(address) : null);
}

function tokenAddresses(item = {}) {
  return [item?.token?.address_hash, item?.token?.address, item?.token_address, item?.token_address_hash];
}

function tokenAddressOfTransfer(item = {}) {
  return record(item) ? consistent(tokenAddresses(item), addressOf) : null;
}

function transferAmount(item = {}, tokenDecimals, raw) {
  if (raw === null) return null;
  const decimals = consistent([item.total?.decimals, item.token?.decimals, item.decimals, tokenDecimals], safeInteger);
  if (decimals === null || decimals > 36) return null;
  return Number(raw) / 10 ** decimals;
}

function timestampOrNull(value) {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function timestampOf(item = {}) {
  return record(item) ? consistent([item.timestamp, item.block_timestamp, item.transaction?.timestamp], timestampOrNull) : null;
}

function normalizeTransfers(payload = {}, project = {}, meta = {}) {
  const tokenAddress = lower(meta.tokenAddress);
  const poolAddress = lower(meta.poolAddress);
  const priceUsd = numberOrNull(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  const nowMs = meta.now instanceof Date ? meta.now.getTime() : Date.now();
  const transactions = [];

  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const itemToken = tokenAddressOfTransfer(item);
    if (!itemToken || itemToken !== tokenAddress) continue;
    const from = addressOf(item.from);
    const to = addressOf(item.to);
    const timestamp = timestampOf(item);
    const timestampMs = timestamp ? Date.parse(timestamp) : NaN;
    if (!from || !to || !Number.isFinite(timestampMs) || !Number.isFinite(nowMs) ||
        timestampMs > nowMs || nowMs - timestampMs > 24 * 60 * 60 * 1000) continue;
    const amountRaw = consistent([item.total?.value, item.value, item.amount, item.token?.value], unsignedInteger);
    const amount = transferAmount(item, meta.tokenDecimals, amountRaw);
    const estimatedValue = amount !== null && priceUsd !== null ? amount * priceUsd : null;
    const poolMovement = poolAddress && from === poolAddress
      ? "POOL_OUTFLOW"
      : poolAddress && to === poolAddress ? "POOL_INFLOW" : null;
    transactions.push({
      transactionHash: lower(item.transaction_hash || item.transaction?.hash),
      timestamp,
      from,
      to,
      participant: null,
      direction: "TRANSFER",
      poolMovement,
      tokenAmount: amount,
      tokenAmountRaw: amountRaw === null ? null : amountRaw.toString(),
      volumeUsd: null,
      estimatedCurrentValueUsd: Number.isFinite(estimatedValue) ? estimatedValue : null,
      smartWallet: null,
    });
  }

  return transactions;
}

function uniqueAddresses(values = []) {
  return [...new Set(values.map(addressOf).filter((address) => address && address !== ZERO_ADDRESS))];
}

export function normalizeBlockscoutWalletEvidence(
  raw = {},
  project = {},
  meta = {}
) {
  raw = record(raw) ? raw : {};
  const tokenAddress = typeof meta.tokenAddress === "string" ? addressOf(meta.tokenAddress) : null;
  const requestedPool = typeof meta.poolAddress === "string" ? addressOf(meta.poolAddress) : null;
  const poolAddress = requestedPool !== ZERO_ADDRESS ? requestedPool : null;
  const metadataAddresses = supplied([raw.token?.address_hash, raw.token?.address,
    raw.token?.token_address, raw.token?.token_address_hash]);
  const validChain = meta.chain === null || meta.chain === undefined || meta.chain === "" || exactEvmChain(meta.chain);
  // Explicit identity conflicts invalidate the batch, including endpoint-scoped holders.
  const exactTokenIdentity = Boolean(validChain && tokenAddress && tokenAddress !== ZERO_ADDRESS &&
    metadataAddresses.every((address) => addressOf(address) === tokenAddress));
  const transfers = normalizeTransfers(exactTokenIdentity ? raw.transfers : {}, project, {
    tokenAddress,
    poolAddress,
    tokenDecimals: raw.token?.decimals,
    now: meta.now,
  });
  const holderItems = exactTokenIdentity && Array.isArray(raw.holders?.items) ? raw.holders.items : [];
  const holderAddresses = uniqueAddresses(holderItems.filter((item) => {
    if (!record(item) || !supplied(tokenAddresses(item)).every((address) => addressOf(address) === tokenAddress)) return false;
    const balance = item.value === null || item.value === undefined ? null : unsignedInteger(item.value);
    return item.value === null || item.value === undefined || (balance !== null && balance > 0n);
  }).map((item) => addressOf(item.address)));
  const wallets = uniqueAddresses([
    ...holderAddresses,
    ...transfers.filter((item) => item.tokenAmountRaw !== null && BigInt(item.tokenAmountRaw) > 0n)
      .flatMap((item) => [item.from, item.to]),
  ]).filter(createEvmWalletParticipantFilter(tokenAddress, poolAddress, project.poolAddress, project.pairAddress));
  const transferItems = Array.isArray(raw.transfers?.items) ? raw.transfers.items : null;
  const nowMs = meta.now instanceof Date ? meta.now.getTime() : Date.now();
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const timestamps = (transferItems || []).map(timestampOf);
  const validTimestamps = Number.isFinite(nowMs) && timestamps.every((value) => value && Date.parse(value) <= nowMs) &&
    (transferItems || []).every((item) => tokenAddressOfTransfer(item) === tokenAddress &&
      isEvmAddress(addressOf(item.from)) && isEvmAddress(addressOf(item.to)));
  const nextPage = raw.transfers?.next_page_params;
  const reachedCutoffInOrder = record(nextPage) && Object.keys(nextPage).length > 0 &&
    timestamps.every((value, index) => index === 0 || Date.parse(value) <= Date.parse(timestamps[index - 1])) &&
    timestamps.some((value) => Date.parse(value) <= cutoff);
  const completeDailyTransfers = exactTokenIdentity && transferItems !== null && validTimestamps &&
    (nextPage === null || nextPage === undefined || reachedCutoffInOrder);
  const reportedHolderCount = exactTokenIdentity ? consistent([
    raw.token?.holders_count,
    raw.token?.holder_count,
    raw.holders?.total_count,
  ], safeInteger) : null;
  const holderCount = reportedHolderCount !== null && reportedHolderCount >= holderAddresses.length
    ? reportedHolderCount : null;

  return {
    provider: "blockscout-wallets",
    status:
      transfers.length || holderAddresses.length || holderCount !== null || completeDailyTransfers
        ? "EVIDENCE_AVAILABLE"
        : "UNKNOWN",
    observedAt: meta.observedAt || new Date().toISOString(),
    chain: meta.chain || null,
    tokenAddress,
    poolAddress: poolAddress || null,
    exactTokenIdentity,
    exactPoolIdentity: Boolean(poolAddress),
    holderCount,
    holderAddresses,
    wallets,
    buyerAddresses: null,
    sellerAddresses: null,
    walletTransactions: transfers,
    walletParticipationHistory: transfers,
    transferCoverage: { available: transferItems !== null, complete24h: completeDailyTransfers,
      observedTransfers24h: completeDailyTransfers ? transfers.length : null },
    // Pool transfers also occur during liquidity changes, fees and donations.
    tradeCoverage: { available: false, status: "UNKNOWN" },
    uniqueBuyers24h: null,
    buyTransactions24h: null,
    sellTransactions24h: null,
    buyVolumeUsd: null,
    sellVolumeUsd: null,
    smartWalletBuys24h: null,
    smartWalletSells24h: null,
    smartWalletBuyCount: null,
    smartWalletSellCount: null,
    smartWallets: null,
    trackedWallets: null,
    smartWalletBuyVolumeUsd: null,
    smartWalletSellVolumeUsd: null,
    warnings: [
      ...(!exactTokenIdentity ? ["Exact EVM token identity is missing, malformed or conflicting; wallet evidence remains unknown."] : []),
      ...(!completeDailyTransfers ? ["Transfer coverage is missing or incomplete; daily activity remains unknown."] : []),
      "Zero or unproven transfer amounts and known sink/token/pool addresses do not establish generic participant wallets.",
      "Token transfers do not prove swaps; buyer, seller and trade totals remain unknown.",
      "Transfer normalization does not verify historical smart-wallet labels.",
    ],
  };
}

export async function getBlockscoutWalletEvidence(project = {}, options = {}) {
  const requestedChain = project.chain || project.network || project.chainId || "";
  const chain = exactEvmChain(requestedChain) ? chainKey(requestedChain) : null;
  const requestedToken = project.tokenAddress || project.contractAddress || project.address;
  const tokenAddress = typeof requestedToken === "string" ? addressOf(requestedToken) : null;
  const requestedPool = project.poolAddress || project.pairAddress;
  const poolAddress = typeof requestedPool === "string" ? addressOf(requestedPool) : null;
  const baseUrl = options.blockscoutBaseUrl || baseUrlForChain(chain, options.env || process.env);
  if (!chain || !baseUrl || !tokenAddress || tokenAddress === ZERO_ADDRESS) {
    return {
      provider: "blockscout-wallets",
      status: "UNKNOWN",
      observedAt: new Date().toISOString(),
      warnings: ["Blockscout wallet recovery requires an exact EVM chain and token contract."],
    };
  }

  const fetchJson = options.fetchJson || defaultFetchJson;
  const root = String(baseUrl).replace(/\/+$/, "");
  const [transfers, holders, token] = await Promise.allSettled([
    fetchJson(`${root}/api/v2/tokens/${tokenAddress}/transfers?type=ERC-20`, {
      timeoutMs: options.timeoutMs,
    }),
    fetchJson(`${root}/api/v2/tokens/${tokenAddress}/holders`, {
      timeoutMs: options.timeoutMs,
    }),
    fetchJson(`${root}/api/v2/tokens/${tokenAddress}`, {
      timeoutMs: options.timeoutMs,
    }),
  ]);
  const payload = {
    transfers: transfers.status === "fulfilled" ? transfers.value : {},
    holders: holders.status === "fulfilled" ? holders.value : {},
    token: token.status === "fulfilled" ? token.value : {},
  };
  const result = normalizeBlockscoutWalletEvidence(payload, project, {
    chain,
    tokenAddress,
    poolAddress: isEvmAddress(poolAddress) ? poolAddress : null,
    observedAt: new Date().toISOString(),
    now: options.now?.() || new Date(),
  });
  return {
    ...result,
    providerFailure: [transfers, holders, token].every((item) => item.status === "rejected"),
    warnings: [
      ...(transfers.status === "rejected"
        ? [`Blockscout transfer request failed: ${transfers.reason?.message || "unknown"}`]
        : []),
      ...(holders.status === "rejected"
        ? [`Blockscout holder request failed: ${holders.reason?.message || "unknown"}`]
        : []),
      ...(token.status === "rejected"
        ? [`Blockscout token request failed: ${token.reason?.message || "unknown"}`]
        : []),
      ...(result.warnings || []),
    ],
  };
}
