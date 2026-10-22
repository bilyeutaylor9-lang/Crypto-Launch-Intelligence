import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { applyCanonicalAliases, canonicalValue } from "../data/canonicalAliasResolver.js";
import { canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { buildTargetedEnrichmentPlan } from "../data/targetedEnrichmentRouter.js";
import { getEngineContracts } from "../kernel/engineContractManifest.js";
import { evaluateEngineDataReadiness } from "./engineDataReadinessEngine.js";
import { analyzeValueOfInformation } from "./valueOfInformationEngine.js";
import { createEvidenceHydrationSchedule } from "../data/evidenceHydrationSchedule.js";
import { decisionProofAssessment } from "../kernel/evidenceFunnelSummary.js";
import { hasKnownTransferRestriction } from "../execution/routeTruthV2.js";
import { BLOCKSCOUT_DEFAULTS, evmChainId } from "../data/security/securityEvidenceUtils.js";
import { getSourceById } from "../config/sourceManifest.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import {
  createActiveEvidenceExecutionState,
  resolveActiveEvidenceRequestBudget,
  executeActiveEvidenceProviderRequests,
  hasExactExecutionRecoveryIdentity,
  mapWithBoundedConcurrency,
  summarizeActiveEvidenceExecutionState,
} from "../data/activeEvidenceProviderExecutor.js";
import {
  recoveryDispositionForField,
  sourceFamilyForField,
} from "../data/enrichmentSourceRegistry.js";

const GOPLUS_SECURITY_CHAINS = new Set(getSourceById("goplus").chains);
const RECOVERY_PRIORITY = getEngineContracts().find(contract => contract.id === "activeEvidenceRecovery").priority;
const RECOVERY_CONTRACTS = new Map(getEngineContracts().filter(contract =>
  contract.priority < RECOVERY_PRIORITY &&
  !["dataStarvationRootCause", "valueOfInformation", "starvationRescue"].includes(contract.id)
).map(contract => [contract.id, contract]));

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value = "") {
  return String(value ?? "").trim();
}

