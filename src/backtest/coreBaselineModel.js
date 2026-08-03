const DEFAULT_WEIGHTS = Object.freeze({
  independentBuyerAcceleration: 0.2,
  qualifiedSmartWalletNetFlow: 0.2,
  liquidityFormation: 0.15,
  relativeStrength: 0.15,
  volumeAcceleration: 0.1,
  verifiedCatalyst: 0.1,
  safetyExecutionQuality: 0.1,
});

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value)));
}

function getPath(object, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value?.[key], object);
}

function firstMeasured(project = {}, fields = []) {
  for (const fieldPath of fields) {
    const value = getPath(project, fieldPath);
    if (!hasNumber(value)) continue;
    return { value: Number(value), fieldPath };
  }
  return null;
}

function measuredValue(measurement) {
  return measurement ? measurement.value : null;
}

function componentMeasurements(project = {}) {
  const smartWalletDirect = firstMeasured(project, [
    "rawEvidence.qualifiedSmartWalletFlowScore",
  ]);
  const netFlow = firstMeasured(project, [
    "rawEvidence.qualifiedSmartWalletNetFlowUsd",
  ]);
  const marketCap = firstMeasured(project, [
    "circulatingMarketCapUsd",
    "marketCap",
    "market.marketCap",
  ]);
  let smartWalletFlow = smartWalletDirect;
  if (!smartWalletFlow && netFlow) {
    const denominator = measuredValue(marketCap);
    smartWalletFlow = {
      value:
        denominator && denominator > 0
          ? clamp((netFlow.value / denominator) * 5000)
          : clamp(netFlow.value / 25000),
      fieldPath: `${netFlow.fieldPath}:normalized`,
    };
  }

  const safety = firstMeasured(project, ["rawEvidence.safetyScore", "measuredSafetyScore"]);
  const route =
    project.buyQuoteVerified === true && project.sellQuoteVerified === true
      ? { value: 100, fieldPath: "buyQuoteVerified+sellQuoteVerified" }
      : project.purchaseRouteConfirmed === true && project.sellRouteAvailable === true
        ? { value: 100, fieldPath: "purchaseRouteConfirmed+sellRouteAvailable" }
        : project.purchaseRouteConfirmed === true
          ? { value: 50, fieldPath: "purchaseRouteConfirmed" }
          : null;
  const safetyParts = [safety, route].filter(Boolean);

  return {
    independentBuyerAcceleration: firstMeasured(
      project,
      ["rawEvidence.independentBuyerAccelerationScore"]
    ),
    qualifiedSmartWalletNetFlow: smartWalletFlow,
    liquidityFormation: firstMeasured(
      project,
      ["rawEvidence.liquidityFormationScore"]
    ),
    relativeStrength: firstMeasured(
      project,
      ["rawEvidence.relativeStrengthScore"]
    ),
    volumeAcceleration: firstMeasured(
      project,
      ["rawEvidence.volumeAccelerationScore"]
    ),
    verifiedCatalyst:
      project.verifiedCatalyst === false
        ? { value: 0, fieldPath: "verifiedCatalyst" }
        : firstMeasured(
            project,
            ["rawEvidence.verifiedCatalystScore"]
          ),
    safetyExecutionQuality:
      project.honeypotDetected === true || project.sellRestricted === true
        ? { value: 0, fieldPath: "deterministicSafetyBlock" }
        : safetyParts.length
          ? {
              value: safetyParts.reduce((sum, item) => sum + item.value, 0) / safetyParts.length,
              fieldPath: safetyParts.map((item) => item.fieldPath).join("+"),
            }
          : null,
  };
}

export function scoreCoreBaseline(project = {}, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const excludedFamilies = new Set(options.excludedFamilies || []);
  const minimumFamilies = Number(options.minimumFamilies ?? 4);
  const minimumCoverage = Number(options.minimumCoverage ?? 0.6);
  const measurements = componentMeasurements(project);
  const measured = Object.entries(measurements).filter(
    ([family, item]) => !excludedFamilies.has(family) && item && hasNumber(item.value)
  );
  const observedWeight = measured.reduce((sum, [key]) => sum + Number(weights[key] || 0), 0);
  const raw =
    observedWeight > 0
      ? measured.reduce(
          (sum, [key, item]) => sum + clamp(item.value) * Number(weights[key] || 0),
          0
        ) / observedWeight
      : null;

  const identityResolved = Boolean(project.identityKey && project.chain && project.tokenAddress);
  const safetyBlocked = project.honeypotDetected === true || project.sellRestricted === true;
  const eligible =
    identityResolved &&
    !safetyBlocked &&
    measured.length >= minimumFamilies &&
    observedWeight >= minimumCoverage &&
    raw !== null;

  return {
    model: "CORE_EVIDENCE_BASELINE",
    rawBaselineScore: raw === null ? null : Number(raw.toFixed(4)),
    evidenceAdjustedBaselineScore:
      raw === null ? null : Number((raw * Math.sqrt(Math.min(1, observedWeight))).toFixed(4)),
    measuredFamilies: measured.length,
    expectedFamilies: Object.keys(measurements).length,
    coverage: Number(observedWeight.toFixed(4)),
    eligible,
    identityResolved,
    safetyBlocked,
    components: Object.fromEntries(
      Object.entries(measurements).map(([key, item]) => [key, measuredValue(item)])
    ),
    componentSources: Object.fromEntries(
      Object.entries(measurements).map(([key, item]) => [key, item?.fieldPath || null])
    ),
    missingComponents: Object.entries(measurements)
      .filter(([, item]) => !item || !hasNumber(item.value))
      .map(([key]) => key),
  };
}

export { DEFAULT_WEIGHTS };
