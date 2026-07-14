const SELL_TESTS_USD = [100_000, 1_000_000, 10_000_000];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0 && num(item.weight) > 0);
  if (!active.length) return 0;

  const total = active.reduce((sum, item) => sum + num(item.score) * num(item.weight), 0);
  const weight = active.reduce((sum, item) => sum + num(item.weight), 0);
  return Math.round(clamp(total / weight));
}

function getPath(source = {}, path = "") {
  return String(path)
    .split(".")
    .reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), source);
}

function firstNumber(project = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(project, path);
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }
  return 0;
}

function firstDefined(project = {}, paths = []) {
  for (const path of paths) {
    const value = getPath(project, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function boolish(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").toLowerCase();
  return ["true", "yes", "locked", "renounced", "multisig", "timelocked"].includes(normalized);
}

function textBlob(project = {}) {
  const narratives = Array.isArray(project.narratives) ? project.narratives : [project.narratives].filter(Boolean);
  const tags = Array.isArray(project.tags) ? project.tags : [project.tags].filter(Boolean);
  const alphaTags = Array.isArray(project.alphaTags) ? project.alphaTags : [project.alphaTags].filter(Boolean);
  const contractFunctions = Array.isArray(project.contractFunctions)
    ? project.contractFunctions
    : [project.contractFunctions].filter(Boolean);
  const privilegedFunctions = Array.isArray(project.privilegedFunctions)
    ? project.privilegedFunctions
    : [project.privilegedFunctions].filter(Boolean);
  const securityFlags = Array.isArray(project.securityFlags) ? project.securityFlags : [project.securityFlags].filter(Boolean);
  const selected = [
    project.name,
    project.symbol,
    project.description,
    project.narrative,
    project.primaryNarrative,
    project.category,
    project.url,
    project.website,
    project.securitySummary,
    project.tokenomicsSummary,
    project.stakingSummary,
    project.auditSummary,
    project.rawText,
    project.rawCandidate?.description,
    project.rawCandidate?.summary,
    ...narratives,
    ...tags,
    ...alphaTags,
    ...contractFunctions,
    ...privilegedFunctions,
    ...securityFlags,
  ];

  return selected.filter(Boolean).join(" ").toLowerCase();
}

function getHolders(project = {}) {
  return firstNumber(project, [
    "holders",
    "holderCount",
    "holdersNow",
    "rawCandidate.holders",
    "marketData.holders",
    "dexScreener.holders",
  ]);
}

function getLiquidity(project = {}) {
  return firstNumber(project, [
    "liquidityUsd",
    "liquidity",
    "marketData.liquidityUsd",
    "rawCandidate.liquidityUsd",
  ]);
}

function getVolume(project = {}) {
  return firstNumber(project, [
    "volume24h",
    "volume",
    "marketData.volume24h",
    "rawCandidate.volume24h",
  ]);
}

function analyzeHolderQuality(project = {}) {
  const holders = getHolders(project);
  const liquidityProviders = firstNumber(project, [
    "liquidityProviders",
    "lpCount",
    "pool.lpCount",
    "dexPair.liquidityProviders",
  ]);
  const uniqueBuyers24h = firstNumber(project, ["uniqueBuyers24h", "buyers24h", "txns.h24.buys"]);
  const uniqueBuyers30d = firstNumber(project, ["uniqueBuyers30d", "buyers30d"]);
  const activeHolders30d = firstNumber(project, ["activeHolders30d", "activeWallets30d"]);
  const activeHolders90d = firstNumber(project, ["activeHolders90d", "activeWallets90d"]);
  const holdersOver10 = firstNumber(project, ["holdersOver10Usd", "holdersOver10", "holderBuckets.over10"]);
  const holdersOver100 = firstNumber(project, ["holdersOver100Usd", "holdersOver100", "holderBuckets.over100"]);
  const holdersOver1000 = firstNumber(project, ["holdersOver1000Usd", "holdersOver1000", "holderBuckets.over1000"]);
  const holderLpRatio = liquidityProviders > 0 ? holders / liquidityProviders : null;
  const activeShare = holders > 0 ? Math.max(activeHolders30d, activeHolders90d * 0.6) / holders : null;
  const buyerShare = holders > 0 ? Math.max(uniqueBuyers30d, uniqueBuyers24h * 20) / holders : null;
  const balanceDepthShare = holders > 0 ? Math.max(holdersOver10, holdersOver100 * 1.5, holdersOver1000 * 4) / holders : null;
  const warnings = [];

  let risk = 0;
  let proof = 0;

  if (!holders) {
    warnings.push("Holder count is missing.");
    risk += 12;
  } else {
    proof += Math.min(20, Math.log10(Math.max(holders, 10)) * 4);
  }

  if (holders >= 100_000 && balanceDepthShare === null) {
    warnings.push("Large holder count lacks balance-depth proof.");
    risk += 20;
  }
  if (holders >= 1_000_000 && liquidityProviders > 0 && holderLpRatio > 10_000) {
    warnings.push("Millions of holders are concentrated around very few liquidity providers.");
    risk += 25;
  }
  if (holders >= 100_000 && buyerShare !== null && buyerShare < 0.005) {
    warnings.push("Unique buyer share is tiny compared with headline holder count.");
    risk += 20;
  }
  if (holders >= 100_000 && activeShare !== null && activeShare < 0.01) {
    warnings.push("Active holder share is tiny compared with headline holder count.");
    risk += 18;
  }
  if (balanceDepthShare !== null && balanceDepthShare >= 0.08) proof += 22;
  else if (balanceDepthShare !== null && balanceDepthShare >= 0.02) proof += 12;
  if (activeShare !== null && activeShare >= 0.08) proof += 18;
  else if (activeShare !== null && activeShare >= 0.02) proof += 10;
  if (buyerShare !== null && buyerShare >= 0.03) proof += 18;
  else if (buyerShare !== null && buyerShare >= 0.01) proof += 8;
  if (liquidityProviders >= 100) proof += 10;
  else if (liquidityProviders > 0 && liquidityProviders < 10) risk += 10;

  return {
    score: Math.round(clamp(46 + proof - risk)),
    risk: Math.round(clamp(risk)),
    holders,
    liquidityProviders,
    holderLpRatio: holderLpRatio === null ? null : Number(holderLpRatio.toFixed(2)),
    activeShare: activeShare === null ? null : Number((activeShare * 100).toFixed(3)),
    buyerShare: buyerShare === null ? null : Number((buyerShare * 100).toFixed(3)),
    balanceDepthShare: balanceDepthShare === null ? null : Number((balanceDepthShare * 100).toFixed(3)),
    warnings,
  };
}

function analyzeActivityQuality(project = {}) {
  const buys = firstNumber(project, ["buyTransactions24h", "buys24h", "txns.h24.buys"]);
  const sells = firstNumber(project, ["sellTransactions24h", "sells24h", "txns.h24.sells"]);
  const swaps = firstNumber(project, ["swapTransactions24h", "dexSwaps24h", "economicTransactions24h"]);
  const approvals = firstNumber(project, ["approvalTransactions24h", "approvals24h"]);
  const transfers = firstNumber(project, ["transferTransactions24h", "transfers24h"]);
  const claims = firstNumber(project, ["claimTransactions24h", "rewardClaims24h", "stakingClaims24h"]);
  const totalProvided = firstNumber(project, ["transactions24h", "txCount24h", "contractCalls24h"]);
  const economicTransactions = buys + sells + swaps;
  const explicitNonEconomic = approvals + transfers + claims;
  const totalTransactions = Math.max(totalProvided, economicTransactions + explicitNonEconomic);
  const nonEconomicTransactions = Math.max(explicitNonEconomic, totalTransactions - economicTransactions);
  const organicShare = totalTransactions > 0 ? economicTransactions / totalTransactions : null;
  const repetitiveRisk = clamp(firstNumber(project, [
    "repetitiveTransactionScore",
    "transactionPatternRisk",
    "botTransactionRisk",
  ]));
  const warnings = [];

  let risk = Math.round(repetitiveRisk * 0.5);
  let score = organicShare === null ? 46 : 35 + organicShare * 65;

  if (totalTransactions >= 10_000 && economicTransactions === 0) {
    warnings.push("High contract activity has no DEX swap proof.");
    risk += 25;
  }
  if (economicTransactions > 0 && nonEconomicTransactions > economicTransactions * 3) {
    warnings.push("Approvals/transfers/rewards dominate economic swaps.");
    risk += 22;
  }
  if (approvals > 0 && approvals > buys + sells) {
    warnings.push("Approve transactions exceed buy/sell transactions.");
    risk += 12;
  }
  if (repetitiveRisk >= 60) warnings.push("Transaction stream appears repetitive.");
  if (buys > 0 && sells > 0) score += 8;
  if (swaps >= 1_000) score += 8;
  if (organicShare !== null && organicShare < 0.1) score -= 24;

  return {
    score: Math.round(clamp(score - risk * 0.35)),
    risk: Math.round(clamp(risk)),
    totalTransactions,
    economicTransactions,
    nonEconomicTransactions,
    organicShare: organicShare === null ? null : Number((organicShare * 100).toFixed(2)),
    buys,
    sells,
    swaps,
    approvals,
    transfers,
    claims,
    repetitiveRisk,
    warnings,
  };
}

function analyzeExitLiquidity(project = {}) {
  const displayedLiquidityUsd = getLiquidity(project);
  const stablecoinReservesUsd = firstNumber(project, [
    "hardExitLiquidityUsd",
    "stablecoinExitLiquidityUsd",
    "stablecoinReservesUsd",
    "pool.stablecoinReservesUsd",
    "pool.quoteReserveUsd",
  ]) || (displayedLiquidityUsd > 0 ? displayedLiquidityUsd * 0.5 : 0);
  const protocolOwnedPct = clamp(firstNumber(project, [
    "protocolOwnedLiquidityPct",
    "lpProtocolOwnedPct",
    "pool.protocolOwnedPct",
  ]));
  const liquidityProviders = firstNumber(project, [
    "liquidityProviders",
    "lpCount",
    "pool.lpCount",
    "dexPair.liquidityProviders",
  ]);
  const locked = boolish(firstDefined(project, ["lpLocked", "liquidityLocked", "pool.locked"]));
  const concentrationPct = clamp(firstNumber(project, [
    "topLpSharePct",
    "lpConcentrationPct",
    "pool.topLpSharePct",
  ]));
  const independenceMultiplier =
    protocolOwnedPct > 0
      ? 1 - protocolOwnedPct / 100
      : liquidityProviders > 0 && liquidityProviders < 20
      ? 0.55
      : 0.75;
  const hardExitLiquidityUsd = Math.max(0, stablecoinReservesUsd * clamp(independenceMultiplier, 0.05, 1));
  const sellTests = SELL_TESTS_USD.map((sellUsd) => {
    const impactPct = hardExitLiquidityUsd > 0 ? (sellUsd / hardExitLiquidityUsd) * 100 : null;
    return {
      sellUsd,
      estimatedStablecoinImpactPct: impactPct === null ? null : Number(impactPct.toFixed(2)),
      pass: impactPct !== null && impactPct <= 35,
    };
  });
  const warnings = [];

  let risk = 0;
  if (!displayedLiquidityUsd) {
    warnings.push("Displayed liquidity is missing.");
    risk += 18;
  }
  if (protocolOwnedPct >= 70) {
    warnings.push("Liquidity appears heavily protocol-controlled.");
    risk += 28;
  } else if (protocolOwnedPct >= 40) {
    warnings.push("Liquidity has meaningful protocol ownership.");
    risk += 14;
  }
  if (liquidityProviders > 0 && liquidityProviders < 20) {
    warnings.push("Liquidity provider count is low.");
    risk += 12;
  }
  if (concentrationPct >= 70) {
    warnings.push("LP concentration is high.");
    risk += 18;
  }
  if (displayedLiquidityUsd > 0 && hardExitLiquidityUsd > 0 && displayedLiquidityUsd / hardExitLiquidityUsd >= 4) {
    warnings.push("Displayed liquidity is much larger than conservative exit liquidity.");
    risk += 16;
  }
  if (sellTests[1]?.estimatedStablecoinImpactPct !== null && sellTests[1].estimatedStablecoinImpactPct > 100) {
    warnings.push("$1M simulated sell overwhelms hard exit liquidity.");
    risk += 18;
  }
  if (locked) risk = Math.max(0, risk - 6);

  const depthScore =
    hardExitLiquidityUsd >= 10_000_000 ? 90 :
    hardExitLiquidityUsd >= 2_000_000 ? 78 :
    hardExitLiquidityUsd >= 500_000 ? 64 :
    hardExitLiquidityUsd >= 100_000 ? 50 :
    hardExitLiquidityUsd > 0 ? 32 :
    20;

  return {
    score: Math.round(clamp(depthScore - risk * 0.35)),
    risk: Math.round(clamp(risk)),
    displayedLiquidityUsd,
    stablecoinReservesUsd: Math.round(stablecoinReservesUsd),
    hardExitLiquidityUsd: Math.round(hardExitLiquidityUsd),
    protocolOwnedPct,
    liquidityProviders,
    locked,
    concentrationPct,
    sellTests,
    warnings,
  };
}

function analyzeAdminControls(project = {}) {
  const text = textBlob(project);
  const controls = [];
  const addIf = (condition, label) => {
    if (condition && !controls.includes(label)) controls.push(label);
  };

  addIf(text.includes("mint") || project.isMintable || project.ownerCanMint, "mint");
  addIf(text.includes("grantrole"), "grantRole");
  addIf(text.includes("revokerole"), "revokeRole");
  addIf(text.includes("setratio"), "setRatio");
  addIf(text.includes("setmainpair"), "setMainPair");
  addIf(text.includes("burnfrom"), "burnFrom");
  addIf(text.includes("blacklist") || project.ownerCanBlacklist, "blacklist");
  addIf(text.includes("pause") || project.ownerCanPause, "pause");
  addIf(text.includes("fee") || text.includes("tax") || project.ownerCanChangeFees, "feeChange");

  const adminRoleKnown = Boolean(firstDefined(project, [
    "adminRoleHolders",
    "defaultAdminRoleHolders",
    "ownerAddress",
    "security.ownerAddress",
  ]));
  const timelocked = boolish(firstDefined(project, ["timelock", "adminTimelock", "security.timelock"]));
  const multisig = boolish(firstDefined(project, ["multisig", "adminMultisig", "security.multisig"]));
  const ownerRenounced = boolish(firstDefined(project, ["ownerRenounced", "security.ownerRenounced"]));
  const warnings = [];
  let risk = 0;

  if (controls.includes("mint")) risk += 22;
  if (controls.includes("grantRole")) risk += 16;
  if (controls.includes("setRatio")) risk += 14;
  if (controls.includes("setMainPair")) risk += 12;
  if (controls.includes("feeChange")) risk += 12;
  if (controls.includes("blacklist")) risk += 14;
  if (controls.includes("pause")) risk += 10;
  if (controls.length >= 4) risk += 12;
  if (controls.length && !adminRoleKnown) risk += 10;
  if (timelocked) risk -= 12;
  if (multisig) risk -= 8;
  if (ownerRenounced) risk -= 18;

  if (controls.includes("mint")) warnings.push("Mint authority or mint-like control is present.");
  if (controls.includes("grantRole")) warnings.push("Role administration controls are present.");
  if (controls.includes("setRatio") || controls.includes("feeChange")) warnings.push("Fees/ratios may be changeable.");
  if (controls.includes("setMainPair")) warnings.push("Main pair can potentially be changed.");
  if (controls.length && !timelocked) warnings.push("No timelock proof found for privileged controls.");

  return {
    score: Math.round(clamp(100 - risk)),
    risk: Math.round(clamp(risk)),
    controls,
    adminRoleKnown,
    timelocked,
    multisig,
    ownerRenounced,
    warnings,
  };
}

function parseDailyYield(text = "") {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*%\s*(?:daily|per day|\/day)/i);
  return match ? Number(match[1]) : 0;
}

function analyzeYieldSustainability(project = {}) {
  const text = textBlob(project);
  const dailyYieldPct = firstNumber(project, ["dailyYieldPct", "stakingDailyPct", "dailyRewardPct"]) || parseDailyYield(text);
  const monthlyYieldPct = firstNumber(project, ["monthlyYieldPct", "stakingMonthlyPct", "monthlyReturnPct"]);
  const apyPct =
    firstNumber(project, ["stakingApy", "apy", "apyPct", "stakingApyPct"]) ||
    (dailyYieldPct > 0 ? (Math.pow(1 + dailyYieldPct / 100, 365) - 1) * 100 : 0);
  const inflationPct = firstNumber(project, ["supplyInflation30dPct", "tokenInflation30dPct", "annualInflationPct"]);
  const hasReferralLanguage =
    text.includes("referral") ||
    text.includes("rank reward") ||
    text.includes("withdrawal pool") ||
    text.includes("level income");
  const hasCompoundingLanguage = text.includes("compound") || text.includes("compounding") || text.includes("rebase");
  const algorithmicIssuance = text.includes("algorithmic") || text.includes("issuance") || text.includes("non-stablecoin");
  const warnings = [];
  let risk = 0;

  if (dailyYieldPct >= 0.5) risk += 38;
  else if (dailyYieldPct > 0) risk += 16;
  if (monthlyYieldPct >= 25) risk += 28;
  else if (monthlyYieldPct >= 10) risk += 14;
  if (apyPct >= 1_000) risk += 35;
  else if (apyPct >= 300) risk += 22;
  else if (apyPct >= 100) risk += 12;
  if (hasReferralLanguage) risk += 16;
  if (hasCompoundingLanguage && apyPct >= 100) risk += 14;
  if (algorithmicIssuance) risk += 10;
  if ((apyPct >= 100 || dailyYieldPct > 0) && inflationPct === 0) risk += 12;
  if (inflationPct >= 20) risk += 12;

  if (dailyYieldPct >= 0.5) warnings.push("Daily compounding yield is extremely high.");
  if (apyPct >= 300) warnings.push("APY implies an unsustainable outside-demand requirement.");
  if (hasReferralLanguage) warnings.push("Referral or rank-reward language detected.");
  if (algorithmicIssuance) warnings.push("Algorithmic issuance language detected.");
  if ((apyPct >= 100 || dailyYieldPct > 0) && inflationPct === 0) {
    warnings.push("Yield is promoted but supply inflation proof is missing.");
  }

  return {
    score: Math.round(clamp(100 - risk)),
    risk: Math.round(clamp(risk)),
    dailyYieldPct: dailyYieldPct ? Number(dailyYieldPct.toFixed(4)) : 0,
    monthlyYieldPct,
    apyPct: apyPct ? Math.round(apyPct) : 0,
    inflationPct,
    hasReferralLanguage,
    hasCompoundingLanguage,
    algorithmicIssuance,
    warnings,
  };
}

function analyzeDataQuality(project = {}) {
  const marketCaps = [
    firstNumber(project, ["marketCap", "marketData.marketCap"]),
    firstNumber(project, ["fdv", "fullyDilutedValuation"]),
    firstNumber(project, ["selfReportedMarketCap", "certikMarketCap"]),
    firstNumber(project, ["dexScreenerMarketCap", "dexMarketCap"]),
    firstNumber(project, ["coinGeckoMarketCap"]),
    firstNumber(project, ["coinMarketCapMarketCap"]),
    firstNumber(project, ["coinbaseMarketCap"]),
  ].filter((value) => value > 0);
  const circulatingSupply = firstNumber(project, [
    "circulatingSupply",
    "marketData.circulatingSupply",
    "rawCandidate.circulatingSupply",
  ]);
  const sourceTruth = firstNumber(project, ["sourceTruthScore", "proofScore", "evidenceQualityScore", "dataConfidenceScore"]);
  const minMarketCap = marketCaps.length ? Math.min(...marketCaps) : 0;
  const maxMarketCap = marketCaps.length ? Math.max(...marketCaps) : 0;
  const dispersion = minMarketCap > 0 ? maxMarketCap / minMarketCap : 1;
  const warnings = [];
  let risk = 0;

  if (marketCaps.length >= 2 && dispersion >= 5) {
    warnings.push("Market-cap sources disagree by more than 5x.");
    risk += 24;
  } else if (marketCaps.length >= 2 && dispersion >= 2.5) {
    warnings.push("Market-cap sources materially disagree.");
    risk += 14;
  }
  if (!circulatingSupply && marketCaps.length) {
    warnings.push("Market cap exists but circulating supply is missing or zero.");
    risk += 18;
  }
  if (sourceTruth > 0 && sourceTruth < 45) {
    warnings.push("Source truth/evidence quality is weak.");
    risk += 12;
  }
  if (!marketCaps.length) {
    warnings.push("No reliable market-cap input was found.");
    risk += 8;
  }

  return {
    score: Math.round(clamp((sourceTruth || 58) - risk * 0.6 + (marketCaps.length >= 2 ? 8 : 0))),
    risk: Math.round(clamp(risk)),
    marketCaps,
    marketCapDispersion: Number(dispersion.toFixed(2)),
    circulatingSupply,
    sourceTruth,
    warnings,
  };
}

function verdictFor({ score = 0, risk = 0, organic = 0, sustainability = 0, blockers = [], liquidity = 0, volume = 0 } = {}) {
  if (risk >= 78 || blockers.length >= 4) return "Institutional Integrity Block";
  if ((liquidity >= 1_000_000 || volume >= 1_000_000) && (organic < 50 || sustainability < 50)) {
    return "Tradable Anomaly / Verify Organic Demand";
  }
  if (score >= 75 && risk < 40) return "Organic Demand Confirmed";
  if (score >= 62 && risk < 55) return "Economic Integrity Watch";
  if (risk >= 60) return "Economic Verification Required";
  return "Thin Integrity Data";
}

function buildBlockers(modules = {}) {
  const blockers = [];

  if (modules.holder.risk >= 45) blockers.push("Holder count may be inflated by dust, Sybil, or distribution wallets.");
  if (modules.activity.risk >= 45) blockers.push("Transaction activity may be approvals, transfers, rewards, or repetitive protocol calls.");
  if (modules.exitLiquidity.risk >= 40) blockers.push("Displayed liquidity may overstate hard stablecoin exit liquidity.");
  if (modules.admin.risk >= 55) blockers.push("Privileged contract controls require admin-role, multisig, and timelock verification.");
  if (modules.yield.risk >= 55) blockers.push("Yield, compounding, referral, or issuance structure may be economically unsustainable.");
  if (modules.dataQuality.risk >= 35) blockers.push("Market cap, circulating supply, or source data is inconsistent.");

  return blockers;
}

export function analyzeOrganicDemandIntegrity(project = {}) {
  const holder = analyzeHolderQuality(project);
  const activity = analyzeActivityQuality(project);
  const exitLiquidity = analyzeExitLiquidity(project);
  const admin = analyzeAdminControls(project);
  const yieldModel = analyzeYieldSustainability(project);
  const dataQuality = analyzeDataQuality(project);
  const blockers = buildBlockers({
    holder,
    activity,
    exitLiquidity,
    admin,
    yield: yieldModel,
    dataQuality,
  });
  const organicDemandScore = weightedAverage([
    { score: holder.score, weight: 1.2 },
    { score: activity.score, weight: 1.3 },
    { score: dataQuality.score, weight: 0.7 },
  ]);
  const economicSustainabilityScore = weightedAverage([
    { score: exitLiquidity.score, weight: 1.2 },
    { score: admin.score, weight: 1.0 },
    { score: yieldModel.score, weight: 1.1 },
    { score: dataQuality.score, weight: 0.9 },
  ]);
  const riskScore = weightedAverage([
    { score: holder.risk, weight: 1.0 },
    { score: activity.risk, weight: 1.1 },
    { score: exitLiquidity.risk, weight: 1.2 },
    { score: admin.risk, weight: 1.2 },
    { score: yieldModel.risk, weight: 1.3 },
    { score: dataQuality.risk, weight: 0.9 },
  ]);
  const score = weightedAverage([
    { score: organicDemandScore, weight: 1.1 },
    { score: economicSustainabilityScore, weight: 1.2 },
    { score: 100 - riskScore, weight: 0.7 },
  ]);
  const liquidity = getLiquidity(project);
  const volume = getVolume(project);
  const verdict = verdictFor({
    score,
    risk: riskScore,
    organic: organicDemandScore,
    sustainability: economicSustainabilityScore,
    blockers,
    liquidity,
    volume,
  });
  const penalty =
    riskScore >= 85 ? 30 :
    riskScore >= 75 ? 24 :
    riskScore >= 65 ? 18 :
    riskScore >= 55 ? 12 :
    score < 45 ? 8 :
    0;
  const strongBuyEligible =
    (verdict === "Organic Demand Confirmed" || verdict === "Economic Integrity Watch") &&
    score >= 68 &&
    riskScore < 45 &&
    blockers.length <= 1;
  const warnings = [
    ...holder.warnings,
    ...activity.warnings,
    ...exitLiquidity.warnings,
    ...admin.warnings,
    ...yieldModel.warnings,
    ...dataQuality.warnings,
  ];

  return {
    ...project,
    organicDemandScore,
    economicSustainabilityScore,
    organicEconomicIntegrityScore: score,
    economicIntegrityRiskScore: riskScore,
    economicIntegrityPenalty: penalty,
    organicDemandVerdict: verdict,
    organicDemandStrongBuyEligible: strongBuyEligible,
    hardExitLiquidityUsd: exitLiquidity.hardExitLiquidityUsd,
    stablecoinExitLiquidityUsd: exitLiquidity.stablecoinReservesUsd,
    organicActivityShare: activity.organicShare,
    economicIntegrityBlockers: blockers,
    organicDemandWarnings: warnings,
    organicDemandIntegrity: {
      name: "Organic Demand and Economic Integrity",
      score,
      verdict,
      strongBuyEligible,
      riskScore,
      penalty,
      organicDemandScore,
      economicSustainabilityScore,
      holder,
      activity,
      exitLiquidity,
      admin,
      yieldModel,
      dataQuality,
      blockers,
      warnings,
      requiredProof: [
        "DEX swaps and new outside capital, not only approvals/transfers/rewards.",
        "Holder balance buckets above $10, $100, and $1,000.",
        "Stablecoin-only exit liquidity after $100K, $1M, and $10M simulated sells.",
        "Admin, mint, fee, pair, multisig, and timelock verification.",
        "Dollar-denominated staking returns net of inflation and price depreciation.",
      ],
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Organic Demand Integrity Engine",
        signal: verdict,
        score,
        confidence: score >= 75 && riskScore < 40 ? 0.82 : score >= 60 ? 0.62 : 0.42,
        impact: verdict.includes("Block") ? "Negative" : verdict.includes("Confirmed") ? "Positive" : "Risk Control",
        reasons: [
          `Organic demand ${organicDemandScore}, economic sustainability ${economicSustainabilityScore}, risk ${riskScore}.`,
          blockers[0] || "No major organic-demand blocker detected.",
          `Hard exit liquidity estimate: $${exitLiquidity.hardExitLiquidityUsd.toLocaleString()}.`,
        ],
      },
    ],
  };
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.organicEconomicIntegrityScore || 0,
    verdict: project.organicDemandVerdict || "Unknown",
    strongBuyEligible: Boolean(project.organicDemandStrongBuyEligible),
    riskScore: project.economicIntegrityRiskScore || 0,
    penalty: project.economicIntegrityPenalty || 0,
    organicDemandScore: project.organicDemandScore || 0,
    economicSustainabilityScore: project.economicSustainabilityScore || 0,
    hardExitLiquidityUsd: project.hardExitLiquidityUsd || 0,
    organicActivityShare: project.organicActivityShare ?? null,
    blockers: project.economicIntegrityBlockers || [],
    warnings: (project.organicDemandWarnings || []).slice(0, 8),
    sellTests: project.organicDemandIntegrity?.exitLiquidity?.sellTests || [],
  };
}

export function analyzeOrganicDemandIntegrityBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeOrganicDemandIntegrity);
}

export function summarizeOrganicDemandIntegrity(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.filter((project) => project.organicDemandIntegrity);
  const blocks = analyzed.filter((project) => project.organicDemandVerdict === "Institutional Integrity Block");
  const anomalies = analyzed.filter((project) => project.organicDemandVerdict === "Tradable Anomaly / Verify Organic Demand");
  const confirmed = analyzed.filter((project) => project.organicDemandVerdict === "Organic Demand Confirmed");
  const verification = analyzed.filter((project) => project.organicDemandVerdict === "Economic Verification Required");

  return {
    generatedAt: new Date().toISOString(),
    name: "Organic Demand and Economic Integrity",
    disclaimer: "Research risk-control model only. It does not recommend buying, selling, or holding any asset.",
    totalProjects: safeProjects.length,
    analyzedProjects: analyzed.length,
    confirmedOrganicDemand: confirmed.length,
    institutionalBlocks: blocks.length,
    tradableAnomalies: anomalies.length,
    verificationRequired: verification.length,
    topConfirmed: confirmed
      .sort((a, b) => num(b.organicEconomicIntegrityScore) - num(a.organicEconomicIntegrityScore))
      .slice(0, 25)
      .map(compact),
    topRisks: [...analyzed]
      .sort((a, b) => num(b.economicIntegrityRiskScore) - num(a.economicIntegrityRiskScore))
      .slice(0, 50)
      .map(compact),
    topScores: [...analyzed]
      .sort((a, b) => num(b.organicEconomicIntegrityScore) - num(a.organicEconomicIntegrityScore))
      .slice(0, 50)
      .map(compact),
  };
}
