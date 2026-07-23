import fs from "fs";
import path from "path";
import "../config/loadEnv.js";
import { getAllSources } from "../data/dataSourceManager.js";
import { getNativeProtocolConfigs } from "../data/native/nativePoolConfig.js";
import {
  memoryFileSizeBytes,
  memoryRewriteLimitBytes,
  memorySidecarPath,
  readMemorySidecarTail,
} from "../learning/boundedMemoryStore.js";
import { summarizeSupabaseConfig } from "../storage/supabaseSync.js";

const REPORT_DIR = path.resolve("reports");
const REPORT_FILE = path.join(REPORT_DIR, "op-mode-readiness.json");
const DATA_DIR = path.resolve("data");

const KEY_GROUPS = [
  {
    id: "ai",
    label: "AI research brain",
    target: 1,
    weight: 1.3,
    items: [
      { env: "OPENAI_API_KEY", label: "OpenAI API key" },
      { env: "OPENAI_MODEL", label: "OpenAI model", optional: true },
    ],
  },
  {
    id: "market",
    label: "Market and listing coverage",
    target: 4,
    weight: 1.1,
    items: [
      { env: "BIRDEYE_API_KEY", label: "Birdeye" },
      { env: "COINGECKO_DEMO_API_KEY", label: "CoinGecko demo key", optional: true },
      { env: "COINCAP_API_KEY", label: "CoinCap" },
      { env: "COINMARKETCAP_API_KEY", label: "CoinMarketCap" },
      { env: "CRYPTOCOMPARE_API_KEY", label: "CryptoCompare" },
      { env: "DEXTOOLS_API_KEY", label: "DexTools" },
      { env: "MESSARI_API_KEY", label: "Messari", optional: true },
      { env: "MOBULA_API_KEY", label: "Mobula", optional: true },
    ],
  },
  {
    id: "social-news",
    label: "Social and news intelligence",
    target: 2,
    weight: 1,
    items: [
      {
        oneOf: ["X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN", "X_API_KEY", "TWITTER_API_KEY"],
        label: "X/Twitter search",
      },
      { env: "CRYPTOPANIC_API_KEY", label: "CryptoPanic" },
      { env: "REDDIT_API_KEY", label: "Reddit", optional: true },
      { env: "TELEGRAM_BOT_TOKEN", label: "Telegram", optional: true },
      { env: "DISCORD_BOT_TOKEN", label: "Discord", optional: true },
    ],
  },
  {
    id: "developer",
    label: "Developer and repo velocity",
    target: 1,
    weight: 0.8,
    items: [{ env: "GITHUB_TOKEN", label: "GitHub token" }],
  },
  {
    id: "explorer",
    label: "Explorer and contract truth",
    target: 2,
    weight: 1,
    items: [
      {
        oneOf: [
          "ETHERSCAN_API_KEY",
          "BASESCAN_API_KEY",
          "BSCSCAN_API_KEY",
          "ARBISCAN_API_KEY",
          "OPTIMISTIC_ETHERSCAN_API_KEY",
          "POLYGONSCAN_API_KEY",
          "SNOWTRACE_API_KEY",
        ],
        label: "EVM contract explorer key",
      },
      { env: "SOLSCAN_API_KEY", label: "Solscan" },
    ],
  },
  {
    id: "wallet",
    label: "Wallet and smart-money truth",
    target: 2,
    weight: 1.1,
    items: [
      { env: "ARKHAM_API_KEY", label: "Arkham" },
      { env: "NANSEN_API_KEY", label: "Nansen" },
      { env: "DEBANK_API_KEY", label: "DeBank", optional: true },
      { env: "ZERION_API_KEY", label: "Zerion", optional: true },
    ],
  },
  {
    id: "risk",
    label: "Extra safety checks",
    target: 1,
    weight: 0.7,
    items: [{ env: "TOKENSNIFFER_API_KEY", label: "TokenSniffer" }],
  },
];

