// src/data/googleNewsDiscoveryConnector.js

const DEFAULT_GOOGLE_NEWS_QUERIES = [
  "crypto token launch",
  "crypto airdrop mainnet",
  "crypto testnet token",
  "crypto AI agent token",
  "crypto RWA tokenized assets",
  "crypto DePIN project",
  "crypto restaking AVS",
  "crypto stablecoin launch",
  "crypto modular rollup launch",
  "crypto prediction market token",
  "Solana token launch",
  "Base ecosystem token launch",
];

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

function sleep(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url = "", options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml,application/xml,text/xml,*/*",
        "user-agent": "Crypto-Launch-Intelligence/0.5",
      },
    });

    if (!response.ok) throw new Error(`Google News request failed: ${response.status}`);

    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function tagValue(xml = "", tag = "") {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return cleanText(match?.[1] || "");
}

function parseItems(xml = "") {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => {
    const block = match[0];
    return {
      title: tagValue(block, "title"),
      url: tagValue(block, "link"),
      publishedAt: tagValue(block, "pubDate"),
      source: tagValue(block, "source") || "Google News",
    };
  });
}

function symbolFromTitle(title = "") {
  const cashtag = title.match(/\$([A-Z][A-Z0-9]{1,12})\b/)?.[1];
  if (cashtag) return cashtag;

  const ticker = title.match(/\(([A-Z][A-Z0-9]{1,12})\)/)?.[1];
  if (ticker) return ticker;

  const words = title
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return String(words[0] || "NEWS").toUpperCase().slice(0, 12);
}

function projectNameFromTitle(title = "") {
  return cleanText(title.split(" - ")[0] || title).slice(0, 96) || "Google News Candidate";
}

function candidateFromArticle(article = {}, query = "") {
  const title = cleanText(article.title);

  return {
    name: projectNameFromTitle(title),
    symbol: symbolFromTitle(title),
    chain: "google-news",
    address: null,
    pairAddress: `google-news-${Buffer.from(`${query}:${title}`).toString("base64url").slice(0, 48)}`,
    dex: "internet-research",
    url: article.url || null,
    priceUsd: 0,
    liquidityUsd: 0,
    volume24h: 0,
    marketCap: 0,
    fdv: 0,
    priceChange24h: 0,
    category: query,
    source: "google-news",
    discoverySources: ["google-news"],
    internetDiscovered: true,
    discoveredAt: new Date().toISOString(),
    description: `${title} ${query} ${article.source || ""} Google News crypto research`,
    newsArticle: article,
  };
}

export async function getGoogleNewsDiscoveryCandidates(options = {}) {
  const limit = Number(options.limit || process.env.GOOGLE_NEWS_DISCOVERY_LIMIT || 120);
  const queryLimit = Number(options.queryLimit || process.env.GOOGLE_NEWS_QUERY_LIMIT || 8);
  const perQuery = Math.max(3, Math.ceil(limit / Math.max(1, queryLimit)));
  const queries = (options.queries || DEFAULT_GOOGLE_NEWS_QUERIES).slice(0, queryLimit);
  const all = [];

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        hl: "en-US",
        gl: "US",
        ceid: "US:en",
      });
      const xml = await fetchText(`https://news.google.com/rss/search?${params}`, options);
      const items = parseItems(xml)
        .slice(0, perQuery)
        .map((article) => candidateFromArticle(article, query));

      all.push(...items);
    } catch (error) {
      console.warn(`google-news ${query} skipped: ${error.message}`);
    }

    await sleep(Number(options.delayMs || process.env.GOOGLE_NEWS_DELAY_MS || 350));
  }

  return all.slice(0, limit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await getGoogleNewsDiscoveryCandidates({ limit: 25 });
  console.log(JSON.stringify(candidates, null, 2));
}
