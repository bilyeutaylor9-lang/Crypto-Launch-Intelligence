const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MILESTONE_TYPES = [
  { type: "mainnet", weight: 92, terms: ["mainnet", "main net", "network launch"] },
  { type: "exchange_listing", weight: 88, terms: ["listing", "cex", "binance", "coinbase", "kraken", "okx", "bybit", "upbit"] },
  { type: "token_launch", weight: 84, terms: ["tge", "token generation", "token launch", "claim"] },
  { type: "airdrop", weight: 76, terms: ["airdrop", "points", "snapshot", "eligibility"] },
  { type: "product_release", weight: 72, terms: ["product", "app", "wallet", "dashboard", "release", "v2", "v3"] },
  { type: "staking", weight: 66, terms: ["staking", "restaking", "validator", "delegation", "rewards"] },
  { type: "integration", weight: 64, terms: ["integration", "partner", "partnership", "ecosystem", "bridge", "sdk"] },
  { type: "funding", weight: 58, terms: ["funding", "raise", "grant", "incubator", "accelerator"] },
  { type: "governance", weight: 48, terms: ["governance", "proposal", "vote", "dao"] },
  { type: "unlock_risk", weight: -62, terms: ["unlock", "vesting", "emissions", "cliff"] },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFrom(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.roadmap,
    project.fullRoadmap,
    project.launchInfo,
    project.catalystText,
    ...(project.roadmapMilestones || []).map((item) => `${item.title || ""} ${item.summary || ""} ${item.date || ""}`),
    ...(project.internetResearch?.pages || []).map((page) => `${page.title || ""}. ${page.description || ""}. ${page.text || ""}`),
    ...(project.internetResearch?.articles || []).map((article) => `${article.title || ""}. ${article.description || ""}`),
  ]
    .filter(Boolean)
    .map(clean)
    .join(" ");
}

function splitSentences(text = "") {
  return clean(text)
    .split(/(?<=[.!?])\s+|\n+|(?:\s+-\s+)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18)
    .slice(0, 120);
}

function classifyMilestone(text = "") {
  const lowered = text.toLowerCase();
  const matched = MILESTONE_TYPES
    .map((entry) => ({
      ...entry,
      hits: entry.terms.filter((term) => lowered.includes(term)),
    }))
    .filter((entry) => entry.hits.length)
    .sort((a, b) => Math.abs(b.weight) + b.hits.length * 4 - (Math.abs(a.weight) + a.hits.length * 4));

  return matched[0] || { type: "roadmap", weight: 35, hits: ["roadmap"] };
}

function parseDateHint(text = "", now = new Date()) {
  const lowered = text.toLowerCase();
  const iso = lowered.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])(?:[-/](0?[1-9]|[12]\d|3[01]))?\b/);

  if (iso) {
    return {
      date: new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] || 15)).toISOString(),
      precision: iso[3] ? "day" : "month",
      label: iso[0],
    };
  }

  const quarter = lowered.match(/\bq([1-4])\s*(20\d{2})\b|\b(20\d{2})\s*q([1-4])\b/);
  if (quarter) {
    const q = Number(quarter[1] || quarter[4]);
    const year = Number(quarter[2] || quarter[3]);
    return {
      date: new Date(year, (q - 1) * 3 + 1, 15).toISOString(),
      precision: "quarter",
      label: `Q${q} ${year}`,
    };
  }

  const month = lowered.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/
  );
  if (month) {
    return {
      date: new Date(Number(month[2]), MONTHS[month[1]], 15).toISOString(),
      precision: "month",
      label: `${month[1]} ${month[2]}`,
    };
  }

  if (lowered.includes("this week")) return relativeDate(now, 7, "relative", "this week");
  if (lowered.includes("next week")) return relativeDate(now, 14, "relative", "next week");
  if (lowered.includes("this month")) return relativeDate(now, 30, "relative", "this month");
  if (lowered.includes("next month")) return relativeDate(now, 45, "relative", "next month");
  if (lowered.includes("soon") || lowered.includes("upcoming")) return relativeDate(now, 60, "estimated", "soon/upcoming");

  return { date: null, precision: "unknown", label: "unknown" };
}

function relativeDate(now = new Date(), days = 0, precision = "relative", label = "") {
  return {
    date: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
    precision,
    label,
  };
}

function daysUntil(date = null, now = new Date()) {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - now.getTime()) / (24 * 60 * 60 * 1000));
}

function timingScore(days = null) {
  if (days === null) return 14;
  if (days < -30) return -10;
  if (days < 0) return 8;
  if (days <= 7) return 30;
  if (days <= 30) return 26;
  if (days <= 90) return 18;
  if (days <= 180) return 10;
  return 4;
}

function sourceConfidence(project = {}) {
  const sources = project.discoverySources || [];
  const pageCount = num(project.internetResearch?.crawlPageCount);
  const sourceCount = num(project.internetResearch?.sourceCount);

  return clamp(35 + Math.min(25, sources.length * 5) + Math.min(22, pageCount * 7) + Math.min(18, sourceCount * 4));
}