function first(values = []) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function positiveNumber(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function booleanEvidence(values = []) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function timestampEvidence(values = []) {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const timestamp = new Date(raw).getTime();
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function chainOf(project = {}) {
  return normalizeChainId(
    first([
      project.chain,
      project.chainId,
      project.network,
      project.baseToken?.chain,
      project.rawCandidate?.chain,
      project.marketData?.chain,
      canonicalValue(project, "chain"),
    ])
  );
}

function tokenAddressOf(project = {}, chain = null) {
  const raw = first([
    project.tokenAddress,
    project.contractAddress,
    project.address,
    project.canonicalAddress,
    project.baseToken?.address,
    project.rawCandidate?.tokenAddress,
    project.rawCandidate?.contractAddress,
    project.rawCandidate?.address,
    project.marketData?.tokenAddress,
    project.executionProofRecoveryRoute?.tokenAddress,
    project.executionProofRecoveryRoute?.contract,
    project.canonicalExecutionRoute?.tokenAddress,
    project.canonicalExecutionRoute?.contract,
    canonicalValue(project, "tokenAddress"),
  ]);
  return normalizeTokenAddress(raw, chain);
}

function poolAddressOf(project = {}, chain = null) {
  const raw = first([
    project.poolAddress,
    project.pairAddress,
    project.primaryPool,
    project.pair?.address,
    project.rawCandidate?.poolAddress,
    project.rawCandidate?.pairAddress,
    project.marketData?.poolAddress,
    project.executionProofRecoveryRoute?.poolAddress,
    project.canonicalExecutionRoute?.poolAddress,
    canonicalValue(project, "poolAddress"),
  ]);
  return normalizePoolAddress(raw, chain);
}

function stringEvidence(values = []) {
  const value = first(values);
  return value ? text(value) : null;
}

function recoveredValueFor(project = {}, field = "") {
  const chain = chainOf(project);

  switch (field) {
    case "chain":
      return chain;
    case "tokenAddress":
      return tokenAddressOf(project, chain);
    case "poolAddress":
      return poolAddressOf(project, chain);
    case "priceUsd":
      return positiveNumber([project.priceUsd, project.price, project.marketData?.priceUsd, project.rawCandidate?.priceUsd, canonicalValue(project, "priceUsd")]);
    case "liquidityUsd":
    case "stableExitLiquidityUsd":
      return positiveNumber([project.liquidityUsd, project.dexLiquidityUsd, project.liquidity?.usd, project.marketData?.liquidityUsd, project.rawCandidate?.liquidityUsd, canonicalValue(project, "liquidityUsd")]);
    case "volume24hUsd":
      return positiveNumber([project.volume24hUsd, project.volume24h, project.volume?.h24, project.marketData?.volume24h, project.rawCandidate?.volume24h, canonicalValue(project, "volume24hUsd")]);
    case "circulatingMarketCapUsd":
      return positiveNumber([project.circulatingMarketCapUsd, project.circulatingMarketCap, project.verifiedMarketCap, project.marketCap, project.marketData?.marketCap, canonicalValue(project, "circulatingMarketCapUsd")]);
    case "fullyDilutedValuationUsd":
      return positiveNumber([project.fullyDilutedValuationUsd, project.fullyDilutedValueUsd, project.fdv, project.fullyDilutedValue, project.marketData?.fdv, canonicalValue(project, "fullyDilutedValuationUsd")]);
    case "estimatedMarketCapUsd":
      return positiveNumber([project.estimatedMarketCapUsd, project.estimatedMarketCap, project.marketCap, project.rawCandidate?.marketCap, canonicalValue(project, "estimatedMarketCapUsd")]);
    case "uniqueBuyers24h":
      return positiveNumber([project.uniqueBuyers24h, project.buyers24h, project.clusterAdjustedUniqueBuyers, project.clusterAdjustedUniqueBuyers24h, canonicalValue(project, "uniqueBuyers24h")]);
    case "holderCount":
      return positiveNumber([project.holderCount, project.holders, project.marketData?.holderCount, canonicalValue(project, "holderCount")]);
    case "githubRepo":
      return stringEvidence([project.githubRepo, project.github, project.githubUrl, project.repository, canonicalValue(project, "githubRepo")]);
    case "website":
      return stringEvidence([project.website, project.projectUrl, project.links?.website, project.links?.homepage?.[0], canonicalValue(project, "website")]);
    case "honeypotDetected":
      return booleanEvidence([project.honeypotDetected, project.securityEvidence?.honeypotDetected, canonicalValue(project, "honeypotDetected")]);
    case "sellRestricted":
      return booleanEvidence([project.sellRestricted, project.securityEvidence?.sellRestricted, canonicalValue(project, "sellRestricted")]);
    case "contractVerified":
      return booleanEvidence([project.contractVerified, project.securityEvidence?.contractVerified, canonicalValue(project, "contractVerified")]);
    case "ownerRenounced":
      return booleanEvidence([project.ownerRenounced, project.securityEvidence?.ownerRenounced, canonicalValue(project, "ownerRenounced")]);
    case "mintAuthorityEnabled":
      return booleanEvidence([project.mintAuthorityEnabled, project.securityEvidence?.mintAuthorityEnabled, canonicalValue(project, "mintAuthorityEnabled")]);
    case "purchaseRouteConfirmed":
      return project.buyQuoteVerified === true || project.executionProofRecoveryRoute?.buyQuoteVerified === true ? true : null;
    case "sellRouteAvailable":
      return project.sellQuoteVerified === true || project.executionProofRecoveryRoute?.sellQuoteVerified === true ? true : null;
    case "quoteTimestamp":
      return timestampEvidence([project.quoteTimestamp, project.executionProofRecoveryRoute?.quoteTimestamp, project.routeQuoteTimestamp, canonicalValue(project, "quoteTimestamp")]);
    default:
      return canonicalValue(project, field) ?? null;
  }
}

function applyRecoveredField(project = {}, field = "", value = null) {
  if (value === null || value === undefined || value === "") return project;
  const next = { ...project };

  if (field === "chain") {
    next.chain = value;
    next.chainId = next.chainId || value;
  } else if (field === "tokenAddress") {
    next.tokenAddress = value;
    next.contractAddress = next.contractAddress || value;
    next.address = next.address || value;
  } else if (field === "poolAddress") {
    next.poolAddress = value;
    next.pairAddress = next.pairAddress || value;
  } else if (field === "volume24hUsd") {
    next.volume24hUsd = value;
    next.volume24h = next.volume24h ?? value;
  } else if (field === "circulatingMarketCapUsd") {
    next.circulatingMarketCapUsd = value;
    next.marketCap = next.marketCap ?? value;
  } else if (field === "fullyDilutedValuationUsd") {
    next.fullyDilutedValuationUsd = value;
    next.fdv = next.fdv ?? value;
    next.fullyDilutedValue = next.fullyDilutedValue ?? value;
  } else if (field === "stableExitLiquidityUsd") {
    next.stableExitLiquidityUsd = value;
    next.liquidityUsd = next.liquidityUsd ?? value;
  } else {
    next[field] = value;
  }

  return next;
}

function localRecoveryProvenance(project = {}, field = "") {
  const existing =
    project.fieldProvenance?.[field] ||
    project.canonicalAliasProvenance?.[field] ||
    {};
  return {
    value: recoveredValueFor(project, field),
    source: existing.source || existing.sourceProvider || project.source || "existing-provider-observation",
    sourceTimestamp:
      existing.sourceTimestamp ||
      existing.observedAt ||
      project.sourceTimestamp ||
      project.updatedAt ||
      project.lastUpdatedAt ||
      project.discoveredAt ||
      null,
    confidence: Number(existing.confidence || project.sourceReliabilityScore || 65) > 1
      ? Number(existing.confidence || project.sourceReliabilityScore || 65) / 100
      : Number(existing.confidence || 0.65),
    verificationStatus:
      existing.verificationStatus ||
      existing.validationStatus ||
      "RECOVERED_EXISTING_OBSERVATION",
    recoveryRun: true,
  };
}

function attachFieldProvenance(project = {}, field = "", record = {}) {
  return {
    ...project,
    fieldProvenance: {
      ...(project.fieldProvenance || {}),
      [field]: {
        ...(project.fieldProvenance?.[field] || {}),
        ...record,
        value: record.value,
        recoveryRun: true,
      },
    },
  };
}

function candidatePriority(project = {}, index = 0) {
  const eligibleBoost = project.starvationRescueEligible ? 25 : 0;
  const routeBoost = (project.dataStarvationBlockingExecutionCount || 0) * 4;
  const researchBoost = Math.min(20, num(project.earlyAsymmetryResearchPriorityScore) / 5);
  const voiBoost = num(project.valueOfInformationScore);
  return eligibleBoost + routeBoost + researchBoost + voiBoost - index * 0.0001;
}

function isDeepCandidate(project = {}) {
  if (project.deepEvaluationState === "DEFERRED_BEFORE_DEEP") return false;
  if (project.deepEvaluationDeferred === true) return false;
  if (project.deepEvaluationSelected === false) return false;
  return true;
}

function recoveryWaveForField(field = "", item = {}) {
  if (field === "holderAddresses" && item.cheapHolderMetadataOnly === true) return "WAVE1";
  const family = sourceFamilyForField(field);
  if (
    ["chain", "tokenAddress", "poolAddress", "priceUsd", "liquidityUsd", "stableExitLiquidityUsd", "volume24hUsd", "circulatingMarketCapUsd", "fullyDilutedValuationUsd", "estimatedMarketCapUsd", "buyTransactions24h", "sellTransactions24h", "creatorAddress", "deployerAddress", "creator", "deployer", "contractVerified", "honeypotDetected", "sellRestricted"].includes(field)
  ) return "WAVE1";
  if (["WALLETS", "DEPLOYER", "SECURITY"].includes(family)) return "WAVE2";
  if (family === "EXECUTION") return "WAVE3";
  return null;
}

function recoveryRouteType(project = {}) {
  const types = [project.executionProof?.routeType, project.canonicalExecutionRoute?.routeType,
    project.routeType, project.executionProofRecoveryRoute?.routeType].map((value) => text(value).toUpperCase());
  if (types.includes("CEX")) return "CEX";
  const observed = types.find((value) => value && value !== "UNKNOWN") || types.find(Boolean) || "";
  // This selects an acquisition provider, not a verified route or venue.
  return observed === "UNKNOWN" && chainOf(project) ? "DEX" : observed;
}

function executionProofRecoveryItems(project = {}, options = {}) {
  const proof = project.executionProof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || !Object.keys(proof).length) return [];
  const assessment = decisionProofAssessment(project);
  if (assessment.conclusivelyRejected || !assessment.missingFields.some((field) =>
    ["BUY_QUOTE", "SELL_QUOTE", "QUOTE_FRESHNESS", "ROUTE_DEPTH", "VERIFIED_SLIPPAGE"].includes(field))) return [];
  const routeType = recoveryRouteType(project);
  if (routeType === "CEX" && text(proof.routeType).toUpperCase() !== "CEX") return [];
  const recovery = options.executionRecovery || options.executionProofRecovery || {};
  const keyedProviderConfigured = chainOf(project) === "solana"
    ? Boolean(recovery.jupiterApiKey || process.env.JUPITER_API_KEY)
    : Boolean(recovery.zeroxApiKey || process.env.ZEROX_API_KEY);
  const freeOnly = options.freeOnly ?? (process.env.FREE_ONLY_MODE === "true" || !keyedProviderConfigured);
  return buildTargetedEnrichmentPlan(["purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "slippagePct"].map((field) => ({
    canonicalField: field, rootCause: "EXECUTION_EVIDENCE_MISSING", evidenceClass: "CORE", blockingExecution: true,
    requiresFreshObservation: true, decisionImportance: 1, currentUncertainty: 1, expectedRankChange: 1,
  })), { chain: chainOf(project), routeType, freeOnly }).items;
}

function poolIdentityRecoveryItems(project = {}, options = {}) {
  const proof = project.executionProof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || !Object.keys(proof).length ||
      recoveryRouteType(project) === "CEX" ||
      decisionProofAssessment(project).conclusivelyRejected) return [];
  const identities = [project, project.rawCandidate || {}, project.marketData || {},
    project.canonicalExecutionRoute || {}, project.executionProofRecoveryRoute || {}, proof];
  const supplied = (value) => value !== undefined && value !== null && value !== "";
  const pools = identities.flatMap((item) => [item.poolAddress, item.pairAddress, item.primaryPool,
    item.primaryTradablePool, item.finalPairAddress, item.verifiedPairAddress, item.pair?.address]).filter(supplied);
  if (pools.length) return [];
  const chain = chainOf(project);
  const token = tokenAddressOf(project, chain);
  if (!chain || !token || /^0x0{40}$/.test(token)) return [];
  const chains = identities.flatMap((item) => [item.chain, item.chainId, item.network,
    item.canonicalChain, item.canonicalChainId, item.finalChain, item.finalChainId,
    item.normalizedChain, item.baseToken?.chain]).filter(supplied);
  const addresses = identities.flatMap((item) => [item.tokenAddress, item.contractAddress, item.address,
    item.canonicalAddress, item.finalContractAddress, item.verifiedContractAddress,
    item.baseTokenAddress, item.baseToken?.address]).filter(supplied);
  if (!chains.every((value) => normalizeChainId(value) === chain) ||
      !addresses.every((value) => normalizeTokenAddress(value, chain) === token)) return [];
  return buildTargetedEnrichmentPlan([{
    canonicalField: "poolAddress", rootCause: "EXACT_POOL_IDENTITY_MISSING", evidenceClass: "CORE",
    blockingExecution: true, requiresFreshObservation: true, decisionImportance: 1,
    currentUncertainty: 1, expectedRankChange: 1,
  }], { chain, routeType: proof.routeType, freeOnly: options.freeOnly ?? true }).items;
}

