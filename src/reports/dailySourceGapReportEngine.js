import fs from "fs";
import path from "path";

const SOURCE_SETUP = {
  dexscreener: { label: "DexScreener", envKey: null, free: true, critical: true, improves: "pool identity, liquidity, boosts, profiles, pairs" },
  geckoterminal: { label: "GeckoTerminal", envKey: null, free: true, critical: true, improves: "DEX pools, networks, price/liquidity corroboration" },
  coingecko: { label: "CoinGecko", envKey: null, alternateEnvKeys: ["COINGECKO_DEMO_API_KEY", "COINGECKO_API_KEY", "COINGECKO_PRO_API_KEY"], free: true, critical: true, improves: "market cap, categories, trending, token lists" },
  freemarketdata: { label: "Free Market Providers", envKey: null, free: true, critical: true, improves: "no-key market data breadth" },
  expandedmarketdata: { label: "Expanded Free Market Providers", envKey: null, free: true, critical: true, improves: "extra no-key market candidates" },
  candidaterescue: { label: "Candidate Rescue", envKey: null, free: true, critical: true, improves: "hidden candidates and missed-project recovery" },
  aidiscoveryswarm: { label: "AI Discovery Swarm", envKey: null, free: true, critical: false, improves: "research seed expansion" },
  researchseeds: { label: "Research Seeds", envKey: null, free: true, critical: true, improves: "fallback seed coverage when APIs are thin" },
  nativediscoverymesh: { label: "Native Discovery Mesh", envKey: null, free: true, critical: true, improves: "native pool and launch route discovery" },
  googlenewsdiscovery: { label: "Google News Discovery", envKey: null, free: true, critical: false, improves: "roadmaps, catalysts, and news corroboration" },
  birdeye: { label: "Birdeye", envKey: "BIRDEYE_API_KEY", improves: "Solana trending, price, liquidity, wallet signals" },
  coincap: { label: "CoinCap", envKey: "COINCAP_API_KEY", improves: "market data breadth" },
  coinmarketcap: { label: "CoinMarketCap", envKey: "COINMARKETCAP_API_KEY", improves: "market data and listings" },
  cryptocompare: { label: "CryptoCompare", envKey: "CRYPTOCOMPARE_API_KEY", improves: "market data and exchange coverage" },
  etherscan: { label: "Etherscan V2", envKey: "ETHERSCAN_API_KEY", critical: true, improves: "multichain EVM ABI, source, creator, deployer evidence" },
  solscan: { label: "Solscan", envKey: "SOLSCAN_API_KEY", critical: true, improves: "Solana token, wallet, and authority evidence" },
  goplus: { label: "GoPlus", envKey: null, free: true, critical: true, improves: "token safety and authority checks" },
  honeypot: { label: "Honeypot.is", envKey: null, free: true, critical: true, improves: "sell restriction and honeypot checks" },
  github: { label: "GitHub", envKey: "GITHUB_TOKEN", optional: true, free: true, critical: true, improves: "developer velocity and repo identity" },
  supabase: { label: "Supabase", envKey: "SUPABASE_SECRET_KEY", alternateEnvKeys: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], improves: "remote memory, outcomes, prior scans" },
  jupiter: { label: "Jupiter", envKey: "JUPITER_API_KEY", optional: true, free: true, critical: true, improves: "Solana buy/sell quote recovery" },
  zerox: { label: "0x Swap API", envKey: "ZEROX_API_KEY", optional: true, critical: true, improves: "EVM buy/sell quote recovery" },
  cexorderbook: { label: "CEX public order books", envKey: null, free: true, critical: true, improves: "spot depth and spread checks" },
};

const FREE_BACKBONE_SOURCES = [
  "dexscreener",
  "geckoterminal",
  "coingecko",
  "freemarketdata",
  "expandedmarketdata",
  "candidaterescue",
  "aidiscoveryswarm",
  "researchseeds",
  "nativediscoverymesh",
  "github",
  "googlenewsdiscovery",
];