const CHAIN_RPC_ENVS = {
  base: ["BASE_RPC_URL", "BASE_WS_URL"],
  ethereum: ["ETHEREUM_RPC_URL", "ETHEREUM_WS_URL"],
  bsc: ["BSC_RPC_URL", "BSC_WS_URL"],
  polygon: ["POLYGON_RPC_URL", "POLYGON_WS_URL"],
  arbitrum: ["ARBITRUM_RPC_URL", "ARBITRUM_WS_URL"],
  optimism: ["OPTIMISM_RPC_URL", "OPTIMISM_WS_URL"],
  avalanche: ["AVALANCHE_RPC_URL", "AVALANCHE_WS_URL"],
  solana: ["SOLANA_RPC_URL", "SOLANA_WS_URL", "HELIUS_API_KEY"],
  "multi-evm": ["EVM_DEPLOYMENT_RADAR_RPC_URL", "ETHEREUM_RPC_URL", "BASE_RPC_URL"],
};

const DATASET_SPECS = [
  {
    id: "universe-ledger",
    label: "39,000-project universe ledger",
    file: "universe-ledger.json",
    critical: true,
  },
  {
    id: "scan-history",
    label: "Scan memory",
    file: "scan-history.json",
    critical: true,
  },
  {
    id: "outcome-snapshots",
    label: "Outcome labels",
    file: "outcome-snapshots.json",
    critical: true,
  },
  {
    id: "paper-trading",
    label: "Paper-trading outcomes",
    file: "paper-trading-outcomes.json",
    critical: true,
  },
  {
    id: "alpha-contracts",
    label: "Proof-carrying thesis contracts",
    file: "alpha-contracts.json",
  },
  {
    id: "agent-performance",
    label: "Agent performance memory",
    file: "agent-performance-memory.json",
  },
  {
    id: "research-memory",
    label: "Internet research memory",
    file: "internet-research-memory.json",
  },
  {
    id: "source-router",
    label: "Adaptive source router memory",
    file: "source-router-memory.json",
  },
  {
    id: "native-events",
    label: "Native confirmed launch events",
    file: "native-discovery/confirmed-events.json",
    critical: true,
  },
  {
    id: "causal-event-lake",
    label: "Causal alpha event lake",
    file: "causal-alpha-event-lake.json",
  },
];

const FREE_COVERAGE_GROUPS = [
  {
    id: "market-universe",
    label: "Free market universe",
    target: 8,
    sources: [
      "dexScreener",
      "geckoTerminal",
      "coinGecko",
      "defiLlama",
      "defiLlamaYields",
      "defiLlamaStablecoins",
      "coinPaprika",
      "coinLore",
      "coinLoreAssets",
      "coinLoreMovers",
    ],
  },
  {
    id: "exchange-routes",
    label: "Free exchange route feeds",
    target: 8,
    sources: [
      "binance",
      "kuCoin",
      "coinbase",
      "kraken",
      "okx",
      "gate",
      "mexc",
      "bitget",
      "htx",
      "bitfinex",
      "bitstamp",
      "gemini",
    ],
  },
  {
    id: "research-discovery",
    label: "Free research discovery",
    target: 5,
    sources: [
      "googleNewsDiscovery",
      "githubProjectDiscovery",
      "github",
      "githubTrending",
      "rssNews",
      "researchSeeds",
      "candidateRescue",
      "aiDiscoverySwarm",
      "npm",
    ],
  },
  {
    id: "safety-contract",
    label: "Free safety and contract checks",
    target: 4,
    sources: ["goPlus", "honeypotChecker", "rugCheck", "sourcify", "blockscout"],
  },
  {
    id: "native-launch",
    label: "Free native launch discovery",
    target: 1,
    sources: ["nativeDiscoveryMesh"],
  },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function isPresent(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/^(your_|optional_|example|changeme|replace_me)/i.test(text);
}

function hasEnv(env = process.env, key = "") {
  return isPresent(env[key]);
}

function keyStatus(item = {}, env = process.env) {
  const keys = item.oneOf || [item.env];
  const presentKeys = keys.filter((key) => hasEnv(env, key));

  return {
    label: item.label || keys.join(" or "),
    keys,
    optional: Boolean(item.optional),
    present: presentKeys.length > 0,
    presentKeys,
    missingKeys: presentKeys.length ? [] : keys,
  };
}

function groupStatus(group = {}, env = process.env) {
  const items = (group.items || []).map((item) => keyStatus(item, env));
  const requiredItems = items.filter((item) => !item.optional);
  const presentRequired = requiredItems.filter((item) => item.present).length;
  const target = Math.max(1, num(group.target || requiredItems.length));
  const score = Math.round(clamp((presentRequired / target) * 100));

  return {
    id: group.id,
    label: group.label,
    target,
    weight: num(group.weight || 1),
    score,
    status: presentRequired >= target ? "READY" : presentRequired > 0 ? "PARTIAL" : "MISSING",
    presentRequired,
    requiredItems: requiredItems.length,
    missingRequired: requiredItems.filter((item) => !item.present).map((item) => item.label),
    items,
  };
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.weight) > 0);
  const totalWeight = active.reduce((sum, item) => sum + num(item.weight), 0);
  if (!totalWeight) return 0;
  return Math.round(active.reduce((sum, item) => sum + num(item.score) * num(item.weight), 0) / totalWeight);
}

