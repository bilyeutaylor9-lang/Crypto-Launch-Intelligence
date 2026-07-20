import {
  classifyAddressState,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { canonicalProviderId, providerProfile } from "./providerVocabularyRegistry.js";
import {
  CANONICAL_FIELD_ALIAS_REGISTRY,
  EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY,
  aliasesForCanonicalField,
  canonicalFieldForAlias,
} from "./canonicalFieldAliasRegistry.js";
import { normalizeUnitValue } from "./unitNormalizationRegistry.js";
import { resolveFieldConflict } from "./fieldConflictResolver.js";
import { buildAliasAuditRecord } from "./aliasResolutionAudit.js";
import { normalizeBooleanVocabulary, normalizeStatusVocabulary } from "./statusVocabularyNormalizer.js";
import {
  aliasConfidenceValue,
  fuzzyAliasMatch,
  fieldNameFromPath,
  IDENTITY_CRITICAL_FIELDS,
  parseMarketPair,
  parentPath,
} from "./semanticAliasNormalizer.js";

const ADDRESS_FIELDS = new Set(["tokenAddress", "poolAddress"]);
const BOOLEAN_FIELDS = new Set([
  "honeypotDetected",
  "sellRestricted",
  "contractVerified",
  "ownerRenounced",
  "mintAuthorityEnabled",
  "blacklistEnabled",
  "purchaseRouteConfirmed",
  "sellRouteAvailable",
]);
const STATUS_FIELDS = new Set(["executionStatus"]);
const NUMERIC_FIELDS = new Set([
  "circulatingMarketCapUsd",
  "fullyDilutedValuationUsd",
  "estimatedMarketCapUsd",
  "priceUsd",
  "liquidityUsd",
  "stableExitLiquidityUsd",
  "volume24hUsd",
  "buyTransactions24h",
  "sellTransactions24h",
  "uniqueBuyers24h",
  "uniqueSellers24h",
  "holderCount",
  "largestHolderSharePct",
  "top10HolderSharePct",
  "walletClusterRiskScore",
  "smartWalletScore",
  "smartWalletArrivalScore",
  "smartMoneyAccumulationScore",
  "developerActivityScore",
  "commits30d",
  "contributors30d",
  "socialFollowers",
  "socialAccelerationScore",
  "catalystScore",
  "buyTaxPct",
  "sellTaxPct",
  "lpLockedPct",
  "lpBurnedPct",
  "ownerLpSharePct",
  "bidDepthUsd",
  "askDepthUsd",
  "spreadPct",
  "orderBookDepthUsd",
  "priceImpactPct",
  "slippagePct",
  "estimatedGasUsd",
  "estimatedFeesUsd",
  "routeHopCount",
  "pipelineScore",
  "vNextScore",
  "capitalMigrationScore",
  "preBreakoutRadarScore",
  "marketOpportunityRank",
]);
const UNSAFE_TOKEN_LIQUIDITY_CONTEXT = /\b(protocol|staking|lending|treasury|bridge|chain|app|application|total)\b/i;
const MARKET_PAIR_SEPARATORS = /[/:_\-\s]/;

function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function getPath(object = {}, path = "") {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value && hasOwn(value, part) ? value[part] : undefined), object);
}

function hasRawValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function sourceTimestamp(project = {}, path = "") {
  return (
    getPath(project, `${path}Timestamp`) ||
    project.fieldProvenance?.[path]?.sourceTimestamp ||
    project.sourceTimestamp ||
    project.updatedAt ||
    project.lastUpdatedAt ||
    project.observationTimestamp ||
    project.discoveredAt ||
    null
  );
}

function inferProvider(project = {}, options = {}) {
  return canonicalProviderId(options.sourceProvider || project.source || project.provider || project.discoverySource || "unknown");
}

function flattenObject(object = {}, prefix = "", output = []) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return output;
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, path, output);
    } else {
      output.push({ sourcePath: path, sourceField: key, rawValue: value });
    }
  }
  return output;
}

function comparable(value = "") {
  return String(value || "").replace(/[_\-\s]+/g, "").toLowerCase();
}

function isExplicitAlias(sourcePath = "", sourceField = "", aliases = []) {
  const pathComparable = comparable(sourcePath);
  const fieldComparable = comparable(sourceField);
  return aliases.some((alias) => {
    const aliasComparable = comparable(alias);
    return aliasComparable === pathComparable || aliasComparable === fieldComparable;
  });
}

