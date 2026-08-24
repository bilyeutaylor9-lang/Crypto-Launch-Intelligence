import fs from "node:fs";
import path from "node:path";

import { timestamp } from "./productionMath.js";

const REQUIRED_FAMILIES = Object.freeze([
  {
    id: "EXACT_FORWARD_MARKET_OUTCOMES",
    requiredForProduction: true,
    codeFiles: [
      "src/data/dexScreenerConnector.js",
      "src/data/geckoTerminalConnector.js",
      "src/learning/outcomeProbe.js",
      "src/production/exactMarketObservationLedger.js",
    ],
    configurationAny: [],
    purpose: "Exact chain/token/pool forward outcome capture without symbol fallback.",
  },
  {
    id: "POINT_IN_TIME_MARKET_CONTEXT",
    requiredForProduction: true,
    codeFiles: [
      "src/data/coinGeckoConnector.js",
      "src/data/expandedMarketDataConnector.js",
      "src/sensors/hyperliquidLeverageSensor.js",
      "src/production/marketContextSnapshotProvider.js",
      "src/production/marketContextObservationLedger.js",
    ],
    configurationAny: [],
    purpose: "BTC/ETH, stablecoin, derivatives, breadth, volume and liquidity context with provenance.",
  },
  {
    id: "NATIVE_EVM_EVENTS_AND_WALLET_FLOW",
    requiredForProduction: true,
    codeFiles: [
      "src/data/native/evm/evmFactoryEventConnector.js",
      "src/sensors/uniswapV3EventTapeSensor.js",
      "src/sensors/chainWideCapitalRadarSensor.js",
      "src/sensors/erc20HolderCohortSensor.js",
    ],
    configurationAny: ["BASE_RPC_URL"],
    purpose: "Point-in-time pool, swap, holder and entity-flow observations on the primary live chain.",
  },
  {
    id: "SECURITY_AND_ADVERSARIAL_EVIDENCE",
    requiredForProduction: true,
    codeFiles: [
      "src/data/security/goplusSecurityConnector.js",
      "src/data/security/sourcifyV2Connector.js",
      "src/data/security/blockscoutConnector.js",
      "src/data/security/solanaSecurityConnector.js",
      "src/production/adversarialMarketIntelligence.js",
    ],
    configurationAny: [],
    purpose: "Contract, authority, sybil, funding and manipulation evidence.",
  },
  {
    id: "EXECUTION_AND_LIQUIDITY_TRUTH",
    requiredForProduction: true,
    codeFiles: [
      "src/execution/routeTruthV2.js",
      "src/execution/routeResolver.js",
      "src/engines/executionProofEngine.js",
      "src/production/executionAwareExpectedValue.js",
    ],
    configurationAny: [],
    purpose: "Exact route, depth, slippage and captureable expected-value evidence.",
  },
  {
    id: "DURABLE_FORWARD_EVIDENCE",
    requiredForProduction: true,
    codeFiles: [
      "src/production/exactMarketObservationLedger.js",
      "src/production/marketContextObservationLedger.js",
      "src/production/prospectiveEdgeCohortLedger.js",
      "src/db/storageAdapter.js",
    ],
    configurationAny: ["SUPABASE_URL"],
    configurationAlso: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
    purpose: "Append-only local evidence plus production remote persistence.",
  },
]);

const CONDITIONAL_FAMILIES = Object.freeze([
  {
    id: "NATIVE_SOLANA_PROGRAM_EVENTS",
    codeFiles: [
      "src/data/native/solana/solanaProgramEventConnector.js",
      "src/data/native/solana/pumpFunListener.js",
      "src/data/native/solana/raydiumLaunchLabListener.js",
      "src/data/native/solana/meteoraDbcListener.js",
    ],
    configurationAny: ["SOLANA_RPC_URL", "HELIUS_RPC_URL"],
    configurationAlso: [
      "SOLANA_PUMP_FUN_PROGRAM",
      "SOLANA_RAYDIUM_LAUNCHLAB_PROGRAM",
      "SOLANA_RAYDIUM_CPMM_PROGRAM",
      "SOLANA_RAYDIUM_CLMM_PROGRAM",
      "SOLANA_METEORA_DBC_PROGRAM",
      "SOLANA_METEORA_DLMM_PROGRAM",
    ],
    purpose: "Exact Solana launch and pool program evidence when Solana collection is enabled.",
  },
]);