function sourceBreakdown(project = {}, milestones = []) {
  const pages = project.internetResearch?.pages || [];
  const articles = project.internetResearch?.articles || [];

  return {
    explicitRoadmapFields: Boolean(project.roadmap || project.fullRoadmap || project.roadmapMilestones?.length || project.milestones?.length),
    crawledPages: pages.length,
    roadmapLikePages: pages.filter((page) => /roadmap|docs|whitepaper|litepaper|changelog|update|announcement|tokenomics/i.test(`${page.url || ""} ${page.title || ""}`)).length,
    articles: articles.length,
    inferredMilestones: milestones.filter((milestone) => milestone.source === "inferred-web-roadmap").length,
    explicitMilestones: milestones.filter((milestone) => milestone.source === "explicit").length,
    uniqueSources: new Set([
      ...pages.map((page) => page.url).filter(Boolean),
      ...articles.map((article) => article.url || article.source).filter(Boolean),
      ...milestones.map((milestone) => milestone.source).filter(Boolean),
    ]).size,
  };
}

function explicitMilestones(project = {}) {
  const raw = project.roadmapMilestones || project.milestones || project.upcomingCatalysts || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => ({
    title: item.title || item.label || item.type || "Roadmap milestone",
    summary: item.summary || item.description || item.reason || "",
    date: item.date || item.targetDate || item.expectedDate || null,
    type: item.type || item.category || "roadmap",
    source: item.source || "explicit",
  }));
}

