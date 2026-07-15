import {
  criticalMissingData,
  identityState,
  isoTime,
  projectKey,
  toTime,
  unique,
} from "../sniper/sniperFramework.js";

const FEATURE_KEYS = [
  "identityVerified",
  "contractVerified",
  "chainVerified",
  "liquidityUsd",
  "hardExitLiquidityUsd",
  "purchaseRouteConfirmed",
  "preConsensusGapScore",
  "quietAccumulationScore",
  "developerActivityScore",
  "adoptionAccelerationScore",
  "smartWalletAccumulationScore",
  "preBreakoutMomentumStage",
  "catalystTimeline",
  "tokenUnlockRiskScore",
  "washTradingRiskScore",
];

function timestampAfter(value, observationTimestamp) {
  const eventTime = toTime(value);
  const observationTime = toTime(observationTimestamp);
  return Boolean(eventTime && observationTime && eventTime > observationTime);
}

function futureLeakageChecks(project = {}, observationTimestamp) {
  const leaks = [];

  if (project.majorExchangeListed && timestampAfter(project.majorExchangeListedAt, observationTimestamp)) {
    leaks.push("Exchange listing occurred after observation.");
  }
  if (project.catalystOccurred && timestampAfter(project.catalystOccurredAt, observationTimestamp)) {
    leaks.push("Catalyst outcome occurred after observation.");
  }
  if (project.latestGithubReleaseAt && timestampAfter(project.latestGithubReleaseAt, observationTimestamp)) {
    leaks.push("GitHub release occurred after observation.");
  }
  if (project.currentHolderDistributionUsed && timestampAfter(project.holderDistributionTimestamp, observationTimestamp)) {
    leaks.push("Holder distribution timestamp is after observation.");
  }
  if (project.identityVerifiedAt && timestampAfter(project.identityVerifiedAt, observationTimestamp) && project.finalIdentityState) {
    leaks.push("Identity verification timestamp is after observation.");
  }
  if (project.futureInformationUsed || project.futureFeaturesUsed) {
    leaks.push("Project is flagged as using future information.");
  }

  return leaks;
}

function availableFeatures(project = {}) {
  return FEATURE_KEYS.reduce((features, key) => {
    if (project[key] != null) features[key] = project[key];
    return features;
  }, {});
}

function featureSources(project = {}) {
  return {
    sourceVersions: project.sourceVersions || project.providerVersions || {},
    scannerVersion: project.scannerVersion || process.env.SCANNER_VERSION || "local-dev",
    dataSourceIds: unique([
      ...(project.sourceIds || []),
      ...(project.verificationSources || []),
      ...(project.catalystTimeline || []).flatMap((item) => item.verificationSources || item.sources || []),
    ]),
  };
}

export function buildPointInTimeObservation(project = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const observationTimestamp =
    isoTime(project.observationTimestamp || project.scanTimestamp || project.firstSeenAt || options.observationTimestamp) || now;
  const sourceTimestamp = isoTime(project.sourceTimestamp || project.marketDataTimestamp || observationTimestamp) || observationTimestamp;
  const ingestionTimestamp = isoTime(project.ingestionTimestamp || now) || now;
  const leakageWarnings = futureLeakageChecks(project, observationTimestamp);
  const missingFeaturesAtObservation = criticalMissingData(project);

  return {
    projectId: project.permanentProjectKey || projectKey(project),
    observationTimestamp,
    sourceTimestamp,
    ingestionTimestamp,
    blockNumber: project.blockNumber || project.creationBlock || project.normalizedNativePool?.creationBlock || null,
    chainId: project.chainId || project.finalChainId || project.chain || project.finalChain || null,
    contractAddress:
      project.finalContractAddress || project.contractAddress || project.address || project.tokenAddress || project.normalizedNativePool?.tokenAddress || null,
    identityStateAtObservation: identityState(project),
    featuresAvailableAtObservation: availableFeatures(project),
    missingFeaturesAtObservation,
    leakageWarnings,
    pointInTimeStatus: leakageWarnings.length ? "LEAKAGE_RISK" : missingFeaturesAtObservation.length ? "INSUFFICIENT" : "PASS",
    selectionBlocked: leakageWarnings.length > 0 || missingFeaturesAtObservation.includes("identity"),
    ...featureSources(project),
  };
}

export function validatePointInTimeObservation(project = {}, options = {}) {
  const observation = project.pointInTimeObservation || buildPointInTimeObservation(project, options);
  return {
    status: observation.leakageWarnings?.length ? "FAIL" : "PASS",
    leakageWarnings: observation.leakageWarnings || [],
    missingFeaturesAtObservation: observation.missingFeaturesAtObservation || [],
  };
}

export function analyzeSniperPointInTime(project = {}, options = {}) {
  const pointInTimeObservation = buildPointInTimeObservation(project, options);

  return {
    ...project,
    pointInTimeObservation,
    pointInTimeStatus: pointInTimeObservation.pointInTimeStatus,
    pointInTimeLeakageWarnings: pointInTimeObservation.leakageWarnings,
    featuresAvailableAtObservation: pointInTimeObservation.featuresAvailableAtObservation,
    missingFeaturesAtObservation: pointInTimeObservation.missingFeaturesAtObservation,
  };
}

export function analyzeSniperPointInTimeBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeSniperPointInTime(project, options));
}