export function buildKeyReadiness(env = process.env) {
  const groups = KEY_GROUPS.map((group) => groupStatus(group, env));
  const missingCriticalKeys = groups.flatMap((group) =>
    group.items
      .filter((item) => !item.optional && !item.present)
      .map((item) => ({
        group: group.id,
        label: item.label,
        keys: item.keys,
      }))
  );

  return {
    score: weightedAverage(groups),
    groups,
    missingCriticalKeys,
    presentGroups: groups.filter((group) => group.status === "READY").length,
    partialGroups: groups.filter((group) => group.status === "PARTIAL").length,
    missingGroups: groups.filter((group) => group.status === "MISSING").length,
  };
}

export function buildSourceReadiness() {
  const sources = getAllSources({ includeDisabled: true });
  const enabled = sources.filter((source) => source.enabled);
  const categories = sources.reduce((acc, source) => {
    const category = source.category || "other";
    acc[category] = acc[category] || {
      total: 0,
      enabled: 0,
      missingKey: 0,
      sources: [],
    };
    acc[category].total += 1;
    acc[category].enabled += source.enabled ? 1 : 0;
    acc[category].missingKey += source.requiresKey && !source.hasKey ? 1 : 0;
    acc[category].sources.push({
      name: source.name,
      enabled: source.enabled,
      requiresKey: source.requiresKey,
      hasKey: source.hasKey,
      envKey: source.envKey,
      tier: source.tier,
    });
    return acc;
  }, {});
  const missingKeySources = sources
    .filter((source) => source.requiresKey && !source.hasKey)
    .map((source) => ({
      name: source.name,
      category: source.category,
      envKey: source.envKey,
      alternateEnvKeys: source.alternateEnvKeys || [],
      priority: source.priority,
      tier: source.tier,
    }));

  return {
    score: Math.round(clamp((enabled.length / Math.max(1, sources.length)) * 100)),
    totalSources: sources.length,
    enabledSources: enabled.length,
    freeEnabledSources: enabled.filter((source) => !source.requiresKey).length,
    premiumEnabledSources: enabled.filter((source) => source.requiresKey).length,
    missingKeySources,
    categories,
  };
}