const OPTIONAL_GAPS = Object.freeze([
  {
    id: "AGGREGATE_BRIDGE_NET_FLOW",
    downstreamField: "bridgeNetFlowUsd",
    state: "OPTIONAL_SOURCE_NOT_VERIFIED",
    reason: "No provider-neutral aggregate bridge-flow feed is treated as verified. The field remains null unless point-in-time evidence is supplied.",
  },
  {
    id: "AGGREGATE_LIQUIDATION_NOTIONAL",
    downstreamField: "liquidationUsd",
    state: "OPTIONAL_SOURCE_NOT_VERIFIED",
    reason: "Public account-agnostic derivatives context cannot prove aggregate liquidation notional, so the field remains null.",
  },
  {
    id: "ECOSYSTEM_GRANTS",
    downstreamField: "fundingEvidence",
    state: "OPTIONAL_DISCOVERY_SOURCE_PLANNED",
    reason: "Grant announcements are optional discovery evidence and are not required for exact forward edge validation.",
  },
]);

const DECLARED_ONLY_REGISTRY_SOURCES = Object.freeze([
  "coinMarketCap", "dexTools", "messari", "mobula", "solscan", "npm", "reddit",
  "googleTrends", "telegram", "discord", "honeypotChecker", "tokenSniffer", "debank",
  "zerion", "arkham", "nansen",
]);

function present(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/^(your_|optional_|example|changeme|replace_me)/i.test(text);
}

function configurationState(family = {}, env = {}) {
  const any = family.configurationAny || [];
  const also = family.configurationAlso || [];
  const anyConfigured = !any.length || any.some((key) => present(env[key]));
  const alsoConfigured = !also.length || also.some((key) => present(env[key]));
  return {
    configured: anyConfigured && alsoConfigured,
    acceptedKeys: [...any, ...also],
    missingConfigurationGroups: [
      ...(!anyConfigured ? [{ anyOf: any }] : []),
      ...(!alsoConfigured ? [{ anyOf: also }] : []),
    ],
  };
}

function codeState(family = {}, root = ".") {
  const missingCodeFiles = (family.codeFiles || []).filter((file) => !fs.existsSync(path.resolve(root, file)));
  return {
    codeComplete: missingCodeFiles.length === 0,
    missingCodeFiles,
  };
}

function enabledChains(env = {}) {
  const configured = String(env.NATIVE_DISCOVERY_CHAINS || "base")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : ["base"]);
}

function latestHealthyContext(options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const maximumAgeMs = Math.max(1, Number(options.maximumLiveAgeHours || 2)) * 60 * 60 * 1000;
  const context = options.latestMarketContext || null;
  const observedMs = timestamp(context?.observedAt);
  if (
    !context ||
    observedMs === null ||
    nowMs === null ||
    observedMs > nowMs ||
    nowMs - observedMs > maximumAgeMs
  ) return false;
  return Object.values(context.providerHealth || {}).filter((row) => row?.status === "OBSERVED").length >= 2;
}

