function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ageHours(project = {}) {
  const date = project.pairCreatedAt || project.createdAt || project.launchDate || project.nativeLifecycle?.firstSeenAt;
  const time = date ? new Date(date).getTime() : 0;
  return Number.isFinite(time) && time > 0 ? Math.max(0, (Date.now() - time) / 36e5) : null;
}

function lifecycleStage(project = {}) {
  if (project.rugged || project.instantSafetyStatus === "CRITICAL") return "RUGGED";
  if (project.failed || project.nativeLifecycle?.failureEvents?.length) return "FAILED";
  if (num(project.volume24h) <= 0 && ageHours(project) !== null && ageHours(project) > 24 * 30) return "DORMANT";

  const nativeStage = project.nativeLifecycleStage || project.nativeLifecycle?.currentStage;
  if (nativeStage === "TOKEN_DEPLOYED") return "CONTRACT_DETECTED";
  if (!project.poolAddress && !project.pairAddress && nativeStage === "DISCOVERED") return "PRE_POOL";
  if (nativeStage === "POOL_CREATED" || nativeStage === "POOL_INITIALIZED") return "POOL_CREATED";
  if (nativeStage === "FIRST_LIQUIDITY_ADDED") return "INITIAL_LIQUIDITY";
  if (nativeStage === "FIRST_SWAP") return "PRICE_DISCOVERY";
  if (["FIRST_EXTERNAL_BUYER", "BUYER_MILESTONE"].includes(nativeStage)) return "EARLY_TRACTION";
  if (num(project.independentBuyers24h) >= 100 || num(project.organicDemandFirewallScore) >= 75) return "VALIDATED_GROWTH";
  if (num(project.marketCap) >= 50_000_000 || num(project.holders) >= 50_000) return "ESTABLISHED";
  if (num(project.liquidityUsd) > 0 && num(project.volume24h) > 0) return "PRICE_DISCOVERY";
  if (project.address || project.tokenAddress || project.contractAddress) return "CONTRACT_DETECTED";
  return "PRE_POOL";
}

function requirementsFor(stage = "") {
  const map = {
    CONTRACT_DETECTED: ["identity resolution", "contract safety", "deployer reputation"],
    PRE_POOL: ["identity proof", "launch source", "contract deployer check"],
    POOL_CREATED: ["pool provenance", "LP control", "buy/sell simulation"],
    INITIAL_LIQUIDITY: ["usable liquidity", "deployer behavior", "contract safety"],
    PRICE_DISCOVERY: ["sell simulation", "wash trading check", "tax check"],
    EARLY_TRACTION: ["independent buyers", "retention", "smart wallet arrival"],
    VALIDATED_GROWTH: ["buyer acceleration", "liquidity expansion", "organic social/dev proof"],
    ESTABLISHED: ["revenue/usage", "holder retention", "tokenomics sustainability"],
    FAILED: ["failure reason", "source autopsy"],
    RUGGED: ["critical risk record", "deployer lineage update"],
    DORMANT: ["fresh catalyst", "liquidity revival", "activity proof"],
  };

  return map[stage] || ["identity proof", "safety proof"];
}

export function analyzeCandidateLifecycle(project = {}) {
  const stage = lifecycleStage(project);
  const requirements = requirementsFor(stage);
  const satisfied = requirements.filter((requirement) => {
    if (/identity/.test(requirement)) return num(project.identityResolutionScore) >= 45;
    if (/contract|safety|sell|tax/.test(requirement)) return ["PASS", "WATCH"].includes(project.instantSafetyStatus);
    if (/deployer/.test(requirement)) return num(project.deployerRiskScore) < 60;
    if (/liquidity|LP/.test(requirement)) return num(project.activeLiquidityTruthScore) >= 45 || num(project.liquidityUsd) > 0;
    if (/independent|buyer|retention/.test(requirement)) return num(project.organicDemandFirewallScore || project.organicBuyerScore) >= 50;
    if (/smart wallet/.test(requirement)) return num(project.smartWalletArrivalScore) >= 50;
    if (/wash/.test(requirement)) return num(project.washTradingRiskScore) < 60;
    if (/social|dev/.test(requirement)) return Math.max(num(project.githubProScore), num(project.socialAccelerationScore), num(project.communityGrowthScore)) >= 45;
    if (/revenue|usage|tokenomics/.test(requirement)) return Math.max(num(project.tokenomicsScore), num(project.ecosystemIntegrationScore), num(project.tvlGrowthScore)) >= 45;
    return false;
  });
  const readinessScore = Math.round(Math.min(100, (satisfied.length / Math.max(1, requirements.length)) * 100));

  return {
    ...project,
    candidateLifecycleStage: stage,
    candidateLifecycleReadinessScore: readinessScore,
    candidateLifecycle: {
      stage,
      ageHours: ageHours(project),
      requirements,
      satisfied,
      missing: requirements.filter((requirement) => !satisfied.includes(requirement)),
    },
  };
}

export function analyzeCandidateLifecycleBatch(projects = []) {
  return projects.map((project) => analyzeCandidateLifecycle(project));
}