function confidenceTypeForPath(sourcePath = "", aliases = [], provider = "unknown") {
  const exact = aliases.some((alias) => alias === sourcePath);
  if (exact && sourcePath.includes(".")) return "STRUCTURAL_ALIAS";
  if (exact) return provider === "unknown" ? "EXACT_ALIAS" : "PROVIDER_ALIAS";
  if (isExplicitAlias(sourcePath, fieldNameFromPath(sourcePath), aliases)) {
    return sourcePath.includes(".") ? "STRUCTURAL_ALIAS" : "EXACT_ALIAS";
  }
  return null;
}

function fieldProvenance(project = {}, path = "") {
  return project.fieldProvenance?.[path] || project.fieldProvenance?.[fieldNameFromPath(path)] || {};
}

function rejectRecord({
  canonicalField,
  sourcePath,
  rawValue,
  provider,
  reason,
  aliases,
  sourceTimestamp: timestamp,
} = {}) {
  return buildAliasAuditRecord({
    canonicalField,
    canonicalValue: null,
    rawValue,
    sourceField: fieldNameFromPath(sourcePath),
    sourcePath,
    sourceProvider: provider,
    sourceTimestamp: timestamp,
    sourceUnit: null,
    canonicalUnit: null,
    conversionApplied: "none",
    normalizationRule: reason,
    confidence: 0,
    validationStatus: "REJECTED_ALIAS",
    conflicts: [],
    alternativesConsidered: aliases,
  });
}

function validateAddressValue(value, canonicalField, chain) {
  const state = classifyAddressState(value, chain);
  const normalized = canonicalField === "poolAddress"
    ? normalizePoolAddress(value, chain)
    : normalizeTokenAddress(value, chain);
  return {
    value: normalized,
    status: normalized ? "VALID" : "INVALID",
    reason: state.reason,
  };
}

function normalizeValue(value, canonicalField, project, options = {}) {
  const chain = canonicalField === "chain"
    ? normalizeChainId(value)
    : options.resolvedChain || normalizeChainId(project.chain || project.chainId || project.network || project.finalChain);

  if (canonicalField === "chain") {
    return {
      value: chain,
      validationStatus: chain ? "VALID" : "INVALID",
      normalizationRule: "strict-chain-registry",
    };
  }

  if (ADDRESS_FIELDS.has(canonicalField)) {
    const field = String(options.sourceField || "").toLowerCase();
    if (
      canonicalField === "tokenAddress" &&
      ["mint", "mintaddress", "tokenmint", "splmint"].includes(field.replace(/[_\-\s]+/g, "")) &&
      ["ethereum", "base", "bsc", "arbitrum", "polygon", "optimism", "avalanche"].includes(chain)
    ) {
      return {
        value: null,
        validationStatus: "REJECTED_ALIAS",
        normalizationRule: "mint-alias-not-compatible-with-evm-chain",
        validationReason: "Mint terminology is only accepted as a token contract on compatible non-EVM chains.",
      };
    }
    const result = validateAddressValue(value, canonicalField, chain);
    return {
      value: result.value,
      validationStatus: result.status,
      normalizationRule: `${canonicalField}-chain-aware-address`,
      validationReason: result.reason,
    };
  }

  if (BOOLEAN_FIELDS.has(canonicalField)) {
    const provenance = fieldProvenance(project, options.sourcePath);
    const normalized = normalizeBooleanVocabulary(value, {
      tested: provenance.tested || provenance.sourceActuallyTested || project.sourceActuallyTested,
      verificationStatus: provenance.verificationStatus || project.verificationStatus,
    });
    return {
      value: normalized.value,
      validationStatus: normalized.value === null ? "UNKNOWN" : "VALID",
      normalizationRule: `boolean-vocabulary:${normalized.status}`,
      validationReason: normalized.reason || null,
      sourceUnit: null,
      canonicalUnit: "boolean",
      conversionApplied: "none",
    };
  }

  if (STATUS_FIELDS.has(canonicalField)) {
    return {
      value: normalizeStatusVocabulary(value),
      validationStatus: "VALID",
      normalizationRule: "status-vocabulary",
      sourceUnit: null,
      canonicalUnit: "status",
      conversionApplied: "none",
    };
  }

  if (NUMERIC_FIELDS.has(canonicalField)) {
    const sourcePath = String(options.sourcePath || "");
    const sourceField = String(options.sourceField || "");
    const provider = inferProvider(project, options);
    const profile = providerProfile(provider);
    if (
      canonicalField === "liquidityUsd" &&
      (UNSAFE_TOKEN_LIQUIDITY_CONTEXT.test(parentPath(sourcePath)) ||
        (profile.family === "protocol-tvl" && !/\b(pool|pair|dex|market|reserve)\b/i.test(sourcePath)))
    ) {
      return {
        value: null,
        validationStatus: "REJECTED_ALIAS",
        normalizationRule: "protocol-tvl-is-not-token-liquidity",
        validationReason: "Protocol, staking, bridge, lending, treasury, or app TVL cannot prove executable token liquidity.",
      };
    }
    if (canonicalField === "orderBookDepthUsd" && /\b(volume|turnover)\b/i.test(sourceField)) {
      return {
        value: null,
        validationStatus: "REJECTED_ALIAS",
        normalizationRule: "volume-is-not-order-book-depth",
        validationReason: "Daily volume cannot prove order-book depth.",
      };
    }
    if (canonicalField === "holderCount" && /token.?accounts?/i.test(sourceField) && !options.allowTokenAccountsAsHolders) {
      return {
        value: null,
        validationStatus: "REJECTED_ALIAS",
        normalizationRule: "token-accounts-not-unique-holders",
        validationReason: "Token accounts do not automatically equal unique holder wallets.",
      };
    }
    const normalized = normalizeUnitValue(value, canonicalField, options.sourceUnit || null);
    return {
      value: normalized.value,
      validationStatus: normalized.value === null ? "INVALID" : "VALID",
      normalizationRule: normalized.conversionApplied,
      sourceUnit: normalized.sourceUnit,
      canonicalUnit: normalized.canonicalUnit,
      conversionApplied: normalized.conversionApplied,
    };
  }

  if (canonicalField === "marketPair") {
    const parsed = parseMarketPair(value);
    if (!parsed) {
      return {
        value,
        validationStatus: MARKET_PAIR_SEPARATORS.test(String(value || "")) ? "VALID" : "UNKNOWN",
        normalizationRule: "market-pair-unparsed",
      };
    }
    return {
      value: `${parsed.baseAsset}/${parsed.quoteAsset}`,
      validationStatus: parsed.spotOrDerivative === "SPOT" ? "VALID" : "PARTIAL",
      normalizationRule: parsed.spotOrDerivative === "SPOT" ? "market-pair-spot-parser" : "market-pair-derivative-preserved",
      parsedMarketPair: parsed,
    };
  }

  return {
    value,
    validationStatus: hasRawValue(value) ? "VALID" : "INVALID",
    normalizationRule: "semantic-alias",
  };
}

