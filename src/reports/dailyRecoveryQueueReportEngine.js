import fs from "fs";
import path from "path";
import {
  hasCleanDisplayIdentity,
  isLikelyAggregateCandidate,
  isLikelyMemeIdentity,
} from "../identity/displayIdentityGuard.js";
import { isEntityResearchOnlyCandidate } from "../kernel/candidateTruthState.js";

const MAX_ITEMS = 50;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function positive(project = {}, paths = []) {
  return paths.some((path) => {
    const value = path.split(".").reduce((current, key) => current?.[key], project);
    return Number.isFinite(Number(value)) && Number(value) > 0;
  });
}

function measured(project = {}, paths = []) {
  return paths.some((path) => {
    const value = path.split(".").reduce((current, key) => current?.[key], project);
    return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
  });
}

function staleDiscoveryGapResolved(project = {}, item = "") {
  const text = String(item || "").toLowerCase();
  if (/market.?cap/.test(text)) {
    return positive(project, ["marketCapUsd", "circulatingMarketCapUsd", "marketCap", "estimatedMarketCapUsd"]);
  }
  if (/^priceusd$|price usd/.test(text)) return positive(project, ["priceUsd", "price"]);
  if (/liquidity/.test(text)) {
    return positive(project, ["liquidityUsd", "dexLiquidityUsd", "executionProof.liquidityUsd"]);
  }
  if (/safetyproof|safety proof/.test(text)) {
    const status = String(first([
      project.instantSafetyStatus,
      project.safetyProofStatus,
      project.contractSafetyStatus,
    ]) || "").toUpperCase();
    return project.executionProof?.safetyVerified === true || /PASS|VERIFIED_SAFE|VERIFIED_CLEAN/.test(status);
  }
  if (/freshbuyquote|buy quote/.test(text)) {
    return project.buyQuoteVerified === true || project.executionProof?.buyQuoteVerified === true;
  }
  if (/freshsellquote|sell quote/.test(text)) {
    return project.sellQuoteVerified === true || project.executionProof?.sellQuoteVerified === true;
  }
  if (/buyerbreadth|buyer breadth/.test(text)) {
    return measured(project, ["uniqueBuyers24h", "buyers24h", "clusterAdjustedUniqueBuyers24h"]);
  }
  if (/walletflow|wallet flow/.test(text)) {
    return measured(project, ["smartWalletNetFlowUsd", "qualifiedSmartWalletNetFlowUsd"]);
  }
  if (/holderdistribution|holder distribution/.test(text)) {
    return measured(project, ["holderCount", "holders"]);
  }
  if (/^chain$/.test(text)) return Boolean(project.chain || project.canonicalChain || project.chainId);
  if (/contractaddress|contract address/.test(text)) {
    return Boolean(project.tokenAddress || project.contractAddress || project.canonicalAddress);
  }
  if (/primarypool|primary pool/.test(text)) {
    return Boolean(project.poolAddress || project.pairAddress || project.primaryTradablePool);
  }
  return false;
}

function score(project = {}) {
  return Math.max(
    num(project.dailyCapitalMoveScore),
    num(project.highUpsideScalpScore),
    num(project.hottestTenNowScore),
    num(project.earlyAsymmetryResearchPriorityScore),
    num(project.preBreakoutRadarScore),
    num(project.progressiveOpportunityScore),
    num(project.opportunityScore)
  );
}

function missingItems(project = {}) {
  const discoveryGaps = [
    ...array(project.missingInfoNeeded),
    ...array(project.missingDataCompletion?.missing),
  ].filter((item) => !staleDiscoveryGapResolved(project, item));

  return [
    ...array(project.dailyCapitalMoveMissingProof),
    ...array(project.highUpsideScalpMissingFields),
    ...array(project.liveRankingMissingEvidence),
    ...discoveryGaps,
    ...array(project.missingEvidence),
    ...array(project.missingRouteEvidence),
    ...array(project.activeEvidenceRecovery?.unrecoveredFields),
  ].filter(Boolean);
}

function sourcePlan(item = "") {
  const text = String(item || "").toLowerCase();
  if (/identity|chain|contract|token|pool|market/.test(text)) return ["DexScreener", "GeckoTerminal", "official website", "block explorer"];
  if (/route|quote|\bsell\b|\bbuy\b|slippage|depth/.test(text)) return ["LI.FI keyless quote", "chain-native DEX quote", "CEX public order book", "Jupiter (API key required)", "0x (API key required)"];
  if (/safety|honeypot|tax|blacklist|freeze|authority/.test(text)) return ["GoPlus", "Honeypot.is", "RugCheck", "Sourcify", "Blockscout", "Etherscan V2"];
  if (/utility|roadmap|developer|github|docs|product/.test(text)) return ["GitHub", "official docs", "project website", "package registry"];
  if (/market cap|liquidity|volume|buyer|wallet|holder|flow/.test(text)) return ["CoinGecko", "CoinPaprika", "CoinLore", "GeckoTerminal trades", "native RPC"];
  return ["source truth router", "official links", "independent market provider"];
}

