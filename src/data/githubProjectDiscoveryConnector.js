const DEFAULT_GITHUB_QUERY_TOPICS = [
  "crypto blockchain token launch",
  "web3 mainnet protocol",
  "defi protocol token",
  "ai agent crypto",
  "rwa tokenized assets crypto",
  "depin crypto protocol",
  "solana token protocol",
  "base blockchain token",
  "airdrop points protocol crypto",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rollingPushedAfterDate(days = 180) {
  const date = new Date(Date.now() - Number(days || 180) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function defaultGithubQueries(options = {}) {
  const pushedAfter = options.pushedAfter || process.env.GITHUB_DISCOVERY_PUSHED_AFTER || rollingPushedAfterDate(options.lookbackDays || process.env.GITHUB_DISCOVERY_LOOKBACK_DAYS || 180);
  return DEFAULT_GITHUB_QUERY_TOPICS.map((topic) => `${topic} pushed:>${pushedAfter}`);
}

function inferChain(text = "") {
  const lowered = text.toLowerCase();
  if (lowered.includes("solana")) return "solana";
  if (lowered.includes("base")) return "base";
  if (lowered.includes("arbitrum")) return "arbitrum";
  if (lowered.includes("optimism")) return "optimism";
  if (lowered.includes("sui")) return "sui";
  if (lowered.includes("sei")) return "sei";
  if (lowered.includes("cosmos")) return "cosmos";
  if (lowered.includes("ethereum") || lowered.includes("evm")) return "ethereum";
  return "unknown";
}

function repoSymbol(repo = {}) {
  return String(repo.name || "REPO")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase() || "REPO";
}

async function githubFetch(url = "", options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || process.env.GITHUB_DISCOVERY_TIMEOUT_MS || 10000));

  try {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "Crypto-Launch-Intelligence/0.5",
    };

    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) throw new Error(`GitHub request failed: ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeRepo(repo = {}) {
  const text = `${repo.full_name || ""} ${repo.description || ""} ${repo.language || ""}`;
  const pushedAt = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
  const daysSincePush = pushedAt ? Math.max(0, Math.round((Date.now() - pushedAt) / (24 * 60 * 60 * 1000))) : null;
  const githubActivityScore = Math.round(
    Math.min(
      100,
      Math.log10(Math.max(1, num(repo.stargazers_count))) * 18 +
        Math.log10(Math.max(1, num(repo.forks_count))) * 12 +
        (daysSincePush !== null && daysSincePush <= 7 ? 24 : daysSincePush <= 30 ? 16 : daysSincePush <= 90 ? 8 : 0)
    )
  );

  return {
    name: repo.full_name || repo.name || "GitHub Project",
    symbol: repoSymbol(repo),
    chain: inferChain(text),
    category: "github-discovered crypto project",
    description: repo.description || "Public GitHub repository discovered by free GitHub search.",
    source: "github-project-discovery",
    discoverySources: ["github-project-discovery"],
    researchOnly: true,
    tradableCandidate: false,
    identityResolutionRequired: true,
    unresolvedRepositoryQueueReason: "GitHub repository must be resolved to an official project identity before developer evidence can affect a tradable token.",
    github: repo.html_url,
    githubUrl: repo.html_url,
    repository: repo.full_name,
    githubStars: num(repo.stargazers_count),
    githubForks: num(repo.forks_count),
    openIssues: num(repo.open_issues_count),
    commits30d: null,
    contributors: null,
    syntheticGithubEstimatesRemoved: true,
    releases: 0,
    githubPushedAt: repo.pushed_at,
    githubCreatedAt: repo.created_at,
    githubUpdatedAt: repo.updated_at,
    githubLanguage: repo.language,
    githubActivityScore,
    developerActivityHint: daysSincePush !== null && daysSincePush <= 30 ? "recently pushed" : "older activity",
    discoveryPriorityScore: githubActivityScore,
  };
}

export async function getGithubProjectDiscoveryCandidates(options = {}) {
  const enabled = options.enabled ?? process.env.DISABLE_GITHUB_DISCOVERY !== "true";
  const limit = Number(options.limit || process.env.GITHUB_DISCOVERY_LIMIT || 250);
  const perPage = Math.min(100, Number(options.perPage || process.env.GITHUB_DISCOVERY_PER_PAGE || 30));
  const delayMs = Number(options.delayMs || process.env.GITHUB_DISCOVERY_DELAY_MS || 1500);
  const queries = String(options.queries || process.env.GITHUB_DISCOVERY_QUERIES || "")
    .split("|")
    .map((query) => query.trim())
    .filter(Boolean);
  const searchQueries = queries.length ? queries : defaultGithubQueries(options);

  if (!enabled) {
    return {
      results: [],
      report: {
        status: "DISABLED",
        queries: searchQueries,
      },
    };
  }

  const seen = new Set();
  const results = [];
  const status = {};

  for (const query of searchQueries) {
    if (results.length >= limit) break;

    try {
      const params = new URLSearchParams({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: String(perPage),
      });
      const json = await githubFetch(`https://api.github.com/search/repositories?${params}`, options);
      const repos = Array.isArray(json.items) ? json.items : [];

      for (const repo of repos) {
        if (results.length >= limit) break;
        if (!repo.full_name || seen.has(repo.full_name)) continue;
        seen.add(repo.full_name);
        results.push(normalizeRepo(repo));
      }

      status[query] = `SUCCESS: ${repos.length}`;
    } catch (error) {
      status[query] = `FAILED: ${error.message}`;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    results,
    report: {
      status: results.length ? "SUCCESS" : "NO_RESULTS",
      queries: searchQueries,
      queryStatus: status,
      discovered: results.length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await getGithubProjectDiscoveryCandidates({ limit: 25 }), null, 2));
}
