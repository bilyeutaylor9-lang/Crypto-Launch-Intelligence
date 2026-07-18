import {
  boolFlag,
  chainKey,
  evmChainId,
  fetchJson,
  getCachedSecurityEvidence,
  isEvmAddress,
  lower,
  numeric,
  setCachedSecurityEvidence,
  tokenAddress,
  unknownSecurityEvidence,
} from "./securityEvidenceUtils.js";

const GOPLUS_BASE_URL = "https://api.gopluslabs.io/api/v1";
const GOPLUS_PROVIDER = "goplus";

function pct(value) {
  const number = numeric(value);
  if (number === null) return null;
  return number <= 1 ? number * 100 : number;
}

function firstResult(raw = {}, address = "") {
  const result = raw.result || raw.data || raw;
  if (!result || typeof result !== "object") return null;
  const normalized = lower(address);
  return (
    result[normalized] ||
    result[address] ||
    result[Object.keys(result).find((key) => lower(key) === normalized)] ||
    result[Object.keys(result)[0]] ||
    null
  );
}

export function normalizeGoPlusTokenSecurity(raw = {}, meta = {}) {
  const address = meta.address || "";
  const item = firstResult(raw, address);

  if (!item || typeof item !== "object") {
    return unknownSecurityEvidence(GOPLUS_PROVIDER, "GoPlus returned no token security record.");
  }

  const buyTaxPct = pct(item.buy_tax);
  const sellTaxPct = pct(item.sell_tax);
  const highTaxRisk = (buyTaxPct ?? 0) >= 10 || (sellTaxPct ?? 0) >= 10;
  const ownerRisk =
    boolFlag(item.hidden_owner) === true ||
    boolFlag(item.can_take_back_ownership) === true ||
    boolFlag(item.owner_change_balance) === true ||
    (item.owner_address && lower(item.owner_address) !== "0x0000000000000000000000000000000000000000");
  const mintRisk = boolFlag(item.is_mintable) === true;
  const freezeRisk =
    boolFlag(item.transfer_pausable) === true ||
    boolFlag(item.trading_cooldown) === true ||
    boolFlag(item.personal_slippage_modifiable) === true;
  const blacklistRisk =
    boolFlag(item.is_blacklisted) === true ||
    boolFlag(item.cannot_sell_all) === true ||
    boolFlag(item.slippage_modifiable) === true;
  const honeypot = boolFlag(item.is_honeypot) === true;
  const malicious = boolFlag(item.malicious_address) === true || boolFlag(item.is_airdrop_scam) === true;
  const proxy = boolFlag(item.is_proxy) === true;
  const verifiedSource = boolFlag(item.is_open_source) === true;

  const riskFindings = [
    ...(malicious ? ["GoPlus marks the token or deployer as malicious/scam risk."] : []),
    ...(honeypot ? ["GoPlus honeypot signal is active."] : []),
    ...(blacklistRisk ? ["Blacklist, sell-limit, or sell-restriction authority detected."] : []),
    ...(mintRisk ? ["Mint authority appears active."] : []),
    ...(freezeRisk ? ["Pause, cooldown, or transfer-control risk detected."] : []),
    ...(ownerRisk ? ["Owner authority is not cleanly renounced or can affect balances."] : []),
    ...(proxy ? ["Upgradeable proxy pattern detected."] : []),
    ...(highTaxRisk ? ["Buy/sell tax is high enough to require review."] : []),
  ];

  return {
    provider: GOPLUS_PROVIDER,
    status: "EVIDENCE_AVAILABLE",
    observedAt: new Date().toISOString(),
    chain: meta.chain || null,
    address: address || null,
    verifiedSource,
    proxy,
    ownerRisk,
    mintRisk,
    freezeRisk,
    blacklistRisk,
    highTaxRisk,
    malicious,
    honeypot,
    buyTaxPct,
    sellTaxPct,
    ownerAddress: item.owner_address || null,
    creatorAddress: item.creator_address || null,
    holderCount: numeric(item.holder_count),
    lpHolderCount: numeric(item.lp_holder_count),
    dexListed: boolFlag(item.is_in_dex) === true,
    riskFindings,
    warnings: verifiedSource ? [] : ["GoPlus did not confirm open-source contract code."],
    confidence: riskFindings.length ? 86 : 78,
    raw: item,
  };
}

function endpointFor(project = {}, address = "") {
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  if (chain === "solana" || project.chainId === "solana") {
    return {
      chain,
      url: `${GOPLUS_BASE_URL}/solana/token_security?contract_addresses=${encodeURIComponent(address)}`,
    };
  }

  const chainId = evmChainId(chain || project.chainId);
  if (!chainId || !isEvmAddress(address)) {
    return { chain, url: null, reason: "GoPlus security requires a supported EVM address or Solana token address." };
  }

  return {
    chain,
    url: `${GOPLUS_BASE_URL}/token_security/${chainId}?contract_addresses=${encodeURIComponent(address)}`,
  };
}

export async function getGoPlusSecurityEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  if (!address) return unknownSecurityEvidence(GOPLUS_PROVIDER, "No token contract address available for GoPlus.");

  const endpoint = endpointFor(project, address);
  if (!endpoint.url) return unknownSecurityEvidence(GOPLUS_PROVIDER, endpoint.reason);

  const cached = options.useCache === false ? null : getCachedSecurityEvidence(GOPLUS_PROVIDER, endpoint.chain, address, options.cacheTtlMs);
  if (cached) return cached;

  try {
    const headers = {};
    if (process.env.GOPLUS_API_KEY) headers.authorization = `Bearer ${process.env.GOPLUS_API_KEY}`;
    const raw = await fetchJson(endpoint.url, {
      timeoutMs: options.timeoutMs,
      headers,
    });
    const evidence = normalizeGoPlusTokenSecurity(raw, { chain: endpoint.chain, address });
    return options.useCache === false ? evidence : setCachedSecurityEvidence(GOPLUS_PROVIDER, endpoint.chain, address, evidence);
  } catch (error) {
    return unknownSecurityEvidence(GOPLUS_PROVIDER, `GoPlus request failed: ${error.message}`);
  }
}