function authorityProofRecoveryItems(project = {}, options = {}, beforeExecution = false) {
  const proof = project.executionProof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || chainOf(project) !== "solana" ||
      (proof.authorityEvidenceVerified === true && proof.authoritySafetyClean === false)) return [];
  const assessment = decisionProofAssessment(project);
  if (assessment.conclusivelyRejected || (!beforeExecution && !assessment.missingFields.includes("TOKEN_AUTHORITY"))) return [];

  const mint = tokenAddressOf(project, "solana");
  const identities = [project, project.rawCandidate || {}, project.marketData || {},
    project.canonicalExecutionRoute || {}, project.executionProofRecoveryRoute || {}];
  const chains = identities.flatMap((item) => [item.chain, item.chainId, item.network, item.canonicalChain,
    item.finalChain, item.baseToken?.chain]).filter((value) => text(value));
  const addresses = identities.flatMap((item) => [item.tokenAddress, item.contractAddress, item.address,
    item.canonicalAddress, item.finalContractAddress, item.baseToken?.address]).filter((value) => text(value));
  if (!mint || !chains.every((value) => normalizeChainId(value) === "solana") ||
      !addresses.every((value) => normalizeTokenAddress(value, "solana") === mint)) return [];

  // The raw mint field dispatches the existing collector for both authorities, not a scalar shortcut.
  return buildTargetedEnrichmentPlan([{
    canonicalField: "mintAuthorityEnabled", rootCause: "TOKEN_AUTHORITY_EVIDENCE_MISSING",
    evidenceClass: "CORE", blockingExecution: true, requiresFreshObservation: true, requiresAuthorityPair: true,
    ...(beforeExecution ? { requiresMintAccountEvidence: true } : {}),
  }], { chain: "solana", routeType: proof.routeType, freeOnly: options.freeOnly ?? true }).items;
}

function securityProofRecoveryItems(project = {}, options = {}) {
  const proof = project.executionProof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || !Object.keys(proof).length) return [];
  const assessment = decisionProofAssessment(project);
  if (assessment.conclusivelyRejected || !assessment.missingFields.some((field) =>
    ["SAFETY", "TRANSFER_TAX"].includes(field))) return [];

  const chain = chainOf(project);
  const token = tokenAddressOf(project, chain);
  const evmSecuritySupported = Boolean(evmChainId(chain)) && GOPLUS_SECURITY_CHAINS.has(chain);
  if (!chain || !token || /^0x0{40}$/.test(token) ||
      (chain !== "solana" && !evmSecuritySupported && !BLOCKSCOUT_DEFAULTS[chain])) return [];
  const identities = [project, project.rawCandidate || {}, project.marketData || {},
    project.canonicalExecutionRoute || {}, project.executionProofRecoveryRoute || {}, proof];
  if (identities.some((item) => [item.routeType, item.routeKind].some((value) => text(value).toUpperCase() === "CEX"))) return [];
  const chains = identities.flatMap((item) => [item.chain, item.chainId, item.network, item.canonicalChain,
    item.canonicalChainId, item.finalChain, item.finalChainId, item.baseToken?.chain]).filter((value) => text(value));
  const addresses = identities.flatMap((item) => [item.tokenAddress, item.contractAddress, item.address,
    item.canonicalAddress, item.finalContractAddress, item.baseTokenAddress, item.baseToken?.address]).filter((value) => text(value));
  if (!chains.every((value) => normalizeChainId(value) === chain) ||
      !addresses.every((value) => normalizeTokenAddress(value, chain) === token)) return [];

  const missing = [];
  if (assessment.missingFields.includes("SAFETY")) {
    const fields = chain === "solana" ? ["honeypotDetected", "sellRestricted"]
      : evmSecuritySupported ? ["honeypotDetected", "sellRestricted", "contractVerified"] : ["contractVerified"];
    missing.push(...fields.map((canonicalField) => ({ canonicalField, rootCause: "SAFETY_EVIDENCE_MISSING" })));
  }
  if (evmSecuritySupported && assessment.missingFields.includes("TRANSFER_TAX")) {
    missing.push(...["buyTaxPct", "sellTaxPct"].map((canonicalField) => ({
      canonicalField, rootCause: "TRANSFER_TAX_EVIDENCE_MISSING",
    })));
  }
  // Only raw observations are acquired here; the safety and execution engines own verification.
  return buildTargetedEnrichmentPlan(missing.map((item) => ({
    ...item, evidenceClass: "CORE", blockingExecution: true, requiresFreshObservation: true,
  })), { chain, routeType: proof.routeType, freeOnly: options.freeOnly ?? true }).items;
}

function cheapCoreHolderRecoveryItems(project, items, options) {
  const configured = options.providers || {};
  const customWallet = configured.getBlockscoutWalletEvidence || configured.getWalletEvidence ||
    configured.getRpcWalletEvidence || options.getBlockscoutWalletEvidence || options.getRpcWalletEvidence;
  const customGoPlus = configured.getGoPlusWalletEvidence || configured.getGoPlusSecurityEvidence || options.getGoPlusWalletEvidence;
  if (!(options.useGoPlusWalletFallback ?? (Boolean(customGoPlus) || !customWallet)) ||
      recoveryRouteType(project) === "CEX" || decisionProofAssessment(project).conclusivelyRejected) return [];
  const needs = items.filter(item => item?.recoverable !== false && item?.rootCause !== "NOT_APPLICABLE" &&
    ["wallets", "holderAddresses"].includes(item?.canonicalField || item?.field) &&
    (item.evidenceClass === "CORE" || (!item.evidenceClass &&
      (item.blockingResearch === true || item.blockingExecution === true))));
  if (!needs.length) return [];
  const chain = chainOf(project), token = tokenAddressOf(project, chain);
  if (!evmChainId(chain) || !GOPLUS_SECURITY_CHAINS.has(chain) || !token || /^0x0{40}$/.test(token)) return [];
  const known = [project, project.rawCandidate || {}, project.marketData || {}, project.executionProof || {},
    project.canonicalExecutionRoute || {}, project.executionProofRecoveryRoute || {}];
  const supplied = value => value !== undefined && value !== null && value !== "";
  const chains = known.flatMap(item => [item.chain, item.chainId, item.network, item.canonicalChain,
    item.canonicalChainId, item.finalChain, item.finalChainId, item.normalizedChain, item.baseToken?.chain]).filter(supplied);
  const tokens = known.flatMap(item => [item.tokenAddress, item.contractAddress, item.address, item.canonicalAddress,
    item.finalContractAddress, item.verifiedContractAddress, item.baseTokenAddress, item.baseToken?.address]).filter(supplied);
  if (!chains.every(value => normalizeChainId(value) === chain) ||
      !tokens.every(value => normalizeTokenAddress(value, chain) === token)) return [];
  const env = options.env || process.env;
  const explorerUrl = options.blockscoutBaseUrl || env[`${chain.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BLOCKSCOUT_URL`] ||
    env.BLOCKSCOUT_BASE_URL || BLOCKSCOUT_DEFAULTS[chain];
  const cheapExplorer = (options.useCheapBlockscoutHolderMetadata ?? !(customWallet || customGoPlus)) && Boolean(explorerUrl);
  return buildTargetedEnrichmentPlan([{
    canonicalField: "holderAddresses", rootCause: "CORE_HOLDER_METADATA_MISSING", evidenceClass: "CORE",
    blockingResearch: true, requiresFreshObservation: true,
    valueOfInformationScore: Math.max(...needs.map(item => num(item.valueOfInformationScore || item.estimatedRecoveryValue))),
  }], { chain, routeType: recoveryRouteType(project), freeOnly: true }).items.map(item => ({
    ...item, cheapHolderMetadataOnly: true,
    targetSources: item.targetSources.filter(source => source.source === "GoPlus" ||
      (cheapExplorer && source.source === "block explorers"))
      .map(source => source.source === "block explorers" ? { ...source, cost: 2, metadataOnly: true } : source),
    estimatedRequests: cheapExplorer ? 3 : 1,
  })).filter(item => item.targetSources.length);
}

