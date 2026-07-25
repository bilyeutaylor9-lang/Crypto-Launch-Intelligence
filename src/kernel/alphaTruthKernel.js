import crypto from "crypto";
import {
  saveDecisionHistory,
  saveEvidenceEvent,
  saveOutcomeLabel,
  saveSnapshot,
  saveSourceHistory,
  fetchOutcomeLabels,
} from "../storage/db.js";
import { buildEvidenceLineage } from "./evidenceLineageCorrelationGovernor.js";
import { judgePointInTimeOutcomeV2 } from "./pointInTimeOutcomeJudgeV2.js";
import { isLiveExecutionReady } from "../execution/routeTruthV2.js";

const DEFAULT_RECEIPT_LIMIT = Number(process.env.ALPHA_TRUTH_RECEIPT_LIMIT || 100);
const DEFAULT_PERSISTENCE_LIMIT = Number(process.env.ALPHA_TRUTH_PERSIST_LIMIT || 250);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function text(value = "") {
  return String(value || "").trim();
}

function compactText(value = "", maxLength = 900) {
  const raw = String(value ?? "");
  return raw.length > maxLength ? `${raw.slice(0, Math.max(0, maxLength - 18))}[truncated]` : raw;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function scoreOf(project = {}) {
  return num(project.pipelineScore ?? project.opportunityScore ?? project.score);
}

function projectKeyFor(project = {}) {
  return lower(
    project.permanentProjectKey ||
      project.projectKey ||
      project.identityKey ||
      project.finalContractAddress ||
      project.contractAddress ||
      project.tokenAddress ||
      project.address ||
      project.finalPairAddress ||
      project.poolAddress ||
      project.pairAddress ||
      `${project.chain || project.finalChain || "unknown"}:${project.symbol || project.name || "unknown"}`
  );
}

function iso(value = null, fallback = new Date().toISOString()) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function marketSnapshot(project = {}, observedAt = new Date().toISOString()) {
  return {
    observedAt,
    priceUsd: num(first([project.priceUsd, project.price, project.marketData?.priceUsd, project.rawCandidate?.priceUsd])),
    dexLiquidityUsd: num(first([
      project.dexLiquidityUsd,
      project.stableExitLiquidityUsd,
      project.finalLiquidityUsd,
      project.liquidityUsd,
      project.marketData?.liquidityUsd,
      project.rawCandidate?.liquidityUsd,
    ])),
    marketCapUsd: num(first([
      project.circulatingMarketCapUsd,
      project.circulatingMarketCap,
      project.finalMarketCapUsd,
      project.marketCap,
      project.marketData?.marketCap,
      project.rawCandidate?.marketCap,
    ])),
    volume24h: num(first([project.volume24h, project.volume, project.marketData?.volume24h, project.rawCandidate?.volume24h])),
  };
}

function executionSnapshot(project = {}, observedAt = new Date().toISOString()) {
  const proof = project.executionProof || {};
  const twin = project.proofOfAlphaExecutionTwin || {};
  const quote = twin.quote || project.executionQuote || {};
  const route = project.purchaseRoute || project.smallCapHunter?.purchaseRoute || twin.route || {};
  const routeStatus = proof.executionStatus || project.executionStatus || route.status || "UNKNOWN";
  const verified = isLiveExecutionReady(project);

  return {
    observedAt,
    routeStatus,
    routeVerified: Boolean(verified),
    preferredRoute: route.preferredRoute || project.proofOfAlphaExecutionTwinRoute || null,
    executableEntryPriceUsd: num(first([quote.entryPriceUsd, quote.priceUsd, project.executableEntryPriceUsd, project.priceUsd])),
    quoteAgeSeconds: first([project.quoteAgeSeconds, project.executionQuoteAgeSeconds, quote.ageSeconds]) ?? null,
    slippagePct: first([project.executionSlippagePct, project.proofOfAlphaExecutionTwinSlippagePct, quote.slippagePct, route.slippagePct]) ?? null,
    priceImpactPct: first([project.priceImpactPct, project.executionPriceImpactPct, quote.priceImpactPct]) ?? null,
    gasCostPct: first([project.gasCostPct, project.executionGasCostPct, quote.gasCostPct]) ?? null,
    buyTaxPct: first([project.buyTaxPct, quote.buyTaxPct]) ?? null,
    sellTaxPct: first([project.sellTaxPct, quote.sellTaxPct]) ?? null,
    missingExecutionCosts: [
      ...(!first([project.executionSlippagePct, quote.slippagePct, route.slippagePct]) ? ["slippage"] : []),
      ...(!first([project.priceImpactPct, quote.priceImpactPct]) ? ["price impact"] : []),
      ...(!first([project.sellTaxPct, quote.sellTaxPct]) ? ["sell tax"] : []),
      ...(!first([project.gasCostPct, quote.gasCostPct]) ? ["gas"] : []),
    ],
  };
}

function securityStatus(project = {}) {
  if (project.honeypotDetected || project.verifiedScam || num(project.contractAuthorityRiskScore) >= 85) return "CRITICAL";
  if (project.securityEvidenceStatus === "CONFLICTING_SECURITY_EVIDENCE") return "CONFLICTING_SECURITY_EVIDENCE";
  if (project.contractSafetyVerified && project.liquidityControlSafetyScore >= 60) return "VERIFIED_SAFE";
  if (project.contractSafetyVerified || project.instantSafetyStatus === "PASS") return "VERIFIED_WITH_ADMIN_RISK";
  if (project.securityEvidenceStatus === "UNKNOWN") return "UNVERIFIED";
  return project.securityEvidenceStatus || "UNVERIFIED";
}

function requiredProof(project = {}, lineage = {}) {
  const execution = executionSnapshot(project);
  const market = marketSnapshot(project);
  return {
    identity: project.identityVerified ? "VERIFIED" : "MISSING_OR_REVIEW",
    chain: project.chainVerified || project.finalChain || project.chain ? "VERIFIED_OR_DECLARED" : "MISSING",
    contract: project.contractVerified || project.finalContractAddress || project.contractAddress ? "VERIFIED_OR_PRESENT" : "MISSING",
    pool: project.finalPairAddress || project.poolAddress || project.pairAddress ? "PRESENT" : "MISSING",
    liquidity: market.dexLiquidityUsd > 0 ? "PRESENT" : "MISSING",
    executionRoute: execution.routeVerified ? "VERIFIED" : "MISSING_OR_UNVERIFIED",
    security: securityStatus(project),
    catalyst: num(project.liveCatalystRadarScore || project.catalystScore || project.catalystCalendarScore) >= 55 ? "EVIDENCED" : "MISSING_OR_WEAK",
    independentEvidence:
      lineage.requiredQuorum?.passed === true
        ? "QUORUM_PASSED"
        : `QUORUM_INCOMPLETE:${safeArray(lineage.requiredQuorum?.missingRequiredGroups).join(",")}`,
  };
}

function truthStatus(project = {}, proof = {}, lineage = {}) {
  if (project.finalSelectionState === "BLOCKED" || project.finalSelectionState === "IDENTITY_CONFLICT") return "BLOCKED";
  if (project.finalSelectionQualified && lineage.requiredQuorum?.passed && proof.executionRoute === "VERIFIED" && proof.security !== "CRITICAL") {
    return "PROOF_CARRYING_CANDIDATE";
  }
  if (project.finalSelectionState === "INSUFFICIENT_DATA" || safeArray(lineage.requiredQuorum?.missingRequiredGroups).length) {
    return "RESEARCH_ONLY_INCOMPLETE_PROOF";
  }
  return "RESEARCH_ONLY";
}

function decisionSnapshot(project = {}, rank = 1) {
  return {
    rank,
    finalState: project.finalSelectionState || "UNKNOWN",
    finalQualified: Boolean(project.finalSelectionQualified || project.finalSelectionState === "QUALIFIED"),
    score: scoreOf(project),
    tier: project.pipelineTier || project.tier || null,
    confidence: project.pipelineConfidence || project.confidence || null,
    reasons: safeArray(project.finalSelectionReasons).concat(safeArray(project.marketOpportunityRankDrivers)).slice(0, 12),
    risks: safeArray(project.finalBlockingReasons).concat(safeArray(project.finalWarningReasons)).slice(0, 12),
    invalidationConditions: safeArray(project.finalInvalidationConditions || project.invalidationConditions).slice(0, 10),
  };
}

function hashReceipt(receipt = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(receipt))
    .digest("hex");
}

