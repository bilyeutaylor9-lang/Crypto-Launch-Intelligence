// src/engines/alphaDatabaseEngine.js

/**
 * Alpha Database Engine
 *
 * Tracks every project discovered by the scanner and stores
 * historical score changes over time.
 *
 * Purpose:
 * - detect early momentum shifts
 * - compare current projects against past launches
 * - learn which signals matter most
 * - improve scoring over time
 */

export function createAlphaRecord(project = {}) {
  return {
    id: project.id || project.symbol || "unknown",
    name: project.name || "Unknown Project",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    stage: project.stage || "unknown",

    scores: {
      opportunity: project.opportunityScore || 0,
      momentum: project.momentumScore || 0,
      narrative: project.narrativeScore || 0,
      developer: project.developerScore || 0,
      liquidity: project.liquidityScore || 0,
      community: project.communityScore || 0,
      risk: project.riskScore || 0,
      confidence: project.confidenceScore || 0
    },

    signals: {
      holderGrowth: project.holderGrowth || 0,
      liquidityGrowth: project.liquidityGrowth || 0,
      volumeGrowth: project.volumeGrowth || 0,
      socialGrowth: project.socialGrowth || 0,
      developerActivity: project.developerActivity || 0,
      whaleActivity: project.whaleActivity || 0
    },

    tracking: {
      firstSeen: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      snapshots: []
    }
  };
}

export function addAlphaSnapshot(record, snapshot = {}) {
  const newSnapshot = {
    timestamp: new Date().toISOString(),
    price: snapshot.price || null,
    marketCap: snapshot.marketCap || null,
    liquidity: snapshot.liquidity || null,
    holders: snapshot.holders || null,
    volume24h: snapshot.volume24h || null,
    opportunityScore: snapshot.opportunityScore || 0,
    momentumScore: snapshot.momentumScore || 0,
    riskScore: snapshot.riskScore || 0
  };

  record.tracking.snapshots.push(newSnapshot);
  record.tracking.lastUpdated = newSnapshot.timestamp;

  return record;
}

export function calculateScoreDelta(previousScore = 0, currentScore = 0) {
  return currentScore - previousScore;
}

export function detectMomentumShift(record) {
  const snapshots = record.tracking.snapshots;

  if (snapshots.length < 2) {
    return {
      detected: false,
      reason: "Not enough historical data yet."
    };
  }

  const previous = snapshots[snapshots.length - 2];
  const current = snapshots[snapshots.length - 1];

  const opportunityDelta = calculateScoreDelta(
    previous.opportunityScore,
    current.opportunityScore
  );

  const momentumDelta = calculateScoreDelta(
    previous.momentumScore,
    current.momentumScore
  );

  const riskDelta = calculateScoreDelta(
    previous.riskScore,
    current.riskScore
  );

  const detected =
    opportunityDelta >= 15 &&
    momentumDelta >= 15 &&
    riskDelta <= 10;

  return {
    detected,
    opportunityDelta,
    momentumDelta,
    riskDelta,
    reason: detected
      ? "Early momentum shift detected."
      : "No major momentum shift detected."
  };
}