function requestedPlanItems(project = {}) {
  return [
    ...(Array.isArray(project.targetedEnrichmentPlan?.items) ? project.targetedEnrichmentPlan.items : []),
    ...(Array.isArray(project.starvationRecoveryPlan?.items) ? project.starvationRecoveryPlan.items : []),
    ...(Array.isArray(project.valueOfInformationItems) ? project.valueOfInformationItems : []),
  ];
}

function requiresRecoveryObservation(item = {}) {
  return item.requiresFreshObservation === true || item.requiresAuthorityPair === true ||
    item.requiresMintAccountEvidence === true || ["STALE_DATA", "CONFLICTED_DATA"].includes(item.rootCause);
}

function hasRecoveryValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value !== "number" || Number.isFinite(value);
}

function coreRecoveryItem(item = {}, project = {}) {
  if (item.evidenceClass) return item.evidenceClass === "CORE";
  return item.blockingResearch === true || item.blockingExecution === true || project.coreDataStarved === true ||
    num(project.dataStarvationBlockingResearchCount) > 0 || project.coreMissingEvidence?.length > 0;
}

function proofRecoveryItems(project, options) {
  if (rawRecoveryDisabled(options)) return executionProofRecoveryItems(project, options);
  return [...executionProofRecoveryItems(project, options), ...poolIdentityRecoveryItems(project, options),
    ...authorityProofRecoveryItems(project, options), ...securityProofRecoveryItems(project, options)];
}

function recoveryWaveLimits(options = {}) {
  return {
    WAVE1: Math.max(0, Number(options.wave1Max ?? process.env.ACTIVE_EVIDENCE_WAVE1_MAX ?? 500)),
    WAVE2: Math.max(0, Number(options.wave2Max ?? process.env.ACTIVE_EVIDENCE_WAVE2_MAX ?? 150)),
    WAVE3: Math.max(0, Number(options.wave3Max ?? process.env.ACTIVE_EVIDENCE_WAVE3_MAX ?? 50)),
  };
}

function rawRecoveryDisabled(options) {
  const limits = recoveryWaveLimits(options);
  return limits.WAVE1 === 0 && limits.WAVE2 === 0;
}

function refreshRecoveryAliases(project, fields, observed = false) {
  if (!fields.length) return project;
  const aliased = applyCanonicalAliases(project, { fields, disableSemanticScan: true });
  const next = { ...project,
    canonicalAliases: { ...project.canonicalAliases },
    canonicalAliasProvenance: { ...project.canonicalAliasProvenance },
    canonicalAliasConflicts: { ...project.canonicalAliasConflicts },
  };
  for (const field of fields) {
    if (!observed && Object.hasOwn(next.canonicalAliases, field) &&
        isDeepStrictEqual(next.canonicalAliases[field], aliased.canonicalAliases[field])) continue;
    next.canonicalAliases[field] = aliased.canonicalAliases[field];
    if (aliased.canonicalAliasProvenance[field]) next.canonicalAliasProvenance[field] = aliased.canonicalAliasProvenance[field];
    if (aliased.canonicalAliasConflicts[field]) next.canonicalAliasConflicts[field] = aliased.canonicalAliasConflicts[field];
  }
  return next;
}

function promoteLocalRecoveryInputs(project, options) {
  if (!isDeepCandidate(project)) return { project, recoveredFields: [], attempts: [] };
  const items = [...requestedPlanItems(project), ...proofRecoveryItems(project, options)];
  const fieldOf = item => canonicalFieldForAlias(item.canonicalField || item.field) || item.canonicalField || item.field;
  const freshFields = new Set(items.filter(requiresRecoveryObservation).map(fieldOf));
  const limits = recoveryWaveLimits(options);
  const localItems = items.filter(item => {
    const field = fieldOf(item);
    return item.recoverable !== false && !freshFields.has(field) &&
      limits[recoveryWaveForField(field, item)] > 0 && recoveryDispositionForField(field, {
        applicability: item.rootCause === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : null,
        chain: chainOf(project), routeType: recoveryRouteType(project),
      }) === "RAW_RECOVERABLE";
  });
  const fields = [...new Set(localItems.map(fieldOf))];
  let next = refreshRecoveryAliases(project, fields);
  const recoveredFields = [];
  const attempts = [];
  for (const field of fields) {
    const value = recoveredValueFor(next, field);
    if (!hasRecoveryValue(value)) continue;
    const promoted = applyRecoveredField(next, field, value);
    const rootChanged = Object.keys(promoted).some(key => !isDeepStrictEqual(next[key], promoted[key]));
    const aliasChanged = !isDeepStrictEqual(project.canonicalAliases?.[field], next.canonicalAliases?.[field]);
    if (!rootChanged && !aliasChanged) continue;
    const provenance = localRecoveryProvenance(project, field);
    next = attachFieldProvenance(promoted, field, { ...provenance, value });
    recoveredFields.push(field);
    attempts.push({ field, family: sourceFamilyForField(field), wave: "LOCAL",
      status: "RECOVERED_EXISTING_OBSERVATION", source: provenance.source });
  }
  return { project: refreshRecoveryAliases(next, fields), recoveredFields, attempts };
}

