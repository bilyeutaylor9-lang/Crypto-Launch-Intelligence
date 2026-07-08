function hasFetch() {
  return typeof fetch === "function";
}

function n(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clean(value = "") {
  return String(value || "").trim();
}

function projectQuery(project = {}) {
  const parts = [
    project.name,
    project.symbol ? `$${String(project.symbol).replace(/^\$/, "")}` : "",
    project.twitterHandle,
    project.xHandle,
  ].filter(Boolean);

  return [...new Set(parts.map(clean).filter(Boolean))].join(" OR ");
}

function normalizePost(post = {}) {
  return {
    id: post.id || null,
    text: post.text || "",
    authorId: post.author_id || post.authorId || null,
    createdAt: post.created_at || post.createdAt || null,
    publicMetrics: post.public_metrics || post.publicMetrics || {},
    source: "x",
  };
}

function scorePosts(posts = []) {
  const joined = posts.map((post) => post.text || "").join(" ").toLowerCase();
  const announcementHits = [
    "launch",
    "mainnet",
    "airdrop",
    "listing",
    "staking",
    "partnership",
    "testnet",
    "token",
  ].filter((word) => joined.includes(word));
  const institutionalHits = [
    "coinbase",
    "binance",
    "kraken",
    "a16z",
    "paradigm",
    "coinfund",
    "multicoin",
    "blackrock",
  ].filter((word) => joined.includes(word));
  const riskHits = [
    "scam",
    "rug",
    "exploit",
    "hack",
    "drain",
    "fake",
    "phishing",
  ].filter((word) => joined.includes(word));
  const engagement = posts.reduce((sum, post) => {
    const metrics = post.publicMetrics || {};
    return (
      sum +
      n(metrics.like_count ?? metrics.likeCount) +
      n(metrics.retweet_count ?? metrics.retweetCount) * 2 +
      n(metrics.reply_count ?? metrics.replyCount) +
      n(metrics.quote_count ?? metrics.quoteCount) * 2
    );
  }, 0);

  return {
    postCount: posts.length,
    engagement,
    announcementHits,
    institutionalHits,
    riskHits,
    signalScore: Math.min(
      100,
      posts.length * 8 +
        announcementHits.length * 10 +
        institutionalHits.length * 12 +
        Math.log10(Math.max(1, engagement)) * 8 -
        riskHits.length * 18
    ),
    riskScore: Math.min(100, riskHits.length * 25),
  };
}

async function fetchXSearch(query = "", options = {}) {
  const bearer = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;

  if (!bearer || !hasFetch() || !query) {
    return {
      status: bearer ? "NO_QUERY" : "MISSING_X_BEARER_TOKEN",
      posts: [],
    };
  }

  const maxResults = Math.max(10, Math.min(100, Number(options.maxResults || 25)));
  const params = new URLSearchParams({
    query: `${query} -is:retweet lang:en`,
    max_results: String(maxResults),
    "tweet.fields": "created_at,public_metrics,author_id,lang",
  });
  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
    },
  });

  if (!response.ok) {
    return {
      status: "FAILED",
      error: `X search failed: ${response.status}`,
      posts: [],
    };
  }

  const body = await response.json();

  return {
    status: "SUCCESS",
    posts: (body.data || []).map(normalizePost),
    meta: body.meta || {},
  };
}

export async function getXProjectIntelligence(project = {}, options = {}) {
  const query = projectQuery(project);
  const result = await fetchXSearch(query, options);
  const posts = result.posts || [];
  const score = scorePosts(posts);

  return {
    source: "x",
    status: result.status,
    query,
    posts,
    postCount: score.postCount,
    engagement: score.engagement,
    announcementHits: score.announcementHits,
    institutionalHits: score.institutionalHits,
    riskHits: score.riskHits,
    signalScore: Math.round(score.signalScore),
    riskScore: Math.round(score.riskScore),
    error: result.error || null,
  };
}

export async function getXProjectIntelligenceBatch(projects = [], options = {}) {
  const limit = Number(options.limit || process.env.X_PROJECT_LIMIT || 25);
  const safeProjects = (Array.isArray(projects) ? projects : []).slice(0, limit);
  const results = new Map();

  for (const project of safeProjects) {
    const key = String(project.address || project.pairAddress || `${project.chain}:${project.symbol || project.name}`).toLowerCase();
    results.set(key, await getXProjectIntelligence(project, options));
  }

  return results;
}
