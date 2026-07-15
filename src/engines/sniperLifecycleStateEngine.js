import {
  average,
  criticalMissingData,
  hoursBetween,
  identityState,
  isoTime,
  num,
  toTime,
  unique,
} from "../sniper/sniperFramework.js";

const EVENT_KEYS = {
  liquidity: ["liquidityUsd", "liquidityFormationScore", "liquidityExpansionScore"],
  wallets: ["smartWalletAccumulationScore", "smartMoneyAccumulationScore", "smartWalletScore"],
  developers: ["developerActivityScore", "githubProScore", "githubVelocityScore"],
  adoption: ["adoptionAccelerationScore", "realAdoptionScore", "buyerRetentionScore", "organicBuyerScore"],
  narrative: ["narrativeEmergenceScore", "narrativeHeatScore", "narrativeForecastScore"],
  social: ["xSocialScore", "socialAccelerationScore", "socialMentionVelocity"],
  price: ["priceChange24h", "priceChange7d", "preBreakoutMomentumScore"],
};

function history(project = {}) {
  return Array.isArray(project.signalHistory)
    ? project.signalHistory
    : Array.isArray(project.history)
    ? project.history
    : Array.isArray(project.scanHistory)
    ? project.scanHistory
    : [];
}

function firstAt(project = {}, family, threshold = 60) {
  const records = history(project);
  const keys = EVENT_KEYS[family] || [];
  const directKey = `first${family[0].toUpperCase()}${family.slice(1)}AccelerationAt`;
  if (project[directKey]) return isoTime(project[directKey]);

  for (const record of records) {
    const score = family === "price" ? Math.max(...keys.map((key) => num(record[key]))) : average(keys.map((key) => record[key]));
    if (score >= threshold) return isoTime(record.timestamp || record.observationTimestamp || record.scanTimestamp);
  }

  const current = family === "price" ? Math.max(...keys.map((key) => num(project[key]))) : average(keys.map((key) => project[key]));
  if (current >= threshold) return isoTime(project.observationTimestamp || project.scanTimestamp || project.firstSeenAt);
  return null;
}

function ledPrice(signalAt, priceAt) {
  const signal = toTime(signalAt);
  const price = toTime(priceAt);
  return Boolean(signal && price && signal < price);
}

function persistentScanCount(project = {}) {
  if (num(project.persistentScanCount) > 0) return num(project.persistentScanCount);
  const records = history(project);
  if (!records.length) return project.signalPersistenceScore >= 70 ? 3 : project.signalPersistenceScore >= 55 ? 2 : 1;
  return records.filter((record) => average([
    record.liquidityFormationScore,
    record.smartWalletAccumulationScore,
    record.developerActivityScore,
    record.adoptionAccelerationScore,
    record.score,
  ]) >= 55).length;
}

export function buildSignalSequenceFeatures(project = {}) {
  const firstLiquidityAccelerationAt = firstAt(project, "liquidity");
  const firstSmartWalletEntryAt = firstAt(project, "wallets");
  const firstDeveloperAccelerationAt = firstAt(project, "developers");
  const firstAdoptionAccelerationAt = firstAt(project, "adoption");
  const firstNarrativeAccelerationAt = firstAt(project, "narrative");
  const firstSocialSpikeAt = firstAt(project, "social", 70);
  const firstPriceBreakoutAt = firstAt(project, "price", 65);

  return {
    firstLiquidityAccelerationAt,
    firstSmartWalletEntryAt,
    firstDeveloperAccelerationAt,
    firstAdoptionAccelerationAt,
    firstNarrativeAccelerationAt,
    firstSocialSpikeAt,
    firstPriceBreakoutAt,
    liquidityLedPrice: ledPrice(firstLiquidityAccelerationAt, firstPriceBreakoutAt),
    walletsLedPrice: ledPrice(firstSmartWalletEntryAt, firstPriceBreakoutAt),
    developersLedPrice: ledPrice(firstDeveloperAccelerationAt, firstPriceBreakoutAt),
    adoptionLedPrice: ledPrice(firstAdoptionAccelerationAt, firstPriceBreakoutAt),
    socialLedPrice: ledPrice(firstSocialSpikeAt, firstPriceBreakoutAt),
    priceLedFundamentals:
      Boolean(firstPriceBreakoutAt) &&
      ![
        firstLiquidityAccelerationAt,
        firstSmartWalletEntryAt,
        firstDeveloperAccelerationAt,
        firstAdoptionAccelerationAt,
      ].some((timestamp) => ledPrice(timestamp, firstPriceBreakoutAt)),
    hoursFromLiquidityToPrice: hoursBetween(firstLiquidityAccelerationAt, firstPriceBreakoutAt),
    hoursFromWalletsToPrice: hoursBetween(firstSmartWalletEntryAt, firstPriceBreakoutAt),
    hoursFromDevelopersToPrice: hoursBetween(firstDeveloperAccelerationAt, firstPriceBreakoutAt),
    hoursFromSocialToPrice: hoursBetween(firstSocialSpikeAt, firstPriceBreakoutAt),
  };
}

