// src/engines/catalystCalendarEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

const CATALYST_WEIGHTS = {
  mainnet: 95,
  exchange_listing: 90,
  listing: 90,
  token_launch: 85,
  tge: 85,
  airdrop: 75,
  partnership: 70,
  product_release: 70,
  launch: 70,
  integration: 65,
  funding: 60,
  governance: 55,
  conference: 45,
  unlock: -45,
  vesting_unlock: -55,
};

function daysUntil(date) {
  if (!date) return null;

  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;

  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

function timeMultiplier(days) {
  if (days === null) return 0.5;
  if (days < 0) return 0.15;
  if (days <= 3) return 1.1;
  if (days <= 7) return 1;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.45;
  return 0.2;
}

function levelForScore(score = 0) {
  if (score >= 85) return "major near-term catalyst";
  if (score >= 70) return "strong catalyst window";
  if (score >= 50) return "moderate catalyst support";
  if (score >= 30) return "early catalyst visibility";
  return "limited catalyst visibility";
}

function normalizeCatalysts(project = {}) {
  const catalysts = project.catalysts || project.upcomingCatalysts || [];
  return Array.isArray(catalysts) ? catalysts : [];
}

function scoreCatalyst(catalyst = {}) {
  const type = String(catalyst.type || catalyst.category || "").toLowerCase();
  const base = CATALYST_WEIGHTS[type] ?? 35;
  const days = daysUntil(catalyst.date);
  const score = base * timeMultiplier(days);

  return {
    ...catalyst,
    type,
    daysUntil: days,
    score: clamp(score, -100, 100),
  };
}

function buildReasons(scoredCatalysts = []) {
  const reasons = [];

  scoredCatalysts
    .filter((c) => c.score > 0)
    .slice(0, 5)
    .forEach((c) => {
      reasons.push(
        `${c.type || "catalyst"} catalyst ${
          c.daysUntil === null ? "has unknown timing" : `is ${c.daysUntil} days away`
        }.`
      );
    });

  scoredCatalysts
    .filter((c) => c.score < 0)
    .slice(0, 3)
    .forEach((c) => {
      reasons.push(
        `${c.type || "risk catalyst"} may create near-term selling pressure.`
      );
    });

  if (!reasons.length) {
    reasons.push("No strong upcoming catalyst detected.");
  }

  return reasons;
}

export function analyzeCatalystCalendar(project = {}) {
  const scoredCatalysts = normalizeCatalysts(project)
    .map(scoreCatalyst)
    .sort((a, b) => num(b.score) - num(a.score));

  const positiveTotal = scoredCatalysts
    .filter((c) => c.score > 0)
    .reduce((sum, c) => sum + num(c.score), 0);

  const negativeTotal = scoredCatalysts
    .filter((c) => c.score < 0)
    .reduce((sum, c) => sum + num(c.score), 0);

  const catalystCalendarScore = clamp(positiveTotal + negativeTotal);
  const catalystCalendarLevel = levelForScore(catalystCalendarScore);
  const strongestCatalyst = scoredCatalysts[0] || null;
  const catalystReasons = buildReasons(scoredCatalysts);

  return {
    ...project,

    catalystCalendarScore,
    catalystCalendarLevel,
    catalystsScored: scoredCatalysts,
    strongestCatalyst,
    catalystReasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      catalystCalendar: {
        score: catalystCalendarScore,
        level: catalystCalendarLevel,
        strongestCatalyst,
        catalysts: scoredCatalysts,
        reasons: catalystReasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Catalyst Calendar Engine",
        signal: "Upcoming project catalyst window",
        score: catalystCalendarScore,
        confidence: clamp(catalystCalendarScore / 100, 0, 1),
        impact:
          catalystCalendarScore >= 70
            ? "Strong Positive"
            : catalystCalendarScore >= 50
            ? "Positive"
            : negativeTotal < 0
            ? "Risk"
            : "Neutral",
        reasons: catalystReasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(catalystCalendarScore >= 85
        ? ["Major near-term catalyst detected."]
        : catalystCalendarScore >= 70
        ? ["Upcoming catalyst window detected."]
        : []),
    ],
  };
}

export function analyzeCatalystCalendarBatch(projects = []) {
  return projects
    .map(analyzeCatalystCalendar)
    .sort(
      (a, b) =>
        Number(b.catalystCalendarScore || 0) -
        Number(a.catalystCalendarScore || 0)
    );
}