export function buildAlphaTruthReceipt(project = {}, rank = 1, meta = {}) {
  const decisionAt = iso(meta.completedAt || meta.now);
  const runId = text(meta.runId || `scan_${Date.parse(decisionAt) || Date.now()}`);
  const lineage = project.evidenceLineage || buildEvidenceLineage(project);
  const market = marketSnapshot(project, decisionAt);
  const execution = executionSnapshot(project, decisionAt);
  const proof = requiredProof(project, lineage);
  const projectKey = projectKeyFor(project);
  const base = {
    schemaVersion: "alpha-truth-receipt-v1",
    runId,
    projectKey,
    decisionAt,
    identity: {
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.finalChain || project.chain || null,
      contractAddress: project.finalContractAddress || project.contractAddress || project.tokenAddress || project.address || null,
      poolAddress: project.finalPairAddress || project.poolAddress || project.pairAddress || null,
      permanentProjectKey: project.permanentProjectKey || projectKey,
    },
    decision: decisionSnapshot(project, rank),
    marketSnapshot: market,
    executionSnapshot: execution,
    requiredProof: proof,
    evidenceLineage: {
      status: lineage.status,
      effectiveIndependentEvidenceCount: lineage.effectiveIndependentEvidenceCount,
      weightedIndependentScore: lineage.weightedIndependentScore,
      correlationPenalty: lineage.correlationPenalty,
      internalOpinionCount: lineage.internalOpinionCount,
      missingRequiredGroups: safeArray(lineage.requiredQuorum?.missingRequiredGroups),
      groups: safeArray(lineage.groups).slice(0, 20),
      warnings: safeArray(lineage.warnings).slice(0, 12),
    },
    outcomeV2: judgePointInTimeOutcomeV2(
      {
        projectKey,
        decisionAt,
        marketSnapshot: market,
        executionSnapshot: execution,
        scannerScoreAtDecision: scoreOf(project),
      },
      safeArray(project.outcomeSnapshots || project.futureOutcomeSnapshots || project.pointInTimeSnapshots)
    ),
    truthStatus: null,
    disclaimer: "Research accountability receipt only. Not financial advice, not a buy recommendation, and not a profit guarantee.",
  };
  base.truthStatus = truthStatus(project, proof, lineage);
  base.receiptId = hashReceipt({
    runId: base.runId,
    projectKey: base.projectKey,
    decisionAt: base.decisionAt,
    identity: base.identity,
    decision: base.decision,
    marketSnapshot: base.marketSnapshot,
    requiredProof: base.requiredProof,
  });
  base.receiptHash = hashReceipt(base);
  return base;
}

