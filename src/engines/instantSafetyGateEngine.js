function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function bool(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "enabled"].includes(String(value || "").toLowerCase());
}

function statusFor(score = 0, critical = 0, restricted = 0, verified = false) {
  if (critical > 0) return "CRITICAL";
  if (restricted > 0 || score < 45) return "RESTRICTED";
  if (!verified) return "UNVERIFIED";
  if (score >= 75) return "PASS";
  return "WATCH";
}

export function analyzeInstantSafetyGate(project = {}) {
  const checks = {
    buySimulationPassed: project.buySimulationPassed ?? project.tradeSimulation?.buyPassed ?? (project.honeypotRiskScore ? num(project.honeypotRiskScore) < 50 : null),
    sellSimulationPassed: project.sellSimulationPassed ?? project.tradeSimulation?.sellPassed ?? (project.honeypotRiskScore ? num(project.honeypotRiskScore) < 45 : null),
    buyTaxPct: num(project.buyTaxPct || project.tradeSimulation?.buyTaxPct),
    sellTaxPct: num(project.sellTaxPct || project.tradeSimulation?.sellTaxPct),
    honeypotRiskScore: num(project.honeypotRiskScore),
    hiddenTransferRestriction: bool(project.hiddenTransferRestriction || project.transferRestricted),
    mintAuthority: bool(project.mintAuthority || project.canMint),
    blacklistAuthority: bool(project.blacklistAuthority || project.canBlacklist),
    pauseAuthority: bool(project.pauseAuthority || project.canPause),
    proxyUpgradeable: bool(project.proxyUpgradeable || project.upgradeableProxy),
    ownershipRenounced: bool(project.ownerRenounced || project.ownershipRenounced),
    lpLocked: bool(project.lpLocked || project.liquidityLocked),
    liquidityRemovalCapability: bool(project.liquidityRemovalCapability || project.lpRemovalCapability),
    topHolderPct: num(project.topHolderPct || project.top10HolderPct || project.topHolderConcentrationPct),
    deployerTokenAllocationPct: num(project.deployerTokenAllocationPct || project.teamAllocationPct),
  };
  const criticalReasons = [
    ...(checks.sellSimulationPassed === false ? ["sell simulation failed"] : []),
    ...(checks.honeypotRiskScore >= 80 ? ["honeypot risk critical"] : []),
    ...(checks.hiddenTransferRestriction ? ["hidden transfer restriction"] : []),
    ...(checks.blacklistAuthority ? ["blacklist authority"] : []),
  ];
  const restrictedReasons = [
    ...(checks.buySimulationPassed === false ? ["buy simulation failed"] : []),
    ...(checks.sellTaxPct >= 20 || checks.buyTaxPct >= 20 ? ["extreme buy/sell tax"] : []),
    ...(checks.mintAuthority ? ["mint authority active"] : []),
    ...(checks.pauseAuthority ? ["pause authority active"] : []),
    ...(checks.proxyUpgradeable ? ["proxy upgrade permission"] : []),
    ...(checks.liquidityRemovalCapability ? ["liquidity removal capability"] : []),
    ...(checks.topHolderPct >= 45 ? ["top-holder concentration critical"] : []),
    ...(checks.deployerTokenAllocationPct >= 35 ? ["deployer token allocation high"] : []),
  ];
  const watchReasons = [
    ...(checks.sellTaxPct >= 8 || checks.buyTaxPct >= 8 ? ["meaningful buy/sell tax"] : []),
    ...(!checks.ownershipRenounced ? ["ownership not renounced or unknown"] : []),
    ...(!checks.lpLocked ? ["LP lock unknown or missing"] : []),
    ...(checks.topHolderPct >= 25 && checks.topHolderPct < 45 ? ["top-holder concentration watch"] : []),
  ];
  const verified = checks.buySimulationPassed !== null || checks.sellSimulationPassed !== null || checks.honeypotRiskScore > 0 || checks.lpLocked || checks.ownershipRenounced;
  const risk = clamp(
    criticalReasons.length * 35 +
      restrictedReasons.length * 16 +
      watchReasons.length * 6 +
      checks.honeypotRiskScore * 0.45 +
      Math.max(0, checks.sellTaxPct - 5) * 1.4 +
      Math.max(0, checks.buyTaxPct - 5) * 1.1
  );
  const score = Math.round(clamp(92 - risk + (checks.ownershipRenounced ? 6 : 0) + (checks.lpLocked ? 8 : 0)));
  const status = statusFor(score, criticalReasons.length, restrictedReasons.length, verified);

  return {
    ...project,
    instantSafetyScore: score,
    instantSafetyRiskScore: Math.round(risk),
    instantSafetyStatus: status,
    instantSafetyGate: {
      status,
      score,
      riskScore: Math.round(risk),
      checks,
      criticalReasons,
      restrictedReasons,
      watchReasons,
      hardCapTier:
        status === "CRITICAL" ? "Do Not Promote" : status === "RESTRICTED" ? "Research Only" : status === "UNVERIFIED" ? "Watch Only" : "No Safety Cap",
    },
  };
}

export function analyzeInstantSafetyGateBatch(projects = []) {
  return projects.map((project) => analyzeInstantSafetyGate(project));
}
