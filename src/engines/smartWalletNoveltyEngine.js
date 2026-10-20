function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function measured(value, maximum = Infinity) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maximum;
}

function walletEvidence(wallet) {
  const values = {
    walletHistoricalHitRate: wallet.walletHistoricalHitRate ?? wallet.hitRate,
    walletResolvedSampleSize: wallet.walletResolvedSampleSize ?? wallet.sampleSize,
    walletMedianEntryLeadTime: wallet.walletMedianEntryLeadTime ?? wallet.leadTimeHours,
    walletRugExposureRate: wallet.walletRugExposureRate ?? wallet.rugExposureRate,
    walletFundingCluster: wallet.walletFundingCluster ?? wallet.fundingCluster,
  };
  return Object.fromEntries(Object.entries(values).filter(([field, value]) =>
    field === "walletFundingCluster"
      ? typeof value === "string" && value.trim().length > 0
      : measured(value, /Rate$/.test(field) ? 100 : Infinity) &&
        (field !== "walletResolvedSampleSize" || Number.isInteger(Number(value)))
  ).map(([field, value]) => [field, field === "walletFundingCluster" ? value.trim() : Number(value)]));
}

function smartWalletRows(project = {}) {
  if (Array.isArray(project.smartWallets)) return project.smartWallets;
  if (Array.isArray(project.smartMoneyWallets)) return project.smartMoneyWallets;
  if (Array.isArray(project.alphaWalletEntries)) return project.alphaWalletEntries;
  return [];
}

export function analyzeSmartWalletNovelty(project = {}) {
  const rows = smartWalletRows(project);
  if (!rows.length) {
    return {
      ...project,
      smartWalletNoveltyScore: null,
      smartWalletNoveltyStatus: "SMART_WALLET_NOVELTY_UNMEASURED",
      smartWalletNovelty: null,
      smartWalletNoveltyCoverage: {
        observedComponentCount: 0,
        expectedComponentCount: 5,
        coveragePct: 0,
        observedValues: {},
        missingValues: [
          "walletHistoricalHitRate",
          "walletResolvedSampleSize",
          "walletMedianEntryLeadTime",
          "walletRugExposureRate",
          "walletFundingCluster",
        ],
        sourceFamilies: [],
      },
    };
  }
  const expectedFields = ["walletHistoricalHitRate", "walletResolvedSampleSize", "walletMedianEntryLeadTime", "walletRugExposureRate", "walletFundingCluster"];
  const evidence = rows.map(walletEvidence);
  const observedCount = evidence.reduce((sum, row) => sum + Object.keys(row).length, 0);
  const coverage = {
    observedComponentCount: observedCount,
    expectedComponentCount: rows.length * expectedFields.length,
    coveragePct: Math.round(observedCount / (rows.length * expectedFields.length) * 100),
    observedValues: { wallets: evidence },
    missingValues: expectedFields.filter((field) => evidence.some((row) => row[field] === undefined)),
    sourceFamilies: observedCount ? ["wallet-history", ...(evidence.some((row) => row.walletFundingCluster) ? ["funding-clusters"] : [])] : [],
  };
  const qualified = rows.filter((wallet, index) => {
    const row = evidence[index];
    const sample = row.walletResolvedSampleSize;
    const hitRate = row.walletHistoricalHitRate;
    const rugExposure = row.walletRugExposureRate;
    const linked = wallet.insiderLinked === true || wallet.deployerLinked === true || wallet.fundingClusterLinked === true;
    return sample >= 8 && hitRate >= 45 && rugExposure !== undefined && rugExposure <= 25 && row.walletFundingCluster && !linked;
  });
  const unrelatedFundingClusters = new Set(qualified.map((wallet) => walletEvidence(wallet).walletFundingCluster));
  const leads = qualified.map((wallet) => walletEvidence(wallet).walletMedianEntryLeadTime).filter((value) => value !== undefined).sort((a, b) => a - b);
  const medianLead = leads.length ? leads[Math.floor(leads.length / 2)] : null;
  const independence = qualified.length ? Math.min(100, (unrelatedFundingClusters.size / qualified.length) * 100) : null;
  const entryNovelty = clamp(project.walletEntryNovelty ?? project.smartWalletArrivalScore ?? (medianLead > 0 ? 70 : 0));
  const noveltyScore = qualified.length ? Math.round(clamp(
    clamp(qualified.length, 0, 8) * 8 +
      clamp(independence) * 0.22 +
      clamp(entryNovelty) * 0.25 +
      clamp(medianLead, 0, 168) * 0.12 +
      clamp(project.smartMoneyAccumulationScore) * 0.13
  )) : null;

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
      walletMedianEntryLeadTime: medianLead,
      walletIndependence: independence === null ? null : Math.round(independence),
      walletEntryNovelty: qualified.length ? Math.round(entryNovelty) : null,
      policy: "Large wallets are not treated as smart wallets without measured history and independence.",
    },
    smartWalletNoveltyCoverage: coverage,
  };
}

export function analyzeSmartWalletNoveltyBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeSmartWalletNovelty);
}