function sourceTelemetry(meta = {}) {
  const reports = meta.discovery?.sourceReports || meta.sourceReports || {};
  return Object.entries(reports).map(([source, report]) => ({
    source,
    status: report?.status || report?.lastStatus || "UNKNOWN",
    candidates: num(report?.scannedTokens ?? report?.discoveredTokens ?? report?.acceptedTokens ?? report?.lastCandidateCount),
    durationMs: num(report?.durationMs),
    error: compactText(report?.error || report?.lastError || "", 500) || null,
  }));
}

function universeCoverage(meta = {}, projects = []) {
  const discovery = meta.discovery || {};
  const target = num(discovery.targetCoverage?.targetCandidates || discovery.targetCandidates || process.env.DISCOVERY_TARGET_CANDIDATES);
  const observed = num(discovery.dedupedCount || discovery.acceptedCount || meta.discoveredProjects);
  const analyzed = projects.length;
  const ledgerTotals = discovery.universeLedger?.totals || {};

  return {
    targetCandidates: target,
    observedDuringRun: observed,
    successfullyAnalyzed: analyzed,
    deeplyResearched: num(meta.analysisFunnel?.funnel?.deepIntelligenceSelected),
    totalKnownUniverse: num(ledgerTotals.total || discovery.universeLedger?.savedProjects),
    promoted: num(ledgerTotals.promoted),
    researchOnly: num(ledgerTotals.researchOnly),
    blocked: num(ledgerTotals.blocked),
    targetMet: target > 0 ? observed >= target : null,
    shortfall: target > 0 ? Math.max(0, target - observed) : 0,
    note: "Coverage counts describe real observed candidates, not a guarantee that every target candidate existed or was fully refreshed.",
  };
}