export function auditDataSourceReadiness(options = {}) {
  const root = options.root || ".";
  const env = options.env || process.env;
  const now = options.now || new Date().toISOString();
  const chains = enabledChains(env);
  const marketContextLive = latestHealthyContext({ ...options, now });
  const familyLiveHealth = options.familyLiveHealth || {};
  const required = REQUIRED_FAMILIES.map((family) => {
    const code = codeState(family, root);
    const configuration = configurationState(family, env);
    const liveHealthVerified = family.id === "POINT_IN_TIME_MARKET_CONTEXT"
      ? marketContextLive
      : familyLiveHealth[family.id] === "HEALTHY";
    return {
      ...family,
      ...code,
      ...configuration,
      liveHealthVerified,
      state: !code.codeComplete
        ? "MISSING_IMPLEMENTATION"
        : !configuration.configured
          ? "MISSING_LIVE_CONFIGURATION"
          : liveHealthVerified
            ? "LIVE_HEALTH_VERIFIED"
            : "LIVE_HEALTH_NOT_VERIFIED",
    };
  });
  const conditional = CONDITIONAL_FAMILIES.map((family) => {
    const enabled = family.id !== "NATIVE_SOLANA_PROGRAM_EVENTS" || chains.has("solana");
    const code = codeState(family, root);
    const configuration = configurationState(family, env);
    const liveHealthVerified = familyLiveHealth[family.id] === "HEALTHY";
    return {
      ...family,
      enabled,
      requiredForProduction: enabled,
      ...code,
      ...configuration,
      liveHealthVerified,
      state: !enabled
        ? "NOT_ENABLED"
        : !code.codeComplete
          ? "MISSING_IMPLEMENTATION"
          : !configuration.configured
            ? "MISSING_LIVE_CONFIGURATION"
            : liveHealthVerified
              ? "LIVE_HEALTH_VERIFIED"
              : "LIVE_HEALTH_NOT_VERIFIED",
    };
  });
  const requiredEnabled = [...required, ...conditional.filter((family) => family.requiredForProduction)];
  const missingCode = requiredEnabled.filter((family) => !family.codeComplete);
  const missingConfiguration = requiredEnabled.filter((family) => !family.configured);
  const unhealthy = requiredEnabled.filter((family) => !family.liveHealthVerified);
  const criticalCodeComplete = missingCode.length === 0;
  const configurationComplete = missingConfiguration.length === 0;
  const liveReady = criticalCodeComplete && configurationComplete && unhealthy.length === 0;

  return {
    schemaVersion: 1,
    generatedAt: now,
    state: liveReady
      ? "DATA_SOURCES_LIVE"
      : !criticalCodeComplete
        ? "MISSING_CRITICAL_SOURCE_IMPLEMENTATION"
        : !configurationComplete
          ? "CODE_COMPLETE_LIVE_CONFIGURATION_REQUIRED"
          : "CODE_COMPLETE_LIVE_HEALTH_UNVERIFIED",
    criticalCodeComplete,
    configurationComplete,
    liveReady,
    requiredFamilies: required,
    conditionalFamilies: conditional,
    optionalGaps: OPTIONAL_GAPS,
    declaredOnlyRegistrySources: DECLARED_ONLY_REGISTRY_SOURCES.map((source) => ({
      source,
      state: "DECLARED_ONLY_NO_EXECUTOR",
      productionEnabled: false,
    })),
    blockers: [
      ...missingCode.map((family) => `${family.id}:MISSING_IMPLEMENTATION`),
      ...missingConfiguration.map((family) => `${family.id}:MISSING_CONFIGURATION`),
      ...unhealthy.map((family) => `${family.id}:LIVE_HEALTH_NOT_VERIFIED`),
    ],
    policy: {
      pointInTimeOnly: true,
      exactForwardIdentityRequired: true,
      symbolFallbackAllowed: false,
      missingInputsRemainNull: true,
      fabricatedProviderHealthAllowed: false,
      automaticTrading: false,
    },
  };
}

export const DATA_SOURCE_REQUIRED_FAMILIES = REQUIRED_FAMILIES;
export const DATA_SOURCE_OPTIONAL_GAPS = OPTIONAL_GAPS;
export const DATA_SOURCE_DECLARED_ONLY_REGISTRY_SOURCES = DECLARED_ONLY_REGISTRY_SOURCES;
