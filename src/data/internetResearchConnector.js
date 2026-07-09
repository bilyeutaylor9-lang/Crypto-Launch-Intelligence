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

function n(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
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

async function fetchText(url = "", options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));

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
  const articles = [];
  const status = {};

  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchText(feed.url, options);
      const parsed = parseRssItems(xml, feed.name);
      articles.push(...parsed);
      status[feed.name] = "SUCCESS";
    } catch (error) {
      status[feed.name] = `FAILED: ${error.message}`;
    }
  }

  return { articles, status };
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
  const signalScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        projectArticles.length * 5 +
          sourceCount * 7 +
          catalystHits.length * 8 +
          narrativeHits.length * 5 -
          riskHits.length * 12
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
  const results = new Map();

  for (const project of safeProjects) {
    const pageResearch = await fetchProjectPage(project, options);
    const scored = scoreResearch({
      articles: feedResearch.articles,
      pages: pageResearch.pages,
      project,
    });

    results.set(projectKey(project), {
      source: "internet-research",
      status: {
        feeds: feedResearch.status,
        projectPage: pageResearch.status,
      },
      ...scored,
    });
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await getInternetProjectResearchBatch([
    { name: "Bittensor", symbol: "TAO", description: "AI decentralized compute" },
    { name: "Ondo", symbol: "ONDO", description: "RWA tokenized treasury" },
  ]);
  console.log(JSON.stringify([...results.values()], null, 2));
}