function predictiveLeaderboard(outcomeRows = []) {
  const rows = Array.isArray(outcomeRows) ? outcomeRows : [];
  const grouped = new Map();

  for (const row of rows) {
    const label = row.label || row.outcomeLabel || "UNKNOWN";
    const horizon = row.horizonDays || 0;
    const key = `horizon_${horizon}`;
    const current = grouped.get(key) || [];
    current.push({
      label,
      returnPct: num(row.returnPct),
      maxDrawdownPct: num(row.maxDrawdownPct),
      buyable: row.buyable !== 0 && row.buyable !== false,
    });
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([id, values]) => {
    const samples = values.length;
    const winners = values.filter((value) => value.returnPct >= 20 && value.buyable).length;
    const falsePositives = values.filter((value) => value.returnPct <= -20 || !value.buyable).length;
    const averageReturnPct = samples
      ? Math.round(values.reduce((sum, value) => sum + value.returnPct, 0) / samples)
      : 0;
    const medianReturnPct = samples
      ? values.map((value) => value.returnPct).sort((a, b) => a - b)[Math.floor(samples / 2)]
      : 0;
    const maxDrawdownPct = samples ? Math.max(...values.map((value) => Math.abs(value.maxDrawdownPct))) : 0;
    return {
      id,
      samples,
      precisionAtObservedSet: samples ? Number((winners / samples).toFixed(4)) : null,
      falsePositiveRate: samples ? Number((falsePositives / samples).toFixed(4)) : null,
      averageReturnPct,
      medianReturnPct,
      maxDrawdownPct,
      calibrationStatus: samples >= 100 ? "DEVELOPING" : "LOW_SAMPLE_COLLECT_MORE_OUTCOMES",
    };
  });
}

export function buildAlphaTruthKernelReport(projects = [], meta = {}, options = {}) {
  const limit = Math.max(1, Number(options.limit || DEFAULT_RECEIPT_LIMIT));
  const ranked = [...(Array.isArray(projects) ? projects : [])]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, limit);
  const receipts = ranked.map((project, index) => buildAlphaTruthReceipt(project, index + 1, meta));
  const proofCarrying = receipts.filter((receipt) => receipt.truthStatus === "PROOF_CARRYING_CANDIDATE").length;
  const incomplete = receipts.filter((receipt) => receipt.truthStatus === "RESEARCH_ONLY_INCOMPLETE_PROOF").length;
  const blocked = receipts.filter((receipt) => receipt.truthStatus === "BLOCKED").length;
  const outcomeRows = options.outcomeRows || [];

  return {
    generatedAt: iso(meta.completedAt || meta.now),
    schemaVersion: "alpha-truth-kernel-v1",
    runId: text(meta.runId || `scan_${Date.parse(meta.completedAt || meta.now || new Date().toISOString()) || Date.now()}`),
    summary: {
      scannedProjects: projects.length,
      receiptCount: receipts.length,
      proofCarrying,
      incompleteProof: incomplete,
      blocked,
      averageEffectiveIndependentEvidenceCount: receipts.length
        ? Number((receipts.reduce((sum, receipt) => sum + num(receipt.evidenceLineage.effectiveIndependentEvidenceCount), 0) / receipts.length).toFixed(2))
        : 0,
      forcedPickPolicy: "NEVER_FORCE_PICK",
    },
    universeCoverage: universeCoverage(meta, projects),
    sourceTelemetry: sourceTelemetry(meta),
    predictiveLeaderboard: predictiveLeaderboard(outcomeRows),
    receipts,
    operatingRules: [
      "A qualified pick requires identity, chain, contract or listing, liquidity, route, safety, catalyst, and independent evidence.",
      "Internal AI opinions are recorded but excluded from independent external evidence counts.",
      "Correlated momentum and narrative derivatives are capped before confidence is raised.",
      "Outcome V2 uses net executable token return, not future scanner scores.",
      "Missing future snapshots remain missing and cannot teach neutral or positive lessons.",
    ],
  };
}

