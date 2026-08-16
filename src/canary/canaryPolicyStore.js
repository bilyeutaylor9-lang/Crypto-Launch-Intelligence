
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "ignition-executable-edge-canary-policy.json");
export const CANARY_POLICY_VERSION = "V14_EXECUTABLE_EDGE_CANARY_V1";

export const DEFAULT_CANARY_POLICY = Object.freeze({
  version: CANARY_POLICY_VERSION,
  experimentName: "BASE_ONLY_EXECUTABLE_EDGE_PAPER_CANARY_V1",
  mode: "PAPER_ONLY",
  allowedChains: ["base"],
  signalState: "COMMITTED_LOADED_VACUUM_SHADOW",
  primaryNotionalUsd: 1000,
  quoteNotionalsUsd: [250, 500, 1000, 2500, 5000],
  maxQuoteAgeMs: 5000,
  minLiquidityUsd: 250000,
  maxEntryImpactBps: 250,
  maxAllInEntryCostBps: 500,
  maxRoundTripCostBps: 800,
  replayDelaysSeconds: [5, 15, 30, 60, 300, 900],
  primaryExitPolicy: {
    takeProfitPct: 25,
    stopLossPct: -15,
    maxHoldingHours: 168,
  },
  diagnosticExitPolicies: [
    { name: "TP50_SL20_168H", takeProfitPct: 50, stopLossPct: -20, maxHoldingHours: 168 },
    { name: "TIME_24H", takeProfitPct: null, stopLossPct: null, maxHoldingHours: 24 },
    { name: "TIME_72H", takeProfitPct: null, stopLossPct: null, maxHoldingHours: 72 },
  ],
  minPaperExecutionsForReview: 50,
  minResolvedPaperExecutionsForReview: 30,
  minUniqueProjectsForReview: 20,
  minResolvedMatchedControlPairsForReview: 20,
  minExecutableQuoteCoveragePct: 80,
  maxDataIntegrityFailurePct: 2,
  maxMedianEntryQuoteLatencyMs: 3000,
  maxMedianExecutionCostBps: 500,
  minMedianPaperNetReturnPct: 0,
  maxPaperFalseIgnitionPct: 45,
  automaticLiveTrading: false,
  realMoneyAllowed: false,
  leverageAllowed: false,
});

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positive(value, fallback) {
  const n = finite(value);
  return n !== null && n > 0 ? n : fallback;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
export function canonicalPolicyJson(policy = {}) {
  return JSON.stringify(stable(policy));
}
export function hashCanaryPolicy(policy = {}) {
  return crypto.createHash("sha256").update(canonicalPolicyJson(policy)).digest("hex");
}

export function normalizeCanaryPolicy(input = {}) {
  const merged = {
    ...DEFAULT_CANARY_POLICY,
    ...input,
    primaryExitPolicy: { ...DEFAULT_CANARY_POLICY.primaryExitPolicy, ...(input.primaryExitPolicy || {}) },
    diagnosticExitPolicies: Array.isArray(input.diagnosticExitPolicies)
      ? input.diagnosticExitPolicies
      : DEFAULT_CANARY_POLICY.diagnosticExitPolicies,
  };
  const quoteNotionalsUsd = [...new Set((merged.quoteNotionalsUsd || [])
    .map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b);
  if (!quoteNotionalsUsd.length) quoteNotionalsUsd.push(...DEFAULT_CANARY_POLICY.quoteNotionalsUsd);
  const primaryNotionalUsd = positive(merged.primaryNotionalUsd, DEFAULT_CANARY_POLICY.primaryNotionalUsd);
  if (!quoteNotionalsUsd.includes(primaryNotionalUsd)) quoteNotionalsUsd.push(primaryNotionalUsd);
  quoteNotionalsUsd.sort((a, b) => a - b);

  return {
    ...merged,
    version: CANARY_POLICY_VERSION,
    mode: "PAPER_ONLY",
    allowedChains: [...new Set((merged.allowedChains || ["base"]).map((v) => String(v).toLowerCase()))],
    quoteNotionalsUsd,
    primaryNotionalUsd,
    replayDelaysSeconds: [...new Set((merged.replayDelaysSeconds || [])
      .map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b),
    maxQuoteAgeMs: positive(merged.maxQuoteAgeMs, DEFAULT_CANARY_POLICY.maxQuoteAgeMs),
    minLiquidityUsd: positive(merged.minLiquidityUsd, DEFAULT_CANARY_POLICY.minLiquidityUsd),
    maxEntryImpactBps: positive(merged.maxEntryImpactBps, DEFAULT_CANARY_POLICY.maxEntryImpactBps),
    maxAllInEntryCostBps: positive(merged.maxAllInEntryCostBps, DEFAULT_CANARY_POLICY.maxAllInEntryCostBps),
    maxRoundTripCostBps: positive(merged.maxRoundTripCostBps, DEFAULT_CANARY_POLICY.maxRoundTripCostBps),
    automaticLiveTrading: false,
    realMoneyAllowed: false,
    leverageAllowed: false,
  };
}

export function buildCanaryPolicyEnvelope(policy = {}, governance = {}, options = {}) {
  const normalized = normalizeCanaryPolicy(policy);
  const governanceState = String(governance?.state || "UNKNOWN");
  const eligible = governanceState === "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW";
  if (!eligible && !options.allowWithoutEligibility) {
    return {
      state: "CANARY_NOT_ELIGIBLE",
      governanceState,
      blockers: ["V13_EVIDENCE_GOVERNOR_NOT_ELIGIBLE"],
      policy: normalized,
      specificationHash: hashCanaryPolicy(normalized),
      frozen: false,
      paperOnly: true,
    };
  }
  return {
    state: "CANARY_POLICY_FROZEN",
    governanceState,
    blockers: [],
    policy: normalized,
    specificationHash: hashCanaryPolicy(normalized),
    frozenAt: options.frozenAt || new Date().toISOString(),
    frozen: true,
    paperOnly: true,
    automaticLiveTrading: false,
  };
}

export function loadCanaryPolicy(options = {}) {
  const file = options.file || FILE;
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function armCanaryPolicy(policy = {}, governance = {}, options = {}) {
  const file = options.file || FILE;
  const existing = loadCanaryPolicy({ file });
  const next = buildCanaryPolicyEnvelope(policy, governance, options);
  if (existing) {
    if (existing.specificationHash !== next.specificationHash) {
      return {
        state: "CANARY_POLICY_IMMUTABLE_CONFLICT",
        file,
        existingHash: existing.specificationHash,
        requestedHash: next.specificationHash,
        existing,
        paperOnly: true,
      };
    }
    return { ...existing, state: existing.state || "CANARY_POLICY_FROZEN", file, alreadyExists: true };
  }
  if (!next.frozen) return { ...next, file };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
  return { ...next, file, alreadyExists: false };
}

export const CANARY_POLICY_FILE = FILE;
export const __canaryPolicyHooks = { finite, stable };
