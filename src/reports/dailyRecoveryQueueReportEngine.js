import fs from "fs";
import path from "path";
import { hasCleanDisplayIdentity, isLikelyAggregateCandidate } from "../identity/displayIdentityGuard.js";

const MAX_ITEMS = 50;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
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
  return [
    ...(project.dailyCapitalMoveMissingProof || []),
    ...(project.highUpsideScalpMissingFields || []),
    ...(project.missingInfoNeeded || []),
    ...(project.missingEvidence || []),
    ...(project.missingRouteEvidence || []),
    ...(project.engineDataContractHealth?.nextSourcesNeeded || []).map((item) => item.source || item),
  ].filter(Boolean);
}

function sourcePlan(item = "") {
  const text = String(item || "").toLowerCase();
  if (/identity|chain|contract|token|pool|market/.test(text)) return ["DexScreener", "GeckoTerminal", "official website", "block explorer"];
  if (/route|quote|sell|buy|slippage|depth/.test(text)) return ["Jupiter", "0x", "1inch", "chain-native DEX quote", "CEX order book"];
  if (/safety|honeypot|tax|blacklist|freeze|authority/.test(text)) return ["GoPlus", "Honeypot.is", "RugCheck", "Sourcify", "Blockscout", "Etherscan V2"];
  if (/utility|roadmap|developer|github|docs|product/.test(text)) return ["GitHub", "official docs", "project website", "package registry"];
  if (/market cap|liquidity|volume|buyer|wallet|holder|flow/.test(text)) return ["CoinGecko", "CoinPaprika", "CoinLore", "GeckoTerminal trades", "native RPC"];
  return ["source truth router", "official links", "independent market provider"];
}

function recoverableLane(project = {}) {
  return !["BLOCKED", "LATE_CHASE_DO_NOT_CHASE", "MEME_ONLY_EXCLUDED"].includes(
    String(project.dailyCapitalMoveLane || "")
  );
}

function compact(project = {}, rank = 0) {
  const missing = [...new Set(missingItems(project))].slice(0, 12);
  const sources = [...new Set([
    ...(project.dailyCapitalMoveNextSources || []),
    ...missing.flatMap(sourcePlan),
  ])].slice(0, 12);
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || project.projectName || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    tokenAddress: first([project.tokenAddress, project.contractAddress, project.canonicalAddress]) || null,
    poolAddress: first([project.poolAddress, project.pairAddress, project.primaryTradablePool]) || null,
    researchScore: score(project),
    lane: project.dailyCapitalMoveLane || project.highUpsideScalpLane || project.hottestTenNowLane || "RESEARCH",
    blockingResearch: project.dailyCapitalMoveLane === "NEEDS_PROOF" || missing.length > 0,
    blockingExecution: missing.some((item) => /route|quote|sell|buy|slippage|depth|liquidity|safety|identity|contract/i.test(item)),
    missingProof: missing,
    nextSingleProofToPromote: missing[0] || null,
    targetSources: sources,
    sourcesUsed: [...new Set([
      project.executionRecoverySource,
      project.executionProofRecovery?.executionRecoverySource,
      project.canonicalExecutionRoute?.supportingSources?.[0],
      ...(project.discoverySources || []),
      project.source,
    ].filter(Boolean))].slice(0, 10),
    sourcesFailed: [...new Set([
      ...(project.executionRecoveryFailures || []),
      ...(project.executionProofRecovery?.executionRecoveryFailures || []),
      ...(project.providerFailures || []),
      ...(project.discoveryProviderFailures || []),
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
