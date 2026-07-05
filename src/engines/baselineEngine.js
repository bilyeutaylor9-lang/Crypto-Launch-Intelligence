// src/engines/baselineEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = -100, max = 500) {
  return Math.max(min, Math.min(max, num(value)));
}

export function createBaseline(project = {}) {
  return {
    volume24h: num(project.averageVolume24h),
    liquidity: num(project.averageLiquidity),
    holders: num(project.averageHolders),
    transactions: num(project.averageTransactions),
    followers: num(project.averageFollowers),
    githubCommits: num(project.averageGithubCommits),
    developerActivity: num(project.averageDeveloperActivity),
    smartWalletActivity: num(project.averageSmartWalletActivity),
  };
}

export function calculateDeviation(current = 0, baseline = 0) {
  const c = num(current);
  const b = num(baseline);

  if (b <= 0) return 0;

  return clamp(((c - b) / b) * 100);
}

function scoreDeviation(value = 0, weight = 1) {
  const n = num(value);

  if (n >= 300) return 20 * weight;
  if (n >= 150) return 16 * weight;
  if (n >= 75) return 12 * weight;
  if (n >= 35) return 8 * weight;
  if (n >= 15) return 4 * weight;
  if (n <= -50) return -8 * weight;
  if (n <= -25) return -4 * weight;

  return 0;
}

function baselineLevel(score = 0) {
  if (score >= 85) return "extreme breakout from baseline";
  if (score >= 70) return "strong abnormal activity";
  if (score >= 50) return "early abnormal activity";
  if (score >= 30) return "mild deviation";
  return "normal";
}

function buildReasons(deviation = {}) {
  const reasons = [];

  if (deviation.volume >= 35) reasons.push("Volume is above historical baseline.");
  if (deviation.liquidity >= 35) reasons.push("Liquidity is above historical baseline.");
  if (deviation.holders >= 35) reasons.push("Holder count is above historical baseline.");
  if (deviation.followers >= 35) reasons.push("Followers are above historical baseline.");
  if (deviation.transactions >= 35) reasons.push("Transactions are above historical baseline.");
  if (deviation.developerActivity >= 35) reasons.push("Developer activity is above historical baseline.");
  if (deviation.smartWalletActivity >= 35) reasons.push("Smart wallet activity is above historical baseline.");

  if (!reasons.length) reasons.push("Activity remains near normal historical baseline.");

  return reasons;
}

export function analyzeBaseline(project = {}) {
  const baseline = createBaseline(project);

  const baselineDeviation = {
    volume: calculateDeviation(project.volume24h, baseline.volume24h),
    liquidity: calculateDeviation(project.liquidityUsd ?? project.liquidity, baseline.liquidity),
    holders: calculateDeviation(project.holders ?? project.holderCount, baseline.holders),
    followers: calculateDeviation(project.followers, baseline.followers),
    transactions: calculateDeviation(project.transactions ?? project.txCount24h, baseline.transactions),
    developerActivity: calculateDeviation(
      project.developerActivity ?? project.githubCommits,
      baseline.developerActivity
    ),
    smartWalletActivity: calculateDeviation(
      project.smartWalletActivity,
      baseline.smartWalletActivity
    ),
  };

  const rawScore =
    scoreDeviation(baselineDeviation.volume, 1.25) +
    scoreDeviation(baselineDeviation.liquidity, 1.15) +
    scoreDeviation(baselineDeviation.holders, 1.1) +
    scoreDeviation(baselineDeviation.followers, 0.75) +
    scoreDeviation(baselineDeviation.transactions, 1.0) +
    scoreDeviation(baselineDeviation.developerActivity, 0.9) +
    scoreDeviation(baselineDeviation.smartWalletActivity, 1.35);

  const baselineScore = Math.max(0, Math.min(100, rawScore));
  const level = baselineLevel(baselineScore);
  const reasons = buildReasons(baselineDeviation);

  return {
    ...project,

    baseline,
    baselineDeviation,
    baselineScore,
    baselineLevel: level,
    baselineReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      baseline: {
        score: baselineScore,
        level,
        deviation: baselineDeviation,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Baseline Engine",
        signal: "Current activity versus historical baseline",
        score: baselineScore,
        confidence: Math.min(baselineScore / 100, 1),
        impact:
          baselineScore >= 70
            ? "Strong Positive"
            : baselineScore >= 45
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(baselineScore >= 85
        ? ["Extreme breakout from historical baseline detected."]
        : baselineScore >= 70
        ? ["Strong abnormal activity versus baseline detected."]
        : []),
    ],
  };
}

export function analyzeBaselineBatch(projects = []) {
  return projects
    .map(analyzeBaseline)
    .sort((a, b) => Number(b.baselineScore || 0) - Number(a.baselineScore || 0));
}
