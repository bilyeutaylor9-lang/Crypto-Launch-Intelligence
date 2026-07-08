// src/engines/narrativeLaunchStakingEngine.js

/**
 * Crypto Launch Intelligence
 * Advanced Narrative + Launch + Staking Engine
 *
 * Purpose:
 * Finds projects with strong narratives, upcoming launch signals,
 * staking/restaking momentum, and dangerous staking red flags.
 */

const HOT_NARRATIVES = {
  ai: {
    weight: 18,
    keywords: ["ai", "agent", "agents", "llm", "inference", "compute", "autonomous"]
  },
  depin: {
    weight: 16,
    keywords: ["depin", "gpu", "storage", "wireless", "node network", "physical infrastructure"]
  },
  rwa: {
    weight: 16,
    keywords: ["rwa", "real world asset", "tokenized", "treasury", "credit", "yield"]
  },
  stablecoin: {
    weight: 14,
    keywords: ["stablecoin", "payments", "settlement", "remittance", "usd", "usdc"]
  },
  zkPrivacy: {
    weight: 13,
    keywords: ["zk", "zero knowledge", "privacy", "proof", "identity"]
  },
  restaking: {
    weight: 18,
    keywords: ["restaking", "avs", "shared security", "liquid restaking", "lrt"]
  },
  staking: {
    weight: 14,
    keywords: ["staking", "stake", "validator", "delegation", "staking rewards"]
  },
  launchpad: {
    weight: 15,
    keywords: ["launchpad", "ido", "ico", "presale", "fair launch", "token sale"]
  },
  perps: {
    weight: 12,
    keywords: ["perp", "perpetual", "derivatives", "onchain trading"]
  },
  modular: {
    weight: 12,
    keywords: ["modular", "rollup", "appchain", "data availability", "da layer"]
  }
};

const LAUNCH_SIGNALS = {
  tge: ["tge", "token generation event"],
  mainnet: ["mainnet", "mainnet launch"],
  testnet: ["testnet", "incentivized testnet"],
  airdrop: ["airdrop", "snapshot", "points"],
  whitelist: ["whitelist", "waitlist", "early access"],
  presale: ["presale", "ico", "ido", "token sale"],
  listing: ["listing soon", "exchange listing", "cex listing"],
  audit: ["audit complete", "audited by", "security audit"]
};

const STAKING_POSITIVE_SIGNALS = {
  stakingLive: ["staking is live", "stake now", "staking live"],
  lockup: ["lockup", "locked staking", "vesting staking"],
  validator: ["validator", "delegate", "delegation"],
  liquidStaking: ["liquid staking", "lst", "staking receipt token"],
  restaking: ["restaking", "liquid restaking", "lrt", "avs"],
  rewards: ["staking rewards", "apr", "apy", "reward pool"],
  stakeToQualify: ["stake to qualify", "stake for airdrop", "stake for allocation"],
  governance: ["governance staking", "vote escrow", "ve token"]
};

const RISK_SIGNALS = {
  insaneApy: ["1000% apy", "500% apy", "guaranteed apy", "risk free yield"],
  unclearLockup: ["hidden lockup", "cannot withdraw", "withdrawals disabled"],
  slashing: ["slashing", "validator penalty"],
  unaudited: ["unaudited", "audit pending", "no audit"],
  custodial: ["custodial staking", "exchange staking"],
  exploit: ["exploit", "hack", "drained", "rug", "scam"]
};

function normalizeText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.websiteText,
    project.twitterBio,
    project.announcement,
    project.blog,
    project.docs,
    project.category,
    project.tags,
    project.staking,
    project.tokenomics,
    project.roadmap,
    project.launchInfo
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findMatches(text, dictionary) {
  const matches = [];

  for (const [group, value] of Object.entries(dictionary)) {
    const keywords = Array.isArray(value) ? value : value.keywords;
    const hits = keywords.filter((keyword) => text.includes(keyword));

    if (hits.length > 0) {
      matches.push({
        group,
        hits,
        weight: value.weight || hits.length * 10
      });
    }
  }

  return matches;
}

