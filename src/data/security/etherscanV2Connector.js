import {
  boolFlag,
  chainKey,
  evmChainId,
  getCachedSecurityEvidence,
  isEvmAddress,
  lower,
  numeric,
  setCachedSecurityEvidence,
  tokenAddress,
  unknownSecurityEvidence,
} from "./securityEvidenceUtils.js";

const ETHERSCAN_PROVIDER = "etherscan-v2";
const ETHERSCAN_V2_BASE_URL = "https://api.etherscan.io/v2/api";

const CHAIN_KEY_FALLBACKS = {
  ethereum: ["ETHERSCAN_API_KEY"],
  base: ["ETHERSCAN_API_KEY", "BASESCAN_API_KEY"],
  bsc: ["ETHERSCAN_API_KEY", "BSCSCAN_API_KEY"],
  arbitrum: ["ETHERSCAN_API_KEY", "ARBISCAN_API_KEY"],
  optimism: ["ETHERSCAN_API_KEY", "OPTIMISTIC_ETHERSCAN_API_KEY"],
  polygon: ["ETHERSCAN_API_KEY", "POLYGONSCAN_API_KEY"],
  avalanche: ["ETHERSCAN_API_KEY", "SNOWTRACE_API_KEY"],
};

function clean(value = "") {
  return String(value ?? "").trim();
}

function firstResult(raw = {}) {
  const result = raw?.result;
  if (Array.isArray(result)) return result[0] || null;
  if (result && typeof result === "object") return result;
  return null;
}

function hasValue(value) {
  return value !== undefined && value !== null && clean(value) !== "";
}

function isUnverifiedAbi(value = "") {
  const text = lower(value);
  return !text || text.includes("contract source code not verified") || text.includes("not verified");
}

function parseAbiSummary(abiText = "") {
  if (typeof abiText !== "string" || isUnverifiedAbi(abiText)) {
    return {
      abiAvailable: false,
      abiLength: typeof abiText === "string" ? abiText.length : 0,
      abiFunctionCount: 0,
      abiEventCount: 0,
    };
  }

  try {
    const parsed = JSON.parse(abiText);
    const entries = Array.isArray(parsed) ? parsed : [];
    return {
      abiAvailable: entries.length > 0,
      abiLength: abiText.length,
      abiFunctionCount: entries.filter((entry) => entry?.type === "function").length,
      abiEventCount: entries.filter((entry) => entry?.type === "event").length,
    };
  } catch {
    return {
      abiAvailable: false,
      abiLength: abiText.length,
      abiFunctionCount: 0,
      abiEventCount: 0,
    };
  }
}

function redactRawSourceRecord(record = {}) {
  if (!record || typeof record !== "object") return null;
  return {
    ContractName: record.ContractName || null,
    CompilerVersion: record.CompilerVersion || null,
    CompilerType: record.CompilerType || null,
    OptimizationUsed: record.OptimizationUsed ?? null,
    Runs: record.Runs ?? null,
    EVMVersion: record.EVMVersion || null,
    LicenseType: record.LicenseType || null,
    Proxy: record.Proxy ?? null,
    Implementation: record.Implementation || null,
    SimilarMatch: record.SimilarMatch || null,
    SourceCodeLength: typeof record.SourceCode === "string" ? record.SourceCode.length : 0,
    AbiLength: typeof record.ABI === "string" ? record.ABI.length : 0,
  };
}

function redactRawCreationRecord(record = {}) {
  if (!record || typeof record !== "object") return null;
  return {
    contractAddress: record.contractAddress || null,
    contractCreator: record.contractCreator || null,
    txHash: record.txHash || null,
    blockNumber: record.blockNumber || null,
    timestamp: record.timestamp || null,
    contractFactory: record.contractFactory || null,
    creationBytecodeLength: typeof record.creationBytecode === "string" ? record.creationBytecode.length : 0,
  };
}

export function etherscanV2ApiKey(chain = "", env = process.env) {
  const normalizedChain = chainKey(chain);
  const keys = CHAIN_KEY_FALLBACKS[normalizedChain] || ["ETHERSCAN_API_KEY"];
  return keys.map((key) => clean(env[key])).find(Boolean) || null;
}

export function buildEtherscanV2Url({ chainId = "1", action = "", address = "", apiKey = "" } = {}) {
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: "contract",
    action,
    apikey: apiKey,
  });

  if (action === "getcontractcreation") {
    params.set("contractaddresses", address);
  } else {
    params.set("address", address);
  }

  return `${ETHERSCAN_V2_BASE_URL}?${params.toString()}`;
}