export function extractRoadmapMilestones(project = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const explicit = explicitMilestones(project);
  const text = textFrom(project);
  const sentences = splitSentences(text);
  const inferred = sentences
    .filter((sentence) => {
      const lowered = sentence.toLowerCase();
      return lowered.includes("roadmap") || MILESTONE_TYPES.some((type) => type.terms.some((term) => lowered.includes(term)));
    })
    .map((sentence) => {
      const classified = classifyMilestone(sentence);
      const dateHint = parseDateHint(sentence, now);
      return {
        title: sentence.slice(0, 120),
        summary: sentence.slice(0, 260),
        date: dateHint.date,
        dateLabel: dateHint.label,
        precision: dateHint.precision,
        type: classified.type,
        matchedTerms: classified.hits || [],
        source: "inferred-web-roadmap",
      };
    });

  const merged = [...explicit, ...inferred]
    .map((milestone) => {
      const classified = classifyMilestone(`${milestone.type || ""} ${milestone.title || ""} ${milestone.summary || ""}`);
      const dateHint = milestone.date ? { date: milestone.date, precision: "provided", label: milestone.date } : parseDateHint(`${milestone.title || ""} ${milestone.summary || ""}`, now);
      const days = daysUntil(dateHint.date, now);
      const base = classified.weight;
      const score = clamp(base + timingScore(days), -100, 100);
      return {
        ...milestone,
        type: milestone.type && milestone.type !== "roadmap" ? milestone.type : classified.type,
        matchedTerms: [...new Set([...(milestone.matchedTerms || []), ...(classified.hits || [])])],
        date: dateHint.date,
        dateLabel: milestone.dateLabel || dateHint.label,
        precision: milestone.precision || dateHint.precision,
        daysUntil: days,
        roadmapScore: score,
        impact: score >= 80 ? "Major Positive" : score >= 60 ? "Positive" : score < 0 ? "Risk" : "Watch",
      };
    })
    .filter((milestone) => milestone.title || milestone.summary)
    .sort((a, b) => num(b.roadmapScore) - num(a.roadmapScore));

  const seen = new Set();
  return merged.filter((milestone) => {
    const key = `${milestone.type}:${String(milestone.title || milestone.summary).toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Number(options.limit || process.env.ROADMAP_MILESTONE_LIMIT || 12));
}

function agent(name = "", score = 0, stance = "watch", message = "") {
  return {
    name,
    score: Math.round(clamp(score)),
    stance,
    message,
  };
}

function decideProfitability(project = {}, milestones = []) {
  const positives = milestones.filter((milestone) => num(milestone.roadmapScore) >= 55);
  const risks = milestones.filter((milestone) => num(milestone.roadmapScore) < 0 || milestone.type === "unlock_risk");
  const best = positives[0] || milestones[0] || null;
  const roadmapDepth = clamp(milestones.length * 10);
  const catalystPower = clamp(positives.reduce((sum, item) => sum + num(item.roadmapScore), 0) / Math.max(1, positives.length));
  const timing = clamp(Math.max(...milestones.map((item) => timingScore(item.daysUntil)), 0));
  const evidence = sourceConfidence(project);
  const marketSupport = clamp(
    num(project.liquidityExpansionScore) * 0.25 +
      num(project.capitalFlowScore) * 0.2 +
      num(project.buyPressureScore) * 0.18 +
      num(project.narrativeHeatScore) * 0.2 +
      num(project.internetResearchScore) * 0.17
  );
  const risk = clamp(Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.tokenUnlockRiskScore), risks.length * 22));
  const agents = [
    agent(
      "Roadmap Analyst",
      roadmapDepth * 0.35 + evidence * 0.35 + catalystPower * 0.3,
      milestones.length >= 4 && evidence >= 55 ? "bullish" : milestones.length >= 2 ? "watching" : "cautious",
      milestones.length >= 4 ? "Roadmap depth is broad enough to evaluate." : "Roadmap evidence is still thin."
    ),
    agent(
      "Catalyst Trader",
      catalystPower * 0.55 + timing * 0.3 + num(project.catalystCalendarScore || project.catalystScore) * 0.15,
      catalystPower >= 65 ? "bullish" : catalystPower >= 45 ? "watching" : "cautious",
      best ? `Best catalyst candidate: ${best.type} (${best.dateLabel || "timing unknown"}).` : "No strong tradable catalyst found."
    ),
    agent(
      "Market Structure Agent",
      marketSupport,
      marketSupport >= 65 ? "bullish" : marketSupport >= 45 ? "watching" : "cautious",
      marketSupport >= 65 ? "Liquidity, flow, narrative, or research support the roadmap." : "Market support is not decisive yet."
    ),
    agent(
      "Risk Officer",
      100 - risk,
      risk < 35 ? "cleared" : risk < 60 ? "watching" : "blocked",
      risk < 35 ? "No major risk cluster blocks roadmap upside." : "Roadmap upside needs risk confirmation."
    ),
  ];
  const score = Math.round(
    clamp(
      catalystPower * 0.32 +
        evidence * 0.2 +
        marketSupport * 0.22 +
        roadmapDepth * 0.13 +
        timing * 0.13 -
        risk * 0.28
    )
  );

  const verdict =
    risk >= 70
      ? "Avoid Roadmap Trap"
      : score >= 75
      ? "Profitable Catalyst Setup"
      : score >= 58
      ? "Speculative Profitable Watch"
      : score >= 42
      ? "Roadmap Needs Confirmation"
      : "Not Enough Profit Edge";

  return {
    score,
    verdict,
    bestMilestone: best,
    agents,
    risks: risks.slice(0, 4),
    summary:
      verdict === "Profitable Catalyst Setup"
        ? "Agents agree the roadmap has a tradable catalyst path, subject to risk checks."
        : verdict === "Speculative Profitable Watch"
        ? "Agents see possible upside, but confirmation is still required."
        : verdict === "Avoid Roadmap Trap"
        ? "Risk agents believe the roadmap setup may be a trap."
        : "Roadmap evidence does not yet create a strong profit edge.",
  };
}

export function analyzeRoadmapCatalystProfit(project = {}, options = {}) {
  const milestones = extractRoadmapMilestones(project, options);
  const decision = decideProfitability(project, milestones);
  const breakdown = sourceBreakdown(project, milestones);
  const roadmapCatalysts = milestones.map((milestone) => ({
    type: milestone.type,
    category: milestone.type,
    label: milestone.title,
    summary: milestone.summary,
    date: milestone.date,
    source: milestone.source,
    score: milestone.roadmapScore,
  }));

  return {
    ...project,
    fullRoadmap: {
      source:
        breakdown.roadmapLikePages > 0
          ? "roadmap-page-crawl"
          : breakdown.crawledPages > 0
          ? "webcrawl-and-project-text"
          : "project-text",
      sourceBreakdown: breakdown,
      milestoneCount: milestones.length,
      milestones,
      bestMilestone: decision.bestMilestone,
    },
    roadmapMilestones: milestones,
    roadmapProfitabilityScore: decision.score,
    roadmapProfitabilityVerdict: decision.verdict,
    roadmapProfitabilityAgents: decision.agents,
    roadmapProfitabilityDecision: decision,
    catalysts: [...(project.catalysts || []), ...roadmapCatalysts],
    upcomingCatalysts: [...(project.upcomingCatalysts || []), ...roadmapCatalysts],
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Roadmap Catalyst Profit Engine",
        signal: "full roadmap catalyst profitability",
        score: decision.score,
        confidence: clamp(sourceConfidence(project) / 100, 0, 1),
        impact: decision.score >= 58 ? "Positive" : decision.verdict === "Avoid Roadmap Trap" ? "Negative" : "Neutral",
        reasons: [
          decision.summary,
          `${milestones.length} roadmap milestones found. Best: ${decision.bestMilestone?.type || "none"}.`,
        ],
      },
    ],
  };
}

export function analyzeRoadmapCatalystProfitBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : [])
    .map((project) => analyzeRoadmapCatalystProfit(project, options))
    .sort((a, b) => num(b.roadmapProfitabilityScore) - num(a.roadmapProfitabilityScore));
}
