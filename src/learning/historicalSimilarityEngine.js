/**
 * Crypto Launch Intelligence
 * Historical Similarity Engine
 *
 * Purpose:
 * Compares current projects against past tracked winners and losers.
 * Helps answer:
 * "Does this project look like previous winners at an early stage?"
 */

const DEFAULT_FEATURES = [
  "finalScore",
  "opportunityScore",
  "prePumpScore",
  "momentumScore",
  "narrativeScore",
  "liquidityScore",
  "smartMoneyScore",
  "smartWalletScore",
  "developerActivityScore",
  "githubScore",
  "communityGrowthScore",
  "socialAccelerationScore",
  "catalystScore",
  "partnershipScore",
  "tokenomicsScore",
  "riskScore"
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getProjectKey(project = {}) {
  const chain = String(project.chain || project.network || "unknown").toLowerCase();
  const address = String(
    project.address || project.contractAddress || project.pairAddress || ""
  ).toLowerCase();
  const symbol = String(project.symbol || project.tokenSymbol || project.name || "unknown").toLowerCase();

  return address ? `${chain}:${address}` : `${chain}:${symbol}`;
}

function getOutcomePct(project = {}) {
  return num(
    project.outcomeTracking?.outcome?.priceChangePct ??
      project.outcome?.priceChangePct ??
      project.priceChangePct
  );
}

function labelHistoricalOutcome(project = {}) {
  const change = getOutcomePct(project);

  if (change >= 100) return "major_winner";
  if (change >= 50) return "winner";
  if (change <= -40) return "major_loser";
  if (change <= -20) return "loser";
  return "neutral";
}

function vectorize(project = {}, features = DEFAULT_FEATURES) {
  return features.map((key) => clamp(project[key]));
}

function cosineSimilarity(a = [], b = []) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    dot += num(a[i]) * num(b[i]);
    magA += num(a[i]) ** 2;
    magB += num(b[i]) ** 2;
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function buildHistoricalProfile(project = {}, features = DEFAULT_FEATURES) {
  return {
    key: getProjectKey(project),
    name: project.name || null,
    symbol: project.symbol || project.tokenSymbol || null,
    chain: project.chain || project.network || null,
    vector: vectorize(project, features),
    outcomePct: getOutcomePct(project),
    outcomeLabel: labelHistoricalOutcome(project),
    score: num(project.finalScore ?? project.opportunityScore ?? project.score),
    riskScore: num(project.riskScore)
  };
}

function compareToHistory(project = {}, historicalProjects = [], features = DEFAULT_FEATURES) {
  const currentVector = vectorize(project, features);

  const comparisons = historicalProjects
    .map((historicalProject) => {
      const profile = buildHistoricalProfile(historicalProject, features);

      return {
        key: profile.key,
        name: profile.name,
        symbol: profile.symbol,
        chain: profile.chain,
        similarity: cosineSimilarity(currentVector, profile.vector),
        outcomePct: profile.outcomePct,
        outcomeLabel: profile.outcomeLabel,
        score: profile.score,
        riskScore: profile.riskScore
      };
    })
    .filter((item) => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  const topMatches = comparisons.slice(0, 10);
  const winnerMatches = topMatches.filter((match) =>
    ["winner", "major_winner"].includes(match.outcomeLabel)
  );
  const loserMatches = topMatches.filter((match) =>
    ["loser", "major_loser"].includes(match.outcomeLabel)
  );

  const winnerSimilarityScore = winnerMatches.reduce(
    (sum, match) => sum + match.similarity * 100,
    0
  );

  const loserSimilarityScore = loserMatches.reduce(
    (sum, match) => sum + match.similarity * 100,
    0
  );

  const historicalEdgeScore = clamp(
    winnerSimilarityScore - loserSimilarityScore + 50
  );

  return {
    sampleSize: historicalProjects.length,
    topMatches,
    winnerMatches: winnerMatches.length,
    loserMatches: loserMatches.length,
    historicalEdgeScore,
    summary: buildSummary(historicalEdgeScore, winnerMatches.length, loserMatches.length)
  };
}

function buildSummary(edgeScore = 0, winnerMatches = 0, loserMatches = 0) {
  if (winnerMatches === 0 && loserMatches === 0) {
    return "Not enough meaningful historical matches yet.";
  }

  if (edgeScore >= 75) {
    return "Current profile resembles prior winners more than prior losers.";
  }

  if (edgeScore >= 60) {
    return "Current profile has a mildly positive historical similarity profile.";
  }

  if (edgeScore <= 40) {
    return "Current profile resembles weak or losing historical setups.";
  }

  return "Historical similarity is mixed or inconclusive.";
}

export function analyzeHistoricalSimilarity(
  project = {},
  historicalProjects = [],
  options = {}
) {
  const features = options.features || DEFAULT_FEATURES;

  return {
    ...project,
    historicalSimilarity: compareToHistory(project, historicalProjects, features)
  };
}

export function analyzeHistoricalSimilarityBatch(
  projects = [],
  historicalProjects = [],
  options = {}
) {
  if (!Array.isArray(projects)) return [];

  return projects.map((project) =>
    analyzeHistoricalSimilarity(project, historicalProjects, options)
  );
}

export default {
  analyzeHistoricalSimilarity,
  analyzeHistoricalSimilarityBatch
};