async function defaultFetchJson(url = "", options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.SECURITY_EVIDENCE_TIMEOUT_MS || 10_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      const error = new Error(`Etherscan V2 ${options.action || "request"} failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEtherscanV2Action(params = {}, options = {}) {
  const url = buildEtherscanV2Url(params);
  const fetcher = options.fetchJson || defaultFetchJson;
  return fetcher(url, {
    timeoutMs: options.timeoutMs,
    action: params.action,
    chainId: params.chainId,
  });
}

export function normalizeEtherscanV2SecurityEvidence(raw = {}, meta = {}) {
  const sourceRecord = firstResult(raw.sourceCode) || {};
  const creationRecord = firstResult(raw.creation) || {};
  const abiText =
    raw.abi?.status === "1" && typeof raw.abi?.result === "string"
      ? raw.abi.result
      : typeof sourceRecord.ABI === "string"
      ? sourceRecord.ABI
      : "";
  const abiSummary = parseAbiSummary(abiText);
  const sourceCodeLength = typeof sourceRecord.SourceCode === "string" ? sourceRecord.SourceCode.length : 0;
  const sourceStatusOk = raw.sourceCode?.status === "1" || raw.sourceCode?.message === "OK";
  const verifiedSource =
    sourceStatusOk &&
    (sourceCodeLength > 0 || abiSummary.abiAvailable || hasValue(sourceRecord.ContractName)) &&
    !isUnverifiedAbi(sourceRecord.ABI || "");
  const proxy = boolFlag(sourceRecord.Proxy) === true || isEvmAddress(sourceRecord.Implementation);
  const implementationAddress = isEvmAddress(sourceRecord.Implementation) ? sourceRecord.Implementation.toLowerCase() : null;
  const creatorAddress = isEvmAddress(creationRecord.contractCreator) ? creationRecord.contractCreator.toLowerCase() : null;
  const creationTxHash = /^0x[a-fA-F0-9]{64}$/.test(clean(creationRecord.txHash)) ? creationRecord.txHash.toLowerCase() : null;

  if (!verifiedSource && !creatorAddress && !abiSummary.abiAvailable) {
    return {
      ...unknownSecurityEvidence(ETHERSCAN_PROVIDER, "Etherscan V2 did not return verified source, ABI, or creation evidence."),
      chain: meta.chain || null,
      chainId: meta.chainId || null,
      address: meta.address || null,
      raw: {
        sourceStatus: raw.sourceCode?.status || null,
        sourceMessage: raw.sourceCode?.message || null,
        abiStatus: raw.abi?.status || null,
        creationStatus: raw.creation?.status || null,
        source: redactRawSourceRecord(sourceRecord),
        creation: redactRawCreationRecord(creationRecord),
      },
    };
  }

  const riskFindings = proxy ? ["Etherscan V2 shows proxy or implementation indirection."] : [];
  const warnings = [
    ...(!verifiedSource ? ["Etherscan V2 did not confirm verified source code."] : []),
    ...(!creatorAddress ? ["Etherscan V2 did not return a contract creator record."] : []),
  ];
  const confidence = Math.round(
    Math.min(
      92,
      Math.max(
        45,
        (verifiedSource ? 58 : 0) +
          (abiSummary.abiAvailable ? 14 : 0) +
          (creatorAddress ? 12 : 0) +
          (implementationAddress ? 4 : 0)
      )
    )
  );

  return {
    provider: ETHERSCAN_PROVIDER,
    status: "EVIDENCE_AVAILABLE",
    observedAt: new Date().toISOString(),
    chain: meta.chain || null,
    chainId: meta.chainId || null,
    address: meta.address || null,
    verifiedSource,
    exactMatch: verifiedSource,
    abiAvailable: abiSummary.abiAvailable,
    abiFunctionCount: abiSummary.abiFunctionCount,
    abiEventCount: abiSummary.abiEventCount,
    contractName: sourceRecord.ContractName || null,
    compilerVersion: sourceRecord.CompilerVersion || null,
    compilerType: sourceRecord.CompilerType || null,
    optimizationUsed: boolFlag(sourceRecord.OptimizationUsed),
    licenseType: sourceRecord.LicenseType || null,
    proxy,
    implementationAddress,
    creatorAddress,
    creationTxHash,
    creationBlockNumber: numeric(creationRecord.blockNumber),
    creationTimestamp: numeric(creationRecord.timestamp),
    ownerRisk: false,
    mintRisk: false,
    freezeRisk: false,
    blacklistRisk: false,
    highTaxRisk: false,
    malicious: false,
    honeypot: false,
    riskFindings,
    warnings,
    confidence,
    raw: {
      source: redactRawSourceRecord(sourceRecord),
      creation: redactRawCreationRecord(creationRecord),
      abi: abiSummary,
    },
  };
}

export async function getEtherscanV2SecurityEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const chainId = evmChainId(chain || project.chainId);

  if (!chainId || !isEvmAddress(address)) {
    return unknownSecurityEvidence(ETHERSCAN_PROVIDER, "Etherscan V2 requires a supported EVM chain and contract address.");
  }

  const apiKey = etherscanV2ApiKey(chain, options.env || process.env);
  if (!apiKey) {
    return unknownSecurityEvidence(ETHERSCAN_PROVIDER, "ETHERSCAN_API_KEY is missing for Etherscan V2 contract evidence.");
  }

  const cached = options.useCache === false ? null : getCachedSecurityEvidence(ETHERSCAN_PROVIDER, chain, address, options.cacheTtlMs);
  if (cached) return cached;

  try {
    const request = { chainId, address, apiKey };
    const [sourceCode, abi, creation] = await Promise.all([
      fetchEtherscanV2Action({ ...request, action: "getsourcecode" }, options),
      fetchEtherscanV2Action({ ...request, action: "getabi" }, options),
      fetchEtherscanV2Action({ ...request, action: "getcontractcreation" }, options),
    ]);
    const evidence = normalizeEtherscanV2SecurityEvidence(
      { sourceCode, abi, creation },
      { chain, chainId, address: address.toLowerCase() }
    );
    return options.useCache === false ? evidence : setCachedSecurityEvidence(ETHERSCAN_PROVIDER, chain, address, evidence);
  } catch (error) {
    return unknownSecurityEvidence(ETHERSCAN_PROVIDER, `Etherscan V2 request failed: ${error.message}`);
  }
}
