import {
  getWatchedProject,
  loadProjectWatchStore,
  projectWatchId,
} from "../learning/projectWatchlistStore.js";

const ANNOUNCEMENT_KEYWORDS = [
  "mainnet",
  "testnet",
  "tge",
  "airdrop",
  "snapshot",
  "listing",
  "launch",
  "partnership",
  "integration",
  "staking",
  "restaking",
  "points",
  "incentive",
  "audit",
];

const INSTITUTIONAL_KEYWORDS = [
  "blackrock",
  "coinbase",
  "binance",
  "kraken",
  "a16z",
  "paradigm",
  "multicoin",
  "framework",
  "polychain",
  "dragonfly",
  "jump",
  "wintermute",
  "market maker",
  "custody",
  "etf",
  "treasury",
  "rwa",
  "compliance",
];

const FOUNDER_KEYWORDS = [
  "founder",
  "cofounder",
  "ceo",
  "cto",
  "core team",
  "dev update",
  "shipping",
  "roadmap",
  "proposal",
  "governance",
];

const RISK_KEYWORDS = [
  "guaranteed",
  "risk free",
  "1000%",
  "500%",
  "withdrawals disabled",
  "hack",
  "exploit",
  "rug",
  "scam",
  "delayed",
  "paused",
  "investigation",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function normalizeText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.twitterBio,
    project.xBio,
    project.twitterText,
    project.xText,
    project.socialText,
    project.announcement,
    project.blog,
    project.docs,
    project.roadmap,
    project.launchInfo,
    project.category,
    project.tags,
    project.narrative,
    project.primaryNarrative,
    project.opportunityThesis,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hits(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function scoreFollowers(project = {}) {
  const followers = num(
    project.twitterFollowers ||
      project.xFollowers ||
      project.followers ||
      project.communityMetrics?.followers
  );

  if (followers >= 500000) return 24;
  if (followers >= 100000) return 18;
  if (followers >= 25000) return 12;
  if (followers >= 5000) return 7;
  return 0;
}

function scoreEngagement(project = {}) {
  const engagement = num(project.engagementRate || project.socialEngagementRate);
  const mentions = num(project.mentions24h || project.socialMentions24h || project.xMentions24h);
  const mentionGrowth = num(
    project.mentionGrowth24h || project.socialMentionGrowth24h || project.xMentionGrowth24h
  );

  let score = 0;
  if (engagement >= 0.08) score += 18;
  else if (engagement >= 0.04) score += 12;
  else if (engagement >= 0.02) score += 7;

  if (mentions >= 1000) score += 18;
  else if (mentions >= 250) score += 12;
  else if (mentions >= 50) score += 6;

  if (mentionGrowth >= 300) score += 18;
  else if (mentionGrowth >= 100) score += 12;
  else if (mentionGrowth >= 35) score += 6;

  return clamp(score, 0, 40);
}

function buildChangeSignal(project = {}, watched = null) {
  const previous = watched?.history?.at(-1);
  const currentScore = num(
    project.pipelineScore ||
      project.opportunityScore ||
      project.marketRankScore ||
      project.prePump?.score ||
      project.narrativeLaunchStakingScore
  );
  const previousScore = num(previous?.score);
  const scoreDelta = previous ? Math.round(currentScore - previousScore) : 0;

  return {
    watchedBefore: Boolean(watched),
    previousScore,
    scoreDelta,
    scoreTrend: !watched
      ? "new"
      : scoreDelta >= 8
      ? "accelerating"
      : scoreDelta <= -8
      ? "fading"
      : "stable",
    previousConviction: previous?.conviction || null,
    previousBucket: previous?.allocationBucket || null,
  };
}

export function analyzeXSocialIntelligence(project = {}, options = {}) {
  const text = normalizeText(project);
  const announcementHits = hits(text, ANNOUNCEMENT_KEYWORDS);
  const institutionalHits = hits(text, INSTITUTIONAL_KEYWORDS);
  const founderHits = hits(text, FOUNDER_KEYWORDS);
  const riskHits = hits(text, RISK_KEYWORDS);
  const watched = getWatchedProject(project, options.watchStore);
  const change = buildChangeSignal(project, watched);

  const announcementScore = clamp(announcementHits.length * 9, 0, 32);
  const institutionalScore = clamp(institutionalHits.length * 12, 0, 36);
  const founderScore = clamp(founderHits.length * 8, 0, 24);
  const audienceScore = scoreFollowers(project);
  const engagementScore = scoreEngagement(project);
  const socialVelocityScore = clamp(
    engagementScore + (change.scoreTrend === "accelerating" ? 12 : 0)
  );
  const riskScore = clamp(riskHits.length * 16 + (change.scoreTrend === "fading" ? 8 : 0));
  const xSocialScore = Math.round(
    clamp(
      announcementScore +
        institutionalScore +
        founderScore +
        audienceScore +
        socialVelocityScore -
        riskScore * 0.7
    )
  );
  const institutionalWatchScore = Math.round(
    clamp(
      institutionalScore +
        announcementScore * 0.6 +
        founderScore * 0.5 +
        num(project.fundingBackerScore) * 0.2 +
        num(project.partnershipScore) * 0.2 -
        riskScore * 0.5
    )
  );

  const reasons = [
    ...announcementHits.map((keyword) => `Announcement/social catalyst: ${keyword}`),
    ...institutionalHits.map((keyword) => `Institutional keyword: ${keyword}`),
    ...founderHits.map((keyword) => `Founder/team signal: ${keyword}`),
    ...riskHits.map((keyword) => `Social risk keyword: ${keyword}`),
  ];

  if (change.scoreTrend === "accelerating") {
    reasons.push(`Watchlist score acceleration: +${change.scoreDelta}`);
  }
  if (!reasons.length) reasons.push("No strong X/social intelligence signal detected yet.");

  return {
    ...project,
    projectWatchId: projectWatchId(project),
    projectWatchChange: change,
    xSocialScore,
    xSocialVelocityScore: socialVelocityScore,
    xAnnouncementScore: announcementScore,
    xFounderSignalScore: founderScore,
    xInstitutionalAttentionScore: institutionalScore,
    xAudienceScore: audienceScore,
    xBotRiskScore: riskScore,
    institutionalWatchScore,
    xSocialSignals: {
      announcementHits,
      institutionalHits,
      founderHits,
      riskHits,
      watchedBefore: change.watchedBefore,
      scoreTrend: change.scoreTrend,
      scoreDelta: change.scoreDelta,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "X Social Intelligence Engine",
        signal: "Watched social and institutional attention",
        score: xSocialScore,
        confidence: Math.min(0.9, reasons.length / 8),
        impact: xSocialScore >= 65 ? "Positive" : riskScore >= 45 ? "Negative" : "Neutral",
        reasons,
      },
    ],
  };
}

export function analyzeXSocialIntelligenceBatch(projects = [], options = {}) {
  const watchStore = options.watchStore || loadProjectWatchStore();
  return projects.map((project) => analyzeXSocialIntelligence(project, { watchStore }));
}