function resolverFor(item = "") {
  const text = String(item || "").toLowerCase();
  if (/identity|chain|contract|token/.test(text)) return "officialIdentityResolver";
  if (/pool|pair/.test(text)) return "dexPoolResolver";
  if (/buyer/.test(text)) return "buyerBreadthResolver";
  if (/route|quote|\bsell\b|\bbuy\b|slippage|depth/.test(text)) return "routeQuoteResolver";
  if (/safety|honeypot|tax|blacklist|freeze|authority/.test(text)) return "contractSafetyResolver";
  if (/market.?cap/.test(text)) return "marketCapResolver";
  if (/liquidity/.test(text)) return "liquidityDepthResolver";
  if (/wallet|flow/.test(text)) return "walletFlowResolver";
  if (/holder/.test(text)) return "holderEvidenceResolver";
  if (/utility|roadmap|developer|github|docs|product/.test(text)) return "utilityEvidenceResolver";
  return null;
}

function recoverableLane(project = {}) {
  return !["BLOCKED", "ENTITY_RESEARCH_ONLY", "LATE_CHASE_DO_NOT_CHASE", "MEME_ONLY_EXCLUDED"].includes(
    String(project.dailyCapitalMoveLane || "")
  );
}

function compact(project = {}, rank = 0) {
  const missing = [...new Set(missingItems(project))].slice(0, 12);
  const sources = [...new Set([
    ...array(project.dailyCapitalMoveNextSources),
    ...missing.flatMap(sourcePlan),
    ...array(project.engineDataContractHealth?.nextSourcesNeeded).map((item) => item?.source || item),
  ])].slice(0, 12);
  const nextResolvers = [...new Set(missing.map(resolverFor).filter(Boolean))].slice(0, 12);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || project.projectName || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    tokenAddress: first([project.tokenAddress, project.contractAddress, project.canonicalAddress]) || null,
    poolAddress: first([project.poolAddress, project.pairAddress, project.primaryTradablePool]) || null,
    researchScore: score(project),
    completionScore: project.completionScore ?? project.missingDataCompletion?.completionScore ?? null,
    lane: project.dailyCapitalMoveLane || project.highUpsideScalpLane || project.hottestTenNowLane || "RESEARCH",
    blockingResearch: project.dailyCapitalMoveLane === "NEEDS_PROOF" || missing.length > 0,
    blockingExecution: missing.some((item) => /route|quote|\bsell\b|\bbuy\b|slippage|depth|liquidity|safety|identity|contract/i.test(item)),
    missingProof: missing,
    nextSingleProofToPromote: missing[0] || null,
    nextSingleResolver: nextResolvers[0] || null,
    nextResolvers,
    targetSources: sources,
    sourcesUsed: [...new Set([
      project.executionRecoverySource,
      project.executionProofRecovery?.executionRecoverySource,
      project.canonicalExecutionRoute?.supportingSources?.[0],
      ...array(project.discoverySources),
      project.source,
    ].filter(Boolean))].slice(0, 10),
    sourcesFailed: [...new Set([
      ...array(project.executionRecoveryFailures),
      ...array(project.executionProofRecovery?.executionRecoveryFailures),
      ...array(project.providerFailures),
      ...array(project.discoveryProviderFailures),
    ].filter(Boolean))].slice(0, 10),
    estimatedRequests: Math.max(1, Math.min(12, sources.length)),
    reason: project.dailyCapitalMoveReason || project.reasonNotQualified || "Recover missing evidence before promotion.",
  };
}

export function summarizeDailyRecoveryQueue(projects = [], meta = {}) {
  const candidates = (Array.isArray(projects) ? projects : [])
    .filter(
      (project) =>
        score(project) > 0 &&
        missingItems(project).length > 0 &&
        recoverableLane(project) &&
        !isEntityResearchOnlyCandidate(project) &&
        project.memeOnlySpeculative !== true &&
        project.memeBrandingDetected !== true &&
        !isLikelyMemeIdentity(project) &&
        hasCleanDisplayIdentity(project, { requireName: false }) &&
        !isLikelyAggregateCandidate(project)
    )
    .sort((a, b) => score(b) - score(a))
    .slice(0, MAX_ITEMS)
    .map((project, index) => compact(project, index + 1));
  const sourceCounts = new Map();
  for (const candidate of candidates) {
    for (const source of candidate.targetSources || []) {
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: candidates.length ? "RECOVERY_ACTIONS_READY" : "NO_RECOVERABLE_GAPS",
    objective: "Convert missing evidence on promising candidates into exact source-recovery actions.",
    disclaimer: "Recovery queue is research workflow only; it is not a buy/sell recommendation.",
    projectsAnalyzed: Array.isArray(projects) ? projects.length : 0,
    recoveryCandidateCount: candidates.length,
    topRecoveryCandidates: candidates,
    topSourceNeeds: [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    policy: [
      "Missing data stays unknown, never zero.",
      "Promising incomplete candidates enter recovery instead of being silently discarded.",
      "Recovered evidence should rerun only affected downstream engines.",
    ],
  };
}

export function writeDailyRecoveryQueueReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeDailyRecoveryQueue(projects, meta);
  const filePath = path.join(reportsDir, "daily-recovery-queue.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