function pendingRecoveryPlanning(project = {}, options = {}) {
  if (rawRecoveryDisabled(options)) return project;
  const items = requestedPlanItems(project);
  if (!items.length || !isDeepCandidate(project)) return project;
  const missing = project.dataStarvationMissingEvidence || [];
  const fieldOf = item => canonicalFieldForAlias(item.canonicalField || item.field) || item.canonicalField || item.field;
  const waitingForProducer = item => item.rootCause === "PIPELINE_STAGE_NOT_RUN" &&
    (item.recomputeAfterRecovery === true || item.recoveryDisposition === "DERIVED_RECOMPUTE" ||
      sourceFamilyForField(fieldOf(item)) === "DERIVED");
  const chain = chainOf(project), routeType = recoveryRouteType(project);
  const rawFields = new Set(items.filter(item => recoveryDispositionForField(fieldOf(item), { chain, routeType }) === "RAW_RECOVERABLE").map(fieldOf));
  const freshFields = new Set([...items, ...proofRecoveryItems(project, options)]
    .filter(requiresRecoveryObservation).map(fieldOf));
  const demandKey = item => `${item.producingEngine}|${fieldOf(item)}|${item.evidenceClass || ""}`;
  const generatedDemands = new Set(missing.filter(item => {
    const contract = RECOVERY_CONTRACTS.get(item.producingEngine);
    return contract && item.evidenceClass === (contract.affectsFinalDecision || contract.canBlockCandidate ? "CORE" : "ADVISORY");
  }).map(demandKey));
  const contracts = [...new Set(missing.filter(item => rawFields.has(fieldOf(item)))
    .map(item => RECOVERY_CONTRACTS.get(item.producingEngine)).filter(Boolean))];
  const fields = [...new Set([
    ...rawFields,
    ...contracts.flatMap(contract => (contract.inputContract?.requiredAny || []).flat())
      .map(field => canonicalFieldForAlias(field) || field),
  ].filter(Boolean))];
  // Planning refreshes aliases, never the raw identity or risk fields used by admission gates.
  const next = { ...refreshRecoveryAliases(project, fields) };
  const requiredFields = new Map();
  const unresolvedFields = new Map();
  for (const contract of contracts) {
    requiredFields.set(contract.id, new Set((contract.inputContract?.requiredAny || []).flat()
      .map(field => canonicalFieldForAlias(field) || field)));
    if (![...requiredFields.get(contract.id)].some(field => hasRecoveryValue(recoveredValueFor(next, field)))) continue;
    const readiness = evaluateEngineDataReadiness(next, contract);
    unresolvedFields.set(contract.id, new Set(readiness.missingRequiredGroups.flatMap(group => group.canonicalFields)));
  }
  const pending = item => {
    if (requiresRecoveryObservation(item) || item.rootCause === "NOT_APPLICABLE") return true;
    const field = fieldOf(item);
    if (freshFields.has(field)) return true;
    // Only contract-generated alternatives retire with their required-any group.
    if (generatedDemands.has(demandKey(item)) && requiredFields.get(item.producingEngine)?.has(field) &&
        unresolvedFields.has(item.producingEngine) && !unresolvedFields.get(item.producingEngine).has(field)) return false;
    if (!rawFields.has(field)) return true;
    return !hasRecoveryValue(recoveredValueFor(next, field));
  };
  const planningRecord = item => waitingForProducer(item)
    ? { ...item, blockingResearch: false, blockingExecution: false, recoverable: false,
      recoveryDisposition: "DERIVED_RECOMPUTE", recomputeAfterRecovery: true } : item;
  for (const key of ["targetedEnrichmentPlan", "starvationRecoveryPlan"]) {
    if (Array.isArray(project[key]?.items)) next[key] = { ...project[key], items: project[key].items.filter(pending).map(planningRecord) };
  }
  if (Array.isArray(project.valueOfInformationItems)) next.valueOfInformationItems = project.valueOfInformationItems.filter(pending).map(planningRecord);
  for (const key of ["dataStarvationMissingEvidence", "coreMissingEvidence", "advisoryMissingEvidence"]) {
    if (Array.isArray(project[key])) next[key] = project[key].filter(pending).map(planningRecord);
  }
  // Recovery is before late producers: retain recompute work, not a premature FINAL core audit.
  if (Array.isArray(next.coreMissingEvidence)) next.coreMissingEvidence = next.coreMissingEvidence.filter(item => !waitingForProducer(item));
  const remaining = requestedPlanItems(next);
  if (remaining.length !== items.length || (Array.isArray(project.dataStarvationMissingEvidence) &&
      (next.dataStarvationMissingEvidence.length !== missing.length || missing.some(waitingForProducer)))) {
    const unique = [...new Map(remaining.filter(item => rawFields.has(fieldOf(item)))
      .map(item => [demandKey(item), item])).values()];
    const voi = analyzeValueOfInformation({ ...next, dataStarvationMissingEvidence: unique }, options);
    next.valueOfInformationScore = voi.valueOfInformationScore;
    if (Array.isArray(project.dataStarvationMissingEvidence)) {
      const core = next.dataStarvationMissingEvidence.filter(item => item.rootCause !== "NOT_APPLICABLE" &&
        item.evidenceClass === "CORE" && !waitingForProducer(item));
      next.coreDataStarved = project.coreDataStarved === true && core.length > 0;
      next.dataStarvationBlockingResearchCount = core.filter(item => item.blockingResearch === true).length;
      next.dataStarvationBlockingExecutionCount = core.filter(item => item.blockingExecution === true).length;
      next.advisoryDataGaps = next.dataStarvationMissingEvidence.some(item => item.rootCause !== "NOT_APPLICABLE" &&
        item.evidenceClass === "ADVISORY");
    }
  }
  return next;
}

function commitRecoveryPlanning(project, options, observedFields) {
  const planned = pendingRecoveryPlanning(project, options);
  // A private planning view may inspect disabled waves; only actual input changes persist their aliases.
  return refreshRecoveryAliases({ ...planned,
    canonicalAliases: project.canonicalAliases,
    canonicalAliasProvenance: project.canonicalAliasProvenance,
    canonicalAliasConflicts: project.canonicalAliasConflicts,
  }, observedFields, true);
}

function mergeRecoveryReports(previous = {}, report = {}) {
  const merged = { ...report };
  for (const key of ["waves", "recoveredFields", "attemptedFields", "unrecoveredFields",
    "changedEvidenceFamilies", "changedEvidenceFamiliesThisPhase"]) {
    merged[key] = [...new Set([...(previous[key] || []), ...(report[key] || [])])];
  }
  for (const key of ["attempts", "providerAttempts", "executionAdapterResults"]) {
    merged[key] = [...(previous[key] || []), ...(report[key] || [])];
  }
  merged.plannedRequestCost = num(previous.plannedRequestCost) + num(report.plannedRequestCost);
  merged.unrecoveredFields = merged.unrecoveredFields.filter(field => !merged.recoveredFields.includes(field));
  merged.status = merged.recoveredFields.length
    ? merged.unrecoveredFields.length ? "PARTIAL_RECOVERY" : "RECOVERED" : "NO_RECOVERY";
  return merged;
}

function planItems(project = {}, options = {}, cheapHolderItems = null) {
  const executionOnly = rawRecoveryDisabled(options);
  const items = [
    ...requestedPlanItems(project),
    ...proofRecoveryItems(project, options),
  ];
  if (!executionOnly) items.push(...(cheapHolderItems ?? cheapCoreHolderRecoveryItems(project, items, options)));
  const bestByField = new Map();
  for (const item of items) {
    const field = item?.canonicalField || item?.field;
    if (!field || item.recoverable === false) continue;
    if (executionOnly && recoveryWaveForField(field, item) !== "WAVE3") continue;
    if (sourceFamilyForField(field) === "EXECUTION" && recoveryRouteType(project) === "CEX" &&
        text(project.executionProof?.routeType).toUpperCase() !== "CEX") continue;
    const recoveryDisposition = recoveryDispositionForField(field, {
        applicability: item.rootCause === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : null,
        chain: chainOf(project),
        routeType: recoveryRouteType(project),
      });
    if (recoveryDisposition !== "RAW_RECOVERABLE") continue;
    const key = item.cheapHolderMetadataOnly === true ? `cheap-holder:${field}` : field;
    const current = bestByField.get(key);
    const value = num(item.valueOfInformationScore || item.estimatedRecoveryValue);
    const evidenceClass = item.evidenceClass === "CORE" || current?.evidenceClass === "CORE"
      ? "CORE" : item.evidenceClass || current?.evidenceClass;
    if (!current || value > num(current.valueOfInformationScore || current.estimatedRecoveryValue)) {
      bestByField.set(key, { ...item, recoveryDisposition, evidenceClass,
        requiresFreshObservation: requiresRecoveryObservation(item) || requiresRecoveryObservation(current || {}),
        requiresAuthorityPair: item.requiresAuthorityPair === true || current?.requiresAuthorityPair === true,
        requiresMintAccountEvidence: item.requiresMintAccountEvidence === true || current?.requiresMintAccountEvidence === true });
    } else {
      bestByField.set(key, { ...current, evidenceClass,
        requiresFreshObservation: requiresRecoveryObservation(item) || requiresRecoveryObservation(current),
        requiresAuthorityPair: item.requiresAuthorityPair === true || current.requiresAuthorityPair === true,
        requiresMintAccountEvidence: item.requiresMintAccountEvidence === true || current.requiresMintAccountEvidence === true });
    }
  }
  return [...bestByField.values()].filter(item => requiresRecoveryObservation(item) ||
    !hasRecoveryValue(recoveredValueFor(project, item.canonicalField || item.field)));
}

