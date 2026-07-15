function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function includesAny(text = "", words = []) {
  return words.some((word) => text.includes(word));
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.riskVerdict,
    project.proofVerdict,
    project.aiThesis?.memo,
    project.opportunityThesis,
    ...(project.topRisks || []).map((item) => item.text || item.summary || item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function distressSignals(project = {}) {
  const text = textFor(project);
  const signals = [];

  if (num(project.priceDrawdownPct || project.drawdownFromAthPct) >= 80) signals.push("Major historical drawdown.");
  if (num(project.liquidityChange30dPct) <= -45 || project.liquidityCollapsed) signals.push("Liquidity has collapsed.");
  if (project.exchangeDelisted || includesAny(text, ["delisted", "delisting"])) signals.push("Exchange delisting risk.");
  if (num(project.developerActivityScore ?? project.developerScore) <= 10 || project.developmentAbandoned) signals.push("Development appears abandoned.");
  if (num(project.protocolFees30d) === 0 && project.requiresProtocolUsage) signals.push("Protocol fees are zero.");
  if (num(project.activeUsers30d) === 0 && project.requiresProtocolUsage) signals.push("Product usage is zero.");
  if (includesAny(text, ["team departure", "insolvency", "exploit", "roadmap delay", "market maker exit"])) signals.push("Distress language detected.");
  if (num(project.tokenUnlockRiskScore) >= 70 || num(project.vestingPressureScore) >= 70) signals.push("Large unlock or vesting pressure.");
  if (project.purchaseRouteConfirmed === false || project.proofOfAlphaExecutionTwinVerdict === "Execution Route Block") signals.push("No verified purchase route.");

  return signals;
}

function turnaroundEvidence(project = {}) {
  const evidence = [];

  if (num(project.developerActivityScore ?? project.developerScore) >= 55 || num(project.githubProScore) >= 55) evidence.push("Renewed development.");
  if (num(project.adoptionAccelerationScore) >= 55 || num(project.organicBuyerScore) >= 55 || num(project.buyerRetentionScore) >= 55) evidence.push("Renewed usage or retention.");
  if (num(project.protocolRevenueGrowthPct) > 0 || num(project.protocolFees30d) > 0) evidence.push("Renewed revenue or fees.");
  if (num(project.liquidityGrowth30d) > 0 || num(project.liquidityFormationScore) >= 55) evidence.push("New liquidity formation.");
  if (num(project.ecosystemIntegrationScore) >= 55 || num(project.partnershipScore) >= 55) evidence.push("New integrations or ecosystem activity.");
  if (num(project.liveCatalystRadarScore) >= 60 || num(project.roadmapProfitabilityScore) >= 60) evidence.push("New product or catalyst path.");
  if (project.verifiedTeamActivity || num(project.sourceTruthScore) >= 65) evidence.push("Verified team or source activity.");
  if (num(project.tokenValueCaptureScore) >= 55) evidence.push("Improving token value capture.");

  return evidence;
}

export function analyzeDistressedMicrocapTrap(project = {}) {
  const distress = distressSignals(project);
  const turnaround = turnaroundEvidence(project);
  const zeroUsage =
    project.requiresProtocolUsage &&
    num(project.activeUsers30d) === 0 &&
    num(project.protocolFees30d) === 0;
  const severeUnresolvedDistress =
    project.exchangeDelisted ||
    project.developmentAbandoned ||
    zeroUsage ||
    project.liquidityCollapsed ||
    project.purchaseRouteConfirmed === false;
  const verifiedRescue =
    project.verifiedRelaunch ||
    project.verifiedTurnaround ||
    project.verifiedTeamActivity ||
    num(project.activeUsers30d) > 0 ||
    num(project.protocolFees30d) > 0 ||
    num(project.protocolRevenueGrowthPct) >= 35;
  const distressScore = clamp(
    distress.length * 14 +
      Math.max(num(project.trapRiskScore), num(project.riskScore)) * 0.38 +
      Math.max(num(project.priceDrawdownPct || project.drawdownFromAthPct) - 60, 0) * 0.42
  );
  const recoveryScore = average([
    project.developerActivityScore ?? project.developerScore,
    project.adoptionAccelerationScore,
    project.liquidityFormationScore,
    project.protocolRevenueGrowthPct,
    project.ecosystemIntegrationScore,
    project.liveCatalystRadarScore,
    project.tokenValueCaptureScore,
  ]);
  const trapScore = Math.round(clamp(distressScore - turnaround.length * 9 - recoveryScore * 0.18));
  const legitimateTurnaround =
    distress.length > 0 &&
    turnaround.length >= 3 &&
    recoveryScore >= 50 &&
    trapScore < 55 &&
    (!severeUnresolvedDistress || verifiedRescue);
  const block =
    distress.length >= 2 &&
    !legitimateTurnaround &&
    (severeUnresolvedDistress || trapScore >= 45 || num(project.priceDrawdownPct || project.drawdownFromAthPct) >= 80);
  const verdict = legitimateTurnaround
    ? "Verified Reacceleration Candidate"
    : block
    ? "Distressed Microcap Trap"
    : distress.length
    ? "Distress Watch"
    : "No Distress Trap Detected";

  return {
    ...project,
    distressedTrapScore: trapScore,
    distressedTrapVerdict: verdict,
    distressedTrapBlock: block,
    legitimateReacceleration: legitimateTurnaround,
    distressedTrapSignals: distress,
    turnaroundEvidence: turnaround,
    distressedMicrocapTrap: {
      score: trapScore,
      verdict,
      block,
      legitimateTurnaround,
      distressSignals: distress,
      turnaroundEvidence: turnaround,
      recoveryScore,
    },
  };
}

export function analyzeDistressedMicrocapTrapBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeDistressedMicrocapTrap);
}
