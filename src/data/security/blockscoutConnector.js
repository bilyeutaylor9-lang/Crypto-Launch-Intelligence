import {
  BLOCKSCOUT_DEFAULTS,
  boolFlag,
  chainKey,
  fetchJson,
  getCachedSecurityEvidence,
  isEvmAddress,
  lower,
  setCachedSecurityEvidence,
  tokenAddress,
  unknownSecurityEvidence,
} from "./securityEvidenceUtils.js";

const BLOCKSCOUT_PROVIDER = "blockscout";
const BLOCKSCOUT_DEPLOYER_PROVIDER = "blockscout-deployer";

function envBaseUrl(chain = "") {
  const key = `${String(chain || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BLOCKSCOUT_URL`;
  return process.env[key] || process.env.BLOCKSCOUT_BASE_URL || BLOCKSCOUT_DEFAULTS[chain] || null;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasObservedProxyType(value) {
  return typeof value === "string" &&
    !["", "null", "undefined", "none", "unknown", "false", "0"].includes(lower(value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  const parsed = Number.isFinite(numericValue)
    ? numericValue > 1e12
      ? numericValue
      : numericValue * 1000
    : Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeBlockscoutSecurityEvidence(contract = {}, addressInfo = {}, meta = {}) {
  const sourceVerified =
    boolFlag(contract.is_verified) === true ||
    boolFlag(contract.is_fully_verified) === true ||
    boolFlag(addressInfo.is_verified) === true ||
    hasValue(contract.source_code);
  const implementationAddress = [
    contract.implementation_address,
    addressInfo.implementation_address,
    ...[contract, addressInfo].flatMap((item) =>
      (Array.isArray(item.implementations) ? item.implementations : [])
        .flatMap((implementation) => [implementation?.address, implementation?.address_hash])),
  ].filter((value) => typeof value === "string" && isEvmAddress(value))
    .map((value) => lower(value))
    .find((value) => value !== "0x0000000000000000000000000000000000000000") || null;
  const proxy =
    boolFlag(contract.is_proxy) === true ||
    boolFlag(addressInfo.is_proxy) === true ||
    hasValue(contract.implementation_address) ||
    hasValue(addressInfo.implementation_address) ||
    hasObservedProxyType(contract.proxy_type) ||
    hasObservedProxyType(addressInfo.proxy_type) ||
    Boolean(implementationAddress);
  const rawCreatorAddress =
    contract.creator_address_hash ||
    contract.creator_address ||
    addressInfo.creator_address_hash ||
    addressInfo.creator_address ||
    null;
  const creatorAddress = isEvmAddress(rawCreatorAddress)
    ? lower(rawCreatorAddress)
    : null;
  const deploymentTransactionHash =
    contract.creation_tx_hash ||
    contract.creation_transaction_hash ||
    contract.transaction_hash ||
    addressInfo.creation_tx_hash ||
    addressInfo.creation_transaction_hash ||
    null;
  const creationBlockNumber = numberOrNull(
    contract.creation_block_number ||
      contract.block_number ||
      addressInfo.creation_block_number ||
      addressInfo.block_number
  );
  const contractCreationTimestamp = timestampOrNull(
    contract.creation_timestamp ||
      contract.created_at ||
      addressInfo.creation_timestamp ||
      addressInfo.created_at
  );

  if (!sourceVerified && !hasValue(contract.name) && !hasValue(addressInfo.hash)) {
    return {
      ...unknownSecurityEvidence(BLOCKSCOUT_PROVIDER, "Blockscout returned no contract metadata."),
      chain: meta.chain || null,
      address: meta.address || null,
      raw: { contract, addressInfo },
    };
  }

  return {
    provider: BLOCKSCOUT_PROVIDER,
    status: "EVIDENCE_AVAILABLE",
    observedAt: new Date().toISOString(),
    chain: meta.chain || null,
    address: meta.address || null,
    verifiedSource: sourceVerified,
    proxy,
    implementationAddress,
    creatorAddress,
    deploymentTransactionHash,
    creationBlockNumber,
    contractCreationTimestamp,
    contractName: contract.name || contract.contract_name || null,
    ownerRisk: false,
    mintRisk: false,
    freezeRisk: false,
    blacklistRisk: false,
    highTaxRisk: false,
    malicious: false,
    honeypot: false,
    riskFindings: proxy ? ["Blockscout shows proxy or implementation indirection."] : [],
    warnings: sourceVerified ? [] : ["Blockscout did not confirm verified source code."],
    confidence: sourceVerified ? (proxy ? 78 : 84) : 48,
    raw: { contract, addressInfo },
  };
}

function reparseCachedBlockscoutRisk(cached, provider, chain, address) {
  if (cached.status === "UNKNOWN") return cached;
  const unknown = () => ({
    ...unknownSecurityEvidence(provider, "Cached Blockscout evidence lacks valid raw metadata or exact contract identity."),
    chain,
    address,
    observedAt: cached.observedAt,
    ...(Object.hasOwn(cached, "sourceTimestamp") ? { sourceTimestamp: cached.sourceTimestamp } : {}),
  });
  const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
  const { contract, addressInfo } = isRecord(cached.raw) ? cached.raw : {};
  if (cached.status !== "EVIDENCE_AVAILABLE" || cached.provider !== provider ||
      chainKey(cached.chain) !== chain || !isEvmAddress(cached.address) ||
      lower(cached.address) !== lower(address) || cached.responseIdentityVerified === false ||
      !isRecord(contract) || !isRecord(addressInfo)) return unknown();
  const rawAddresses = [contract.hash, contract.address, contract.address_hash,
    addressInfo.hash, addressInfo.address, addressInfo.address_hash].filter(hasValue);
  if (!rawAddresses.length || !rawAddresses.every((value) =>
    typeof value === "string" && isEvmAddress(value) && lower(value) === lower(address))) return unknown();

  const parsed = normalizeBlockscoutSecurityEvidence(contract, addressInfo, { chain, address });
  if (parsed.status === "UNKNOWN") return unknown();
  // Reinterpret retained risk only; cached receipt times and clean-proof claims cannot improve.
  return {
    ...cached,
    proxy: cached.proxy === true || parsed.proxy === true,
    implementationAddress: parsed.implementationAddress,
    riskFindings: [...new Set([
      ...(Array.isArray(cached.riskFindings) ? cached.riskFindings : []),
      ...parsed.riskFindings,
    ])],
  };
}

export async function getBlockscoutSecurityEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const baseUrl = envBaseUrl(chain);

  if (!baseUrl || !isEvmAddress(address)) {
    return unknownSecurityEvidence(BLOCKSCOUT_PROVIDER, "Blockscout requires a configured EVM explorer and contract address.");
  }

  const cached = options.useCache === false ? null : getCachedSecurityEvidence(BLOCKSCOUT_PROVIDER, chain, address, options.cacheTtlMs);
  if (cached) return reparseCachedBlockscoutRisk(cached, BLOCKSCOUT_PROVIDER, chain, address);

  try {
    const root = String(baseUrl).replace(/\/+$/, "");
    const contractUrl = `${root}/api/v2/smart-contracts/${address}`;
    const addressUrl = `${root}/api/v2/addresses/${address}`;
    const [contractResult, addressResult] = await Promise.allSettled([
      fetchJson(contractUrl, { timeoutMs: options.timeoutMs }),
      fetchJson(addressUrl, { timeoutMs: options.timeoutMs }),
    ]);
    const contract = contractResult.status === "fulfilled" ? contractResult.value : {};
    const addressInfo = addressResult.status === "fulfilled" ? addressResult.value : {};
    const evidence = normalizeBlockscoutSecurityEvidence(contract, addressInfo, { chain, address });

    if (contractResult.status === "rejected" && addressResult.status === "rejected") {
      return unknownSecurityEvidence(
        BLOCKSCOUT_PROVIDER,
        `Blockscout requests failed: ${contractResult.reason?.message || addressResult.reason?.message || "unknown"}`,
        contractResult.reason || addressResult.reason
      );
    }

    return options.useCache === false ? evidence : setCachedSecurityEvidence(BLOCKSCOUT_PROVIDER, chain, address, evidence);
  } catch (error) {
    return unknownSecurityEvidence(BLOCKSCOUT_PROVIDER, `Blockscout request failed: ${error.message}`, error);
  }
}

export async function getBlockscoutDeployerEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const baseUrl = envBaseUrl(chain);

  if (!baseUrl || !isEvmAddress(address)) {
    return {
      ...unknownSecurityEvidence(
        BLOCKSCOUT_DEPLOYER_PROVIDER,
        "Blockscout deployer recovery requires a configured EVM explorer and contract address."
      ),
      chain,
      address: address || null,
    };
  }

  const cached = options.useCache === false
    ? null
    : getCachedSecurityEvidence(
        BLOCKSCOUT_DEPLOYER_PROVIDER,
        chain,
        address,
        options.cacheTtlMs
      );
  if (cached) return reparseCachedBlockscoutRisk(cached, BLOCKSCOUT_DEPLOYER_PROVIDER, chain, address);

  try {
    const root = String(baseUrl).replace(/\/+$/, "");
    const [contractResult, addressResult] = await Promise.allSettled([
      fetchJson(`${root}/api/v2/smart-contracts/${address}`, {
        timeoutMs: options.timeoutMs,
      }),
      fetchJson(`${root}/api/v2/addresses/${address}`, {
        timeoutMs: options.timeoutMs,
      }),
    ]);
    const contract = contractResult.status === "fulfilled" ? contractResult.value : {};
    const addressInfo = addressResult.status === "fulfilled" ? addressResult.value : {};
    if (contractResult.status === "rejected" && addressResult.status === "rejected") {
      throw contractResult.reason || addressResult.reason;
    }
    const evidence = {
      ...normalizeBlockscoutSecurityEvidence(contract, addressInfo, { chain, address }),
      provider: BLOCKSCOUT_DEPLOYER_PROVIDER,
    };
    return options.useCache === false
      ? evidence
      : setCachedSecurityEvidence(
          BLOCKSCOUT_DEPLOYER_PROVIDER,
          chain,
          address,
          evidence
        );
  } catch (error) {
    return {
      ...unknownSecurityEvidence(
        BLOCKSCOUT_DEPLOYER_PROVIDER,
        `Blockscout deployer request failed: ${error.message}`,
        error
      ),
      chain,
      address,
    };
  }
}