export function collectAliasCandidates(project = {}, canonicalField = "", options = {}) {
  const aliases = aliasesForCanonicalField(canonicalField);
  const provider = inferProvider(project, options);
  const profile = providerProfile(provider);
  const resolvedChain = canonicalField === "chain"
    ? null
    : resolveCanonicalAliases(project, { fields: ["chain"], sourceProvider: provider, shallow: true }).resolved.chain ?? null;

  const explicitCandidates = aliases
    .map((sourcePath) => ({
      sourcePath,
      sourceField: fieldNameFromPath(sourcePath),
      rawValue: getPath(project, sourcePath),
      confidenceType: confidenceTypeForPath(sourcePath, aliases, provider) || "EXACT_ALIAS",
    }))
    .filter((candidate) => hasRawValue(candidate.rawValue));

  const explicitPaths = new Set(explicitCandidates.map((candidate) => candidate.sourcePath));
  const semanticFields = options._semanticFields || (options.disableSemanticScan ? [] : flattenObject(project));
  const discoveredCandidates = options.disableSemanticScan
    ? []
    : semanticFields
        .filter((candidate) => !explicitPaths.has(candidate.sourcePath) && hasRawValue(candidate.rawValue))
        .map((candidate) => {
          const direct = confidenceTypeForPath(candidate.sourcePath, aliases, provider);
          if (direct) return { ...candidate, confidenceType: direct };
          const fuzzy = fuzzyAliasMatch(candidate.sourceField, canonicalField);
          if (fuzzy.matched) {
            return {
              ...candidate,
              confidenceType: fuzzy.confidenceType,
              detectedAlias: fuzzy.matchedTerm,
            };
          }
          return null;
        })
        .filter(Boolean);

  const candidates = [...explicitCandidates, ...discoveredCandidates];
  const records = [];

  for (const candidate of candidates) {
    if (candidate.confidenceType === "FUZZY_ALIAS" && IDENTITY_CRITICAL_FIELDS.has(canonicalField)) {
      records.push(rejectRecord({
        canonicalField,
        sourcePath: candidate.sourcePath,
        rawValue: candidate.rawValue,
        provider,
        reason: "identity-critical-fuzzy-disabled",
        aliases,
        sourceTimestamp: sourceTimestamp(project, candidate.sourcePath),
      }));
      continue;
    }

      const normalized = normalizeValue(candidate.rawValue, canonicalField, project, {
        ...options,
        sourcePath: candidate.sourcePath,
        sourceField: candidate.sourceField,
        resolvedChain,
      });
      const confidenceType = normalized.validationStatus === "REJECTED_ALIAS" ? "REJECTED_ALIAS" : candidate.confidenceType;
      records.push(buildAliasAuditRecord({
        canonicalField,
        canonicalValue: normalized.value,
        rawValue: candidate.rawValue,
        sourceField: candidate.sourceField,
        sourcePath: candidate.sourcePath,
        providerFieldName: candidate.sourceField,
        detectedAlias: candidate.detectedAlias || candidate.sourceField,
        sourceProvider: provider,
        sourceTimestamp: sourceTimestamp(project, candidate.sourcePath),
        sourceUnit: normalized.sourceUnit || options.sourceUnit || null,
        canonicalUnit: normalized.canonicalUnit || null,
        conversionApplied: normalized.conversionApplied || "none",
        normalizationRule: `${confidenceType}:${normalized.normalizationRule}`,
        confidence: aliasConfidenceValue(confidenceType, profile.authority),
        validationStatus: normalized.validationStatus,
        conflicts: [],
        alternativesConsidered: aliases,
        parsedMarketPair: normalized.parsedMarketPair,
        validationReason: normalized.validationReason,
      }));
  }

  return records;
}

