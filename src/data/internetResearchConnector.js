// src/data/internetResearchConnector.js

const RSS_FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "Blockworks", url: "https://blockworks.co/feed" },
  { name: "The Defiant", url: "https://thedefiant.io/api/feed" },
];

const CATALYST_TERMS = [
  "launch",
  "mainnet",
  "testnet",
  "airdrop",
  "tge",
  "listing",
  "funding",
  "raise",
  "partnership",
  "staking",
  "restaking",
  "upgrade",
  "integration",
  "ecosystem",
];

const NARRATIVE_TERMS = [
  "ai",
  "agent",
  "rwa",
  "tokenized",
  "depin",
  "stablecoin",
  "prediction",
  "privacy",
  "zero knowledge",
  "zk",
  "perp",
  "modular",
  "rollup",
  "restaking",
  "launchpad",
];

const RISK_TERMS = [
  "hack",
  "exploit",
  "drain",
  "rug",
  "scam",
  "lawsuit",
  "investigation",
  "sec",
  "halt",
  "insolvent",
  "phishing",
];

const BLOCKED_CRAWL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "discord.com",
  "t.me",
  "telegram.me",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "api.",
];

const BLOCKED_CRAWL_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
  ".pdf",
  ".zip",
  ".mp4",
  ".mov",
  ".avi",
  ".css",
  ".js",
];

const ROADMAP_CRAWL_PATHS = [
  "/roadmap",
  "/docs/roadmap",
  "/docs",
  "/blog",
  "/whitepaper",
  "/litepaper",
  "/changelog",
  "/updates",
  "/announcements",
  "/tokenomics",
];

