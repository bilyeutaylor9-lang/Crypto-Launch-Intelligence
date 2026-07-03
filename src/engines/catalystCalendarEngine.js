// src/engines/catalystCalendarEngine.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

const CATALYST_WEIGHTS = {
  mainnet: 95,
  exchange_listing: 90,
  token_launch: 85,
  airdrop: 75,
  partnership: 70,
  product_release: 70,
  governance: 55,
  conference: 45,
  unlock: -45
};

function daysUntil(date) {
  if (!date) return null;

  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;

  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function timeMultiplier(days) {
  if (days === null) return 0.5;
  if (days < 0) return 0.15;
  if (days <= 7) return 1;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.45;
  return 0.2;
}

export function analyzeCatalystCalendar(project = {}) {
  const catalysts = project.catalysts || project.upcomingCatalysts || [];

  let total = 0;
  let strongestCatalyst = null;

  for (const catalyst of catalysts) {
    const type = String(catalyst.type || catalyst.category || "").toLowerCase();
    const base = CATALYST_WEIGHTS[type] ?? 35;
    const days = daysUntil(catalyst.date);
    const score = base * timeMultiplier(days);

    total += score;

    if (!strongestCatalyst || score > strongestCatalyst.score) {
      strongestCatalyst = {
        ...catalyst,
        daysUntil: days,
        score: clamp(score, -100, 100)
      };
    }
  }

  const catalystCalendarScore = clamp(total);
  const catalystCalendarLevel =
    catalystCalendarScore >= 85
      ? "major near-term catalyst"
      : catalystCalendarScore >= 70
        ? "strong catalyst window"
        : catalystCalendarScore >= 50
          ? "moderate catalyst support"
          : "limited catalyst visibility";

  const alerts = [...(project.alerts || [])];

  if (catalystCalendarScore >= 75) {
    alerts.push("Upcoming catalyst window detected.");
  }

  return {
    ...project,
    catalystCalendarScore,
    catalystCalendarLevel,
    strongestCatalyst,
    alerts
  };
}

export function analyzeCatalystCalendarBatch(projects = []) {
  return projects.map(analyzeCatalystCalendar);
}
