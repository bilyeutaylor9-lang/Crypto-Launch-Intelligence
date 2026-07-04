// src/engines/catalystEngine.js

/**
 * Catalyst Engine v3
 *
 * Purpose:
 * Detects and scores catalysts that may drive attention, adoption,
 * liquidity, listings, community activity, or momentum.
 *
 * Upgrades from v2:
 * - Time-weighted catalyst scoring
 * - Source confidence weighting
 * - Narrative alignment bonus
 * - Exchange quality weighting
 * - Catalyst stack / synergy bonus
 * - Countdown to next catalyst
 * - Institutional impact classification
 * - Historical-learning hook support
 * - Rich evidence and alerts
 * - Backward compatible outputs
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const CATALYST_GROUPS = {
  launch: [
    "tge",
    "token generation",
    "launch",
    "mainnet",
    "testnet",
    "beta",
    "public beta",
    "alpha release",
    "genesis"
  ],

  token: [
    "airdrop",
    "claim",
    "staking",
    "burn",
    "token unlock",
    "unlock",
    "migration",
    "token migration",
    "rewards",
    "emissions"
  ],

  market: [
    "listing",
    "cex",
    "exchange",
    "market maker",
    "liquidity",
    "liquidity pool",
    "dex listing",
    "spot trading",
    "futures listing"
  ],

  growth: [
    "partnership",
    "integration",
    "grant",
    "ecosystem",
    "sdk",
    "bridge",
    "hackathon",
    "developer program",
    "incubator",
    "accelerator"
  ],

  governance: [
    "governance",
    "dao",
    "proposal",
    "vote",
    "snapshot",
    "treasury",
    "delegation"
  ],

  product: [
    "app launch",
    "product launch",
    "dashboard",
    "wallet",
    "mobile app",
    "api",
    "protocol upgrade",
    "v2",
    "v3",
    "upgrade"
  ],

  institutional: [
    "institutional",
    "enterprise",
    "bank",
    "asset manager",
    "custody",
    "compliance",
    "etf",
    "real world asset",
    "rwa",
    "tokenized asset"
  ]
};

const CATALYST_WEIGHTS = {
  launch: 25,
  token: 18,
  market: 22,
  growth: 16,
  governance: 10,
  product: 15,
  institutional: 24
};

const EXCHANGE_WEIGHTS = {
  binance: 30,
  coinbase: 28,
  upbit: 26,
  okx: 24,
  kraken: 22,
  bybit: 20,
  kucoin: 16,
  gate: 14,
  mexc: 12,
  bitget: 12,
  crypto_com: 12,
  huobi: 10,
  htx: 10,
  uniswap: 8,
  pancakeswap: 8,
  raydium: 8,
  aerodrome: 8,
  camelot: 7,
  unknown: 5
};

const SOURCE_CONFIDENCE = {
  official_blog: 1.0,
  official_docs: 0.98,
  github_release: 0.95,
  official_x: 0.9,
  official_discord: 0.82,
  official_telegram: 0.78,
  coinmarketcal: 0.8,
  exchange_announcement: 0.92,
  launchpad: 0.84,
  news_article: 0.72,
  community: 0.45,
  rumor: 0.3,
  unknown: 0.6
};

const NARRATIVE_KEYWORDS = {
  ai: ["ai", "agent", "agents", "automation", "model", "inference", "compute"],
  depin: ["depin", "physical infrastructure", "sensor", "wireless", "storage", "compute"],
  rwa: ["rwa", "real world asset", "tokenized", "treasury", "credit", "invoice"],
  bitcoin: ["bitcoin", "btc", "ordinals", "runes", "bitcoin l2", "bitvm"],
  gaming: ["gaming", "gamefi", "nft game", "metaverse"],
  defi: ["defi", "dex", "lending", "yield", "staking", "liquidity"],
  modular: ["modular", "rollup", "data availability", "da", "sequencer"],
  privacy: ["privacy", "zk", "zero knowledge", "confidential"],
  solana: ["solana", "jupiter", "raydium", "pump", "jito"],
  base: ["base", "coinbase", "aerodrome", "onchain summer"]
};

function num(value = 0) {
  return Number(value || 0);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  if (Array.isArray(value)) return value.join(" ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value || "");
}

function buildSearchText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.description,
    project.announcement,
    project.news,
    project.roadmap,
    project.twitterBio,
    project.docs,
    project.tags,
    project.catalystText,
    project.narrative,
    project.narratives,
    project.category,
    project.categories
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function daysUntil(dateValue, now = new Date()) {
  const date = parseDate(dateValue);
  if (!date) return null;

  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

function urgencyFromDays(days) {
  if (days === null) return "unknown";
  if (days < 0) return "recent/past";
  if (days <= 3) return "immediate";
  if (days <= 7) return "very high";
  if (days <= 30) return "high";
  if (days <= 90) return "medium";
  return "low";
}

function timeWeightFromDays(days) {
  if (days === null) return 0;
  if (days < -30) return 0;
  if (days < 0) return 6;
  if (days <= 3) return 24;
  if (days <= 7) return 20;
  if (days <= 14) return 16;
  if (days <= 30) return 12;
  if (days <= 90) return 6;
  return 2;
}

function inferSourceConfidence(project = {}) {
  const rawSource = String(
    project.catalystSource ||
      project.sourceType ||
      project.newsSource ||
      project.source ||
      "unknown"
  )
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");

  if (SOURCE_CONFIDENCE[rawSource]) return SOURCE_CONFIDENCE[rawSource];

  const text = buildSearchText(project);

  if (text.includes("official blog")) return SOURCE_CONFIDENCE.official_blog;
  if (text.includes("github release")) return SOURCE_CONFIDENCE.github_release;
  if (text.includes("official docs")) return SOURCE_CONFIDENCE.official_docs;
  if (text.includes("exchange announcement")) return SOURCE_CONFIDENCE.exchange_announcement;
  if (text.includes("rumor")) return SOURCE_CONFIDENCE.rumor;

  return SOURCE_CONFIDENCE.unknown;
}

function getKnownCatalystDates(project = {}) {
  const entries = [
    { type: "TGE", date: project.tgeDate, group: "launch" },
    { type: "Mainnet", date: project.mainnetDate, group: "launch" },
    { type: "Listing", date: project.listingDate, group: "market" },
    { type: "Airdrop", date: project.airdropDate, group: "token" },
    { type: "Claim", date: project.claimDate, group: "token" },
    { type: "Unlock", date: project.unlockDate, group: "token" },
    { type: "Partnership", date: project.partnershipDate, group: "growth" },
    { type: "Product Launch", date: project.productLaunchDate, group: "product" },
    { type: "Governance Vote", date: project.governanceDate, group: "governance" }
  ];

  return entries
    .map(entry => {
      const date = parseDate(entry.date);
      if (!date) return null;

      const days = daysUntil(date);

      return {
        ...entry,
        date: date.toISOString(),
        daysUntil: days,
        urgency: urgencyFromDays(days),
        timeWeight: timeWeightFromDays(days)
      };
    })
    .filter(Boolean);
}

function detectExchangeCatalyst(project = {}) {
  const text = buildSearchText(project);
  const exchangeName = String(project.exchange || project.listingExchange || project.cex || "")
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll(".", "_");

  const detected = [];

  for (const [exchange, weight] of Object.entries(EXCHANGE_WEIGHTS)) {
    const readable = exchange.replaceAll("_", " ");

    if (exchangeName.includes(exchange) || text.includes(exchange) || text.includes(readable)) {
      detected.push({ exchange, weight });
    }
  }

  if (!detected.length && (project.listingDate || text.includes("listing"))) {
    detected.push({ exchange: "unknown", weight: EXCHANGE_WEIGHTS.unknown });
  }

  return detected.sort((a, b) => b.weight - a.weight);
}

function detectNarratives(project = {}) {
  const text = buildSearchText(project);
  const explicit = normalizeText(project.narrative || project.narratives).toLowerCase();
  const detected = new Set();

  for (const [narrative, keywords] of Object.entries(NARRATIVE_KEYWORDS)) {
    if (
      explicit.includes(narrative) ||
      keywords.some(keyword => text.includes(keyword))
    ) {
      detected.add(narrative);
    }
  }

  return [...detected];
}

function calculateNarrativeAlignmentBonus(project = {}, detectedCatalysts = []) {
  const narratives = detectNarratives(project);
  if (!narratives.length || !detectedCatalysts.length) return 0;

  const catalystText = detectedCatalysts
    .flatMap(catalyst => catalyst.keywords || [])
    .join(" ")
    .toLowerCase();

  let bonus = 0;

  for (const narrative of narratives) {
    const keywords = NARRATIVE_KEYWORDS[narrative] || [];

    if (keywords.some(keyword => catalystText.includes(keyword))) {
      bonus += 8;
    }
  }

  if (detectedCatalysts.some(c => c.group === "institutional") && narratives.includes("rwa")) {
    bonus += 10;
  }

  if (detectedCatalysts.some(c => c.group === "product") && narratives.includes("ai")) {
    bonus += 6;
  }

  return clamp(bonus, 0, 20);
}

function historicalLearningBonus(project = {}) {
  const history = project.catalystHistory || project.historicalCatalystStats;
  if (!history || typeof history !== "object") return 0;

  const avgGain = num(history.averageGainPct || history.avgGainPct);
  const winRate = num(history.winRate || history.successRate);
  const sampleSize = num(history.sampleSize || history.samples);

  let bonus = 0;

  if (sampleSize >= 20 && avgGain >= 15) bonus += 5;
  if (sampleSize >= 50 && avgGain >= 30) bonus += 8;
  if (sampleSize >= 50 && winRate >= 0.6) bonus += 6;
  if (sampleSize >= 100 && winRate >= 0.7) bonus += 8;

  return clamp(bonus, 0, 15);
}

function classifyCatalystImpact({ catalystScore = 0, detectedGroups = [], exchangeCatalysts = [] }) {
  const groups = new Set(detectedGroups);
  const topExchange = exchangeCatalysts[0];

  if (groups.has("institutional")) return "Institutional Catalyst";
  if (topExchange && topExchange.weight >= 22) return "Market Catalyst";
  if (groups.has("market")) return "Liquidity Catalyst";
  if (groups.has("launch") || groups.has("product")) return "Protocol Catalyst";
  if (groups.has("growth")) return "Ecosystem Catalyst";
  if (groups.has("token")) return "Retail Catalyst";
  if (catalystScore >= 70) return "Major Catalyst";

  return "General Catalyst";
}

export function detectCatalysts(project = {}) {
  const text = buildSearchText(project);
  const detected = [];

  for (const [group, keywords] of Object.entries(CATALYST_GROUPS)) {
    const matches = keywords.filter(keyword => text.includes(keyword));

    if (matches.length) {
      detected.push({
        group,
        keywords: [...new Set(matches)],
        weight: CATALYST_WEIGHTS[group] || 5
      });
    }
  }

  return detected;
}

export function scoreCatalysts(project = {}) {
  const detected = detectCatalysts(project);
  const catalystDates = getKnownCatalystDates(project);
  const exchangeCatalysts = detectExchangeCatalyst(project);

  let rawScore = detected.reduce((sum, catalyst) => {
    return sum + catalyst.weight + catalyst.keywords.length * 3;
  }, 0);

  rawScore += catalystDates.reduce((sum, catalystDate) => {
    return sum + catalystDate.timeWeight;
  }, 0);

  if (project.tgeDate) rawScore += 12;
  if (project.mainnetDate) rawScore += 12;
  if (project.listingDate) rawScore += 12;
  if (project.airdropDate || project.claimDate) rawScore += 10;

  if (Array.isArray(project.partnerships) && project.partnerships.length) {
    rawScore += Math.min(18, project.partnerships.length * 6);
  }

  if (Array.isArray(project.integrations) && project.integrations.length) {
    rawScore += Math.min(18, project.integrations.length * 6);
  }

  if (Array.isArray(project.grants) && project.grants.length) {
    rawScore += Math.min(12, project.grants.length * 4);
  }

  if (exchangeCatalysts.length) {
    rawScore += exchangeCatalysts[0].weight;
  }

  const uniqueGroups = new Set(detected.map(catalyst => catalyst.group));

  if (uniqueGroups.size >= 2) rawScore += 8;
  if (uniqueGroups.size >= 3) rawScore += 15;
  if (uniqueGroups.size >= 4) rawScore += 22;

  rawScore += calculateNarrativeAlignmentBonus(project, detected);
  rawScore += historicalLearningBonus(project);

  const sourceConfidence = inferSourceConfidence(project);
  const confidenceAdjustedScore = rawScore * sourceConfidence;

  return Math.round(clamp(confidenceAdjustedScore));
}

export function getNextCatalyst(project = {}) {
  const catalystDates = getKnownCatalystDates(project)
    .filter(catalyst => catalyst.daysUntil !== null)
    .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil));

  return catalystDates[0] || null;
}

export function analyzeCatalysts(project = {}) {
  const detectedCatalysts = detectCatalysts(project);
  const catalystScore = scoreCatalysts(project);
  const sourceConfidence = inferSourceConfidence(project);
  const catalystDates = getKnownCatalystDates(project);
  const nextCatalyst = getNextCatalyst(project);
  const exchangeCatalysts = detectExchangeCatalyst(project);
  const narratives = detectNarratives(project);
  const narrativeAlignmentBonus = calculateNarrativeAlignmentBonus(project, detectedCatalysts);
  const historicalBonus = historicalLearningBonus(project);

  const flatCatalysts = detectedCatalysts.flatMap(catalyst =>
    catalyst.keywords.map(keyword => ({
      group: catalyst.group,
      keyword,
      weight: catalyst.weight
    }))
  );

  const detectedGroups = [...new Set(detectedCatalysts.map(catalyst => catalyst.group))];

  const catalystLevel =
    catalystScore >= 90 ? "institutional catalyst cluster" :
    catalystScore >= 85 ? "major catalyst cluster" :
    catalystScore >= 70 ? "strong catalyst setup" :
    catalystScore >= 50 ? "developing catalyst setup" :
    catalystScore >= 30 ? "early catalyst signal" :
    "limited catalyst signal";

  const catalystImpactType = classifyCatalystImpact({
    catalystScore,
    detectedGroups,
    exchangeCatalysts
  });

  const catalystStackBonus =
    detectedGroups.length >= 4 ? 22 :
    detectedGroups.length >= 3 ? 15 :
    detectedGroups.length >= 2 ? 8 :
    0;

  const alerts = [];

  if (catalystScore >= 90) {
    alerts.push("Institutional-grade catalyst cluster detected.");
  } else if (catalystScore >= 85) {
    alerts.push("Major catalyst cluster detected.");
  } else if (catalystScore >= 70) {
    alerts.push("Strong catalyst setup detected.");
  }

  if (nextCatalyst?.daysUntil !== null && nextCatalyst?.daysUntil >= 0 && nextCatalyst?.daysUntil <= 7) {
    alerts.push(`${nextCatalyst.type} catalyst is within ${nextCatalyst.daysUntil} day(s).`);
  }

  if (exchangeCatalysts[0]?.weight >= 22) {
    alerts.push(`High-impact exchange catalyst detected: ${exchangeCatalysts[0].exchange}.`);
  }

  if (narrativeAlignmentBonus >= 10) {
    alerts.push("Catalyst is strongly aligned with active project narrative.");
  }

  const catalystSummary =
    flatCatalysts.length > 0
      ? `Detected catalyst signals: ${flatCatalysts.map(c => c.keyword).join(", ")}.`
      : "No major catalyst signal detected yet.";

  return {
    ...project,

    catalysts: flatCatalysts,
    detectedCatalysts,
    catalystDates,
    nextCatalyst,

    catalystScore,
    catalystLevel,
    catalystImpactType,
    catalystConfidence: Number(sourceConfidence.toFixed(2)),
    catalystSummary,

    catalystAnalytics: {
      score: catalystScore,
      level: catalystLevel,
      impactType: catalystImpactType,
      sourceConfidence: Number(sourceConfidence.toFixed(2)),
      detectedGroups,
      detectedNarratives: narratives,
      narrativeAlignmentBonus,
      historicalBonus,
      catalystStackBonus,
      exchangeCatalysts,
      nextCatalyst
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Catalyst Engine v3",
        signal: "Project catalyst activity",
        score: catalystScore,
        confidence: Math.min(catalystScore / 100, 1),
        sourceConfidence: Number(sourceConfidence.toFixed(2)),
        impact:
          catalystScore >= 85 ? "Very Strong Positive" :
          catalystScore >= 70 ? "Strong Positive" :
          catalystScore >= 50 ? "Positive" :
          catalystScore >= 30 ? "Early" :
          "Neutral",
        details: {
          catalystLevel,
          catalystImpactType,
          detectedGroups,
          nextCatalyst,
          exchangeCatalysts,
          narrativeAlignmentBonus,
          historicalBonus
        }
      }
    ],

    alerts: [...(project.alerts || []), ...alerts]
  };
}

export function analyzeCatalystsBatch(projects = []) {
  return projects
    .map(analyzeCatalysts)
    .sort((a, b) => b.catalystScore - a.catalystScore);
}

export default analyzeCatalystsBatch;
