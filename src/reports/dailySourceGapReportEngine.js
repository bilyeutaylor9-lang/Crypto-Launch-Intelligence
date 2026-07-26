import fs from "fs";
import path from "path";

const SOURCE_SETUP = {
  dexscreener: { label: "DexScreener", key: null, improves: "pool identity, liquidity, boosts, profiles, pairs" },
  geckoterminal: { label: "GeckoTerminal", key: null, improves: "DEX pools, networks, price/liquidity corroboration" },
  coingecko: { label: "CoinGecko", key: "COINGECKO_DEMO_API_KEY or COINGECKO_API_KEY", improves: "market cap, categories, trending, token lists" },
  birdeye: { label: "Birdeye", key: "BIRDEYE_API_KEY", improves: "Solana trending, price, liquidity, wallet signals" },
  coincap: { label: "CoinCap", key: "COINCAP_API_KEY", improves: "market data breadth" },
  coinmarketcap: { label: "CoinMarketCap", key: "COINMARKETCAP_API_KEY", improves: "market data and listings" },
  cryptocompare: { label: "CryptoCompare", key: "CRYPTOCOMPARE_API_KEY", improves: "market data and exchange coverage" },
  etherscan: { label: "Etherscan V2", key: "ETHERSCAN_API_KEY", improves: "multichain EVM ABI, source, creator, deployer evidence" },
  goplus: { label: "GoPlus", key: null, improves: "token safety and authority checks" },
  honeypot: { label: "Honeypot.is", key: null, improves: "sell restriction and honeypot checks" },
  github: { label: "GitHub", key: "GITHUB_TOKEN optional", improves: "developer velocity and repo identity" },
  supabase: { label: "Supabase", key: "SUPABASE_URL + SUPABASE_SECRET_KEY", improves: "remote memory, outcomes, prior scans" },
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeSource(value = "") {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key.includes("dexscreener")) return "dexscreener";
  if (key.includes("geckoterminal")) return "geckoterminal";
  if (key.includes("coingecko")) return "coingecko";
  if (key.includes("birdeye")) return "birdeye";
  if (key.includes("coincap")) return "coincap";
  if (key.includes("coinmarketcap")) return "coinmarketcap";
  if (key.includes("cryptocompare")) return "cryptocompare";
  if (key.includes("etherscan") || key.includes("blockscout") || key.includes("explorer")) return "etherscan";
  if (key.includes("goplus")) return "goplus";
  if (key.includes("honeypot")) return "honeypot";
  if (key.includes("github")) return "github";
  if (key.includes("supabase")) return "supabase";
  return key || "unknown";
}

function classifyStatus(item = {}) {
  const text = String(item.lastError || item.error || item.status || item.lastStatus || "").toLowerCase();
  if (/missing.*key|required.*key|api_key|unauthorized|401/.test(text)) return "MISSING_KEY";
  if (/429|rate/.test(text)) return "RATE_LIMITED";
  if (/451|region|blocked|forbidden|403/.test(text)) return "REGION_BLOCKED";
  if (/stale/.test(text)) return "STALE";
  if (/fail|error|timeout|fetch/.test(text)) return "FAILED";
  if (num(item.lastCandidateCount || item.candidates) > 0 || /success|ok|used|ready/.test(text)) return "AVAILABLE";
  return "UNKNOWN";
}

export function summarizeDailySourceGaps(meta = {}) {
  const sourceRouter = meta.sourceRouter || {};
  const opMode = meta.opModeReadiness || {};
  const providerRows = [
    ...(sourceRouter.strongestSources || []),
    ...(sourceRouter.weakestSources || []),
    ...(sourceRouter.sources || []),
  ];
  const sourceMap = new Map();
  for (const row of providerRows) {
    const key = normalizeSource(row.source || row.label || row.name);
    if (!key || key === "unknown") continue;
    const current = sourceMap.get(key) || {};
    sourceMap.set(key, {
      ...current,
      ...row,
      source: key,
      status: classifyStatus(row),
      trustScore: num(row.trustScore),
      returnedUsefulData: num(row.lastCandidateCount || row.candidates) > 0,
    });
  }
  for (const group of opMode.keys?.groups || []) {
    for (const missing of group.missingRequired || []) {
      const key = normalizeSource(missing);
      const setup = SOURCE_SETUP[key] || { label: missing, key: `${missing.toUpperCase()}_API_KEY`, improves: group.label };
      sourceMap.set(key, {
        ...(sourceMap.get(key) || {}),
        source: key,
        label: setup.label,
        status: "MISSING_KEY",
        missingKey: setup.key,
        improves: setup.improves,
        returnedUsefulData: false,
      });
    }
  }

  const sources = [...sourceMap.values()].map((item) => {
    const setup = SOURCE_SETUP[item.source] || {};
    return {
      source: item.source,
      label: item.label || setup.label || item.source,
      status: item.status || "UNKNOWN",
      trustScore: num(item.trustScore),
      available: item.status === "AVAILABLE",
      rateLimited: item.status === "RATE_LIMITED",
      missingKey: item.status === "MISSING_KEY" ? item.missingKey || setup.key || null : null,
      regionBlocked: item.status === "REGION_BLOCKED",
      failed: item.status === "FAILED",
      stale: item.status === "STALE",
      returnedUsefulData: Boolean(item.returnedUsefulData),
      cooldownUntil: item.cooldownUntil || null,
      lastError: item.lastError || item.error || null,
      improves: item.improves || setup.improves || "source coverage",
      nextAction:
        item.status === "MISSING_KEY"
          ? `Add ${item.missingKey || setup.key || "provider key"} if available.`
          : item.status === "RATE_LIMITED"
            ? "Lower request volume or retry after cooldown."
            : item.status === "REGION_BLOCKED"
              ? "Use an allowed regional endpoint or alternate provider."
              : item.status === "FAILED"
                ? "Keep cooldown and rely on alternate source until healthy."
                : "No action needed.",
    };
  }).sort((a, b) => {
    const priority = { MISSING_KEY: 5, FAILED: 4, RATE_LIMITED: 3, REGION_BLOCKED: 2, STALE: 1, UNKNOWN: 1, AVAILABLE: 0 };
    return (priority[b.status] || 0) - (priority[a.status] || 0) || b.trustScore - a.trustScore;
  });

  return {
    generatedAt: new Date().toISOString(),
    status: sources.some((item) => ["MISSING_KEY", "FAILED", "RATE_LIMITED", "REGION_BLOCKED"].includes(item.status))
      ? "SOURCE_GAPS_FOUND"
      : "SOURCE_HEALTH_OK",
    sourceCount: sources.length,
    availableCount: sources.filter((item) => item.status === "AVAILABLE").length,
    missingKeyCount: sources.filter((item) => item.status === "MISSING_KEY").length,
    failedCount: sources.filter((item) => item.status === "FAILED").length,
    rateLimitedCount: sources.filter((item) => item.status === "RATE_LIMITED").length,
    regionBlockedCount: sources.filter((item) => item.status === "REGION_BLOCKED").length,
    sources,
    topNextActions: sources
      .filter((item) => item.status !== "AVAILABLE")
      .slice(0, 12)
      .map((item) => ({ source: item.label, status: item.status, nextAction: item.nextAction, improves: item.improves })),
  };
}

export function writeDailySourceGapReport(meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeDailySourceGaps(meta);
  const filePath = path.join(reportsDir, "daily-source-gaps.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
