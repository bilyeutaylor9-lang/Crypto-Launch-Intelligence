// src/engines/cexListingDiscoveryEngine.js

const CEX_KEYWORDS = [
  "listed",
  "listing",
  "spot trading",
  "deposits open",
  "withdrawals open",
  "trading opens",
  "exchange listing",
  "cex",
  "launchpool",
  "launchpad",
  "market maker",
  "mexc",
  "gate",
  "kucoin",
  "coinbase",
  "binance",
  "bybit",
  "okx",
  "kraken",
  "bitget",
  "upbit",
];

const CEX_WEIGHTS = {
  binance: 35,
  coinbase: 33,
  upbit: 31,
  okx: 28,
  kraken: 26,
  bybit: 24,
  kucoin: 20,
  gate: 18,
  mexc: 16,
  bitget: 16,
  unknown: 10,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function collectText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.announcement,
    project.twitterBio,
    project.exchange,
    project.listingExchange,
    project.news,
    project.tags,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function detectCexListingSignal(project = {}) {
  const text = collectText(project);
  return CEX_KEYWORDS.filter((keyword) => text.includes(keyword));
}

function detectExchange(project = {}) {
  const text = collectText(project);
  const exchangeName = String(project.exchange || project.listingExchange || "")
    .toLowerCase()
    .replaceAll(" ", "_");

  const detected = [];

  for (const [exchange, weight] of Object.entries(CEX_WEIGHTS)) {
    if (
      exchangeName.includes(exchange) ||
      text.includes(exchange) ||
      text.includes(exchange.replaceAll("_", " "))
    ) {
      detected.push({ exchange, weight });
    }
  }

  if (!detected.length && detectCexListingSignal(project).length) {
    detected.push({ exchange: "unknown", weight: CEX_WEIGHTS.unknown });
  }

  return detected.sort((a, b) => b.weight - a.weight);
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const target = new Date(dateValue).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

function timeBonus(days) {
  if (days === null) return 0;
  if (days < -14) return 5;
  if (days < 0) return 12;
  if (days <= 3) return 20;
  if (days <= 7) return 16;
  if (days <= 30) return 10;
  return 4;
}

function levelForScore(score = 0) {
  if (score >= 85) return "major exchange listing signal";
  if (score >= 70) return "strong CEX listing setup";
  if (score >= 50) return "developing CEX attention";
  if (score >= 35) return "early CEX listing signal";
  return "limited CEX signal";
}

function buildReasons(project = {}, signals = [], exchanges = []) {
  const reasons = [];

  if (signals.length) {
    reasons.push(`CEX/listing language detected: ${signals.slice(0, 6).join(", ")}.`);
  }

  if (exchanges[0]) {
    reasons.push(`Exchange attention detected: ${exchanges[0].exchange}.`);
  }

  if (project.listingDate) reasons.push("Listing date is present.");
  if (project.depositOpen) reasons.push("Deposits are open.");
  if (project.tradingOpen) reasons.push("Trading is open or announced.");
  if (project.marketMaker) reasons.push("Market maker signal detected.");

  if (!reasons.length) reasons.push("No meaningful CEX listing signal detected.");

  return reasons;
}

export function scoreCexListingSignal(project = {}) {
  const signals = detectCexListingSignal(project);
  const exchanges = detectExchange(project);
  const days = daysUntil(project.listingDate);

  let score = 0;

  score += Math.min(signals.length * 7, 28);
  score += exchanges[0]?.weight || 0;
  score += timeBonus(days);

  if (project.exchange || project.listingExchange) score += 12;
  if (project.listingDate) score += 14;
  if (project.depositOpen) score += 8;
  if (project.tradingOpen) score += 10;
  if (project.marketMaker) score += 8;

  return clamp(score);
}

export function analyzeCexListing(project = {}) {
  const signals = detectCexListingSignal(project);
  const exchanges = detectExchange(project);
  const score = scoreCexListingSignal(project);
  const level = levelForScore(score);
  const reasons = buildReasons(project, signals, exchanges);

  return {
    ...project,

    stage: project.stage || (score >= 35 ? "cex-listing" : project.stage),
    cexListingSignal: signals[0] || null,
    cexListingSignals: signals,
    detectedCexExchanges: exchanges,
    cexListingScore: score,
    cexListingLevel: level,
    cexListingReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      cexListing: {
        score,
        level,
        signals,
        exchanges,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "CEX Listing Discovery Engine",
        signal: "Centralized exchange listing or exchange attention",
        score,
        confidence: clamp(score / 100, 0, 1),
        impact:
          score >= 70 ? "Strong Positive" : score >= 35 ? "Positive" : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(score >= 85
        ? ["Major exchange listing signal detected."]
        : score >= 70
        ? ["Strong CEX listing setup detected."]
        : []),
    ],
  };
}

export function analyzeCexListingBatch(projects = []) {
  return projects
    .map(analyzeCexListing)
    .sort((a, b) => Number(b.cexListingScore || 0) - Number(a.cexListingScore || 0));
}

export function discoverCexListingProjects(projects = []) {
  return analyzeCexListingBatch(projects).filter(
    (project) => Number(project.cexListingScore || 0) >= 35
  );
}
