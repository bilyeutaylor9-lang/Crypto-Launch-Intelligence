/**
 * Crypto Launch Intelligence
 * Outcome Tracker
 *
 * Purpose:
 * Compares current project data against previous scan snapshots
 * to measure 1h, 24h, 7d, and 30d performance outcomes.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctChange(oldValue, newValue) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;

  return ((newNum - oldNum) / oldNum) * 100;
}

function getProjectKey(project = {}) {
  const chain = String(project.chain || project.network || "unknown").toLowerCase();
  const address = String(project.address || project.contractAddress || project.pairAddress || "").toLowerCase();
  const symbol = String(project.symbol || project.tokenSymbol || project.name || "unknown").toLowerCase();

  return address ? `${chain}:${address}` : `${chain}:${symbol}`;
}

function getPrice(project = {}) {
  return num(
    project.priceUsd ??
      project.price ??
      project.currentPrice ??
      project.marketData?.priceUsd
  );
}

function getMarketCap(project = {}) {
  return num(
    project.marketCap ??
      project.circulatingMarketCap ??
      project.circulatingMarketCapUsd ??
      project.marketData?.marketCap
  );
}

function getLiquidity(project = {}) {
  return num(
    project.liquidityUsd ??
      project.liquidity ??
      project.marketData?.liquidityUsd
  );
}

function getVolume24h(project = {}) {
  return num(
    project.volume24h ??
      project.volume?.h24 ??
      project.marketData?.volume24h
  );
}

export function createOutcomeSnapshot(project = {}, timestamp = new Date().toISOString()) {
  return {
    key: getProjectKey(project),
    timestamp,
    name: project.name || null,
    symbol: project.symbol || null,
    chain: project.chain || project.network || null,
    priceUsd: getPrice(project),
    marketCap: getMarketCap(project),
    liquidityUsd: getLiquidity(project),
    volume24h: getVolume24h(project),
    score: num(project.finalScore ?? project.opportunityScore ?? project.score),
    riskScore: num(project.riskScore),
    tier: project.tier || project.opportunityTier || null,
    action: project.opportunityThesis?.suggestedAction || null
  };
}

export function compareOutcomeSnapshots(oldSnapshot = {}, newSnapshot = {}) {
  return {
    key: oldSnapshot.key || newSnapshot.key,
    fromTimestamp: oldSnapshot.timestamp,
    toTimestamp: newSnapshot.timestamp,
    priceChangePct: pctChange(oldSnapshot.priceUsd, newSnapshot.priceUsd),
    marketCapChangePct: pctChange(oldSnapshot.marketCap, newSnapshot.marketCap),
    liquidityChangePct: pctChange(oldSnapshot.liquidityUsd, newSnapshot.liquidityUsd),
    volumeChangePct: pctChange(oldSnapshot.volume24h, newSnapshot.volume24h),
    originalScore: num(oldSnapshot.score),
    latestScore: num(newSnapshot.score),
    originalTier: oldSnapshot.tier || null,
    latestTier: newSnapshot.tier || null,
    originalAction: oldSnapshot.action || null,
    latestAction: newSnapshot.action || null,
    outcomeLabel: labelOutcome(pctChange(oldSnapshot.priceUsd, newSnapshot.priceUsd))
  };
}

function labelOutcome(priceChangePct = 0) {
  if (priceChangePct >= 300) return "Explosive Winner";
  if (priceChangePct >= 100) return "Major Winner";
  if (priceChangePct >= 50) return "Strong Winner";
  if (priceChangePct >= 20) return "Positive Move";
  if (priceChangePct <= -50) return "Major Loser";
  if (priceChangePct <= -20) return "Weak Outcome";
  return "Neutral";
}

export function buildOutcomeMap(previousSnapshots = []) {
  const map = new Map();

  for (const snapshot of previousSnapshots) {
    if (!snapshot?.key) continue;
    map.set(snapshot.key, snapshot);
  }

  return map;
}

export function analyzeOutcomes(projects = [], previousSnapshots = []) {
  const previousMap = buildOutcomeMap(previousSnapshots);

  return projects.map((project) => {
    const currentSnapshot = createOutcomeSnapshot(project);
    const previousSnapshot = previousMap.get(currentSnapshot.key);

    if (!previousSnapshot) {
      return {
        ...project,
        outcomeTracking: {
          status: "new",
          snapshot: currentSnapshot,
          outcome: null
        }
      };
    }

    return {
      ...project,
      outcomeTracking: {
        status: "tracked",
        snapshot: currentSnapshot,
        outcome: compareOutcomeSnapshots(previousSnapshot, currentSnapshot)
      }
    };
  });
}

export default {
  createOutcomeSnapshot,
  compareOutcomeSnapshots,
  analyzeOutcomes
};
