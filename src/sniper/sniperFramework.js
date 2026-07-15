export const SNIPER_STATES = [
  "DISCOVERED",
  "IDENTITY_PENDING",
  "UNVERIFIED",
  "FORMING",
  "EARLY_BUILD",
  "LIQUIDITY_FORMING",
  "QUIET_ACCUMULATION",
  "FUNDAMENTALS_ACCELERATING",
  "ARMED",
  "BREAKOUT_STARTING",
  "CONFIRMED_EXPANSION",
  "LATE_CHASE",
  "FAILED_BREAKOUT",
  "DISTRIBUTION",
  "DISTRESSED",
  "RECOVERY_ATTEMPT",
  "INVALIDATED",
  "BLOCKED",
];

export const SNIPER_OUTCOME_LABELS = [
  "SNIPER_SUCCESS",
  "EARLY_BUT_SUCCESSFUL",
  "TOO_EARLY",
  "LATE_DISCOVERY",
  "FAILED_BREAKOUT",
  "SLOW_BLEED",
  "IMMEDIATE_DUMP",
  "RUG_OR_HONEYPOT",
  "UNTRADEABLE_WINNER",
  "DEAD_CAT_BOUNCE",
  "DISTRESSED_RECOVERY",
  "CORRECT_REJECTION",
  "INSUFFICIENT_HISTORY",
];

export const EVIDENCE_FAMILIES = [
  "IDENTITY",
  "CONTRACT_SAFETY",
  "LIQUIDITY",
  "ORGANIC_BUYERS",
  "SMART_WALLETS",
  "HOLDER_DISTRIBUTION",
  "DEVELOPMENT",
  "PRODUCT_DELIVERY",
  "ADOPTION",
  "REVENUE",
  "NARRATIVE",
  "CATALYSTS",
  "TOKENOMICS",
  "MARKET_STRUCTURE",
  "MARKET_REGIME",
  "MANIPULATION_RISK",
];

export const CRITICAL_DATA_FIELDS = [
  "identity",
  "chain",
  "contract",
  "liquidity",
  "exitDepth",
  "purchaseRoute",
  "contractSafety",
  "priceSource",
  "supplyData",
  "holderDistribution",
];

export function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

export function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0 && num(item.weight) > 0);
  if (!active.length) return 0;
  const total = active.reduce((sum, item) => sum + num(item.score) * num(item.weight), 0);
  const weight = active.reduce((sum, item) => sum + num(item.weight), 0);
  return clamp(total / weight);
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function toTime(value) {
  if (!value) return null;
  const raw = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(raw) ? raw : null;
}

export function isoTime(value) {
  const raw = toTime(value);
  return raw ? new Date(raw).toISOString() : null;
}

export function hoursBetween(start, end) {
  const a = toTime(start);
  const b = toTime(end);
  if (!a || !b) return null;
  return Math.round(((b - a) / 3600000) * 10) / 10;
}

export function confidenceLabel(score = 0) {
  const value = num(score);
  if (value >= 85) return "Very High";
  if (value >= 75) return "High";
  if (value >= 60) return "Medium";
  if (value >= 40) return "Low";
  return "Insufficient";
}

export function freshnessFromTimestamp(timestamp, now = Date.now()) {
  const raw = toTime(timestamp);
  if (!raw) return 0.65;
  const ageHours = Math.max(0, (now - raw) / 3600000);
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.92;
  if (ageHours <= 72) return 0.78;
  if (ageHours <= 168) return 0.62;
  return 0.45;
}

export function evidenceScore(score, confidence = 70, freshness = 1) {
  return Math.round(clamp(num(score) * (clamp(confidence) / 100) * clamp(freshness, 0, 1)));
}

export function projectKey(project = {}) {
  const chain = lower(project.chainId || project.finalChainId || project.chain || project.finalChain || "unknown");
  const contract = lower(
    project.finalContractAddress ||
      project.contractAddress ||
      project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.id ||
      project.symbol ||
      "unknown"
  );
  return `${chain}:${contract}`;
}

export function identityState(project = {}) {
  if (project.finalIdentityState) return project.finalIdentityState;
  if (project.identityConflict) return "CONFLICTED_IDENTITY";
  if (project.impersonationRisk || project.impersonationRiskScore >= 60) return "IMPERSONATION_RISK";
  if (project.identityVerified && (project.contractVerified || project.contractAddress)) return "VERIFIED_CONTRACT";
  if (project.exchangeAssetId || project.coinbaseAssetId || project.exchangeVerified) return "VERIFIED_EXCHANGE_ASSET";
  if (project.discoveryLane === "prelaunch" && project.officialWebsite && project.githubOrg) return "VERIFIED_PRELAUNCH_PROJECT";
  if (project.contractAddress || project.address || project.tokenAddress) return "PROBABLE_MATCH";
  if (project.symbol && !project.contractAddress && !project.address && !project.tokenAddress) return "SYMBOL_ONLY";
  return "UNRESOLVED";
}

export function criticalMissingData(project = {}) {
  const missing = [];
  const state = identityState(project);
  const hasContract = Boolean(project.finalContractAddress || project.contractAddress || project.address || project.tokenAddress);
  const hasChain = Boolean(project.chainId || project.finalChainId || project.chain || project.finalChain);
  const hasLiquidity = num(project.liquidityUsd || project.finalLiquidityUsd || project.activeLiquidityUsd || project.hardExitLiquidityUsd) > 0;
  const hasExitDepth = num(project.hardExitLiquidityUsd || project.depthWithin2Pct || project.exitLiquidityScore || project.liquidityUsd) > 0;
  const hasPurchaseRoute =
    project.purchaseRouteConfirmed === true ||
    project.purchaseRoute?.purchasable === true ||
    project.smallCapHunter?.purchaseRoute?.purchasable === true;
  const contractSafety =
    project.contractSafetyPassed === true ||
    project.instantSafetyGatePassed === true ||
    (num(project.honeypotRiskScore) < 70 && project.honeypotDetected !== true);

  if (["SYMBOL_ONLY", "UNRESOLVED", "CONFLICTED_IDENTITY", "IMPERSONATION_RISK"].includes(state)) missing.push("identity");
  if (!hasChain) missing.push("chain");
  if (!hasContract && state !== "VERIFIED_PRELAUNCH_PROJECT") missing.push("contract");
  if (!hasLiquidity && state !== "VERIFIED_PRELAUNCH_PROJECT") missing.push("liquidity");
  if (!hasExitDepth && state !== "VERIFIED_PRELAUNCH_PROJECT") missing.push("exitDepth");
  if (!hasPurchaseRoute && state !== "VERIFIED_PRELAUNCH_PROJECT") missing.push("purchaseRoute");
  if (!contractSafety) missing.push("contractSafety");
  if (!project.priceUsd && !project.price && !project.priceSource && state !== "VERIFIED_PRELAUNCH_PROJECT") missing.push("priceSource");
  if (!project.circulatingSupply && !project.supplyDataConfidence && !project.circulatingSupplyConfidence) missing.push("supplyData");
  if (
    project.top10HolderPct == null &&
    project.holderDistributionScore == null &&
    project.walletClusterScore == null &&
    state !== "VERIFIED_PRELAUNCH_PROJECT"
  ) {
    missing.push("holderDistribution");
  }

  return unique(missing);
}

export function valueAt(project = {}, keys = []) {
  for (const key of keys) {
    if (project[key] != null) return project[key];
  }
  return undefined;
}
