import {
  classifyAddressState,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { canonicalProviderId, providerProfile } from "./providerVocabularyRegistry.js";
import {
  CANONICAL_FIELD_ALIAS_REGISTRY,
  aliasesForCanonicalField,
  canonicalFieldForAlias,
} from "./canonicalFieldAliasRegistry.js";
import { normalizeUnitValue } from "./unitNormalizationRegistry.js";
import { resolveFieldConflict } from "./fieldConflictResolver.js";
import { buildAliasAuditRecord } from "./aliasResolutionAudit.js";

const ADDRESS_FIELDS = new Set(["tokenAddress", "poolAddress"]);
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
]);

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
    const result = validateAddressValue(value, canonicalField, chain);
    return {
      value: result.value,
      validationStatus: result.status,
      normalizationRule: `${canonicalField}-chain-aware-address`,
      validationReason: result.reason,
    };
  }

  if (NUMERIC_FIELDS.has(canonicalField)) {
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

  return aliases
    .map((sourcePath) => ({
      sourcePath,
      sourceField: sourcePath.split(".").at(-1),
      rawValue: getPath(project, sourcePath),
    }))
    .filter((candidate) => hasRawValue(candidate.rawValue))
    .map((candidate) => {
      const normalized = normalizeValue(candidate.rawValue, canonicalField, project, {
        ...options,
        resolvedChain,
      });
      return buildAliasAuditRecord({
        canonicalField,
        canonicalValue: normalized.value,
        sourceField: candidate.sourceField,
        sourcePath: candidate.sourcePath,
        sourceProvider: provider,
        sourceTimestamp: sourceTimestamp(project, candidate.sourcePath),
        sourceUnit: normalized.sourceUnit || options.sourceUnit || null,
        canonicalUnit: normalized.canonicalUnit || null,
        conversionApplied: normalized.conversionApplied || "none",
        normalizationRule: normalized.normalizationRule,
        confidence: Math.min(100, Math.max(0, Number(profile.authority || 50))),
        validationStatus: normalized.validationStatus,
        conflicts: [],
        alternativesConsidered: aliases,
      });
    });
}

export function resolveCanonicalAliases(project = {}, options = {}) {
  const fields = options.fields || Object.keys(CANONICAL_FIELD_ALIAS_REGISTRY);
  const resolved = {};
  const provenance = {};
  const conflicts = {};
  const audits = [];

  for (const field of fields) {
    const candidates = collectAliasCandidates(project, field, options);
    const { winner, conflicts: fieldConflicts, status } = resolveFieldConflict(candidates);
    if (winner) {
      resolved[field] = winner.canonicalValue;
      provenance[field] = { ...winner, conflicts: fieldConflicts };
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
  return resolveCanonicalAliases(project, { fields: [canonicalField] }).resolved[canonicalField] ?? null;
}
