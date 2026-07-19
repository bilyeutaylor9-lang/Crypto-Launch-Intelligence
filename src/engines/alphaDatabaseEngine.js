// src/engines/alphaDatabaseEngine.js

function now() {
  return new Date().toISOString();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getProjectId(project = {}) {
  return (
    project.id ||
    project.address ||
    project.tokenAddress ||
    project.pairAddress ||
    `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  )
    .toString()
    .toLowerCase();
}

function scoreOf(project = {}) {
  return num(project.opportunityScore ?? project.pipelineScore ?? project.score ?? 0);
}

export function createAlphaRecord(project = {}) {
  const timestamp = now();

  return {
    id: getProjectId(project),
    name: project.name || "Unknown Project",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    stage: project.stage || "unknown",

    identity: {
      address: project.address || project.tokenAddress || null,
      pairAddress: project.pairAddress || null,
      source: project.source || null,
      url: project.url || null,
    },

    scores: {
      opportunity: scoreOf(project),
      pipeline: num(project.pipelineScore),
      marketRank: num(project.marketRankScore),
      prePump: num(project.prePump?.score),
      momentum: num(project.momentumScore ?? project.momentumShiftScore),
      narrative: num(project.narrativeScore),
      narrativeForecast: num(project.narrativeForecastScore),
      developer: num(project.developerScore ?? project.developerActivityScore),
      liquidity: num(project.liquidityScore),
      community: num(project.communityScore ?? project.communityGrowthScore),
      smartMoney: num(project.smartMoneyAccumulationScore),
      whale: num(project.whaleActivityScore),
      risk: num(project.riskScore),
      confidence: num(project.confidenceScore),
    },

    signals: {
      holderGrowth: num(project.holderGrowth),
      liquidityGrowth: num(project.liquidityGrowth),
      volumeGrowth: num(project.volumeGrowth),
      socialGrowth: num(project.socialGrowth),
      developerActivity: num(project.developerActivity),
      whaleActivity: num(project.whaleActivity),
      priceChange24h: num(project.priceChange24h),
      volume24h: num(project.volume24h),
      liquidityUsd: num(project.liquidityUsd ?? project.liquidity),
      marketCap: num(project.marketCap ?? project.circulatingMarketCap ?? project.circulatingMarketCapUsd),
    },

    intelligenceSignals: project.intelligenceSignals || {},
    evidence: project.evidence || [],
    alerts: project.alerts || [],

    tracking: {
      firstSeen: timestamp,
      lastUpdated: timestamp,
      scanCount: 0,
      bestOpportunityScore: scoreOf(project),
      worstRiskScore: num(project.riskScore),
      snapshots: [],
    },
  };
}

export function createAlphaSnapshot(project = {}) {
  return {
    timestamp: now(),

    price: project.priceUsd ?? project.price ?? null,
    marketCap: project.marketCap ?? project.circulatingMarketCap ?? project.circulatingMarketCapUsd ?? null,
    liquidity: project.liquidityUsd ?? project.liquidity ?? null,
    holders: project.holders ?? project.holderCount ?? null,
    volume24h: project.volume24h ?? project.volume ?? null,

    opportunityScore: scoreOf(project),
    pipelineScore: num(project.pipelineScore),
    marketRankScore: num(project.marketRankScore),
    momentumScore: num(project.momentumScore ?? project.momentumShiftScore),
    narrativeScore: num(project.narrativeScore),
    prePumpScore: num(project.prePump?.score),
    riskScore: num(project.riskScore),

    tier: project.pipelineTier || project.tier || null,
    stage: project.stage || null,
    status: project.prePump?.status || null,
  };
}

export function addAlphaSnapshot(record = createAlphaRecord(), snapshot = {}) {
  const newSnapshot =
    snapshot.timestamp || snapshot.opportunityScore !== undefined
      ? {
          timestamp: snapshot.timestamp || now(),
          price: snapshot.price ?? null,
          marketCap: snapshot.marketCap ?? null,
          liquidity: snapshot.liquidity ?? null,
          holders: snapshot.holders ?? null,
          volume24h: snapshot.volume24h ?? null,
          opportunityScore: num(snapshot.opportunityScore),
          pipelineScore: num(snapshot.pipelineScore),
          marketRankScore: num(snapshot.marketRankScore),
          momentumScore: num(snapshot.momentumScore),
          narrativeScore: num(snapshot.narrativeScore),
          prePumpScore: num(snapshot.prePumpScore),
          riskScore: num(snapshot.riskScore),
          tier: snapshot.tier || null,
          stage: snapshot.stage || null,
          status: snapshot.status || null,
        }
      : createAlphaSnapshot(snapshot);

  record.tracking = record.tracking || {
    firstSeen: newSnapshot.timestamp,
    lastUpdated: newSnapshot.timestamp,
    scanCount: 0,
    bestOpportunityScore: 0,
    worstRiskScore: 0,
    snapshots: [],
  };

  record.tracking.snapshots = Array.isArray(record.tracking.snapshots)
    ? record.tracking.snapshots
    : [];

  record.tracking.snapshots.push(newSnapshot);
  record.tracking.lastUpdated = newSnapshot.timestamp;
  record.tracking.scanCount += 1;
  record.tracking.bestOpportunityScore = Math.max(
    num(record.tracking.bestOpportunityScore),
    num(newSnapshot.opportunityScore)
  );
  record.tracking.worstRiskScore = Math.max(
    num(record.tracking.worstRiskScore),
    num(newSnapshot.riskScore)
  );

  return record;
}

export function calculateScoreDelta(previousScore = 0, currentScore = 0) {
  return num(currentScore) - num(previousScore);
}

export function detectMomentumShift(record = {}) {
  const snapshots = record.tracking?.snapshots || [];

  if (snapshots.length < 2) {
    return {
      detected: false,
      reason: "Not enough historical data yet.",
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

  const prePumpDelta = calculateScoreDelta(
    previous.prePumpScore,
    current.prePumpScore
  );

  const riskDelta = calculateScoreDelta(previous.riskScore, current.riskScore);

  const detected =
    opportunityDelta >= 12 &&
    momentumDelta >= 10 &&
    prePumpDelta >= 5 &&
    riskDelta <= 10;

  return {
    detected,
    opportunityDelta,
    momentumDelta,
    prePumpDelta,
    riskDelta,
    reason: detected
      ? "Early momentum shift detected."
      : "No major momentum shift detected.",
  };
}

export function enrichWithAlphaDatabase(project = {}) {
  const record = createAlphaRecord(project);
  addAlphaSnapshot(record, createAlphaSnapshot(project));
  const momentumShift = detectMomentumShift(record);

  return {
    ...project,
    alphaRecord: record,
    alphaMomentumShift: momentumShift,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      alphaDatabase: {
        score: scoreOf(project),
        recordId: record.id,
        scanCount: record.tracking.scanCount,
        bestOpportunityScore: record.tracking.bestOpportunityScore,
        momentumShift,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Alpha Database Engine",
        signal: "Historical alpha tracking initialized",
        score: scoreOf(project),
        confidence: 0.6,
        impact: "Informational",
        reasons: ["Project was added to the alpha tracking database."],
      },
    ],
  };
}

export function analyzeAlphaDatabaseBatch(projects = []) {
  return projects.map(enrichWithAlphaDatabase);
}
