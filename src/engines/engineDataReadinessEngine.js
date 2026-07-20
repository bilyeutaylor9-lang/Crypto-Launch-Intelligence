import { getEngineContracts } from "../kernel/engineContractManifest.js";
import { canonicalValue, resolveCanonicalAliases } from "../data/canonicalAliasResolver.js";
import { canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { fieldApplicability } from "./dataStarvationRootCauseEngine.js";

let cachedEngineContracts = null;
const contractFieldCache = new WeakMap();

function engineContracts(options = {}) {
  if (options.contracts) return options.contracts;
  if (!cachedEngineContracts) cachedEngineContracts = getEngineContracts();
  return cachedEngineContracts;
}

function hasOwn(project = {}, field = "") {
  return Object.prototype.hasOwnProperty.call(project, field);
}

function getPath(project = {}, path = "") {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), project);
}

function hasValue(project = {}, field = "") {
  const value = field.includes(".") ? getPath(project, field) : project[field];
  if (!field.includes(".") && !hasOwn(project, field)) return false;
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

const SOURCE_HINTS_BY_FIELD = {
  address: ["DexScreener", "GeckoTerminal", "GoPlus", "Sourcify", "Blockscout", "native RPC", "official docs"],
  tokenAddress: ["DexScreener", "GeckoTerminal", "GoPlus", "Sourcify", "Blockscout", "native RPC", "official docs"],
  contractAddress: ["DexScreener", "GeckoTerminal", "GoPlus", "Sourcify", "Blockscout", "native RPC", "official docs"],
  pairAddress: ["DexScreener", "GeckoTerminal", "native RPC pool listeners", "official docs"],
  poolAddress: ["DexScreener", "GeckoTerminal", "native RPC pool listeners", "official docs"],
  liquidityUsd: ["DexScreener", "GeckoTerminal", "native RPC pool listeners"],
  dexLiquidityUsd: ["DexScreener", "GeckoTerminal", "native RPC pool listeners"],
  stableExitLiquidityUsd: ["DexScreener", "GeckoTerminal", "execution proof"],
  volume24h: ["DexScreener", "GeckoTerminal", "CoinGecko", "CoinPaprika", "CoinLore", "CEX public tickers"],
  priceUsd: ["CoinGecko", "CoinPaprika", "CoinLore", "DexScreener", "GeckoTerminal", "CEX public tickers"],
  marketCap: ["CoinGecko", "CoinPaprika", "CoinLore", "CryptoCompare when allowed"],
  fdv: ["CoinGecko", "DexScreener", "GeckoTerminal"],
  circulatingMarketCapUsd: ["CoinGecko", "CoinPaprika", "CoinLore"],
  holders: ["GoPlus", "Blockscout", "chain explorers", "native RPC"],
  buyers24h: ["DexScreener", "GeckoTerminal trades", "native RPC"],
  buyTransactions24h: ["DexScreener", "GeckoTerminal trades", "native RPC"],
  wallets: ["native RPC", "block explorers", "wallet cluster store"],
  smartWalletScore: ["wallet memory", "native RPC", "block explorers"],
  source: ["provider payload", "discovery source registry"],
  discoverySources: ["discovery source registry", "source truth"],
  evidence: ["source truth", "institutional provenance", "provider payloads"],
  githubRepo: ["GitHub Project Discovery", "official docs", "project README"],
  repository: ["GitHub Project Discovery", "official docs", "project README"],
  roadmap: ["official docs", "project website", "Google News Discovery", "GitHub README"],
  description: ["provider payload", "official docs", "Google News Discovery"],
  websiteText: ["free web crawler", "official website", "docs crawler"],
  liveCatalystEvents: ["Google News Discovery", "roadmap crawler", "official announcements"],
  securityEvidence: ["GoPlus", "Sourcify", "Blockscout", "RugCheck for Solana"],
  securityEvidenceSummary: ["GoPlus", "Sourcify", "Blockscout", "RugCheck for Solana"],
  purchaseRouteConfirmed: ["Canonical Execution Route", "Execution Proof"],
  executionProofVerified: ["Canonical Execution Route", "Execution Proof"],
};

const DEFAULT_SOURCE_HINTS = ["DexScreener", "GeckoTerminal", "CoinGecko", "CoinPaprika", "CoinLore", "Google News", "GitHub"];

function sourceHintsForField(field = "") {
  return SOURCE_HINTS_BY_FIELD[field] || DEFAULT_SOURCE_HINTS;
}

function canonicalFieldsForContracts(contracts = []) {
  if (contractFieldCache.has(contracts)) return contractFieldCache.get(contracts);

  const fields = new Set();
  for (const contract of contracts) {
    for (const group of contract.inputContract?.requiredAny || []) {
      for (const field of Array.isArray(group) ? group : [group].filter(Boolean)) {
        fields.add(canonicalFieldForAlias(field) || field);
      }
    }
    for (const field of contract.inputContract?.optional || []) {
      fields.add(canonicalFieldForAlias(field) || field);
    }
  }

  const canonicalFields = [...fields];
  contractFieldCache.set(contracts, canonicalFields);
  return canonicalFields;
}

function evaluateRequiredGroup(project = {}, group = [], contract = {}, lookupCanonicalValue = canonicalValue) {
  const fields = Array.isArray(group) ? group : [group].filter(Boolean);
  const canonicalFields = [...new Set(fields.map((field) => canonicalFieldForAlias(field) || field))];
  const applicability = canonicalFields.map((field) => ({
    field,
    ...fieldApplicability(project, field, contract),
  }));
  const applicableFields = applicability.filter((item) => item.status !== "NOT_APPLICABLE").map((item) => item.field);
  const notApplicable = applicability.filter((item) => item.status === "NOT_APPLICABLE");
  const present = applicableFields.filter((field) => hasValue(project, field) || hasValue({ value: lookupCanonicalValue(project, field) }, "value"));
  const missing = applicableFields.filter((field) => !present.includes(field));

  return {
    fields,
    canonicalFields,
    satisfied: present.length > 0 || (canonicalFields.length > 0 && notApplicable.length === canonicalFields.length),
    present,
    missing,
    notApplicable,
    sourceHints: [...new Set(missing.flatMap(sourceHintsForField))],
  };
}

export function evaluateEngineDataReadiness(project = {}, contract = {}, options = {}) {
  const requiredGroups = contract.inputContract?.requiredAny || [];
  const optionalFields = contract.inputContract?.optional || [];
  const aliased = project;
  const lookupCanonicalValue = options.lookupCanonicalValue || canonicalValue;
  const groups = requiredGroups.map((group) => evaluateRequiredGroup(aliased, group, contract, lookupCanonicalValue));
  const optionalCanonicalFields = [...new Set(optionalFields.map((field) => canonicalFieldForAlias(field) || field))];
  const optionalApplicable = optionalCanonicalFields.filter((field) => fieldApplicability(aliased, field, contract).status !== "NOT_APPLICABLE");
  const optionalPresent = optionalApplicable.filter((field) => hasValue(aliased, field) || hasValue({ value: lookupCanonicalValue(aliased, field) }, "value"));
  const optionalMissing = optionalApplicable.filter((field) => !optionalPresent.includes(field));
  const requiredSatisfied = groups.filter((group) => group.satisfied).length;
  const requiredTotal = groups.length;
  const requiredCoveragePct = requiredTotal ? Math.round((requiredSatisfied / requiredTotal) * 100) : 100;
  const optionalCoveragePct = optionalFields.length
    ? Math.round((optionalPresent.length / optionalFields.length) * 100)
    : 100;
  const coveragePct = Math.round(requiredCoveragePct * 0.8 + optionalCoveragePct * 0.2);
  const missingRequiredGroups = groups.filter((group) => !group.satisfied);
  const status =
    requiredCoveragePct === 100
      ? "READY"
      : requiredCoveragePct >= 50
        ? "PARTIAL_INPUTS"
        : "DATA_STARVED";

  return {
    engineId: contract.id,
    phase: contract.phase,
    affectsFinalDecision: Boolean(contract.affectsFinalDecision),
    canBlockCandidate: Boolean(contract.canBlockCandidate),
    status,
    coveragePct,
    requiredCoveragePct,
    optionalCoveragePct,
    requiredSatisfied,
    requiredTotal,
    missingRequiredGroups: missingRequiredGroups.map((group) => ({
      fields: group.fields,
      canonicalFields: group.canonicalFields,
      sourceHints: group.sourceHints,
    })),
    notApplicableGroups: groups
      .filter((group) => group.notApplicable.length)
      .map((group) => ({
        fields: group.fields,
        canonicalFields: group.canonicalFields,
        notApplicable: group.notApplicable,
      })),
    optionalMissing,
    nextSources: [
      ...new Set([
        ...missingRequiredGroups.flatMap((group) => group.sourceHints),
        ...optionalMissing.flatMap(sourceHintsForField),
      ]),
    ].slice(0, 12),
  };
}

function summarizeReadiness(readiness = []) {
  const required = readiness.filter((item) => item.affectsFinalDecision || item.canBlockCandidate);
  const starved = readiness.filter((item) => item.status === "DATA_STARVED");
  const partial = readiness.filter((item) => item.status === "PARTIAL_INPUTS");
  const coreGaps = required.filter((item) => item.status !== "READY");
  const coreDataStarved = required.filter((item) => item.status === "DATA_STARVED");
  const averageCoverage = readiness.length
    ? Math.round(readiness.reduce((sum, item) => sum + item.coveragePct, 0) / readiness.length)
    : 0;
  const topMissingFields = new Map();

  for (const item of readiness) {
    for (const group of item.missingRequiredGroups || []) {
      const label = group.fields.join(" or ");
      topMissingFields.set(label, (topMissingFields.get(label) || 0) + 1);
    }
  }

  return {
    status:
      coreGaps.length === 0
        ? "CORE_READY"
        : coreDataStarved.length
          ? "CORE_DATA_STARVED"
          : coreGaps.length <= Math.max(1, Math.round(required.length * 0.25))
          ? "CORE_PARTIAL"
          : "CORE_DATA_STARVED",
    averageCoverage,
    engineCount: readiness.length,
    readyEngines: readiness.filter((item) => item.status === "READY").length,
    partialEngines: partial.length,
    starvedEngines: starved.length,
    coreGapCount: coreGaps.length,
    coreGaps: coreGaps.map((item) => item.engineId),
    topMissingFields: [...topMissingFields.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

export function analyzeEngineDataReadiness(project = {}, options = {}) {
  const contracts = engineContracts(options);
  const resolvedChain = canonicalValue(project, "chain", { disableSemanticScan: true });
  const canonicalFields = options.canonicalFields || canonicalFieldsForContracts(contracts);
  const aliasResolution = resolveCanonicalAliases(project, {
    fields: canonicalFields,
    disableSemanticScan: true,
    resolvedChain,
  });
  const lookupCache = new Map(Object.entries(aliasResolution.resolved || {}));
  const lookupCanonicalValue = (target = project, field = "") => {
    const canonicalField = canonicalFieldForAlias(field) || field;
    if (target === project && lookupCache.has(canonicalField)) return lookupCache.get(canonicalField);
    const value = canonicalValue(target, canonicalField, {
      disableSemanticScan: true,
      resolvedChain,
    });
    if (target === project) lookupCache.set(canonicalField, value);
    return value;
  };
  const readiness = contracts.map((contract) => evaluateEngineDataReadiness(project, contract, { lookupCanonicalValue }));
  const summary = summarizeReadiness(readiness);
  const nextSourcePlan = [
    ...new Set(readiness.flatMap((item) => item.nextSources || [])),
  ].slice(0, 12);

  return {
    ...project,
    engineDataReadinessScore: summary.averageCoverage,
    engineDataReadinessStatus: summary.status,
    engineDataReadiness: {
      ...summary,
      nextSourcePlan,
      engines: readiness,
      policy:
        "Missing engine inputs remain unknown evidence. This audit cannot promote a project; it only shows which free sources should be queried next.",
    },
    missingEngineInputs: summary.topMissingFields,
    nextDataSourcesNeeded: nextSourcePlan,
  };
}

export function analyzeEngineDataReadinessBatch(projects = [], options = {}) {
  return projects.map((project) => analyzeEngineDataReadiness(project, options));
}

export function summarizeEngineDataReadiness(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const contracts = engineContracts();
  const analyzed = safeProjects.map((project) =>
    project.engineDataReadiness ? project : analyzeEngineDataReadiness(project, { contracts })
  );
  const statuses = analyzed.reduce((acc, project) => {
    const status = project.engineDataReadinessStatus || "UNKNOWN";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const missingFields = new Map();
  const sourceNeeds = new Map();

  for (const project of analyzed) {
    for (const item of project.missingEngineInputs || []) {
      missingFields.set(item.fields, (missingFields.get(item.fields) || 0) + item.count);
    }
    for (const source of project.nextDataSourcesNeeded || []) {
      sourceNeeds.set(source, (sourceNeeds.get(source) || 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    status: statuses.CORE_DATA_STARVED ? "GAPS_FOUND" : "PASS",
    projectsAnalyzed: analyzed.length,
    contractCount: contracts.length,
    averageCoverage: analyzed.length
      ? Math.round(analyzed.reduce((sum, project) => sum + (project.engineDataReadinessScore || 0), 0) / analyzed.length)
      : 0,
    statuses,
    coreReady: statuses.CORE_READY || 0,
    corePartial: statuses.CORE_PARTIAL || 0,
    coreDataStarved: statuses.CORE_DATA_STARVED || 0,
    topMissingInputs: [...missingFields.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    topSourceNeeds: [...sourceNeeds.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    mostReadyProjects: analyzed
      .slice()
      .sort((a, b) => (b.engineDataReadinessScore || 0) - (a.engineDataReadinessScore || 0))
      .slice(0, 20)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.engineDataReadinessScore || 0,
        status: project.engineDataReadinessStatus || "UNKNOWN",
        nextSourcesNeeded: project.nextDataSourcesNeeded || [],
      })),
  };
}
