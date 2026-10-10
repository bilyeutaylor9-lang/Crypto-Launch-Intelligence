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

function knownWalletLabels(project = {}) {
  const values = [
    ...(Array.isArray(project.smartWallets) ? project.smartWallets : []),
    ...(Array.isArray(project.trackedWallets) ? project.trackedWallets : []),
    ...(Array.isArray(project.walletHistory?.smartWallets)
      ? project.walletHistory.smartWallets
      : []),
    ...(Array.isArray(project.walletParticipationHistory)
      ? project.walletParticipationHistory.filter((item) => item?.smartWallet === true)
      : []),
  ];
  return new Set(
    values
      .map((value) => addressOf(value?.address || value?.wallet || value))
      .filter(Boolean)
  );
}

function normalizeTransfers(payload = {}, project = {}, meta = {}) {
  const tokenAddress = lower(meta.tokenAddress);
  const poolAddress = lower(meta.poolAddress);
  const priceUsd = numberOrNull(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  const nowMs = meta.now instanceof Date ? meta.now.getTime() : Date.now();
  const smartWalletLabels = knownWalletLabels(project);
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
    const direction = poolAddress && from === poolAddress
      ? "BUY"
      : poolAddress && to === poolAddress
        ? "SELL"
        : "TRANSFER";
    const participant = direction === "BUY" ? to : direction === "SELL" ? from : null;
    transactions.push({
      transactionHash: lower(item.transaction_hash || item.transaction?.hash),
      timestamp,
      from,
      to,
      participant,
      direction,
      tokenAmount: amount,
      volumeUsd: null,
      estimatedCurrentValueUsd: amount !== null && priceUsd !== null ? amount * priceUsd : null,
      smartWallet: participant ? smartWalletLabels.has(participant) : false,
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
  const buyers = transfers.filter((item) => item.direction === "BUY");
  const sellers = transfers.filter((item) => item.direction === "SELL");
  const buyerAddresses = uniqueAddresses(buyers.map((item) => item.participant));
  const sellerAddresses = uniqueAddresses(sellers.map((item) => item.participant));
  const wallets = uniqueAddresses([
    ...holderAddresses,
    ...buyerAddresses,
    ...sellerAddresses,
  ]);
  const smartBuys = buyers.filter((item) => item.smartWallet);
  const smartSells = sellers.filter((item) => item.smartWallet);
  const labeledWallets = knownWalletLabels(project);
  const participatingSmartWallets = wallets.filter((wallet) => labeledWallets.has(wallet));
  const labelsPresent = labeledWallets.size > 0;
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
    buyerAddresses,
    sellerAddresses,
    walletTransactions: transfers,
    walletParticipationHistory: transfers,
    transferCoverage: { available: transferItems !== null, complete24h: completeDailyTransfers },
    uniqueBuyers24h: poolAddress && completeDailyTransfers ? buyerAddresses.length : null,
    buyTransactions24h: poolAddress && completeDailyTransfers ? buyers.length : null,
    sellTransactions24h: poolAddress && completeDailyTransfers ? sellers.length : null,
    buyVolumeUsd:
      poolAddress && completeDailyTransfers && buyers.length && buyers.every((item) => item.volumeUsd !== null)
        ? buyers.reduce((sum, item) => sum + item.volumeUsd, 0)
        : null,
    sellVolumeUsd:
      poolAddress && completeDailyTransfers && sellers.length && sellers.every((item) => item.volumeUsd !== null)
        ? sellers.reduce((sum, item) => sum + item.volumeUsd, 0)
        : null,
    smartWalletBuys24h: labelsPresent && completeDailyTransfers ? smartBuys.length : null,
    smartWalletSells24h: labelsPresent && completeDailyTransfers ? smartSells.length : null,
    smartWalletBuyCount: labelsPresent && completeDailyTransfers ? smartBuys.length : null,
    smartWalletSellCount: labelsPresent && completeDailyTransfers ? smartSells.length : null,
    smartWallets: labelsPresent && wallets.length ? participatingSmartWallets : null,
    trackedWallets: labelsPresent && wallets.length ? participatingSmartWallets : null,
    smartWalletBuyVolumeUsd:
      labelsPresent && completeDailyTransfers && smartBuys.length && smartBuys.every((item) => item.volumeUsd !== null)
        ? smartBuys.reduce((sum, item) => sum + item.volumeUsd, 0)
        : null,
    smartWalletSellVolumeUsd:
      labelsPresent && completeDailyTransfers && smartSells.length && smartSells.every((item) => item.volumeUsd !== null)
        ? smartSells.reduce((sum, item) => sum + item.volumeUsd, 0)
        : null,
    warnings: [
      ...(!completeDailyTransfers ? ["Transfer coverage is missing or incomplete; daily activity remains unknown."] : []),
      ...(!poolAddress
        ? ["Exact pool identity is missing; transfers were not classified as buys or sells."]
        : []),
      ...(!labelsPresent
        ? ["No persistent wallet labels were available; smart-wallet fields remain unknown."]
        : []),
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