export function buildFreeCoverageReadiness() {
  const sources = getAllSources({ includeDisabled: true });
  const byName = new Map(sources.map((source) => [source.name, source]));
  const groups = FREE_COVERAGE_GROUPS.map((group) => {
    const items = group.sources.map((name) => {
      const source = byName.get(name);
      const enabled = Boolean(source && source.enabled && !source.requiresKey);
      return {
        name,
        enabled,
        category: source?.category || "unknown",
        tier: source?.tier || null,
      };
    });
    const enabledCount = items.filter((item) => item.enabled).length;
    const target = Math.max(1, num(group.target || items.length));
    const score = Math.round(clamp((enabledCount / target) * 100));
    return {
      id: group.id,
      label: group.label,
      target,
      score,
      status: enabledCount >= target ? "READY" : enabledCount > 0 ? "PARTIAL" : "MISSING",
      enabledCount,
      totalSources: items.length,
      missingSources: items.filter((item) => !item.enabled).map((item) => item.name),
      sources: items,
    };
  });

  return {
    score: weightedAverage(groups.map((group) => ({ ...group, weight: 1 }))),
    status: groups.every((group) => group.status === "READY")
      ? "READY"
      : groups.some((group) => group.status === "MISSING")
        ? "PARTIAL"
        : "READY_WITH_GAPS",
    readyGroups: groups.filter((group) => group.status === "READY").length,
    partialGroups: groups.filter((group) => group.status === "PARTIAL").length,
    missingGroups: groups.filter((group) => group.status === "MISSING").length,
    groups,
  };
}

function chainRpcKeys(protocol = {}) {
  return CHAIN_RPC_ENVS[protocol.chain] || CHAIN_RPC_ENVS["multi-evm"] || [];
}

function nativeProtocolStatus(protocol = {}, env = process.env) {
  const protocolKeys = [protocol.factoryEnv, protocol.programEnv, protocol.eventTopic0Env].filter(Boolean);
  const rpcKeys = [
    ...new Set([
      ...(protocol.rpcCandidates || []),
      ...(protocol.rpcEnv ? [protocol.rpcEnv] : []),
      ...chainRpcKeys(protocol),
    ]),
  ];
  const identifierReady =
    protocol.family === "evm-factory"
      ? Boolean(protocol.factoryAddress && protocol.eventTopic0)
      : protocol.family === "solana-program"
      ? Boolean(protocol.programId)
      : protocol.family === "evm-deployment";
  const rpcPresent = Boolean(protocol.rpcUrl) || rpcKeys.some((key) => hasEnv(env, key));
  const liveReady = Boolean(protocol.configured);
  const coverageWeight = liveReady ? (protocol.rpcSource === "env" ? 1 : protocol.usesPublicRpcFallback ? 0.65 : 0.75) : 0;
  const status = liveReady
    ? protocol.usesPublicRpcFallback
      ? "LIVE_READY_PUBLIC_RPC"
      : "LIVE_READY"
    : identifierReady
    ? "MISSING_RPC"
    : rpcPresent
    ? "MISSING_PROTOCOL_ID"
    : "UNCONFIGURED";

  return {
    id: protocol.id,
    chain: protocol.chain,
    family: protocol.family,
    protocol: protocol.protocol,
    priority: protocol.priority,
    status,
    liveReady,
    coverageWeight,
    configuredForDecoding: identifierReady,
    rpcSource: protocol.rpcSource,
    rpcEnvUsed: protocol.rpcEnvUsed,
    usesPublicRpcFallback: Boolean(protocol.usesPublicRpcFallback),
    usesStaticProtocolDefaults: Boolean(protocol.usesStaticProtocolDefaults),
    protocolKeys,
    rpcKeys,
    missingProtocolKeys: identifierReady ? [] : protocolKeys,
    missingRpcKeys: rpcPresent ? [] : rpcKeys,
  };
}

