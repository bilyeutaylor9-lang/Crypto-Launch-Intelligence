const DEFAULTS = {
  discoveryTargetCandidates: 39000,
  standardIntelligenceLimit: 4000,
  advancedIntelligenceLimit: 1500,
  deepIntelligenceLimit: 500,
  crawlerResearchLimit: 300,
  localAITopProjectLimit: 100,
  finalistDebateLimit: 25,
  finalistComparisonLimit: 5,
  winnerLimit: 1,
};

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

export function resolveAnalysisFunnelConfig(env = process.env, overrides = {}) {
  const discoveryTargetCandidates = positiveInteger(
    overrides.discoveryTargetCandidates ||
      env.DISCOVERY_TARGET_CANDIDATES ||
      env.WIDE_SCAN_LIMIT,
    DEFAULTS.discoveryTargetCandidates
  );
  const standardIntelligenceLimit = positiveInteger(
    overrides.standardIntelligenceLimit ||
      env.STANDARD_INTELLIGENCE_LIMIT ||
      env.INTELLIGENCE_PIPELINE_LIMIT,
    DEFAULTS.standardIntelligenceLimit
  );
  const advancedIntelligenceLimit = positiveInteger(
    overrides.advancedIntelligenceLimit ||
      env.ADVANCED_INTELLIGENCE_LIMIT,
    DEFAULTS.advancedIntelligenceLimit,
    standardIntelligenceLimit
  );
  const deepIntelligenceLimit = positiveInteger(
    overrides.deepIntelligenceLimit ||
      env.DEEP_INTELLIGENCE_LIMIT,
    DEFAULTS.deepIntelligenceLimit,
    advancedIntelligenceLimit
  );
  const crawlerResearchLimit = positiveInteger(
    overrides.crawlerResearchLimit ||
      env.CRAWLER_RESEARCH_LIMIT,
    DEFAULTS.crawlerResearchLimit,
    deepIntelligenceLimit
  );
  const localAITopProjectLimit = positiveInteger(
    overrides.localAITopProjectLimit ||
      env.LOCAL_AI_TOP_PROJECT_LIMIT,
    DEFAULTS.localAITopProjectLimit,
    crawlerResearchLimit
  );
  const finalistDebateLimit = positiveInteger(
    overrides.finalistDebateLimit ||
      env.FINALIST_DEBATE_LIMIT,
    DEFAULTS.finalistDebateLimit,
    localAITopProjectLimit
  );
  const finalistComparisonLimit = positiveInteger(
    overrides.finalistComparisonLimit ||
      env.FINALIST_COMPARISON_LIMIT,
    DEFAULTS.finalistComparisonLimit,
    finalistDebateLimit
  );

  return {
    ...DEFAULTS,
    discoveryTargetCandidates,
    standardIntelligenceLimit,
    advancedIntelligenceLimit,
    deepIntelligenceLimit,
    crawlerResearchLimit,
    localAITopProjectLimit,
    finalistDebateLimit,
    finalistComparisonLimit,
    winnerLimit: positiveInteger(overrides.winnerLimit || env.WINNER_LIMIT, DEFAULTS.winnerLimit, finalistComparisonLimit),
    laneBudgets: {
      compositeMerit: Math.round(standardIntelligenceLimit * 0.6),
      accelerationReserve: Math.round(standardIntelligenceLimit * 0.15),
      attentionGapReserve: Math.round(standardIntelligenceLimit * 0.1),
      catalystDeveloperReserve: Math.round(standardIntelligenceLimit * 0.075),
      coverageReserve: Math.round(standardIntelligenceLimit * 0.05),
      deferredRotation: Math.max(1, Math.round(standardIntelligenceLimit * 0.025)),
    },
  };
}

export function defaultAnalysisFunnelConfig() {
  return { ...DEFAULTS };
}