const PAID_KEY_UPSIDE_RANK = [
  { source: "birdeye", missingKey: "BIRDEYE_API_KEY", priority: 1, reason: "Best first paid upgrade for Solana liquidity, trending, and wallet signals." },
  { source: "etherscan", missingKey: "ETHERSCAN_API_KEY", priority: 2, reason: "Best EVM contract/source/deployer truth upgrade." },
  { source: "solscan", missingKey: "SOLSCAN_API_KEY", priority: 3, reason: "Best Solana wallet and token-authority verification upgrade." },
  { source: "zerox", missingKey: "ZEROX_API_KEY", priority: 4, reason: "Best EVM live buy/sell route quote upgrade." },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeSource(value = "") {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key.includes("dexscreener")) return "dexscreener";
  if (key.includes("geckoterminal")) return "geckoterminal";
  if (key.includes("coingecko")) return "coingecko";
  if (key.includes("freemarketdata") || key === "freemarket" || key.includes("freemarket")) return "freemarketdata";
  if (key.includes("expandedmarketdata") || key.includes("expandedmarket")) return "expandedmarketdata";
  if (key.includes("candidaterescue")) return "candidaterescue";
  if (key.includes("aidiscoveryswarm") || key.includes("aiswarm")) return "aidiscoveryswarm";
  if (key.includes("researchseeds") || key.includes("researchseed")) return "researchseeds";
  if (key.includes("nativediscoverymesh") || key.includes("nativediscovery") || key.includes("nativepool")) return "nativediscoverymesh";
  if (key.includes("googlenewsdiscovery") || key.includes("googlenews")) return "googlenewsdiscovery";
  if (key.includes("birdeye")) return "birdeye";
  if (key.includes("coincap")) return "coincap";
  if (key.includes("coinmarketcap")) return "coinmarketcap";
  if (key.includes("cryptocompare")) return "cryptocompare";
  if (key.includes("etherscan") || key.includes("blockscout") || key.includes("explorer")) return "etherscan";
  if (key.includes("solscan")) return "solscan";
  if (key.includes("goplus")) return "goplus";
  if (key.includes("honeypot")) return "honeypot";
  if (key.includes("github")) return "github";
  if (key.includes("supabase")) return "supabase";
  if (key.includes("jupiter")) return "jupiter";
  if (key.includes("zerox") || key === "0x" || key.includes("0xswap")) return "zerox";
  if (key.includes("orderbook") || key.includes("cex")) return "cexorderbook";
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

function cleanEnvKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw || /\s|\//.test(raw)) return null;
  return raw;
}

function setupForSource(source = "") {
  const setup = SOURCE_SETUP[source] || {};
  return {
    ...setup,
    label: setup.label || source,
    envKey: cleanEnvKey(setup.envKey),
    alternateEnvKeys: (setup.alternateEnvKeys || []).map(cleanEnvKey).filter(Boolean),
  };
}

function usefulCount(item = {}) {
  return Math.max(
    num(item.lastCandidateCount),
    num(item.candidates),
    num(item.candidateCount),
    num(item.scannedTokens),
    num(item.tokens),
    num(item.pairs),
    num(item.poolCount),
    num(item.pools),
    num(item.seedCount),
    num(item.seeds),
    num(item.seedUrlsDiscovered),
    num(item.evidenceRecords),
    num(item.results),
    Array.isArray(item.items) ? item.items.length : 0,
    Array.isArray(item.projects) ? item.projects.length : 0,
    Array.isArray(item.rows) ? item.rows.length : 0
  );
}

function returnedUsefulData(item = {}) {
  if (item.returnedUsefulData === true) return true;
  return usefulCount(item) > 0;
}

function sourceNextAction(item = {}, setup = {}) {
  if (item.status === "AVAILABLE") return "Keep using this source as live source truth.";
  if (item.status === "MISSING_OPTIONAL_KEY") return `Optional: add ${item.missingKey || setup.envKey || "provider key"} to improve coverage.`;
  if (item.status === "MISSING_KEY") return `Add ${item.missingKey || setup.envKey || "provider key"} if available.`;
  if (item.status === "RATE_LIMITED") return "Lower request volume, honor cooldown, or add a fallback source.";
  if (item.status === "REGION_BLOCKED") return "Use an allowed regional endpoint or alternate provider.";
  if (item.status === "FAILED") return "Inspect the provider error, keep cooldown, and rely on alternate source until healthy.";
  if (item.status === "STALE") return "Refresh this source before using it for current rankings.";
  if (item.status === "UNKNOWN" && setup.free) return "Run the no-key source probe and confirm it returns non-empty usable data.";
  if (item.status === "UNKNOWN") return "Configure a probe or connector health record so availability can be verified.";
  return "Review source health; unavailable sources require a concrete probe, key, or fallback.";
}