export function buildNativeReadiness(env = process.env) {
  const protocols = getNativeProtocolConfigs({ env }).map((protocol) => nativeProtocolStatus(protocol, env));
  const liveReady = protocols.filter((protocol) => protocol.liveReady);
  const publicRpcReady = liveReady.filter((protocol) => protocol.usesPublicRpcFallback);
  const envRpcReady = liveReady.filter((protocol) => protocol.rpcSource === "env");
  const decodingReady = protocols.filter((protocol) => protocol.configuredForDecoding);
  const effectiveLiveReadyProtocols = protocols.reduce((sum, protocol) => sum + num(protocol.coverageWeight), 0);
  const byChain = protocols.reduce((acc, protocol) => {
    acc[protocol.chain] = acc[protocol.chain] || {
      total: 0,
      liveReady: 0,
      liveReadyPublicRpc: 0,
      liveReadyEnvRpc: 0,
      configuredForDecoding: 0,
      protocols: [],
    };
    acc[protocol.chain].total += 1;
    acc[protocol.chain].liveReady += protocol.liveReady ? 1 : 0;
    acc[protocol.chain].liveReadyPublicRpc += protocol.liveReady && protocol.usesPublicRpcFallback ? 1 : 0;
    acc[protocol.chain].liveReadyEnvRpc += protocol.liveReady && protocol.rpcSource === "env" ? 1 : 0;
    acc[protocol.chain].configuredForDecoding += protocol.configuredForDecoding ? 1 : 0;
    acc[protocol.chain].protocols.push(protocol.id);
    return acc;
  }, {});

  return {
    score: Math.round(clamp((effectiveLiveReadyProtocols / Math.max(1, protocols.length)) * 100)),
    totalProtocols: protocols.length,
    liveReadyProtocols: liveReady.length,
    effectiveLiveReadyProtocols: Number(effectiveLiveReadyProtocols.toFixed(2)),
    liveReadyEnvRpcProtocols: envRpcReady.length,
    liveReadyPublicRpcProtocols: publicRpcReady.length,
    decodingReadyProtocols: decodingReady.length,
    unconfiguredProtocols: protocols.length - decodingReady.length,
    byChain,
    requiredEnvironmentVariables: [
      ...new Set(protocols.flatMap((protocol) => [...protocol.protocolKeys, ...protocol.rpcKeys])),
    ],
    protocols,
  };
}

