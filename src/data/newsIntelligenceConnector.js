function hasFetch() {
  return typeof fetch === "function";
}

function clean(value = "") {
  return String(value || "").trim();
}

function projectTerms(project = {}) {
  return [
    project.name,
    project.symbol,
    project.primaryNarrative,
    ...(project.narratives || []),
  ]
    .filter(Boolean)
    .map(clean)
    .filter(Boolean);
}

function normalizeNews(item = {}) {
  return {
    id: item.id || item.slug || item.url || null,
    title: item.title || "",
    url: item.url || item.link || "",
    publishedAt: item.published_at || item.publishedAt || item.created_at || null,
    source: item.source?.title || item.source || "news",
    domain: item.domain || null,
    votes: item.votes || {},
  };
}

function scoreNews(items = []) {
  const joined = items.map((item) => `${item.title || ""} ${item.source || ""}`).join(" ").toLowerCase();
  const catalystHits = [
    "launch",
    "mainnet",
    "listing",
    "partnership",
    "funding",
    "raise",
    "airdrop",
    "staking",
    "upgrade",
  ].filter((word) => joined.includes(word));
  const riskHits = [
    "hack",
    "exploit",
    "lawsuit",
    "sec",
    "investigation",
    "scam",
    "rug",
    "bankrupt",
  ].filter((word) => joined.includes(word));
  const sourceQuality = items.filter((item) =>
    /coindesk|cointelegraph|the block|decrypt|blockworks|defiant|messari/i.test(
      `${item.source} ${item.domain}`
    )
  ).length;

  return {
    articleCount: items.length,
    catalystHits,
    riskHits,
    sourceQuality,
    signalScore: Math.min(
      100,
      items.length * 7 + catalystHits.length * 10 + sourceQuality * 8 - riskHits.length * 16
    ),
    riskScore: Math.min(100, riskHits.length * 24),
  };
}

async function fetchCryptoPanic(project = {}, options = {}) {
  const freeOnly = options.freeOnly ?? process.env.FREE_ONLY_MODE === "true";

  if (freeOnly) {
    return {
      status: "SKIPPED_FREE_ONLY",
      articles: [],
    };
  }

  const key = process.env.CRYPTOPANIC_API_KEY;

  if (!key || !hasFetch()) {
    return {
      status: key ? "FETCH_UNAVAILABLE" : "MISSING_CRYPTOPANIC_API_KEY",
      articles: [],
    };
  }

  const terms = projectTerms(project).slice(0, 4).join(" ");
  const params = new URLSearchParams({
    auth_token: key,
    public: "true",
    kind: "news",
  });

  if (terms) params.set("filter", "hot");

  const response = await fetch(`https://cryptopanic.com/api/v1/posts/?${params}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return {
      status: "FAILED",
      error: `CryptoPanic failed: ${response.status}`,
      articles: [],
    };
  }

  const body = await response.json();
  const normalized = (body.results || []).map(normalizeNews);
  const loweredTerms = projectTerms(project).map((term) => term.toLowerCase());
  const filtered = loweredTerms.length
    ? normalized.filter((article) =>
        loweredTerms.some((term) => `${article.title} ${article.source}`.toLowerCase().includes(term))
      )
    : normalized;

  return {
    status: "SUCCESS",
    articles: filtered.slice(0, Number(options.maxArticles || 20)),
  };
}

export async function getNewsProjectIntelligence(project = {}, options = {}) {
  const result = await fetchCryptoPanic(project, options);
  const articles = result.articles || [];
  const score = scoreNews(articles);

  return {
    source: "news",
    status: result.status,
    articles,
    articleCount: score.articleCount,
    catalystHits: score.catalystHits,
    riskHits: score.riskHits,
    sourceQuality: score.sourceQuality,
    signalScore: Math.round(score.signalScore),
    riskScore: Math.round(score.riskScore),
    error: result.error || null,
  };
}

export async function getNewsProjectIntelligenceBatch(projects = [], options = {}) {
  const limit = Number(options.limit || process.env.NEWS_PROJECT_LIMIT || 25);
  const safeProjects = (Array.isArray(projects) ? projects : []).slice(0, limit);
  const results = new Map();

  for (const project of safeProjects) {
    const key = String(project.address || project.pairAddress || `${project.chain}:${project.symbol || project.name}`).toLowerCase();
    results.set(key, await getNewsProjectIntelligence(project, options));
  }

  return results;
}