function persistReceipt(receipt = {}) {
  saveDecisionHistory({
    projectKey: receipt.projectKey,
    symbol: receipt.identity?.symbol,
    chain: receipt.identity?.chain,
    finalState: receipt.decision?.finalState,
    finalQualified: receipt.decision?.finalQualified,
    confidence: receipt.decision?.confidence,
    score: receipt.decision?.score,
    blockingReasons: receipt.decision?.risks,
    warningReasons: receipt.evidenceLineage?.warnings,
    invalidationConditions: receipt.decision?.invalidationConditions,
    payload: receipt,
    timestamp: Date.parse(receipt.decisionAt),
  });

  saveSnapshot({
    poolId: receipt.identity?.poolAddress || receipt.projectKey,
    symbol: receipt.identity?.symbol,
    chain: receipt.identity?.chain,
    priceUsd: receipt.marketSnapshot?.priceUsd,
    liquidityUsd: receipt.marketSnapshot?.dexLiquidityUsd,
    volume24h: receipt.marketSnapshot?.volume24h,
    overallScore: receipt.decision?.score,
    timestamp: Date.parse(receipt.decisionAt),
  });

  let evidenceEventsSaved = 0;
  for (const group of safeArray(receipt.evidenceLineage?.groups).slice(0, 20)) {
    saveEvidenceEvent({
      projectKey: receipt.projectKey,
      symbol: receipt.identity?.symbol,
      chain: receipt.identity?.chain,
      source: group.rawProviders?.[0] || group.group,
      family: group.group,
      eventType: group.status,
      score: group.cappedContribution,
      confidence: group.averageConfidence,
      payload: group,
      observedAt: Date.parse(receipt.decisionAt),
    });
    evidenceEventsSaved += 1;
  }

  let outcomeLabelsSaved = 0;
  for (const label of safeArray(receipt.outcomeV2?.labels)) {
    if (label.status !== "LABELED") continue;
    saveOutcomeLabel({
      projectKey: receipt.projectKey,
      symbol: receipt.identity?.symbol,
      chain: receipt.identity?.chain,
      label: label.label,
      horizonDays: label.horizon === "1h" ? 0 : label.horizon === "24h" ? 1 : label.horizon === "7d" ? 7 : 30,
      returnPct: label.netExecutableReturnPct,
      maxDrawdownPct: label.maxAdverseExcursionPct,
      liquidityUsd: label.exitLiquidityUsd,
      buyable: !label.becameUntradeable,
      payload: label,
      timestamp: Date.parse(label.snapshotAt || receipt.decisionAt),
    });
    outcomeLabelsSaved += 1;
  }

  return {
    evidenceEventsSaved,
    outcomeLabelsSaved,
  };
}

function persistSources(meta = {}) {
  let sourceHistorySaved = 0;
  for (const source of sourceTelemetry(meta)) {
    saveSourceHistory({
      source: source.source,
      status: source.status,
      candidateCount: source.candidates,
      durationMs: source.durationMs,
      errorMessage: source.error,
      payload: source,
      timestamp: Date.now(),
    });
    sourceHistorySaved += 1;
  }
  return sourceHistorySaved;
}

export function persistAlphaTruthMemory(projects = [], meta = {}, options = {}) {
  const persist = boolEnv(process.env.ALPHA_TRUTH_PERSIST_ENABLED, options.persist !== false);
  const report = buildAlphaTruthKernelReport(projects, meta, {
    ...options,
    outcomeRows: options.outcomeRows || fetchOutcomeLabels(5000),
  });

  if (!persist) {
    return {
      report,
      persistence: {
        status: "SKIPPED",
        reason: "ALPHA_TRUTH_PERSIST_ENABLED=false or persist=false.",
      },
    };
  }

  try {
    const receipts = report.receipts.slice(0, Math.max(1, Number(options.persistenceLimit || DEFAULT_PERSISTENCE_LIMIT)));
    let evidenceEventsSaved = 0;
    let outcomeLabelsSaved = 0;
    for (const receipt of receipts) {
      const result = persistReceipt(receipt);
      evidenceEventsSaved += result.evidenceEventsSaved;
      outcomeLabelsSaved += result.outcomeLabelsSaved;
    }
    const sourceHistorySaved = persistSources(meta);
    return {
      report,
      persistence: {
        status: "OK",
        receiptsSaved: receipts.length,
        evidenceEventsSaved,
        sourceHistorySaved,
        outcomeLabelsSaved,
      },
    };
  } catch (error) {
    return {
      report,
      persistence: {
        status: "FAILED",
        reason: error.message,
      },
    };
  }
}