function scoreNarratives(text) {
  const matches = findMatches(text, HOT_NARRATIVES);
  const score = matches.reduce((sum, item) => {
    return sum + Math.min(item.weight, item.hits.length * item.weight);
  }, 0);

  return {
    score: Math.min(100, score),
    matches
  };
}

function scoreLaunch(text) {
  const matches = findMatches(text, LAUNCH_SIGNALS);
  const score = matches.length * 14;

  return {
    score: Math.min(100, score),
    matches
  };
}

function scoreStaking(text, project = {}) {
  const matches = findMatches(text, STAKING_POSITIVE_SIGNALS);

  let score = matches.length * 12;

  const apy = Number(project.apy || project.stakingApy || 0);
  const stakingRatio = Number(project.stakingRatio || project.percentStaked || 0);

  if (apy > 0 && apy <= 25) score += 15;
  if (apy > 25 && apy <= 80) score += 8;
  if (apy > 100) score -= 15;

  if (stakingRatio >= 20 && stakingRatio <= 70) score += 15;
  if (stakingRatio > 85) score -= 10;

  return {
    score: Math.max(0, Math.min(100, score)),
    matches,
    apy,
    stakingRatio
  };
}

function scoreRisk(text, project = {}) {
  const matches = findMatches(text, RISK_SIGNALS);

  let score = matches.length * 15;

  const apy = Number(project.apy || project.stakingApy || 0);
  const liquidityUsd = Number(project.liquidityUsd || project.liquidity || 0);

  if (apy >= 100) score += 15;
  if (apy >= 300) score += 25;
  if (liquidityUsd > 0 && liquidityUsd < 50000) score += 15;

  return {
    score: Math.min(100, score),
    matches
  };
}

function getTier(score, riskScore) {
  if (riskScore >= 70) return "High Risk / Avoid";
  if (score >= 85) return "A+ Launch Narrative";
  if (score >= 72) return "A Strong Watchlist";
  if (score >= 58) return "B Early Signal";
  if (score >= 42) return "C Weak Signal";
  return "D Ignore";
}

function buildEvidence({ narrative, launch, staking, risk }) {
  const evidence = [];

  for (const item of narrative.matches) {
    evidence.push(`Narrative match: ${item.group} (${item.hits.join(", ")})`);
  }

  for (const item of launch.matches) {
    evidence.push(`Launch signal: ${item.group} (${item.hits.join(", ")})`);
  }

  for (const item of staking.matches) {
    evidence.push(`Staking signal: ${item.group} (${item.hits.join(", ")})`);
  }

  for (const item of risk.matches) {
    evidence.push(`Risk signal: ${item.group} (${item.hits.join(", ")})`);
  }

  if (staking.apy > 0) evidence.push(`Detected staking APY: ${staking.apy}%`);
  if (staking.stakingRatio > 0) evidence.push(`Detected staking ratio: ${staking.stakingRatio}%`);

  return evidence;
}

export function analyzeNarrativeLaunchStaking(project = {}) {
  const text = normalizeText(project);

  const narrative = scoreNarratives(text);
  const launch = scoreLaunch(text);
  const staking = scoreStaking(text, project);
  const risk = scoreRisk(text, project);

  const opportunityScore = Math.round(
    narrative.score * 0.35 +
    launch.score * 0.25 +
    staking.score * 0.25 -
    risk.score * 0.15
  );

  const finalScore = Math.max(0, Math.min(100, opportunityScore));

  return {
    ...project,

    narrativeScore: narrative.score,
    launchReadinessScore: launch.score,
    stakingMomentumScore: staking.score,
    stakingRiskScore: risk.score,

    narrativeLaunchStakingScore: finalScore,
    narrativeLaunchStakingTier: getTier(finalScore, risk.score),

    matchedNarratives: narrative.matches,
    launchSignals: launch.matches,
    stakingSignals: staking.matches,
    stakingRiskSignals: risk.matches,

    evidence: [
      ...(project.evidence || []),
      ...buildEvidence({ narrative, launch, staking, risk })
    ]
  };
}

export function analyzeNarrativeLaunchStakingBatch(projects = []) {
  return projects.map(analyzeNarrativeLaunchStaking);
}