function readJson(filePath = "") {
  if (!fs.existsSync(filePath)) return null;
  const largeJson = memoryFileSizeBytes(filePath) > memoryRewriteLimitBytes(process.env);
  if (largeJson && !boolEnv(process.env.OP_READINESS_ALLOW_LARGE_JSON_READ, false)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function countJsonItems(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  if (value.projects && typeof value.projects === "object") return Object.keys(value.projects).length;
  if (Array.isArray(value.records)) return value.records.length;
  if (Array.isArray(value.runs)) return value.runs.length;
  if (Array.isArray(value.alerts)) return value.alerts.length;
  if (Array.isArray(value.outcomes)) return value.outcomes.length;
  if (Array.isArray(value.contracts)) return value.contracts.length;
  if (Array.isArray(value.rawEvents)) return value.rawEvents.length;
  if (Array.isArray(value.confirmedEvents)) return value.confirmedEvents.length;
  return Object.keys(value).length;
}

function sidecarRecordEstimate(filePath = "") {
  const sidecarPath = memorySidecarPath(filePath);
  if (!fs.existsSync(sidecarPath)) return 0;
  try {
    return readMemorySidecarTail(filePath, {
      limit: 10000,
      maxBytes: Number(process.env.OP_READINESS_SIDECAR_READ_BYTES || 8 * 1024 * 1024),
    }).length;
  } catch {
    return 0;
  }
}

function datasetStatus(spec = {}, dataDir = DATA_DIR) {
  const filePath = path.join(dataDir, spec.file);
  const exists = fs.existsSync(filePath);
  const bytes = exists ? fs.statSync(filePath).size : 0;
  const sidecarPath = memorySidecarPath(filePath);
  const sidecarBytes = memoryFileSizeBytes(sidecarPath);
  const largeJsonSkipped =
    exists &&
    bytes > memoryRewriteLimitBytes(process.env) &&
    !boolEnv(process.env.OP_READINESS_ALLOW_LARGE_JSON_READ, false);
  const parsed = readJson(filePath);
  const sidecarRecords = parsed ? 0 : sidecarRecordEstimate(filePath);
  const records = parsed ? countJsonItems(parsed) : sidecarRecords;
  const active = records > 0 || (largeJsonSkipped && bytes > 0);

  return {
    id: spec.id,
    label: spec.label,
    critical: Boolean(spec.critical),
    file: filePath,
    sidecarFile: sidecarBytes > 0 ? sidecarPath : null,
    exists,
    largeJsonSkipped,
    records,
    recordEstimate: parsed ? false : sidecarRecords > 0,
    bytes,
    sidecarBytes,
    status: !exists ? "MISSING" : active ? "ACTIVE" : "EMPTY",
  };
}

export function buildDatasetReadiness(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const datasets = DATASET_SPECS.map((spec) => datasetStatus(spec, dataDir));
  const active = datasets.filter((dataset) => dataset.status === "ACTIVE");
  const critical = datasets.filter((dataset) => dataset.critical);
  const criticalActive = critical.filter((dataset) => dataset.status === "ACTIVE");

  return {
    score: Math.round(clamp((active.length / Math.max(1, datasets.length)) * 100)),
    criticalScore: Math.round(clamp((criticalActive.length / Math.max(1, critical.length)) * 100)),
    activeDatasets: active.length,
    totalDatasets: datasets.length,
    missingCriticalDatasets: critical.filter((dataset) => dataset.status !== "ACTIVE"),
    datasets,
  };
}

export function buildSupabaseReadiness(env = process.env) {
  const config = summarizeSupabaseConfig(env);
  const status = !config.enabled
    ? "DISABLED"
    : config.configured && config.serverWriteCapable
      ? "READY"
      : "INCOMPLETE";

  return {
    score: status === "READY" ? 100 : status === "INCOMPLETE" ? 20 : 0,
    status,
    enabled: config.enabled,
    configured: config.configured,
    hasUrl: config.hasUrl,
    hasKey: config.hasKey,
    keyType: config.keyType,
    serverWriteCapable: config.serverWriteCapable,
    hasJwksUrl: config.hasJwksUrl,
    required: config.required,
    syncReports: config.syncReports,
    projectLimit: config.projectLimit,
    tables: config.tables,
    missing: status === "READY"
      ? []
      : [
          !config.hasUrl ? "SUPABASE_URL" : "",
          !config.hasKey ? "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY" : "",
          config.hasKey && !config.serverWriteCapable ? "server write key, not publishable/anon key" : "",
        ].filter(Boolean),
  };
}

function workflowEnvReadiness(repoRoot = path.resolve(".")) {
  const workflowFiles = [
    path.join(repoRoot, ".github/workflows/pages-dashboard.yml"),
    path.join(repoRoot, ".github/workflows/manual.yml"),
  ];
  const requiredKeys = [
    "OPENAI_API_KEY",
    "BIRDEYE_API_KEY",
    "X_BEARER_TOKEN",
    "CRYPTOPANIC_API_KEY",
    "GITHUB_TOKEN",
    "BASESCAN_API_KEY",
    "SOLSCAN_API_KEY",
    "EVM_DEPLOYMENT_RADAR_RPC_URL",
  ];
  const files = workflowFiles.map((file) => {
    const exists = fs.existsSync(file);
    const text = exists ? fs.readFileSync(file, "utf8") : "";
    const presentKeys = requiredKeys.filter((key) => text.includes(key));
    return {
      file,
      exists,
      presentKeys,
      missingKeys: requiredKeys.filter((key) => !presentKeys.includes(key)),
      score: Math.round(clamp((presentKeys.length / requiredKeys.length) * 100)),
    };
  });

  return {
    score: Math.round(files.reduce((sum, file) => sum + file.score, 0) / Math.max(1, files.length)),
    files,
  };
}

function opStatus(score = 0) {
  if (score >= 85) return "OP_READY";
  if (score >= 65) return "ALPHA_READY";
  if (score >= 45) return "DEGRADED_BUT_USABLE";
  return "SETUP_REQUIRED";
}

function nextActions(report = {}) {
  const actions = [];

  if (report.keys.missingCriticalKeys.length) {
    actions.push({
      priority: "critical",
      action: "Add missing API keys as local .env values and GitHub Secrets.",
      missing: report.keys.missingCriticalKeys.slice(0, 12),
    });
  }
  if (report.freeCoverage.score < 80) {
    actions.push({
      priority: "high",
      action: "Restore free public-source coverage before relying on premium feeds.",
      missing: report.freeCoverage.groups
        .filter((group) => group.status !== "READY")
        .flatMap((group) => group.missingSources.map((source) => `${group.id}:${source}`))
        .slice(0, 16),
    });
  }
  if (report.native.liveReadyProtocols === 0) {
    actions.push({
      priority: "critical",
      action: "Configure at least one native launch lane with protocol IDs plus RPC/WebSocket access.",
      missing: report.native.requiredEnvironmentVariables.slice(0, 16),
    });
  }
  if (report.datasets.criticalScore < 100) {
    actions.push({
      priority: "high",
      action: "Run scans long enough to populate outcome, ledger, native-event, and paper-trading memory.",
      missing: report.datasets.missingCriticalDatasets.map((dataset) => dataset.id),
    });
  }
  if (report.sources.categories.wallet?.enabled === 0) {
    actions.push({
      priority: "high",
      action: "Add at least one wallet intelligence source so smart-money and deployer labels stop relying on weak proxies.",
      missing: ["ARKHAM_API_KEY", "NANSEN_API_KEY", "DEBANK_API_KEY"],
    });
  }
  if (report.automation.score < 100) {
    actions.push({
      priority: "medium",
      action: "Keep GitHub Actions env wiring aligned with OP Mode keys so cloud scans match local scans.",
      missing: report.automation.files.flatMap((file) => file.missingKeys).slice(0, 12),
    });
  }
  if (report.supabase.enabled && report.supabase.status !== "READY") {
    actions.push({
      priority: "medium",
      action: "Finish Supabase sync setup or disable SUPABASE_ENABLED until credentials are available.",
      missing: report.supabase.missing,
    });
  }

  return actions;
}

export function buildOpModeReadiness(options = {}) {
  const env = options.env || process.env;
  const keys = buildKeyReadiness(env);
  const sources = buildSourceReadiness();
  const freeCoverage = buildFreeCoverageReadiness();
  const native = buildNativeReadiness(env);
  const datasets = buildDatasetReadiness(options);
  const supabase = buildSupabaseReadiness(env);
  const automation = workflowEnvReadiness(options.repoRoot || path.resolve("."));
  const score = Math.round(
    keys.score * 0.25 +
      sources.score * 0.1 +
      freeCoverage.score * 0.15 +
      native.score * 0.22 +
      Math.max(datasets.score, datasets.criticalScore) * 0.2 +
      automation.score * 0.08
  );
  const report = {
    generatedAt: new Date().toISOString(),
    name: "OP Mode Readiness Report",
    description:
      "A setup and evidence audit for turning Crypto Launch Intelligence into an institutional-grade scanner. It reports missing keys, source gaps, native-launch coverage, memory datasets, workflow wiring, and next actions without exposing secret values.",
    score,
    status: opStatus(score),
    keys,
    sources,
    freeCoverage,
    native,
    datasets,
    supabase,
    automation,
  };

  return {
    ...report,
    nextActions: nextActions(report),
  };
}

export function writeOpModeReadinessReport(options = {}) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = buildOpModeReadiness(options);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return {
    filePath: REPORT_FILE,
    report,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { filePath, report } = writeOpModeReadinessReport();
  console.log(
    JSON.stringify(
      {
        filePath,
        status: report.status,
        score: report.score,
        missingKeyGroups: report.keys.groups
          .filter((group) => group.status !== "READY")
          .map((group) => ({ id: group.id, status: group.status, missing: group.missingRequired })),
        liveReadyNativeProtocols: report.native.liveReadyProtocols,
        freeCoverage: {
          status: report.freeCoverage.status,
          score: report.freeCoverage.score,
          readyGroups: report.freeCoverage.readyGroups,
          partialGroups: report.freeCoverage.partialGroups,
          missingGroups: report.freeCoverage.missingGroups,
        },
        missingCriticalDatasets: report.datasets.missingCriticalDatasets.map((dataset) => dataset.id),
        nextActions: report.nextActions,
      },
      null,
      2
    )
  );
}
