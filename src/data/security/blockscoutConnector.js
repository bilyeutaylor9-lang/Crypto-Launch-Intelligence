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
  const proxy =
    boolFlag(contract.is_proxy) === true ||
    boolFlag(addressInfo.is_proxy) === true ||
    hasValue(contract.implementation_address) ||
    hasValue(addressInfo.implementation_address);
  const implementationAddress =
    contract.implementation_address ||
    addressInfo.implementation_address ||
    contract.implementations?.[0]?.address ||
    null;
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

export async function getBlockscoutSecurityEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const baseUrl = envBaseUrl(chain);

  if (!baseUrl || !isEvmAddress(address)) {
    return unknownSecurityEvidence(BLOCKSCOUT_PROVIDER, "Blockscout requires a configured EVM explorer and contract address.");
  }

  const cached = options.useCache === false ? null : getCachedSecurityEvidence(BLOCKSCOUT_PROVIDER, chain, address, options.cacheTtlMs);
  if (cached) return cached;

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
        `Blockscout requests failed: ${contractResult.reason?.message || addressResult.reason?.message || "unknown"}`
      );
    }

    return options.useCache === false ? evidence : setCachedSecurityEvidence(BLOCKSCOUT_PROVIDER, chain, address, evidence);
  } catch (error) {
    return unknownSecurityEvidence(BLOCKSCOUT_PROVIDER, `Blockscout request failed: ${error.message}`);
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
  if (cached) return cached;

  try {
    const root = String(baseUrl).replace(/\/+$/, "");
    const addressInfo = await fetchJson(`${root}/api/v2/addresses/${address}`, {
      timeoutMs: options.timeoutMs,
    });
    const evidence = {
      ...normalizeBlockscoutSecurityEvidence({}, addressInfo, { chain, address }),
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
        `Blockscout deployer request failed: ${error.message}`
      ),
      chain,
      address,
    };
  }
}
