import { clamp, num } from "../edge/edgeMath.js";

function ratioGrowth(current, previous) {
  const c = num(current);
  const p = num(previous);
  if (c === null || p === null || p <= 0) return null;
  return ((c - p) / p) * 100;
}

export function analyzeFakeMomentumFirewall(project = {}) {
  const txGrowth = num(project.transactionCountGrowthPct ?? project.transactionsGrowthPct);
  const volumeGrowth = num(project.volumeAccelerationPct ?? project.volumeGrowthPct);
  const uniqueBuyerGrowth = num(project.buyerBreadthAccelerationPct ?? project.independentBuyerAccelerationPct);
  const currentTx = num(project.transactions24h ?? project.txCount24h);
  const previousTx = num(project.previousTransactions24h ?? project.priorTxCount24h);
  const currentVolume = num(project.volume24hUsd ?? project.volume24h ?? project.volume);
  const previousVolume = num(project.previousVolume24hUsd ?? project.previousVolume24h ?? project.priorVolume24h);
  const derivedTxGrowth = txGrowth ?? ratioGrowth(currentTx, previousTx);
  const derivedVolumeGrowth = volumeGrowth ?? ratioGrowth(currentVolume, previousVolume);

  const repeatedSizeSimilarity = num(project.repeatedTradeSizeSimilarity ?? project.repetitiveTransactionScore);
  const circularFundingScore = num(project.circularFundingScore);
  const botSharePct = num(project.botAdjustedTradeSharePct ?? project.botTradeSharePct);
  const transactionEntropy = num(project.transactionEntropyScore);
  const sameFunderSharePct = num(project.sameFunderBuyerSharePct);
  const clusterAdjustedBuyers = num(project.clusterAdjustedUniqueBuyers24h ?? project.independentBuyers24h);
  const rawBuyers = num(project.uniqueBuyers24h ?? project.buyers24h);

  const reasons = [];
  let risk = 0;

  if (derivedTxGrowth !== null && derivedTxGrowth >= 150 && (derivedVolumeGrowth ?? 0) < 35) {
    risk += 25;
    reasons.push("TRANSACTION_COUNT_OUTRUNS_CAPITAL_VOLUME");
  }
  if (derivedTxGrowth !== null && derivedTxGrowth >= 100 && (uniqueBuyerGrowth ?? 0) < 20) {
    risk += 20;
    reasons.push("TRANSACTION_COUNT_OUTRUNS_UNIQUE_BUYER_GROWTH");
  }
  if (repeatedSizeSimilarity !== null && repeatedSizeSimilarity >= 70) {
    risk += 20;
    reasons.push("REPEATED_TRADE_SIZE_PATTERN");
  }
  if (circularFundingScore !== null && circularFundingScore >= 60) {
    risk += 25;
    reasons.push("CIRCULAR_FUNDING_PATTERN");
  }
  if (botSharePct !== null && botSharePct >= 50) {
    risk += 20;
    reasons.push("HIGH_BOT_ADJUSTED_ACTIVITY_SHARE");
  }
  if (transactionEntropy !== null && transactionEntropy <= 25) {
    risk += 15;
    reasons.push("LOW_TRANSACTION_ENTROPY");
  }
  if (sameFunderSharePct !== null && sameFunderSharePct >= 45) {
    risk += 20;
    reasons.push("BUYER_SET_CONCENTRATED_BY_FUNDER");
  }
  if (rawBuyers !== null && clusterAdjustedBuyers !== null && rawBuyers >= 10 && clusterAdjustedBuyers / rawBuyers < 0.45) {
    risk += 20;
    reasons.push("RAW_BUYERS_COLLAPSE_AFTER_CLUSTER_ADJUSTMENT");
  }

  risk = Math.round(clamp(risk));
  const evidenceCount = [
    derivedTxGrowth,
    derivedVolumeGrowth,
    uniqueBuyerGrowth,
    repeatedSizeSimilarity,
    circularFundingScore,
    botSharePct,
    transactionEntropy,
    sameFunderSharePct,
    clusterAdjustedBuyers,
  ].filter((value) => value !== null).length;

  const state = evidenceCount < 2
    ? "INSUFFICIENT_EVIDENCE"
    : risk >= 70
      ? "ACTIVITY_QUALITY_FAILURE"
      : risk >= 45
        ? "SYNTHETIC_ACTIVITY_RISK"
        : risk >= 25
          ? "REVIEW_ACTIVITY_QUALITY"
          : "PASS";

  return {
    ...project,
    fakeMomentumFirewall: {
      state,
      riskScore: risk,
      evidenceCount,
      reasons,
      observed: {
        transactionGrowthPct: derivedTxGrowth,
        volumeGrowthPct: derivedVolumeGrowth,
        uniqueBuyerGrowthPct: uniqueBuyerGrowth,
        repeatedSizeSimilarity,
        circularFundingScore,
        botSharePct,
        transactionEntropy,
        sameFunderSharePct,
      },
      shadowOnly: true,
    },
    fakeMomentumFirewallState: state,
    fakeMomentumRiskScore: risk,
  };
}

export function analyzeFakeMomentumFirewallBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeFakeMomentumFirewall);
}