function priorState(project = {}) {
  if (project.previousSniperState) return project.previousSniperState;
  const states = Array.isArray(project.sniperStateHistory) ? project.sniperStateHistory : [];
  return states.at(-1)?.state || states.at(-1)?.sniperState || null;
}

function stateFor(project = {}, sequence = {}) {
  const missing = criticalMissingData(project);
  const state = identityState(project);
  const fundamentals = average([
    project.developerActivityScore,
    project.githubProScore,
    project.adoptionAccelerationScore,
    project.realAdoptionScore,
    project.protocolRevenueGrowthPct,
    project.liquidityFormationScore,
  ]);
  const liquidity = average([project.liquidityFormationScore, project.liquidityExpansionScore, project.activeLiquidityTruthScore]);
  const earlyBuild = average([project.developerActivityScore, project.githubProScore, project.productDeliveryScore]);

  if (project.sniperBlockingReasons?.length || project.finalSelectionState === "BLOCKED") return "BLOCKED";
  if (project.finalSelectionState === "IDENTITY_CONFLICT" || state === "CONFLICTED_IDENTITY" || state === "IMPERSONATION_RISK") return "INVALIDATED";
  if (["SYMBOL_ONLY", "UNRESOLVED"].includes(state)) return "IDENTITY_PENDING";
  if (missing.includes("contractSafety") || project.contractRisk || project.honeypotDetected) return "UNVERIFIED";
  if (project.distressedTrapBlock) return "DISTRESSED";
  if (project.legitimateReacceleration && fundamentals >= 55 && project.finalSelectionQualified !== true) return "RECOVERY_ATTEMPT";
  if (project.preBreakoutMomentumStage === "FAILED_BREAKOUT" || project.falseBreakout) return "FAILED_BREAKOUT";
  if (["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage)) return "LATE_CHASE";
  if (num(project.insiderDistributionRisk) >= 70 || num(project.sellPressureScore) >= 75) return "DISTRIBUTION";
  if (project.preBreakoutMomentumStage === "BREAKOUT_STARTING") return "BREAKOUT_STARTING";
  if (project.quietAccumulationDetected && fundamentals >= 60) return "QUIET_ACCUMULATION";
  if (fundamentals >= 70 && Object.values(sequence).some(Boolean)) return "FUNDAMENTALS_ACCELERATING";
  if (liquidity >= 60) return "LIQUIDITY_FORMING";
  if (earlyBuild >= 55) return "EARLY_BUILD";
  if (fundamentals >= 45 || project.nativeLifecycle || project.discoveryLane) return "FORMING";
  return "DISCOVERED";
}

export function analyzeSniperLifecycleState(project = {}) {
  const sniperSignalSequence = buildSignalSequenceFeatures(project);
  const previous = priorState(project);
  let sniperLifecycleState = stateFor(project, sniperSignalSequence);
  const warnings = [];

  if (previous === "DISCOVERED" && sniperLifecycleState === "ARMED") {
    sniperLifecycleState = "FORMING";
    warnings.push("State machine blocked direct DISCOVERED to ARMED transition.");
  }

  return {
    ...project,
    sniperSignalSequence,
    sniperLifecycleState,
    sniperState: project.sniperState || sniperLifecycleState,
    sniperPersistentScanCount: persistentScanCount(project),
    sniperStateTransition: previous
      ? {
          from: previous,
          to: sniperLifecycleState,
          changed: previous !== sniperLifecycleState,
        }
      : {
          from: null,
          to: sniperLifecycleState,
          changed: false,
        },
    sniperLifecycleWarnings: unique([...(project.sniperLifecycleWarnings || []), ...warnings]),
  };
}

export function analyzeSniperLifecycleStateBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeSniperLifecycleState);
}
