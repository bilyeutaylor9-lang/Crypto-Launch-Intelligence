const FAMILY_FIELDS = Object.freeze({
  strictIdentity: [],
  sourceTruth: ["scores.sourceTruth"],
  activeLiquidity: ["scores.activeLiquidityTruth"],
  contractSafety: ["scores.instantSafety"],
  deployerReputation: ["scores.deployerReputation"],
  independentBuyerGrowth: ["rawEvidence.independentBuyerAccelerationScore"],
  qualifiedWalletFlow: ["rawEvidence.qualifiedSmartWalletFlowScore"],
  liquidityFormation: ["rawEvidence.liquidityFormationScore"],
  momentumRelativeStrength: ["rawEvidence.relativeStrengthScore"],
  verifiedCatalyst: ["rawEvidence.verifiedCatalystScore"],
  executionProof: [],
  outcomeCalibration: ["scores.calibration"],
});

function getPath(object, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value?.[key], object);
}

function measuredNumber(project, fieldPaths) {
  for (const fieldPath of fieldPaths) {
    const value = getPath(project, fieldPath);
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) continue;
    if (fieldPath.startsWith("scores.") && Number(value) === 0) continue;
    return Number(value);
  }
  return null;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

export function scoreCoreInstitutionalModel(project = {}, options = {}) {
  const minimumFamilies = Number(options.minimumFamilies ?? 7);
  const minimumCoverage = Number(options.minimumCoverage ?? 0.6);
  const exactIdentity = Boolean(project.identityKey && project.chain && project.tokenAddress);
  const twoWayRoute =
    (project.buyQuoteVerified === true && project.sellQuoteVerified === true) ||
    (project.purchaseRouteConfirmed === true && project.sellRouteAvailable === true);
  const components = {};
  for (const [family, fields] of Object.entries(FAMILY_FIELDS)) {
    if (family === "strictIdentity") components[family] = exactIdentity ? 100 : null;
    else if (family === "executionProof") components[family] = twoWayRoute ? 100 : null;
    else components[family] = measuredNumber(project, fields);
  }
  const measured = Object.values(components).filter((value) => value !== null);
  const coverage = measured.length / Object.keys(components).length;
  const rawScore = measured.length ? measured.reduce((sum, value) => sum + clamp(value), 0) / measured.length : null;
  const deterministicBlock = project.honeypotDetected === true || project.sellRestricted === true;
  const eligible =
    !deterministicBlock &&
    exactIdentity &&
    measured.length >= minimumFamilies &&
    coverage >= minimumCoverage &&
    rawScore !== null;
  return {
    model: "CORE_INSTITUTIONAL",
    rawScore: rawScore === null ? null : Number(rawScore.toFixed(4)),
    evidenceAdjustedScore:
      rawScore === null ? null : Number((rawScore * Math.sqrt(coverage)).toFixed(4)),
    measuredFamilies: measured.length,
    expectedFamilies: Object.keys(components).length,
    coverage: Number(coverage.toFixed(4)),
    eligible,
    deterministicBlock,
    components,
    missingFamilies: Object.entries(components)
      .filter(([, value]) => value === null)
      .map(([family]) => family),
  };
}

export { FAMILY_FIELDS };