function n(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(n(value));
  return parsed > 0 ? parsed : fallback;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function projectKey(project = {}) {
  return String(
    project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function projectTerms(project = {}) {
  const terms = [
    project.name,
    project.symbol,
    project.category,
    project.primaryNarrative,
    project.narrative,
    ...(project.narratives || []),
  ]
    .filter(Boolean)
    .map((term) => String(term).toLowerCase().trim())
    .filter((term) => term.length >= 2);

  return [...new Set(terms)].slice(0, 12);
}

function normalizeUrl(url = "", baseUrl = "") {
  try {
    const parsed = new URL(url, baseUrl || undefined);
    parsed.hash = "";

    if (parsed.hostname === "www.google.com" && parsed.pathname === "/url") {
      const redirected = parsed.searchParams.get("q") || parsed.searchParams.get("url");
      if (redirected) return normalizeUrl(redirected);
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function crawlAllowed(url = "", rootHost = "") {
  const normalized = normalizeUrl(url);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return false;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const sameRoot = rootHost ? host === rootHost || host.endsWith(`.${rootHost}`) : true;

    if (!sameRoot) return false;
    if (BLOCKED_CRAWL_HOSTS.some((blocked) => host.includes(blocked))) return false;
    if (BLOCKED_CRAWL_EXTENSIONS.some((extension) => path.endsWith(extension))) return false;

    return true;
  } catch {
    return false;
  }
}

function extractLinks(html = "", baseUrl = "", options = {}) {
  const rootHost = new URL(baseUrl).hostname.toLowerCase();
  const maxLinks = Number(options.maxLinks || process.env.FREE_WEBCRAWL_MAX_LINKS || 12);
  const links = [];

  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const normalized = normalizeUrl(match[1], baseUrl);

    if (!crawlAllowed(normalized, rootHost)) continue;
    if (normalized === normalizeUrl(baseUrl)) continue;
    if (links.includes(normalized)) continue;

    links.push(normalized);
    if (links.length >= maxLinks) break;
  }

  return links;
}

function roadmapSeedUrls(rootUrl = "") {
  const normalized = normalizeUrl(rootUrl);
  if (!normalized) return [];

  const root = new URL(normalized);
  return ROADMAP_CRAWL_PATHS.map((pathname) => normalizeUrl(pathname, `${root.protocol}//${root.hostname}`));
}

function parseSitemapLinks(xml = "", rootUrl = "", options = {}) {
  const rootHost = new URL(rootUrl).hostname.toLowerCase();
  const maxLinks = Number(options.maxSitemapLinks || process.env.FREE_WEBCRAWL_SITEMAP_LINKS || 12);
  const roadmapTerms = ["roadmap", "docs", "blog", "whitepaper", "litepaper", "changelog", "update", "announcement", "tokenomics"];
  const links = [];

  for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const normalized = normalizeUrl(cleanText(match[1]));
    const lowered = normalized.toLowerCase();

    if (!crawlAllowed(normalized, rootHost)) continue;
    if (!roadmapTerms.some((term) => lowered.includes(term))) continue;
    if (links.includes(normalized)) continue;

    links.push(normalized);
    if (links.length >= maxLinks) break;
  }

  return links;
}

async function fetchSitemapLinks(rootUrl = "", options = {}) {
  const root = new URL(rootUrl);
  const sitemapUrl = `${root.protocol}//${root.hostname}/sitemap.xml`;

  try {
    const xml = await fetchText(sitemapUrl, {
      ...options,
      timeoutMs: options.crawlTimeoutMs || process.env.FREE_WEBCRAWL_TIMEOUT_MS || options.timeoutMs || 8000,
    });
    return parseSitemapLinks(xml, rootUrl, options);
  } catch {
    return [];
  }
}

function crawlRelevanceScore(page = {}, project = {}) {
  const text = `${page.title || ""} ${page.description || ""} ${page.text || ""}`.toLowerCase();
  const termHits = projectTerms(project).filter((term) => text.includes(term)).length;
  const catalystCount = hits(text, CATALYST_TERMS).length;
  const narrativeCount = hits(text, NARRATIVE_TERMS).length;
  const riskCount = hits(text, RISK_TERMS).length;

  return Math.round(termHits * 12 + catalystCount * 8 + narrativeCount * 5 - riskCount * 10);
}

async function fetchText(url = "", options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));
  const parentSignal = options.signal;
  const abortFromParent = () => {
    try {
      controller.abort(parentSignal?.reason || "parent signal aborted");
    } catch {
      controller.abort();
    }
  };

  if (parentSignal?.aborted) abortFromParent();
  if (parentSignal && typeof parentSignal.addEventListener === "function") {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/rss+xml,application/xml,text/xml,*/*",
        "user-agent": "Crypto-Launch-Intelligence/0.5",
      },
    });

    if (!response.ok) throw new Error(`Request failed: ${response.status} ${url}`);

    return response.text();
  } finally {
    clearTimeout(timer);
    if (parentSignal && typeof parentSignal.removeEventListener === "function") {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }
}

function tagValue(xml = "", tag = "") {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return cleanText(match?.[1] || "");
}

function parseRssItems(xml = "", source = "rss") {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  return blocks.slice(0, 80).map((block) => {
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";

    return {
      title: tagValue(block, "title"),
      description: tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content"),
      url: tagValue(block, "link") || atomLink,
      publishedAt: tagValue(block, "pubDate") || tagValue(block, "updated") || tagValue(block, "published"),
      source,
    };
  });
}

function extractPageResearch(html = "", url = "") {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const metaDescription =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    "";
  const body = cleanText(html).slice(0, 6000);

  return {
    title,
    description: cleanText(metaDescription),
    url,
    text: `${title} ${cleanText(metaDescription)} ${body}`.slice(0, 8000),
  };
}

function containsTerm(text = "", terms = []) {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
}

function hits(text = "", dictionary = []) {
  const lowered = text.toLowerCase();
  return dictionary.filter((term) => lowered.includes(term));
}

async function fetchFeedArticles(options = {}) {
  const feedResults = await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const xml = await fetchText(feed.url, options);
        return {
          feed: feed.name,
          status: "SUCCESS",
          articles: parseRssItems(xml, feed.name),
        };
      } catch (error) {
        return {
          feed: feed.name,
          status: `FAILED: ${error.message}`,
          articles: [],
        };
      }
    })
  );

  return {
    articles: feedResults.flatMap((result) => result.articles),
    status: Object.fromEntries(feedResults.map((result) => [result.feed, result.status])),
  };
}

async function mapWithConcurrency(items = [], concurrency = 4, worker = async () => null) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(items.length, concurrency));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        output[index] = await worker(items[index], index);
      }
    })
  );

  return output;
}

async function researchSingleProject(project = {}, feedResearch = {}, options = {}) {
  const crawlResearch = await crawlProjectWeb(project, options);
  const pageResearch = crawlResearch.pages.length
    ? { status: "COVERED_BY_WEBCRAWL", pages: [] }
    : await fetchProjectPage(project, options);
  const googleNews = await fetchGoogleNewsForProject(project, options);
  const scored = scoreResearch({
    articles: [...(feedResearch.articles || []), ...googleNews.articles],
    pages: [...pageResearch.pages, ...crawlResearch.pages],
    project,
  });

  return {
    key: projectKey(project),
    research: {
      source: "internet-research",
      status: {
        feeds: feedResearch.status || {},
        projectPage: pageResearch.status,
        webcrawl: crawlResearch.status,
        googleNews: googleNews.status,
      },
      webcrawl: {
        status: crawlResearch.status,
        crawledUrls: crawlResearch.crawledUrls,
        errors: crawlResearch.errors,
        pageCount: crawlResearch.pages.length,
      },
      ...scored,
    },
  };
}

async function fetchGoogleNewsForProject(project = {}, options = {}) {
  const terms = projectTerms(project).slice(0, 3).join(" ");

  if (!terms) {
    return {
      status: "NO_QUERY",
      articles: [],
    };
  }

  try {
    const params = new URLSearchParams({
      q: `${terms} crypto`,
      hl: "en-US",
      gl: "US",
      ceid: "US:en",
    });
    const xml = await fetchText(`https://news.google.com/rss/search?${params}`, options);

    return {
      status: "SUCCESS",
      articles: parseRssItems(xml, "Google News").slice(
        0,
        Number(options.googleNewsArticles || process.env.GOOGLE_NEWS_PROJECT_ARTICLES || 8)
      ),
    };
  } catch (error) {
    return {
      status: `FAILED: ${error.message}`,
      articles: [],
    };
  }
}

async function fetchProjectPage(project = {}, options = {}) {
  const url = project.website || project.homepage || project.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      status: "NO_PROJECT_URL",
      pages: [],
    };
  }

  try {
    const html = await fetchText(url, options);
    return {
      status: "SUCCESS",
      pages: [extractPageResearch(html, url)],
    };
  } catch (error) {
    return {
      status: `FAILED: ${error.message}`,
      pages: [],
    };
  }
}

async function crawlProjectWeb(project = {}, options = {}) {
  const enabled =
    options.webcrawl?.enabled ??
    options.crawl?.enabled ??
    process.env.FREE_WEBCRAWL_ENABLED !== "false";
  const rootUrl = normalizeUrl(project.website || project.homepage || project.url || "");

  if (!enabled) {
    return {
      status: "DISABLED",
      pages: [],
      crawledUrls: [],
      errors: [],
    };
  }

  if (!rootUrl) {
    return {
      status: "NO_PROJECT_URL",
      pages: [],
      crawledUrls: [],
      errors: [],
    };
  }

  const rootHost = new URL(rootUrl).hostname.toLowerCase();
  const maxPages = Number(options.maxCrawlPages || process.env.FREE_WEBCRAWL_MAX_PAGES || 4);
  const sitemapLinks = await fetchSitemapLinks(rootUrl, options);
  const queue = [...new Set([rootUrl, ...roadmapSeedUrls(rootUrl), ...sitemapLinks])];
  const visited = new Set();
  const pages = [];
  const errors = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (!crawlAllowed(url, rootHost) || visited.has(url)) continue;

    visited.add(url);

    try {
      const html = await fetchText(url, {
        ...options,
        timeoutMs: options.crawlTimeoutMs || process.env.FREE_WEBCRAWL_TIMEOUT_MS || options.timeoutMs || 8000,
      });
      const page = {
        ...extractPageResearch(html, url),
        crawlDepth: url === rootUrl ? 0 : 1,
      };
      pages.push(page);

      if (url === rootUrl) {
        queue.push(...extractLinks(html, url, options));
      }
    } catch (error) {
      errors.push({ url, error: error.message });
    }
  }

  const rankedPages = pages
    .map((page) => ({
      ...page,
      relevanceScore: crawlRelevanceScore(page, project),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    status: rankedPages.length ? "SUCCESS" : errors.length ? "FAILED" : "NO_PAGES",
    pages: rankedPages,
    crawledUrls: [...visited],
    errors,
  };
}

function scoreResearch({ articles = [], pages = [], project = {} }) {
  const terms = projectTerms(project);
  const projectArticles = articles
    .filter((article) =>
      containsTerm(`${article.title} ${article.description} ${article.source}`, terms)
    )
    .slice(0, 20);
  const articleText = projectArticles
    .map((article) => `${article.title} ${article.description} ${article.source}`)
    .join(" ");
  const pageText = pages.map((page) => page.text || `${page.title} ${page.description}`).join(" ");
  const combined = `${articleText} ${pageText} ${project.description || ""} ${project.category || ""}`;
  const catalystHits = hits(combined, CATALYST_TERMS);
  const narrativeHits = hits(combined, NARRATIVE_TERMS);
  const riskHits = hits(combined, RISK_TERMS);
  const sourceCount = new Set([
    ...projectArticles.map((article) => article.source),
    ...pages.map((page) => page.url),
  ].filter(Boolean)).size;
  const crawlPageCount = pages.filter((page) => page.crawlDepth !== undefined).length;
  const crawlEvidenceScore = Math.min(24, crawlPageCount * 6);
  const signalScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        projectArticles.length * 5 +
          sourceCount * 7 +
          catalystHits.length * 8 +
          narrativeHits.length * 5 -
          riskHits.length * 12 +
          crawlEvidenceScore
      )
    )
  );
  const riskScore = Math.round(Math.min(100, riskHits.length * 22));

  return {
    articles: projectArticles,
    pages,
    catalystHits,
    narrativeHits,
    riskHits,
    crawlPageCount,
    sourceCount,
    signalScore,
    riskScore,
    summary:
      signalScore >= 65
        ? "Internet research found broad supporting evidence."
        : riskScore >= 45
        ? "Internet research found elevated risk language."
        : sourceCount > 0
        ? "Internet research found some supporting context."
        : "Internet research found limited project-specific context.",
  };
}

export async function getInternetProjectResearchBatch(projects = [], options = {}) {
  const limit = Number(options.limit || process.env.INTERNET_RESEARCH_PROJECT_LIMIT || 20);
  const safeProjects = (Array.isArray(projects) ? projects : []).slice(0, limit);
  const feedResearch = await fetchFeedArticles(options);
  const concurrency = positiveInteger(
    options.concurrency || process.env.INTERNET_RESEARCH_CONCURRENCY,
    4
  );
  const projectResults = await mapWithConcurrency(
    safeProjects,
    concurrency,
    (project) => researchSingleProject(project, feedResearch, options)
  );
  const results = new Map();

  for (const item of projectResults) {
    if (item?.key) results.set(item.key, item.research);
  }

  return results;
}

export const __internetResearchTestHooks = {
  cleanText,
  extractLinks,
  extractPageResearch,
  normalizeUrl,
  crawlAllowed,
  roadmapSeedUrls,
  parseSitemapLinks,
  scoreResearch,
  mapWithConcurrency,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await getInternetProjectResearchBatch([
    { name: "Bittensor", symbol: "TAO", description: "AI decentralized compute" },
    { name: "Ondo", symbol: "ONDO", description: "RWA tokenized treasury" },
  ]);
  console.log(JSON.stringify([...results.values()], null, 2));
}