function executionPriority(project = {}, index = 0) {
  return (
    num(project.preliminaryOpportunityScore || project.progressiveOpportunityScore) * 2 +
    num(project.executionScore || project.executionReadinessScore) +
    num(project.valueOfInformationScore) +
    candidatePriority(project, index)
  );
}

export function buildActiveEvidenceRecoveryWaves(projects = [], options = {}) {
  const input = Array.isArray(projects) ? projects : [];
  const waveLimits = recoveryWaveLimits(options);
  const executionOnly = rawRecoveryDisabled(options);
  const maxFieldsPerCandidate = Math.max(
    1,
    Number(options.maxFieldsPerCandidate || process.env.ACTIVE_EVIDENCE_RECOVERY_FIELDS_PER_CANDIDATE || 8)
  );
  const eligible = input
    .map((project, projectIndex) => {
      const cheapHolderItems = executionOnly ? [] : cheapCoreHolderRecoveryItems(project, requestedPlanItems(project), options);
      project = pendingRecoveryPlanning(project, options);
      const items = planItems(project, options, cheapHolderItems);
      const valueOfInformationPriority = Math.max(
        0,
        ...items.map((item) => num(item.valueOfInformationScore || item.estimatedRecoveryValue) * 100)
      );
      return {
        project,
        projectIndex,
        priority: candidatePriority(project, projectIndex) + valueOfInformationPriority,
        executionPriority: executionPriority(project, projectIndex) + valueOfInformationPriority,
        items,
      };
    })
    .filter(({ project }) => isDeepCandidate(project));

  const waves = {};
  for (const wave of ["WAVE1", "WAVE2", "WAVE3"]) {
    const scoreKey = wave === "WAVE3" ? "executionPriority" : "priority";
    waves[wave] = eligible
      .filter((candidate) => wave !== "WAVE3" ||
        (hasExactExecutionRecoveryIdentity(candidate.project) && !hasKnownTransferRestriction(candidate.project)))
      .map((candidate) => {
        const entries = candidate.items
          .filter((item) => recoveryWaveForField(item.canonicalField || item.field, item) === wave)
          .map((item) => {
            const field = item.canonicalField || item.field;
            return {
              projectIndex: candidate.projectIndex,
              field,
              family: sourceFamilyForField(field),
              wave,
              item,
              coreEvidence: coreRecoveryItem(item, candidate.project),
              requestCost: Math.max(1, item.estimatedRequests || item.targetSources?.length || 1),
              score:
                num(item.valueOfInformationScore || item.estimatedRecoveryValue) * 100 +
                candidate[scoreKey],
            };
          })
          .sort((a, b) => Number(b.coreEvidence) - Number(a.coreEvidence) || b.score - a.score)
          .slice(0, maxFieldsPerCandidate);
        return { ...candidate, entries, coreRecoveryPriority: Number(entries.some(entry => entry.coreEvidence)) };
      })
      .filter((candidate) => candidate.entries.length)
      .sort((a, b) => {
        if (wave !== "WAVE3" && b.coreRecoveryPriority !== a.coreRecoveryPriority) {
          return b.coreRecoveryPriority - a.coreRecoveryPriority;
        }
        return b[scoreKey] - a[scoreKey];
      })
      .slice(0, waveLimits[wave]);
  }
  return { waves, waveLimits, deepEvaluatedCandidates: eligible.length,
    executionIdentityDeferredCandidates: eligible.filter((candidate) =>
      !hasExactExecutionRecoveryIdentity(candidate.project) && candidate.items.some((item) =>
        recoveryWaveForField(item.canonicalField || item.field, item) === "WAVE3")).length };
}

export function createActiveEvidenceRecoveryState(options = {}) {
  const maxRequests = resolveActiveEvidenceRequestBudget(options, 2000);
  return { ...createActiveEvidenceExecutionState({
    ...options,
    maxProviderRequests: maxRequests,
    timeBudgetMs: options.timeBudgetMs ?? process.env.ACTIVE_EVIDENCE_RECOVERY_TIME_BUDGET_MS ?? 23 * 60 * 1000,
  }), recoverySessionId: randomUUID() };
}

export function reserveExecutionRecoveryWindow(state, options = {}) {
  const remaining = state.deadlineAt - (state.now || Date.now)();
  const requested = Number(options.executionReserveMs ?? process.env.ACTIVE_EVIDENCE_EXECUTION_RESERVE_MS ?? 180000);
  const enabled = Number(options.wave3Max ?? process.env.ACTIVE_EVIDENCE_WAVE3_MAX ?? 50) > 0;
  const reserve = enabled && Number.isFinite(remaining) && Number.isFinite(requested) && requested > 0
    ? Math.min(requested, Math.max(0, remaining) / 4) : 0;
  state.executionTimeReserveMs = reserve;
  const wave3Max = Number(options.wave3Max ?? process.env.ACTIVE_EVIDENCE_WAVE3_MAX ?? 50);
  const defaultRequests = Number.isSafeInteger(wave3Max) && wave3Max > 0 ? Math.min(200, wave3Max * 4) : 0;
  const configuredRequests = Number(options.executionReserveRequests ?? process.env.ACTIVE_EVIDENCE_EXECUTION_RESERVE_REQUESTS ?? defaultRequests);
  const requestedRequests = Number.isSafeInteger(configuredRequests) && configuredRequests >= 0 ? configuredRequests : defaultRequests;
  const remainingRequests = Math.max(0, state.maxRequests - state.requestsUsed);
  const reservedRequests = enabled && remaining > 0 ? Math.min(requestedRequests, Math.floor(remainingRequests / 4)) : 0;
  state.executionRequestsReserved = reservedRequests;
  const callerRequestLimit = options.phaseRequestLimit === undefined ? undefined
    : typeof options.phaseRequestLimit === "number" && Number.isSafeInteger(options.phaseRequestLimit) && options.phaseRequestLimit >= 0
      ? options.phaseRequestLimit : 0;
  const phaseRequestLimit = reservedRequests > 0
    ? Math.min(state.maxRequests - reservedRequests, callerRequestLimit ?? Infinity) : callerRequestLimit;
  state.rawProviderRequestLimit = phaseRequestLimit ?? null;
  const phaseDeadlineAt = reserve > 0 ? Math.min(options.phaseDeadlineAt ?? Infinity, state.deadlineAt - reserve)
    : options.phaseDeadlineAt;
  return { ...(phaseDeadlineAt === undefined ? {} : { phaseDeadlineAt }),
    ...(phaseRequestLimit === undefined ? {} : { phaseRequestLimit }) };
}

export async function analyzeActiveEvidenceRecoveryBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const executionState = options.executionState || createActiveEvidenceRecoveryState(options);
  executionState.recoverySessionId ||= randomUUID();
  const concurrency = Math.max(
    1,
    Number(
      options.concurrency ||
        process.env.ACTIVE_EVIDENCE_CONCURRENCY ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_CONCURRENCY ||
        6
    )
  );
  const resume = options.resumeRecovery === true && Boolean(options.executionState);
  const currentProjects = safeProjects.map((project) => ({ ...project,
    ...(resume && project.activeEvidenceRecovery?.recoverySessionId === executionState.recoverySessionId ? { activeEvidenceRecovery: {
      ...project.activeEvidenceRecovery, changedEvidenceFamiliesThisPhase: [],
    } } : {}),
  }));
  const recoveryByProject = new Map();
  if (resume) currentProjects.forEach((project, index) => {
    if (isDeepCandidate(project) && project.activeEvidenceRecovery?.recoverySessionId === executionState.recoverySessionId &&
        (project.activeEvidenceRecovery?.waves?.length || project.activeEvidenceRecovery?.recoveredFields?.length)) recoveryByProject.set(index, project);
  });
  currentProjects.forEach((project, index) => {
    const local = promoteLocalRecoveryInputs(project, options);
    currentProjects[index] = local.project;
    if (!local.recoveredFields.length) return;
    const families = [...new Set(local.recoveredFields.map(sourceFamilyForField))];
    const report = mergeRecoveryReports(recoveryByProject.get(index)?.activeEvidenceRecovery, {
      recoverySessionId: executionState.recoverySessionId, waves: [], recoveredFields: local.recoveredFields,
      attemptedFields: local.recoveredFields, unrecoveredFields: [], changedEvidenceFamilies: families,
      changedEvidenceFamiliesThisPhase: families, attempts: local.attempts,
      providerAttempts: [], executionAdapterResults: [], plannedRequestCost: 0,
      policy: "Existing observations are normalized locally without provider requests or external wave slots.",
    });
    const recovered = { ...local.project, activeEvidenceRecoveryStatus: report.status,
      activeEvidenceRecoveryRecoveredFields: report.recoveredFields,
      activeEvidenceRecoveryAttemptedFields: report.attemptedFields, activeEvidenceRecovery: report };
    currentProjects[index] = recovered;
    recoveryByProject.set(index, recovered);
  });
  const hydration = buildActiveEvidenceRecoveryWaves(currentProjects, options);
  for (const [index, project] of recoveryByProject) {
    const planned = commitRecoveryPlanning(project, options, []);
    currentProjects[index] = planned;
    recoveryByProject.set(index, planned);
  }

  async function recoverCandidate({ projectIndex, entries }, wave, phaseOptions = options) {
      const project = currentProjects[projectIndex];
      // Attach safety only after Wave3 selection, and recheck raw proof at dispatch.
      if (wave === "WAVE3" && recoveryRouteType(project) !== "CEX") {
        entries = [...entries, ...authorityProofRecoveryItems(project, options, true).map((item) => ({
          field: item.canonicalField || item.field, family: "SECURITY", wave, item,
          requestCost: Math.max(1, item.estimatedRequests || item.targetSources?.length || 1),
        }))];
      }
      let next = { ...project };
      const recoveredFields = [];
      const changedEvidenceFamilies = new Set();
      const attempts = [];
      const unresolvedEntries = [];

      for (const entry of entries) {
        const value = requiresRecoveryObservation(entry.item) ? null : recoveredValueFor(next, entry.field);
        const planAttempt = {
          field: entry.field,
          family: entry.family,
          wave,
          rootCause: entry.item.rootCause || null,
          valueOfInformationScore:
            entry.item.valueOfInformationScore ||
            entry.item.estimatedRecoveryValue ||
            0,
          targetSources: (entry.item.targetSources || [])
            .map((source) => source.source)
            .slice(0, 4),
        };
        if (value === null || value === undefined || value === "") {
          unresolvedEntries.push(entry);
          attempts.push({ ...planAttempt, status: "PROVIDER_RECOVERY_QUEUED" });
          continue;
        }
        const provenance = localRecoveryProvenance(next, entry.field);
        next = applyRecoveredField(next, entry.field, value);
        next = attachFieldProvenance(next, entry.field, {
          ...provenance,
          value,
        });
        recoveredFields.push(entry.field);
        attempts.push({
          ...planAttempt,
          status: "RECOVERED_EXISTING_OBSERVATION",
          source: provenance.source,
        });
      }

      let providerAttempts = [];
      let executionAdapterResults = [];
      if (unresolvedEntries.length) {
        const providerResult = await executeActiveEvidenceProviderRequests(
          next,
          unresolvedEntries,
          { ...phaseOptions, waitForGoPlusCooldown: phaseOptions.waitForGoPlusCooldown ?? true },
          executionState
        );
        for (const family of providerResult.changedEvidenceFamilies || []) {
          changedEvidenceFamilies.add(family);
        }
        next = { ...next, ...(providerResult.projectPatch || {}) };
        providerAttempts = providerResult.attempts || [];
        executionAdapterResults = providerResult.executionAdapterResults || [];
        for (const recovered of providerResult.observations || []) {
          next = applyRecoveredField(next, recovered.field, recovered.value);
          next = attachFieldProvenance(next, recovered.field, recovered);
          recoveredFields.push(recovered.field);
        }
      }

      const attemptedFields = [...new Set(entries.map((entry) => entry.field))];
      const uniqueRecovered = [...new Set(recoveredFields)];
      const uniqueUnrecovered = attemptedFields.filter(
        (field) => !uniqueRecovered.includes(field)
      );
      const status = uniqueRecovered.length
        ? uniqueUnrecovered.length
          ? "PARTIAL_RECOVERY"
          : "RECOVERED"
        : "NO_RECOVERY";

      return {
        projectIndex,
        project: {
          ...next,
          activeEvidenceRecoveryStatus: status,
          activeEvidenceRecoveryRecoveredFields: uniqueRecovered,
          activeEvidenceRecoveryAttemptedFields: attemptedFields,
          activeEvidenceRecovery: {
            status,
            recoverySessionId: executionState.recoverySessionId,
            waves: [wave],
            changedEvidenceFamilies: [...new Set([...uniqueRecovered.map(sourceFamilyForField), ...changedEvidenceFamilies])],
            changedEvidenceFamiliesThisPhase: [...new Set([...uniqueRecovered.map(sourceFamilyForField), ...changedEvidenceFamilies])],
            recoveredFields: uniqueRecovered,
            attemptedFields,
            unrecoveredFields: uniqueUnrecovered,
            attempts,
            providerAttempts,
            executionAdapterResults,
            plannedRequestCost: entries.reduce(
              (sum, entry) => sum + entry.requestCost,
              0
            ),
            policy:
              "Exact provider observations are recovered with provenance under bounded request, concurrency, timeout, and circuit-breaker limits. Ambiguous identity and unknown evidence remain unpromoted.",
          },
        },
      };
  }

  const isFastMetadata = entry => ["IDENTITY", "MARKET"].includes(entry.family);
  const isCheapMetadata = entry => entry.item.cheapHolderMetadataOnly === true || isFastMetadata(entry);
  const schedule = createEvidenceHydrationSchedule(executionState, options, {
    wave1: hydration.waves.WAVE1.length > 0,
    wave2: hydration.waves.WAVE2.length > 0,
    cheapMetadata: hydration.waves.WAVE1.some(candidate => candidate.entries.some(entry => entry.item.cheapHolderMetadataOnly === true)),
    otherWave1: hydration.waves.WAVE1.some(candidate => candidate.entries.some(entry => !isCheapMetadata(entry))),
  });
  let refreshBeforeWave = false;
  for (const wave of ["WAVE1", "WAVE2", "WAVE3"]) {
    if (hydration.waveLimits[wave] === 0) continue;
    if (refreshBeforeWave) {
      const refreshed = buildActiveEvidenceRecoveryWaves(currentProjects, options);
      hydration.waves[wave] = refreshed.waves[wave];
      hydration.executionIdentityDeferredCandidates = refreshed.executionIdentityDeferredCandidates;
    }
    refreshBeforeWave = true;
    // Keep the priority-selected set, but acquire short-lived Raydium proof last.
    const selected = hydration.waves[wave];
    const cheapWave1 = wave === "WAVE1" && selected.some(candidate => candidate.entries.some(entry => entry.item.cheapHolderMetadataOnly === true));
    // Holder admission can wait on a provider cooldown. Finish fast exact-identity
    // work first, within the same cheap window, so that wait cannot block it.
    const cohorts = cheapWave1
      ? [{ candidates: selected.map(candidate => ({ ...candidate, entries: candidate.entries.filter(isFastMetadata) })), cheapMetadata: true },
        { candidates: selected.map(candidate => ({ ...candidate, entries: candidate.entries.filter(entry => entry.item.cheapHolderMetadataOnly === true) })), cheapMetadata: true },
        { candidates: selected.map(candidate => ({ ...candidate, entries: candidate.entries.filter(entry => !isCheapMetadata(entry)) })), cheapMetadata: false }]
      : wave === "WAVE3"
      ? [{ candidates: selected.filter((candidate) => chainOf(candidate.project) !== "solana") },
        { candidates: selected.filter((candidate) => chainOf(candidate.project) === "solana") }]
      : [{ candidates: selected }];
    for (const cohort of cohorts) {
      const independentFallbacks = !Array.isArray(options.securityEvidence?.providers) &&
        (wave === "WAVE2" || (wave === "WAVE1" && !cohort.cheapMetadata));
      const phaseOptions = { ...options, waitForGoPlusCooldown: options.waitForGoPlusCooldown ?? !independentFallbacks,
        ...(wave === "WAVE1" ? { phaseDeadlineAt:
          cohort.cheapMetadata ? schedule.cheapMetadataDeadlineAt : schedule.wave1DeadlineAt } : {}) };
      const recoveredWave = await mapWithBoundedConcurrency(cohort.candidates.filter(candidate => candidate.entries.length), concurrency,
        (candidate) => recoverCandidate(candidate, wave, phaseOptions));
      for (const recovered of recoveredWave) {
        const previous = recoveryByProject.get(recovered.projectIndex);
        const previousReport = previous?.activeEvidenceRecovery || {};
        const report = recovered.project.activeEvidenceRecovery || {};
        const mergedReport = mergeRecoveryReports(previousReport, report);
        const merged = {
          ...recovered.project,
          activeEvidenceRecoveryStatus: mergedReport.status,
          activeEvidenceRecoveryRecoveredFields: mergedReport.recoveredFields,
          activeEvidenceRecoveryAttemptedFields: mergedReport.attemptedFields,
          activeEvidenceRecovery: mergedReport,
        };
        const planned = commitRecoveryPlanning(merged, options, report.recoveredFields);
        currentProjects[recovered.projectIndex] = planned;
        recoveryByProject.set(recovered.projectIndex, planned);
      }
    }
  }

  const providerExecution = summarizeActiveEvidenceExecutionState(executionState);
  const selectedIndexes = new Set([...recoveryByProject.keys()].filter(index =>
    recoveryByProject.get(index).activeEvidenceRecovery?.waves?.length));
  const selectedWaveCounts = Object.fromEntries(["WAVE1", "WAVE2", "WAVE3"].map(wave =>
    [wave, [...recoveryByProject.values()].filter(project => project.activeEvidenceRecovery?.waves?.includes(wave)).length]));
  const recoveredFieldsByFamily = {};
  const unresolvedFieldsByFamily = {};
  for (const project of recoveryByProject.values()) {
    for (const field of project.activeEvidenceRecovery?.recoveredFields || []) {
      const family = sourceFamilyForField(field);
      recoveredFieldsByFamily[family] = (recoveredFieldsByFamily[family] || 0) + 1;
    }
    for (const field of project.activeEvidenceRecovery?.unrecoveredFields || []) {
      const family = sourceFamilyForField(field);
      unresolvedFieldsByFamily[family] = (unresolvedFieldsByFamily[family] || 0) + 1;
    }
  }
  const batchSummary = {
    deepEvaluatedCandidates: hydration.deepEvaluatedCandidates,
    recoveryCandidatesAttempted: selectedIndexes.size,
    selectedWaveCounts,
    executionIdentityDeferredCandidates: hydration.executionIdentityDeferredCandidates,
    providerRequestsUsed: providerExecution.requestsUsed,
    providerRequestBudget: providerExecution.maxRequests,
    timeBudgetExceeded: providerExecution.timeBudgetExceeded,
    timeBudgetSkippedCalls: providerExecution.timeBudgetSkippedCalls,
    phaseTimeBudgetExceeded: providerExecution.phaseTimeBudgetExceeded,
    phaseTimeBudgetSkippedCalls: providerExecution.phaseTimeBudgetSkippedCalls,
    phaseRequestBudgetExceeded: providerExecution.phaseRequestBudgetExceeded,
    phaseRequestBudgetSkippedCalls: providerExecution.phaseRequestBudgetSkippedCalls,
    executionTimeReserveMs: executionState.executionTimeReserveMs || 0,
    executionRequestsReserved: executionState.executionRequestsReserved || 0,
    rawProviderRequestLimit: executionState.rawProviderRequestLimit ?? null,
    recoveredFieldsByFamily,
    unresolvedFieldsByFamily,
  };

  return currentProjects.map((project, projectIndex) => {
    const recovered = recoveryByProject.get(projectIndex);
    if (recovered) {
      return {
        ...recovered,
        activeEvidenceRecovery: {
          ...recovered.activeEvidenceRecovery,
          providerExecution,
          batchSummary,
        },
      };
    }
    const deferred = !isDeepCandidate(project);
    const executionIdentityDeferred = !deferred && !hasExactExecutionRecoveryIdentity(project) &&
      planItems(project, options).some((item) => recoveryWaveForField(item.canonicalField || item.field, item) === "WAVE3");
    return {
      ...project,
      activeEvidenceRecoveryStatus: deferred ? "DEFERRED_BEFORE_DEEP" : "NOT_SELECTED",
      activeEvidenceRecovery: {
        status: deferred ? "DEFERRED_BEFORE_DEEP" : "NOT_SELECTED",
        recoverySessionId: executionState.recoverySessionId,
        recoveredFields: [],
        attemptedFields: [],
        unrecoveredFields: [],
        changedEvidenceFamiliesThisPhase: [],
        providerExecution,
        batchSummary,
        executionIdentityDeferred,
        reason: deferred
          ? "Project was deferred before deep evaluation and excluded from recovery."
          : executionIdentityDeferred
          ? "Quote recovery awaits exact non-conflicting chain, contract and pool identity, or a supported exact CEX venue market."
          : "Project was outside the bounded value-of-information recovery budget.",
      },
    };
  });
}
