function explicitNumber(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value, min = 0, max = 100) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(min, Math.min(max, Number(value)));
}

function averageObserved(values = []) {
  const observed = values
    .filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)))
    .map(Number);
  if (!observed.length) return null;
  return observed.reduce((sum, value) => sum + value, 0) / observed.length;
}

function score(values = [], min = 0, max = 100) {
  return clamp(explicitNumber(values), min, max);
}

function rounded(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
}

export function analyzeAttentionGapV2(project = {}) {
  const developerProgressScore = score([
    project.developerAccelerationV2Score,
    project.developerActivityScore,
    project.githubProScore,
  ]);
  const userGrowthScore = score([
    project.buyerBreadthAccelerationScore,
    project.organicBuyerScore,
    project.holderGrowthScore,
  ]);
  const capitalFormationScore = score([
    project.liquidityFormationScore,
    project.capitalMigrationScore,
    project.capitalFlowScore,
  ]);
  const verifiedCatalystScore = score([
    project.catalystScore,
    project.liveCatalystRadarScore,
    project.roadmapProfitabilityScore,
  ]);
  const sourceTruthScore = score([project.sourceTruthScore]);
  const identityResolutionScore = score([project.identityResolutionScore]);
  const fundamentalProgressScore = rounded(averageObserved([
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
    sourceTruthScore,
    identityResolutionScore,
  ]));

  const volume = explicitNumber([project.volume24hUsd, project.volume24h]);
  const normalizedVolume = volume === null ? null : clamp(volume, 0, 2_000_000) / 20_000;
  const buyPressureScore = score([project.buyPressureScore]);
  const relativeStrengthScore = score([project.relativeStrengthScore]);
  const marketActivityScore = rounded(averageObserved([
    normalizedVolume,
    buyPressureScore,
    relativeStrengthScore,
  ]));

  const socialAccelerationScore = score([project.socialAccelerationScore]);
  const xSocialScore = score([project.xSocialScore]);
  const narrativeHeatScore = score([project.narrativeHeatScore]);
  const externalSignalScore = score([project.externalSignalScore]);
  const socialAttentionScore = rounded(averageObserved([
    socialAccelerationScore,
    xSocialScore,
    narrativeHeatScore,
    externalSignalScore,
  ]));
  const searchAttentionScore = score([
    project.searchAttentionScore,
    project.googleNewsAttentionScore,
    project.internetResearchAttentionScore,
  ]);

  const price24h = explicitNumber([project.priceChange24hPct, project.priceChange24h]);
  const price7d = explicitNumber([project.priceChange7dPct, project.priceChange7d]);
  const priceSignals = [
    price24h === null ? null : clamp(Math.abs(price24h), 0, 120),
    price7d === null ? null : clamp(Math.abs(price7d), 0, 260) * 0.75,
  ].filter((value) => value !== null);
  const priceAttentionScore = priceSignals.length ? Math.round(Math.max(...priceSignals)) : null;
  const exchangeAttentionScore = score([
    project.exchangeProbabilityScore,
    project.cexListingAttentionScore,
  ]);
  const observedProgress = rounded(averageObserved([
    fundamentalProgressScore,
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
  ]));
  const marketAttention = rounded(averageObserved([
    socialAttentionScore,
    searchAttentionScore,
    priceAttentionScore,
    exchangeAttentionScore,
  ]));
  const attentionGap =
    observedProgress === null || marketAttention === null
      ? null
      : Math.round(clamp(50 + observedProgress * 0.62 - marketAttention * 0.42, 0, 100));

  const observedValues = {
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
    sourceTruthScore,
    identityResolutionScore,
    marketActivityScore,
    socialAttentionScore,
    searchAttentionScore,
    priceAttentionScore,
    exchangeAttentionScore,
  };
  const missingValues = Object.entries(observedValues)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  const observedComponentCount = Object.keys(observedValues).length - missingValues.length;
  const expectedComponentCount = Object.keys(observedValues).length;
  const coveragePct = Math.round((observedComponentCount / expectedComponentCount) * 100);
  const attentionGapV2State =
    attentionGap === null
      ? "INSUFFICIENT_DATA"
      : attentionGap >= 72 && priceAttentionScore < 65
        ? "PROGRESS_EXCEEDS_ATTENTION"
        : priceAttentionScore >= 85 || socialAttentionScore >= 85
          ? "ATTENTION_ALREADY_HIGH"
          : attentionGap >= 55
            ? "DEVELOPING_ATTENTION_GAP"
            : "NO_ATTENTION_ADVANTAGE";

  return {
    ...project,
    fundamentalProgressScore,
    marketActivityScore,
    developerProgressScore,
    userGrowthScore,
    capitalFormationScore,
    verifiedCatalystScore,
    socialAttentionScore,
    searchAttentionScore,
    priceAttentionScore,
    exchangeAttentionScore,
    attentionGapV2Score: attentionGap,
    attentionGapV2State,
    attentionGapV2Coverage: {
      observedComponentCount,
      expectedComponentCount,
      coveragePct,
      observedValues: Object.fromEntries(
        Object.entries(observedValues).filter(([, value]) => value !== null)
      ),
      missingValues,
      sourceFamilies: [
        ...(developerProgressScore !== null ? ["development"] : []),
        ...(userGrowthScore !== null ? ["users"] : []),
        ...(capitalFormationScore !== null ? ["capital"] : []),
        ...(verifiedCatalystScore !== null ? ["catalysts"] : []),
        ...(marketAttention !== null ? ["market-attention"] : []),
      ],
    },
    evidence:
      attentionGap === null
        ? project.evidence || []
        : [
            ...(project.evidence || []),
            {
              engine: "Attention Gap v2",
              signal: attentionGapV2State,
              score: attentionGap,
              confidence: coveragePct / 100,
              impact: attentionGap >= 55 ? "Positive" : "Neutral",
              sourceFields: Object.keys(observedValues).filter((field) => observedValues[field] !== null),
            },
          ],
  };
}

export function analyzeAttentionGapV2Batch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeAttentionGapV2);
}
