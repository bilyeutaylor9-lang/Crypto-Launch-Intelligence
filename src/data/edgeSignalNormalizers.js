import { num } from "../edge/edgeMath.js";

function iso(value) {
  if (!value) return null;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

function text(value = "") {
  return String(value || "").trim();
}

export function normalizeWalletTemporalEvents(project = {}) {
  const raw =
    project.walletTemporalEvents ||
    project.capitalIntent?.walletEvents ||
    project.walletFlow?.events ||
    project.smartWalletEvents ||
    [];
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((event = {}) => {
    const type = text(event.type || event.eventType || event.action).toUpperCase();
    const timestamp = iso(event.timestamp || event.observedAt || event.blockTime);
    const wallet = text(event.wallet || event.address || event.from || event.owner);
    if (!type || !timestamp || !wallet) return [];
    return [{
      type,
      timestamp,
      wallet,
      counterparty: text(event.counterparty || event.to || event.protocol || event.venue) || null,
      amountUsd: num(event.amountUsd ?? event.valueUsd ?? event.notionalUsd),
      token: text(event.token || event.symbol || event.asset) || null,
      txHash: text(event.txHash || event.signature || event.transactionHash) || null,
      source: text(event.source || project.walletTemporalSource) || null,
    }];
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function normalizeDownstreamAdoptionEvents(project = {}) {
  const raw =
    project.downstreamAdoptionEvents ||
    project.externalAdoptionEvents ||
    project.githubDownstreamAdoption?.events ||
    [];
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((event = {}) => {
    const timestamp = iso(event.timestamp || event.observedAt || event.createdAt);
    const repository = text(event.repository || event.repo || event.fullName);
    if (!timestamp || !repository) return [];
    const org = text(event.organization || event.org || repository.split("/")[0]);
    return [{
      timestamp,
      repository,
      organization: org || null,
      type: text(event.type || event.integrationType || event.action || "INTEGRATION").toUpperCase(),
      productionEvidence: event.productionEvidence === true,
      independent: event.independent !== false,
      source: text(event.source || "github") || "github",
      url: text(event.url) || null,
    }];
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function normalizeLiquidityBands(project = {}) {
  const raw =
    project.liquidityBands ||
    project.liquidityTopography?.bands ||
    project.uniswapV3?.liquidityBands ||
    project.poolLiquidityBands ||
    [];
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((band = {}) => {
    const lower = num(band.lowerPrice ?? band.priceLow ?? band.minPrice);
    const upper = num(band.upperPrice ?? band.priceHigh ?? band.maxPrice);
    const liquidityUsd = num(
      band.liquidityUsd ?? band.depthUsd ?? band.activeLiquidityUsd ?? band.usdLiquidity
    );
    if (lower === null || upper === null || liquidityUsd === null || upper <= lower || liquidityUsd < 0) {
      return [];
    }
    return [{ lower, upper, liquidityUsd }];
  }).sort((a, b) => a.lower - b.lower);
}

export function normalizeCapitalIntentEvidence(project = {}) {
  return {
    stablecoinInflowUsd: num(
      project.stablecoinInflowUsd ?? project.walletFundingUsd ?? project.capitalIntent?.stablecoinInflowUsd
    ),
    bridgeInflowUsd: num(project.bridgeInflowUsd ?? project.capitalIntent?.bridgeInflowUsd),
    priorityFeePercentile: num(
      project.priorityFeePercentile ?? project.executionUrgencyScore ?? project.capitalIntent?.priorityFeePercentile
    ),
    approvalActivityScore: num(
      project.approvalActivityScore ?? project.routerPreparationScore ?? project.capitalIntent?.approvalActivityScore
    ),
    source: project.capitalIntent?.source || project.capitalIntentSource || null,
    observedAt: iso(project.capitalIntent?.observedAt || project.capitalIntentObservedAt),
  };
}
