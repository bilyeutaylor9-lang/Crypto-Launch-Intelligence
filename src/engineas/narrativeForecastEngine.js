// src/engines/narrativeForecastEngine.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const HOT_NARRATIVES = [
  "ai",
  "agents",
  "rwa",
  "depin",
  "btcfi",
  "modular",
  "restaking",
  "privacy",
  "gaming",
  "infrastructure"
];

export function analyzeNarrativeForecast(project = {}) {
  const tags = [
    ...(project.narratives || []),
    ...(project.tags || []),
    project.category,
    project.sector
  ]
    .filter(Boolean)
    .map(t => String(t).toLowerCase());

  const narrativeScore = num(project.narrativeScore);
  const socialAcceleration = num(project.socialAccelerationScore);
  const communityGrowth = num(project.communityGrowthScore);
  const searchTrend = num(project.searchTrendScore);
  const volumeGrowth = num(project.volumeGrowthScore);
  const priceChange24h = Math.abs(num(project.priceChange24h));

  const hotNarrativeMatch = tags.some(tag =>
    HOT_NARRATIVES.some(narrative => tag.includes(narrative))
  );

  const narrativeMatchScore = hotNarrativeMatch ? 75 : 35;

  const earlyNarrativeBonus =
    socialAcceleration > priceChange24h && priceChange24h < 20 ? 15 : 0;

  const narrativeForecastScore = clamp(
    narrativeScore * 0.25 +
      socialAcceleration * 0.25 +
      communityGrowth * 0.15 +
      searchTrend * 0.15 +
      volumeGrowth * 0.1 +
      narrativeMatchScore * 0.1 +
      earlyNarrativeBonus
  );

  const narrativeForecastLevel =
    narrativeForecastScore >= 85
      ? "explosive narrative acceleration"
      : narrativeForecastScore >= 70
        ? "strong narrative forecast"
        : narrativeForecastScore >= 50
          ? "emerging narrative"
          : "weak narrative forecast";

  const alerts = [...(project.alerts || [])];

  if (narrativeForecastScore >= 75) {
    alerts.push("Narrative forecast is strengthening before full market recognition.");
  }

  return {
    ...project,
    narrativeForecastScore,
    narrativeForecastLevel,
    hotNarrativeMatch,
    alerts
  };
}

export function analyzeNarrativeForecastBatch(projects = []) {
  return projects.map(analyzeNarrativeForecast);
}