function blindnessRisk({ availableCount = 0, workingFreeSourceCount = 0, criticalSourceAvailableCount = 0 } = {}) {
  if (availableCount === 0) return "CRITICAL";
  if (workingFreeSourceCount < 3 || criticalSourceAvailableCount < 2) return "HIGH";
  if (workingFreeSourceCount < 5 || criticalSourceAvailableCount < 4) return "MEDIUM";
  return "LOW";
}

function mergeSource(sourceMap, key, patch = {}) {
  if (!key || key === "unknown") return;
  const current = sourceMap.get(key) || {};
  const setup = setupForSource(key);
  const next = {
    ...current,
    source: key,
    label: current.label || setup.label || key,
    ...patch,
  };
  if (!next.status) next.status = classifyStatus(next);
  next.returnedUsefulData = returnedUsefulData(next);
  if (next.returnedUsefulData && !["MISSING_KEY", "MISSING_OPTIONAL_KEY", "RATE_LIMITED", "REGION_BLOCKED", "FAILED", "STALE"].includes(next.status)) {
    next.status = "AVAILABLE";
  }
  sourceMap.set(key, next);
}

export function summarizeDailySourceGaps(meta = {}) {
  const sourceRouter = meta.sourceRouter || {};
  const opMode = meta.opModeReadiness || {};
  const providerRows = [
    ...(sourceRouter.strongestSources || []),
    ...(sourceRouter.weakestSources || []),
    ...(sourceRouter.sources || []),
    ...Object.entries(meta.discovery?.sourceReports || {}).map(([source, row]) => ({ ...row, source })),
    ...(meta.discovery?.providerHealth?.sources || []),
    ...(meta.providerHealth?.sources || []),
  ];
  const sourceMap = new Map();
  for (const row of providerRows) {
    const key = normalizeSource(row.source || row.label || row.name);
    if (!key || key === "unknown") continue;
    mergeSource(sourceMap, key, {
      ...row,
      source: key,
      status: classifyStatus(row),
      trustScore: num(row.trustScore),
      returnedUsefulData: returnedUsefulData(row),
    });
  }
  const freeProbeRows = meta.freeSourceProbes || meta.sourceProbes || {};
  for (const [source, row] of Object.entries(freeProbeRows)) {
    const key = normalizeSource(source);
    mergeSource(sourceMap, key, {
      ...row,
      source: key,
      status: classifyStatus(row),
      returnedUsefulData: returnedUsefulData(row),
    });
  }
  for (const key of FREE_BACKBONE_SOURCES) {
    if (!sourceMap.has(key)) {
      const setup = setupForSource(key);
      mergeSource(sourceMap, key, {
        source: key,
        label: setup.label,
        status: "UNKNOWN",
        returnedUsefulData: false,
        free: true,
        critical: setup.critical === true,
      });
    }
  }
  for (const group of opMode.keys?.groups || []) {
    for (const missing of group.missingRequired || []) {
      const key = normalizeSource(missing);
      const setup = setupForSource(key);
      const envKey = setup.envKey || cleanEnvKey(missing) || null;
      mergeSource(sourceMap, key, {
        source: key,
        label: setup.label || missing,
        status: "MISSING_KEY",
        missingKey: envKey,
        improves: setup.improves,
        returnedUsefulData: false,
      });
    }
  }
  for (const gap of meta.executionProofRecovery?.optionalSourceGaps || []) {
    const key = normalizeSource(gap.source || gap.missingKey);
    const setup = setupForSource(key);
    mergeSource(sourceMap, key, {
      source: key,
      label: setup.label,
      status: "MISSING_OPTIONAL_KEY",
      missingKey: cleanEnvKey(gap.missingKey) || setup.envKey,
      optional: true,
      improves: setup.improves,
      returnedUsefulData: false,
      lastError: gap.reason || null,
    });
  }

  const sources = [...sourceMap.values()].map((item) => {
    const setup = setupForSource(item.source);
    const optional = item.optional === true || setup.optional === true || item.status === "MISSING_OPTIONAL_KEY";
    const available = item.status === "AVAILABLE";
    return {
      source: item.source,
      label: item.label || setup.label || item.source,
      status: item.status || "UNKNOWN",
      optional,
      free: item.free === true || setup.free === true,
      critical: item.critical === true || setup.critical === true,
      envKey: setup.envKey,
      alternateEnvKeys: setup.alternateEnvKeys || [],
      trustScore: num(item.trustScore),
      available,
      rateLimited: item.status === "RATE_LIMITED",
      missingKey: ["MISSING_KEY", "MISSING_OPTIONAL_KEY"].includes(item.status) ? cleanEnvKey(item.missingKey) || setup.envKey || null : null,
      regionBlocked: item.status === "REGION_BLOCKED",
      failed: item.status === "FAILED",
      stale: item.status === "STALE",
      returnedUsefulData: Boolean(item.returnedUsefulData),
      usefulRecordCount: usefulCount(item),
      cooldownUntil: item.cooldownUntil || null,
      lastError: item.lastError || item.error || null,
      improves: item.improves || setup.improves || "source coverage",
      nextAction: sourceNextAction(item, setup),
    };
  }).sort((a, b) => {
    const priority = { MISSING_KEY: 5, FAILED: 4, RATE_LIMITED: 3, REGION_BLOCKED: 2, MISSING_OPTIONAL_KEY: 1, STALE: 1, UNKNOWN: 1, AVAILABLE: 0 };
    return (priority[b.status] || 0) - (priority[a.status] || 0) || b.trustScore - a.trustScore;
  });
  const fatalGapStatuses = new Set(["MISSING_KEY", "FAILED", "RATE_LIMITED", "REGION_BLOCKED"]);
  const availableCount = sources.filter((item) => item.status === "AVAILABLE").length;
  const workingFreeSourceCount = sources.filter((item) => item.free && item.status === "AVAILABLE").length;
  const workingPaidSourceCount = sources.filter((item) => !item.free && item.status === "AVAILABLE").length;
  const criticalSourceCount = sources.filter((item) => item.critical).length;
  const criticalSourceAvailableCount = sources.filter((item) => item.critical && item.status === "AVAILABLE").length;
  const scannerBlindnessRisk = blindnessRisk({ availableCount, workingFreeSourceCount, criticalSourceAvailableCount });

  return {
    generatedAt: new Date().toISOString(),
    status: availableCount === 0 || sources.some((item) => fatalGapStatuses.has(item.status))
      ? "SOURCE_GAPS_FOUND"
      : "SOURCE_HEALTH_OK",
    sourceCount: sources.length,
    availableCount,
    workingFreeSourceCount,
    workingPaidSourceCount,
    criticalSourceCount,
    criticalSourceAvailableCount,
    scannerBlindnessRisk,
    criticalWarning:
      availableCount === 0
        ? "CRITICAL: scanner has no live source truth. Rankings are research-only and should not be trusted until source coverage is restored."
        : null,
    missingKeyCount: sources.filter((item) => item.status === "MISSING_KEY").length,
    optionalMissingKeyCount: sources.filter((item) => item.status === "MISSING_OPTIONAL_KEY").length,
    failedCount: sources.filter((item) => item.status === "FAILED").length,
    rateLimitedCount: sources.filter((item) => item.status === "RATE_LIMITED").length,
    regionBlockedCount: sources.filter((item) => item.status === "REGION_BLOCKED").length,
    topFreeSourceFailures: sources
      .filter((item) => item.free && item.status !== "AVAILABLE")
      .slice(0, 12)
      .map((item) => ({ source: item.label, status: item.status, nextAction: item.nextAction, improves: item.improves })),
    paidKeyUpsideRank: PAID_KEY_UPSIDE_RANK.map((item) => {
      const source = sources.find((sourceItem) => sourceItem.source === item.source);
      return {
        ...item,
        status: source?.status || "UNKNOWN",
        missing: source ? source.status !== "AVAILABLE" : true,
      };
    }),
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
