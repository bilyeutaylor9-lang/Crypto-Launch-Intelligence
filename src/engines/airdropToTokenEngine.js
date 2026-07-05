// src/engines/airdropToTokenEngine.js

const AIRDROP_KEYWORDS = [
  "airdrop",
  "points",
  "rewards",
  "claim",
  "snapshot",
  "eligibility",
  "season",
  "incentives",
  "quests",
  "campaign",
  "testnet",
  "galxe",
  "zealy",
  "xp",
  "loyalty",
  "allocation",
  "tge",
];

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function collectText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.website,
    project.docs,
    project.twitterBio,
    project.announcement,
    project.campaign,
    project.stage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function detectAirdropSignal(project = {}) {
  const text = collectText(project);
  return AIRDROP_KEYWORDS.filter((keyword) => text.includes(keyword));
}

function buildReasons(project = {}, signals = []) {
  const reasons = [];

  if (signals.length) {
    reasons.push(`Airdrop/token-launch language detected: ${signals.slice(0, 5).join(", ")}.`);
  }

  if (project.pointsProgram) reasons.push("Points program is active.");
  if (project.snapshotDate) reasons.push("Snapshot date is present.");
  if (project.claimDate) reasons.push("Claim date is present.");
  if (project.testnetLive) reasons.push("Testnet is live.");
  if (project.tgeDate) reasons.push("TGE date is present.");
  if (project.questCampaign || project.campaign) reasons.push("Quest or rewards campaign detected.");

  return reasons;
}

function levelForScore(score = 0) {
  if (score >= 85) return "high probability token conversion";
  if (score >= 70) return "strong airdrop-to-token setup";
  if (score >= 50) return "early airdrop/token candidate";
  if (score >= 35) return "weak airdrop signal";
  return "no clear signal";
}

export function scoreAirdropToToken(project = {}) {
  const signals = detectAirdropSignal(project);

  let score = 0;

  score += Math.min(signals.length * 8, 32);

  if (project.pointsProgram) score += 20;
  if (project.snapshotDate) score += 15;
  if (project.claimDate) score += 15;
  if (project.testnetLive) score += 10;
  if (project.tgeDate) score += 10;
  if (project.questCampaign || project.campaign) score += 8;
  if (project.hasToken === false) score += 10;

  if (project.tokenAddress || project.hasToken === true) score -= 15;

  return clamp(score);
}

export function analyzeAirdropToToken(project = {}) {
  const signals = detectAirdropSignal(project);
  const score = scoreAirdropToToken(project);
  const reasons = buildReasons(project, signals);
  const level = levelForScore(score);

  return {
    ...project,

    stage: project.stage || (score >= 35 ? "airdrop-to-token" : project.stage),
    airdropSignals: signals,
    airdropSignal: signals[0] || null,
    airdropToTokenScore: score,
    airdropToTokenLevel: level,
    airdropToTokenReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      airdropToToken: {
        score,
        level,
        signals,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Airdrop-To-Token Engine",
        signal: "Airdrop, points, rewards, testnet, or claim setup",
        score,
        confidence: clamp(score / 100, 0, 1),
        impact: score >= 70 ? "Strong Positive" : score >= 35 ? "Positive" : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(score >= 80
        ? ["High-probability airdrop-to-token setup detected."]
        : score >= 60
        ? ["Airdrop-to-token watchlist candidate detected."]
        : []),
    ],
  };
}

export function analyzeAirdropToTokenBatch(projects = []) {
  return projects
    .map(analyzeAirdropToToken)
    .sort((a, b) => Number(b.airdropToTokenScore || 0) - Number(a.airdropToTokenScore || 0));
}

export function discoverAirdropToTokenProjects(projects = []) {
  return analyzeAirdropToTokenBatch(projects).filter(
    (project) => Number(project.airdropToTokenScore || 0) >= 35
  );
}
