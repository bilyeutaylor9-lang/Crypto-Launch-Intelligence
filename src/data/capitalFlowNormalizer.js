import crypto from "node:crypto";

import { normalizeMetricTruth } from "./metricTruthNormalizer.js";
import { numberOrNull } from "../math/numericSafety.js";

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function clean(value = "") {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function hashKey(parts = []) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32);
}

function sourceFor(project = {}) {
  return clean(project.source || project.provider || project.discoverySource || project.canonicalExecutionRoute?.supportingSources?.[0]) || "unknown";
}

function canonicalProjectIdFor(project = {}, normalized = {}) {
  return first([
    project.canonicalProjectId,
    normalized.canonicalProjectId,
    normalized.chainId && normalized.tokenAddress ? `${normalized.chainId}:${normalized.tokenAddress}` : null,
    normalized.chainId && normalized.poolAddress ? `${normalized.chainId}:pool:${normalized.poolAddress}` : null,
    project.projectId && !String(project.projectId).startsWith("unresolved:") ? project.projectId : null,
  ]);
}

function missingFieldsFor(observation = {}) {
  return [
    ["canonicalProjectId", observation.canonicalProjectId],
    ["chainId", observation.chainId],
    ["tokenAddress", observation.tokenAddress],
    ["poolAddress", observation.poolAddress],
    ["priceUsd", observation.priceUsd],
    ["dexLiquidityUsd", observation.dexLiquidityUsd],
    ["dexVolumeUsd", observation.dexVolumeUsd],
    ["netFlowUsd", observation.netFlowUsd],
    ["uniqueBuyers", observation.uniqueBuyers],
  ]
    .filter(([, value]) => value === null || value === undefined || value === "")
    .map(([field]) => field);
}

export function normalizeCapitalFlowObservation(project = {}, options = {}) {
  const observedAt = options.observedAt || project.observedAt || project.observationTimestamp || new Date().toISOString();
  const ingestedAt = options.ingestedAt || new Date().toISOString();
  const normalized = normalizeMetricTruth(project, { observedAt });
  const source = sourceFor(project);
  const buyVolumeUsd = numberOrNull(first([
    project.buyVolumeUsd,
    project.buyVolume24h,
    project.buyVolume,
    project.capitalFlow?.buyVolume,
  ]));
  const sellVolumeUsd = numberOrNull(first([
    project.sellVolumeUsd,
    project.sellVolume24h,
    project.sellVolume,
    project.capitalFlow?.sellVolume,
  ]));
  const netFlowUsd = numberOrNull(first([
    project.netFlowUsd,
    project.capitalFlow?.totalNetFlow,
    buyVolumeUsd !== null && sellVolumeUsd !== null ? buyVolumeUsd - sellVolumeUsd : null,
  ]));
  const liquidityAddedUsd = numberOrNull(first([
    project.liquidityAddedUsd,
    project.liquidityAdded24hUsd,
    project.liquidityGrowthUsd,
  ]));
  const liquidityRemovedUsd = numberOrNull(first([
    project.liquidityRemovedUsd,
    project.liquidityRemoved24hUsd,
  ]));
  const canonicalProjectId = canonicalProjectIdFor(project, normalized);
  const observation = {
    observedAt,
    sourceTimestamp: project.sourceTimestamp || project.updatedAt || project.canonicalExecutionRoute?.quoteTimestamp || null,
    source,
    canonicalProjectId,
    identityStatus: normalized.identityStatus || project.identityStatus || "UNKNOWN",
    name: normalized.name || project.name || "Unknown",
    symbol: normalized.symbol || project.symbol || "UNKNOWN",
    chainId: normalized.chainId || null,
    tokenAddress: normalized.tokenAddress || null,
    poolAddress: normalized.poolAddress || null,
    quoteTokenAddress: clean(project.quoteTokenAddress || project.quoteToken?.address || project.canonicalExecutionRoute?.quoteTokenAddress),
    venue: clean(project.canonicalExecutionRoute?.venue || project.dex || project.exchange),
    priceUsd: numberOrNull(first([normalized.priceUsd, project.priceUsd, project.price])),
    circulatingMarketCapUsd: numberOrNull(first([
      normalized.circulatingMarketCapUsd,
      project.circulatingMarketCapUsd,
      project.marketCap,
    ])),
    fullyDilutedValueUsd: numberOrNull(first([
      normalized.fullyDilutedValueUsd,
      project.fullyDilutedValueUsd,
      project.fdv,
    ])),
    dexLiquidityUsd: numberOrNull(first([
      normalized.dexLiquidityUsd,
      project.dexLiquidityUsd,
      project.canonicalExecutionRoute?.liquidityUsd,
      project.executionProof?.liquidityUsd,
      project.liquidityUsd,
    ])),
    stableExitLiquidityUsd: numberOrNull(first([
      normalized.stableExitLiquidityUsd,
      project.stableExitLiquidityUsd,
      project.hardExitLiquidityUsd,
    ])),
    dexVolumeUsd: numberOrNull(first([
      normalized.dexVolume24hUsd,
      project.dexVolumeUsd,
      project.dexVolume24hUsd,
      project.canonicalExecutionRoute?.volume24hUsd,
      project.volume24h,
    ])),
    buyVolumeUsd,
    sellVolumeUsd,
    netFlowUsd,
    buyTransactions: numberOrNull(first([project.buyTransactions, project.buyTransactions24h, project.capitalFlow?.buyTransactions])),
    sellTransactions: numberOrNull(first([project.sellTransactions, project.sellTransactions24h, project.capitalFlow?.sellTransactions])),
    uniqueBuyers: numberOrNull(first([project.uniqueBuyers, project.uniqueBuyers24h, project.buyers24h])),
    uniqueSellers: numberOrNull(first([project.uniqueSellers, project.uniqueSellers24h, project.sellers24h])),
    newBuyers: numberOrNull(first([project.newBuyers, project.newBuyers24h])),
    repeatBuyers: numberOrNull(first([project.repeatBuyers, project.repeatBuyers24h])),
    liquidityAddedUsd,
    liquidityRemovedUsd,
    holderCount: numberOrNull(first([normalized.holderCount, project.holderCount, project.holders])),
    largestBuySharePct: numberOrNull(project.largestBuySharePct),
    largestWalletFlowSharePct: numberOrNull(first([project.largestWalletFlowSharePct, project.walletConcentrationPct])),
    walletConcentrationPct: numberOrNull(first([project.walletConcentrationPct, project.top10WalletFlowSharePct])),
    dataConfidence: numberOrNull(first([project.dataConfidenceScore, normalized.evidenceConfidence])),
    fieldProvenance: normalized.fieldProvenance || {},
    ingestedAt,
  };
  const missingFields = missingFieldsFor(observation);

  return {
    ...observation,
    missingFields,
    observationKey: hashKey([
      canonicalProjectId || "unresolved",
      observation.chainId || "unknown-chain",
      observation.poolAddress || observation.tokenAddress || "unknown-address",
      source,
      observation.sourceTimestamp || observedAt,
    ]),
  };
}

export function normalizeCapitalFlowObservations(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    normalizeCapitalFlowObservation(project, options)
  );
}
