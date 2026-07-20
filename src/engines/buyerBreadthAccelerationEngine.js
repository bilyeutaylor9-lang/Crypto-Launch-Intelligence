function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function shares(values = []) {
  const total = values.reduce((sum, value) => sum + Math.max(0, num(value)), 0);
  if (!total) return [];
  return values.map((value) => Math.max(0, num(value)) / total);
}

export function walletDistributionStats(values = []) {
  const active = shares(values).filter((share) => share > 0);
  const hhi = active.reduce((sum, share) => sum + share ** 2, 0);
  const entropy = active.length > 1
    ? -active.reduce((sum, share) => sum + share * Math.log(share), 0) / Math.log(active.length)
    : active.length ? 0 : null;
  const sorted = [...active].sort((a, b) => b - a);

  return {
    walletFlowHHI: Number(hhi.toFixed(4)),
    walletFlowEntropy: entropy === null ? null : Number(entropy.toFixed(4)),
    effectiveParticipantCount: hhi ? Number((1 / hhi).toFixed(2)) : 0,
    largestBuyerShare: sorted[0] ? Number((sorted[0] * 100).toFixed(2)) : null,
    top5BuyerShare: Number((sorted.slice(0, 5).reduce((sum, share) => sum + share, 0) * 100).toFixed(2)),
    top10BuyerShare: Number((sorted.slice(0, 10).reduce((sum, share) => sum + share, 0) * 100).toFixed(2)),
  };
}

function participantFlows(project = {}) {
  if (Array.isArray(project.walletFlows)) return project.walletFlows.map((wallet) => wallet.buyVolumeUsd ?? wallet.volumeUsd ?? wallet.amountUsd ?? wallet.valueUsd);
  if (Array.isArray(project.buyers)) return project.buyers.map((wallet) => wallet.buyVolumeUsd ?? wallet.volumeUsd ?? wallet.amountUsd ?? 1);
  if (Array.isArray(project.wallets)) return project.wallets.map((wallet) => wallet.buyVolumeUsd ?? wallet.volumeUsd ?? wallet.balanceUsd ?? 1);
  return [];
}

export function analyzeBuyerBreadthAcceleration(project = {}) {
  const rawUniqueBuyers = num(project.rawUniqueBuyers ?? project.uniqueBuyers24h ?? project.buyers24h);
  const linkedWalletClusterCount = num(project.linkedWalletClusterCount ?? project.walletClusterCount);
  const largestClusterShare = num(project.largestClusterShare ?? project.walletClusterLargestSharePct);
  const clusterPenalty = Math.min(rawUniqueBuyers * 0.75, linkedWalletClusterCount * 2 + (largestClusterShare / 100) * rawUniqueBuyers);
  const clusterAdjustedUniqueBuyers = Math.max(0, Math.round(rawUniqueBuyers - clusterPenalty));
  const buys = num(project.buyTransactions24h ?? project.buys24h);
  const sells = num(project.sellTransactions24h ?? project.sells24h);
  const previousBuyers = num(project.uniqueBuyersPrev24h ?? project.buyersPrev24h);
  const newBuyerRatio = rawUniqueBuyers ? clamp(num(project.newBuyerRatio ?? project.newBuyerPct ?? ((rawUniqueBuyers - previousBuyers) / rawUniqueBuyers) * 100), 0, 100) : null;
  const repeatBuyerRatio = newBuyerRatio === null ? null : clamp(100 - newBuyerRatio);
  const buyerRetention = clamp(project.buyerRetentionRate ?? project.buyerRetention ?? project.buyerRetentionScore);
  const buyerChurn = buyerRetention ? clamp(100 - buyerRetention) : null;
  const buyTransactionGrowth = previousBuyers ? clamp(((rawUniqueBuyers - previousBuyers) / previousBuyers) * 100, -100, 300) : clamp(project.buyersChange24hPct ?? project.buyerGrowth24hPct);
  const buyerGrowthAcceleration = clamp(project.buyerAccelerationScore ?? project.buyersAccelerationPct ?? buyTransactionGrowth);
  const buyerSellerRatio = sells > 0 ? Number((buys / sells).toFixed(2)) : buys > 0 ? buys : null;
  const netBuyerGrowth = Math.round(rawUniqueBuyers - num(project.uniqueSellers24h ?? project.sellers24h));
  const distribution = walletDistributionStats(participantFlows(project));
  const effectiveCount = distribution.effectiveParticipantCount || clusterAdjustedUniqueBuyers;
  const breadthScore = Math.round(clamp(
    clamp(clusterAdjustedUniqueBuyers, 0, 250) * 0.22 +
      clamp(effectiveCount, 0, 100) * 0.22 +
      clamp(buyerGrowthAcceleration) * 0.22 +
      clamp(buyerRetention) * 0.14 +
      clamp(newBuyerRatio ?? 0) * 0.1 +
      clamp((buyerSellerRatio || 0) * 25, 0, 100) * 0.1 -
      clamp(largestClusterShare) * 0.25
  ));

  return {
    ...project,
    rawUniqueBuyers,
    clusterAdjustedUniqueBuyers,
    newBuyerRatio,
    repeatBuyerRatio,
    buyerRetention,
    buyerChurn,
    buyTransactionGrowth,
    buyerGrowthAcceleration,
    buyerSellerRatio,
    netBuyerGrowth,
    linkedWalletClusterCount,
    largestClusterShare,
    ...distribution,
    buyerBreadthAccelerationScore: breadthScore,
    buyerBreadthStatus:
      largestClusterShare >= 45 || distribution.top5BuyerShare >= 70
        ? "CLUSTER_REVIEW"
        : breadthScore >= 70
          ? "BROAD_BUYER_ACCELERATION"
          : breadthScore >= 45
            ? "DEVELOPING_BUYER_BREADTH"
            : "THIN_OR_UNKNOWN_BUYER_BREADTH",
  };
}

export function analyzeBuyerBreadthAccelerationBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeBuyerBreadthAcceleration);
}