export function resolveCanonicalAliases(project = {}, options = {}) {
  const fields = options.fields || [...new Set([...Object.keys(CANONICAL_FIELD_ALIAS_REGISTRY), ...Object.keys(EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY)])];
  const semanticFields = options.disableSemanticScan ? [] : flattenObject(project);
  const resolved = {};
  const provenance = {};
  const conflicts = {};
  const audits = [];

  for (const field of fields) {
    const candidates = collectAliasCandidates(project, field, { ...options, _semanticFields: semanticFields });
    const { winner, conflicts: fieldConflicts, status } = resolveFieldConflict(candidates);
    if (winner) {
      resolved[field] = winner.canonicalValue;
      provenance[field] = { ...winner, conflicts: fieldConflicts, conflictStatus: status };
      audits.push({ ...winner, conflicts: fieldConflicts, conflictStatus: status });
      if (fieldConflicts.length) conflicts[field] = fieldConflicts;
    } else if (!options.shallow) {
      resolved[field] = null;
    }
  }

  if (resolved.tokenAddress && resolved.poolAddress && resolved.tokenAddress === resolved.poolAddress) {
    conflicts.tokenAddress = [
      ...(conflicts.tokenAddress || []),
      { canonicalField: "tokenAddress", canonicalValue: resolved.tokenAddress, reason: "Token address equals pool address." },
    ];
    resolved.tokenAddress = null;
    if (provenance.tokenAddress) provenance.tokenAddress.validationStatus = "INVALID";
  }

  return {
    resolved,
    provenance,
    conflicts,
    audits,
    aliasResolutionSummary: {
      requestedFields: fields.length,
      resolvedFields: Object.values(resolved).filter((value) => value !== null && value !== undefined && value !== "").length,
      conflictFields: Object.keys(conflicts),
    },
  };
}

export function applyCanonicalAliases(project = {}, options = {}) {
  const resolution = resolveCanonicalAliases(project, options);
  return {
    ...project,
    ...Object.fromEntries(
      Object.entries(resolution.resolved).filter(([, value]) => value !== null && value !== undefined && value !== "")
    ),
    canonicalAliases: resolution.resolved,
    canonicalAliasProvenance: resolution.provenance,
    canonicalAliasConflicts: resolution.conflicts,
    aliasResolutionAudit: resolution.audits,
    aliasResolutionSummary: resolution.aliasResolutionSummary,
  };
}

export function canonicalValue(project = {}, field = "") {
  const canonicalField = canonicalFieldForAlias(field) || field;
  if (project.canonicalAliases && hasOwn(project.canonicalAliases, canonicalField)) {
    return project.canonicalAliases[canonicalField];
  }
  if (hasOwn(project, canonicalField) && hasRawValue(project[canonicalField])) {
    return project[canonicalField];
  }
  return resolveCanonicalAliases(project, { fields: [canonicalField], disableSemanticScan: true }).resolved[canonicalField] ?? null;
}
