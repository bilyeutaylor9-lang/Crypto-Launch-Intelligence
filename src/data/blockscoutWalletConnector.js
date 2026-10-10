import {
  BLOCKSCOUT_DEFAULTS,
  chainKey,
  fetchJson as defaultFetchJson,
  isEvmAddress,
} from "./security/securityEvidenceUtils.js";

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function first(values = []) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function baseUrlForChain(chain = "", env = process.env) {
  const normalized = chainKey(chain);
  const key = `${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BLOCKSCOUT_URL`;
  return env[key] || env.BLOCKSCOUT_BASE_URL || BLOCKSCOUT_DEFAULTS[normalized] || null;
}

function addressOf(value) {
  if (typeof value === "string") return lower(value);
  return lower(value?.hash || value?.address || value?.address_hash);
}

function tokenAddressOfTransfer(item = {}) {
  return addressOf(
    first([
      item.token?.address_hash,
      item.token?.address,
      item.token_address,
      item.token_address_hash,
    ])
  );
}

function transferAmount(item = {}) {
  const raw = numberOrNull(
    first([item.total?.value, item.value, item.amount, item.token?.value])
  );
  if (raw === null) return null;
  const decimals = numberOrNull(
    first([item.total?.decimals, item.token?.decimals, item.decimals])
  );
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return raw / 10 ** decimals;
}

function timestampOf(item = {}) {
  const value = first([item.timestamp, item.block_timestamp, item.transaction?.timestamp]);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeTransfers(payload = {}, project = {}, meta = {}) {
  const tokenAddress = lower(meta.tokenAddress);
  const poolAddress = lower(meta.poolAddress);
  const priceUsd = numberOrNull(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  const nowMs = meta.now instanceof Date ? meta.now.getTime() : Date.now();
  const transactions = [];

  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const itemToken = tokenAddressOfTransfer(item);
    if (itemToken && itemToken !== tokenAddress) continue;
    const from = addressOf(item.from);
    const to = addressOf(item.to);
    const timestamp = timestampOf(item);
    const timestampMs = timestamp ? Date.parse(timestamp) : null;
    if (timestampMs !== null && (timestampMs > nowMs || nowMs - timestampMs > 24 * 60 * 60 * 1000)) continue;
    const amount = transferAmount(item);
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
      volumeUsd: null,
      estimatedCurrentValueUsd: amount !== null && priceUsd !== null ? amount * priceUsd : null,
      smartWallet: null,
    });
  }

  return transactions;
}

function uniqueAddresses(values = []) {
  return [...new Set(values.map(lower).filter(Boolean))];
}

export function normalizeBlockscoutWalletEvidence(
  raw = {},
  project = {},
  meta = {}
) {
  const tokenAddress = lower(meta.tokenAddress);
  const poolAddress = lower(meta.poolAddress);
  const transfers = normalizeTransfers(raw.transfers, project, {
    tokenAddress,
    poolAddress,
    now: meta.now,
  });
  const holderItems = Array.isArray(raw.holders?.items) ? raw.holders.items : [];
  const holderAddresses = uniqueAddresses(holderItems.map((item) => addressOf(item.address)));
  const wallets = uniqueAddresses([
    ...holderAddresses,
    ...transfers.flatMap((item) => [item.from, item.to]),
  ]).filter((address) => address !== poolAddress && address !== `0x${"0".repeat(40)}`);
  const transferItems = Array.isArray(raw.transfers?.items) ? raw.transfers.items : null;
  const nowMs = meta.now instanceof Date ? meta.now.getTime() : Date.now();
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const timestamps = (transferItems || []).map(timestampOf);
  const validTimestamps = timestamps.every((value) => value && Date.parse(value) <= nowMs) &&
    (transferItems || []).every((item) => tokenAddressOfTransfer(item) === tokenAddress &&
      isEvmAddress(addressOf(item.from)) && isEvmAddress(addressOf(item.to)));
  const completeDailyTransfers = transferItems !== null && validTimestamps &&
    (!raw.transfers.next_page_params || timestamps.some((value) => Date.parse(value) <= cutoff));
  const holderCount = numberOrNull(
    first([
      raw.token?.holders_count,
      raw.token?.holder_count,
      raw.holders?.total_count,
    ])
  );

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
    exactTokenIdentity: Boolean(tokenAddress),
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
      ...(!completeDailyTransfers ? ["Transfer coverage is missing or incomplete; daily activity remains unknown."] : []),
      "Token transfers do not prove swaps; buyer, seller and trade totals remain unknown.",
      "Transfer normalization does not verify historical smart-wallet labels.",
    ],
  };
}

export async function getBlockscoutWalletEvidence(project = {}, options = {}) {
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const tokenAddress = lower(
    project.tokenAddress || project.contractAddress || project.address || ""
  );
  const poolAddress = lower(project.poolAddress || project.pairAddress || "");
  const baseUrl = options.blockscoutBaseUrl || baseUrlForChain(chain, options.env || process.env);
  if (!baseUrl || !isEvmAddress(tokenAddress)) {
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
