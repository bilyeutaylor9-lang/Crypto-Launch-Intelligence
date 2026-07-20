function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function smartWalletRows(project = {}) {
  if (Array.isArray(project.smartWallets)) return project.smartWallets;
  if (Array.isArray(project.smartMoneyWallets)) return project.smartMoneyWallets;
  if (Array.isArray(project.alphaWalletEntries)) return project.alphaWalletEntries;
  return [];
}

export function analyzeSmartWalletNovelty(project = {}) {
  const rows = smartWalletRows(project);
  const qualified = rows.filter((wallet) => {
    const sample = num(wallet.walletResolvedSampleSize ?? wallet.sampleSize);
    const hitRate = num(wallet.walletHistoricalHitRate ?? wallet.hitRate);
    const rugExposure = num(wallet.walletRugExposureRate ?? wallet.rugExposureRate);
    const linked = wallet.insiderLinked === true || wallet.deployerLinked === true || wallet.fundingClusterLinked === true;
    return sample >= 8 && hitRate >= 45 && rugExposure <= 25 && !linked;
  });
  const unrelatedFundingClusters = new Set(qualified.map((wallet) => wallet.walletFundingCluster || wallet.fundingCluster || wallet.address).filter(Boolean));
  const medianLead = qualified.length
    ? qualified.map((wallet) => num(wallet.walletMedianEntryLeadTime ?? wallet.leadTimeHours)).sort((a, b) => a - b)[Math.floor(qualified.length / 2)]
    : 0;
  const independence = qualified.length ? Math.min(100, (unrelatedFundingClusters.size / qualified.length) * 100) : 0;
  const entryNovelty = clamp(project.walletEntryNovelty ?? project.smartWalletArrivalScore ?? (medianLead > 0 ? 70 : 0));
  const noveltyScore = Math.round(clamp(
    clamp(qualified.length, 0, 8) * 8 +
      clamp(independence) * 0.22 +
      clamp(entryNovelty) * 0.25 +
      clamp(medianLead, 0, 168) * 0.12 +
      clamp(project.smartMoneyAccumulationScore) * 0.13
  ));

  return {
    ...project,
    smartWalletNoveltyScore: noveltyScore,
    smartWalletNoveltyStatus:
      qualified.length >= 3 && independence >= 65
        ? "MEASURED_UNRELATED_SMART_WALLETS"
        : rows.length && !qualified.length
          ? "UNMEASURED_OR_LINKED_WALLETS"
          : "NO_MEASURED_SMART_WALLET_NOVELTY",
    smartWalletNovelty: {
      walletCount: rows.length,
      qualifiedWalletCount: qualified.length,
      unrelatedFundingClusterCount: unrelatedFundingClusters.size,
      walletMedianEntryLeadTime: medianLead || null,
      walletIndependence: Math.round(independence),
      walletEntryNovelty: Math.round(entryNovelty),
      policy: "Large wallets are not treated as smart wallets without measured history and independence.",
    },
  };
}

export function analyzeSmartWalletNoveltyBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeSmartWalletNovelty);
}
