import fs from "fs";
import path from "path";
import { getSourceManifest, summarizeSourceManifest } from "../config/sourceManifest.js";
import { summarizeSourceRouter } from "../data/adaptiveSourceRouter.js";
import { analyzeSignalPerformance } from "../learning/signalPerformanceEngine.js";
import { buildInstitutionalDataProvenanceLedger } from "./institutionalDataProvenanceLedger.js";
import { getEngineContracts } from "./engineContractManifest.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function present(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return String(value).trim().length > 0;
}

function getPathValue(object = {}, key = "") {
  return String(key)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), object);
}

function hasAny(project = {}, keys = []) {
  return keys.some((key) => present(getPathValue(project, key)));
}

function missingAnyGroups(project = {}, groups = []) {
  return groups.filter((group) => !hasAny(project, group));
}

function normalizeSource(source = "") {
  return String(source || "").trim().toLowerCase();
}

function statusText(value = "") {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function readText(filePath = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function compactName(project = {}) {
  return project.symbol || project.name || project.address || project.pairAddress || "UNKNOWN";
}

function riskScore(project = {}) {
  return Math.max(
    num(project.riskScore),
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.instantSafetyRiskScore),
    num(project.organicDemandFirewallRisk),
    num(project.economicIntegrityRiskScore),
    num(project.walletClusterRiskScore),
    num(project.washTradingRiskScore),
    num(project.bundledLaunchRiskScore),
    num(project.deployerRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore)
  );
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0 && num(item.weight) > 0);
  const weight = active.reduce((sum, item) => sum + num(item.weight), 0);
  if (!weight) return 0;
  return active.reduce((sum, item) => sum + num(item.score) * num(item.weight), 0) / weight;
}

function exportedFunctions(source = "") {
  return [
    ...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g),
    ...source.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g),
  ].map((match) => match[1]);
}

function sourceReportCount(report = {}) {
  return num(report.scannedTokens ?? report.discoveredTokens ?? report.acceptedTokens ?? report.lastCandidateCount);
}

function sourceErrorType(report = {}) {
  const text = `${report.status || ""} ${report.error || ""} ${report.lastError || ""}`.toLowerCase();

  if (text.includes("429") || text.includes("rate")) return "RATE_LIMIT";
  if (text.includes("451") || text.includes("403") || text.includes("region") || text.includes("blocked")) return "REGION_BLOCKED";
  if (text.includes("401") || text.includes("auth") || text.includes("missing") || text.includes("key")) return "AUTH_REQUIRED";
  if (text.includes("timeout") || text.includes("abort")) return "TIMEOUT";
  if (text.includes("fail") || text.includes("error")) return "ERROR";
  return null;
}

function sourceRuntimeState(report = {}) {
  const status = statusText(report.status || report.lastStatus);
  const candidates = sourceReportCount(report);
  const errorType = sourceErrorType(report);

  if (["SUCCESS", "USED", "OK", "HEALTHY"].includes(status) && candidates > 0) return "SUCCEEDED";
  if (["SUCCESS", "USED", "OK", "HEALTHY"].includes(status)) return "ATTEMPTED_EMPTY";
  if (["SKIPPED", "DISABLED", "COOLDOWN"].includes(status)) return "SKIPPED";
  if (errorType) return errorType;
  if (["FAILED", "ERROR", "DEGRADED"].includes(status)) return "ERROR";
  return candidates > 0 ? "SUCCEEDED" : "UNKNOWN";
}

function sourceReportEntries(sourceReports = {}, evidenceSourceCounts = {}) {
  return Object.entries(sourceReports).map(([source, report]) => {
    const runtimeState = sourceRuntimeState(report || {});
    return {
      source,
      status: report?.status || report?.lastStatus || "UNKNOWN",
      runtimeState,
      enabled: Boolean(report?.enabled ?? true),
      candidates: sourceReportCount(report || {}),
      durationMs: num(report?.durationMs),
      error: report?.error || report?.lastError || null,
      usableEvidenceCount: evidenceSourceCounts[normalizeSource(source)] || 0,
      circuitBreaker:
        runtimeState === "RATE_LIMIT" || runtimeState === "REGION_BLOCKED" || runtimeState === "AUTH_REQUIRED"
          ? "COOLDOWN_RECOMMENDED"
          : runtimeState === "ERROR" || runtimeState === "TIMEOUT"
          ? "RETRY_WITH_BACKOFF"
          : "OPEN",
    };
  });
}

function providerEntriesFromHealth(source = "", providerHealth = {}) {
  const providers = Array.isArray(providerHealth?.providers) ? providerHealth.providers : [];
  return providers.map((provider) => ({
    source: provider.source || provider.id || provider.name || source,
    parentSource: source,
    status: provider.status || "UNKNOWN",
    runtimeState: sourceRuntimeState(provider),
    candidates: sourceReportCount(provider),
    error: provider.error || null,
  }));
}

function evidenceItems(project = {}) {
  const evidence = Array.isArray(project.evidence) ? project.evidence : [];
  const familyEvidence = Object.entries(project.finalEvidenceFamilies || project.sniperEvidenceFamilySummary || {})
    .flatMap(([family, value]) => {
      if (!value || typeof value !== "object") return [];
      const items = Array.isArray(value.evidence) ? value.evidence : [];
      return items.map((item) => ({
        engine: family,
        family,
        signal: typeof item === "string" ? item : item.signal || item.type || family,
        source: item.source || family,
        score: value.score || item.score || 0,
        confidence: item.confidence || 0.55,
      }));
    });

  return [...evidence, ...familyEvidence]
    .map((item) => {
      if (typeof item === "string") {
        return {
          engine: "unknown",
          source: "unknown",
          family: "unknown",
          signal: item,
          score: 0,
          confidence: 0.45,
          observedAt: null,
        };
      }
      return {
        engine: item.engine || item.source || "unknown",
        source: item.source || item.provider || item.engine || "unknown",
        family: item.family || item.evidenceFamily || item.category || item.engine || "unknown",
        signal: item.signal || item.reason || item.message || item.type || "evidence",
        score: clamp(item.score || item.value || 0),
        confidence: clamp(num(item.confidence) > 1 ? item.confidence : num(item.confidence) * 100) / 100 || 0.5,
        observedAt: item.observedAt || item.timestamp || item.createdAt || null,
      };
    });
}

function derivedSourceItems(project = {}) {
  const sources = [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source || source.type),
  ]
    .filter(Boolean)
    .map(normalizeSource)
    .filter(Boolean);

  return [...new Set(sources)].map((source) => ({
    engine: "source",
    source,
    family: "source",
    signal: `source observed: ${source}`,
    score: 50,
    confidence: 0.5,
    observedAt: project.discoveredAt || null,
  }));
}

function evidenceFamilyFromProject(project = {}) {
  return {
    identity: average([project.identityResolutionScore, project.projectIdentity?.score, project.finalQualified ? 70 : 0]),
    source: average([project.sourceTruthScore, project.evidenceQualityScore]),
    liquidity: average([project.liquidityScore, project.activeLiquidityTruthScore, project.liquidityUsd ? 65 : 0]),
    buyers: average([project.organicBuyerScore, project.buyerRetentionScore, project.holderGrowthScore]),
    wallet: average([project.smartWalletScore, project.smartWalletArrivalScore, project.smartMoneyAccumulationScore]),
    development: average([project.githubProScore, project.githubScore, project.developerActivityScore]),
    catalyst: average([project.catalystScore, project.catalystCalendarScore, project.liveCatalystRadarScore, project.roadmapProfitabilityScore]),
    narrative: average([project.narrativeScore, project.narrativeForecastScore, project.narrativeHeatScore, project.xSocialScore]),
    safety: average([project.instantSafetyScore, project.organicDemandFirewallScore, 100 - riskScore(project)]),
    execution: average([project.executionTwinScore, project.purchaseRouteConfirmed ? 75 : 0, project.smallCapHunter?.purchaseRoute?.purchasable ? 75 : 0]),
    learning: average([project.outcomeLearningScore, project.prePumpPatternScore, project.paperTradingOutcomeScore]),
  };
}

export function buildEvidenceLedger(project = {}) {
  const items = [...evidenceItems(project), ...derivedSourceItems(project)];
  const uniqueSources = [...new Set(items.map((item) => normalizeSource(item.source)).filter(Boolean))];
  const familyScores = evidenceFamilyFromProject(project);
  const families = Object.entries(familyScores).map(([family, score]) => {
    const directItems = items.filter((item) => normalizeSource(item.family) === family || normalizeSource(item.engine).includes(family));
    return {
      family,
      score: Math.round(clamp(score)),
      status: score >= 65 ? "confirmed" : score >= 35 ? "partial" : "thin",
      evidenceCount: directItems.length,
      sources: [...new Set(directItems.map((item) => normalizeSource(item.source)).filter(Boolean))],
    };
  });
  const confirmedFamilies = families.filter((family) => family.status === "confirmed").length;
  const partialFamilies = families.filter((family) => family.status === "partial").length;

  return {
    evidenceCount: items.length,
    uniqueSourceCount: uniqueSources.length,
    uniqueSources,
    families,
    confirmedFamilies,
    partialFamilies,
    evidenceCoverage: Math.round(clamp((confirmedFamilies / families.length) * 100 + partialFamilies * 2)),
    sourceIndependence: Math.round(clamp((uniqueSources.length / 5) * 100)),
    items: items.slice(0, 100),
  };
}

function scoreFieldAudit(project = {}, fields = []) {
  return fields
    .filter((field) => present(getPathValue(project, field)))
    .map((field) => {
      const value = num(getPathValue(project, field));
      return {
        field,
        value,
        finite: Number.isFinite(value),
        inRange: value >= 0 && value <= 100,
      };
    });
}

function hasEvidenceForContract(project = {}, contract = {}) {
  const evidence = evidenceItems(project);
  const idText = contract.id.toLowerCase();
  const moduleText = String(contract.module || "").replace(/Engine\.js$/i, "").toLowerCase();
  return evidence.some((item) => {
    const text = `${item.engine} ${item.source} ${item.family} ${item.signal}`.toLowerCase();
    return text.includes(idText) || text.includes(moduleText) || text.includes(idText.replace(/[A-Z]/g, (char) => ` ${char.toLowerCase()}`));
  });
}

export function auditEngineContract(project = {}, contract = {}) {
  const missingInputGroups = missingAnyGroups(project, contract.inputContract?.requiredAny || []);
  const missingOutputGroups = missingAnyGroups(project, contract.outputContract?.requiredAny || []);
  const scoreAudit = scoreFieldAudit(project, contract.outputContract?.scoreFields || []);
  const invalidScores = scoreAudit.filter((score) => !score.finite || !score.inRange);
  const activeScore = scoreAudit.some((score) => score.value > 0);
  const evidenceMissing = Boolean(contract.outputContract?.evidenceRequiredWhenScored && activeScore && !hasEvidenceForContract(project, contract));

  let status = "PASS";
  if (missingInputGroups.length) status = "INSUFFICIENT_INPUT";
  else if (missingOutputGroups.length) status = "OUTPUT_MISSING";
  else if (invalidScores.length) status = "CONTRACT_FAIL";
  else if (evidenceMissing) status = "EVIDENCE_THIN";

  return {
    engineId: contract.id,
    phase: contract.phase,
    status,
    affectsFinalDecision: Boolean(contract.affectsFinalDecision),
    canBlockCandidate: Boolean(contract.canBlockCandidate),
    missingInputGroups,
    missingOutputGroups,
    invalidScores,
    evidenceMissing,
    scoreAudit,
  };
}

export function auditProjectContracts(project = {}) {
  const contracts = getEngineContracts();
  const audits = contracts.map((contract) => auditEngineContract(project, contract));
  const count = (status) => audits.filter((audit) => audit.status === status).length;
  const blockingFailures = audits.filter((audit) =>
    audit.canBlockCandidate && ["OUTPUT_MISSING", "CONTRACT_FAIL"].includes(audit.status)
  );
  const finalDecisionWarnings = audits.filter((audit) =>
    audit.affectsFinalDecision && ["INSUFFICIENT_INPUT", "OUTPUT_MISSING", "EVIDENCE_THIN"].includes(audit.status)
  );

  return {
    totalContracts: audits.length,
    pass: count("PASS"),
    evidenceThin: count("EVIDENCE_THIN"),
    insufficientInput: count("INSUFFICIENT_INPUT"),
    outputMissing: count("OUTPUT_MISSING"),
    contractFail: count("CONTRACT_FAIL"),
    blockingFailures,
    finalDecisionWarnings,
    contractPassRate: Math.round(clamp((count("PASS") / Math.max(1, audits.length)) * 100)),
    audits,
  };
}

function rawSignalScore(project = {}) {
  return Math.round(
    clamp(
      weightedAverage([
        { score: project.institutionalScore, weight: 1.2 },
        { score: project.pipelineScore, weight: 1.1 },
        { score: project.discoveryDecisionScore, weight: 1.2 },
        { score: project.alphaEvolutionGovernorScore, weight: 1.2 },
        { score: project.sniperIntegrityScore, weight: 1.3 },
        { score: project.breakoutBrainScore, weight: 1.1 },
        { score: project.quantumOpportunityScore, weight: 0.9 },
        { score: project.sourceTruthScore, weight: 0.8 },
        { score: project.organicEconomicIntegrityScore, weight: 1.0 },
        { score: project.githubProScore, weight: 0.7 },
        { score: project.catalystScore, weight: 0.7 },
        { score: project.smartMoneyAccumulationScore, weight: 0.8 },
      ])
    )
  );
}

function multiplier(score = 0, floor = 0.25, ceiling = 1.1) {
  return clamp(floor + (clamp(score) / 100) * (ceiling - floor), floor, ceiling);
}

export function buildEvidenceCalibratedScore(
  project = {},
  ledger = buildEvidenceLedger(project),
  audit = auditProjectContracts(project),
  provenance = buildInstitutionalDataProvenanceLedger(project)
) {
  const rawScore = rawSignalScore(project);
  const identityConfidence = clamp(average([project.identityResolutionScore, project.projectIdentity?.score, project.finalQualified ? 75 : 0]));
  const safetyScore = clamp(100 - riskScore(project));
  const freshnessScore = project.discoveredAt || project.lastSeenAt || ledger.items.some((item) => item.observedAt) ? 75 : 55;
  const historicalCalibration = clamp(average([project.calibrationScore, project.outcomeLearningScore, 50 + num(project.calibrationAdjustment) * 4]) || 50);
  const contractScore = audit.contractPassRate;
  const evidenceCoverageMultiplier = multiplier(ledger.evidenceCoverage, 0.25, 1.05);
  const sourceIndependenceMultiplier = multiplier(ledger.sourceIndependence, 0.35, 1.08);
  const freshnessMultiplier = multiplier(freshnessScore, 0.65, 1.05);
  const identityConfidenceMultiplier = multiplier(identityConfidence, 0.45, 1.08);
  const safetyMultiplier = multiplier(safetyScore, 0.25, 1.1);
  const calibrationMultiplier = multiplier(historicalCalibration, 0.7, 1.05);
  const contractMultiplier = multiplier(contractScore, 0.45, 1.05);
  const provenanceMultiplier = multiplier(provenance.score, 0.75, 1.06);
  const finalScore = Math.round(
    clamp(
      rawScore *
        evidenceCoverageMultiplier *
        sourceIndependenceMultiplier *
        freshnessMultiplier *
        identityConfidenceMultiplier *
        safetyMultiplier *
        calibrationMultiplier *
        contractMultiplier *
        provenanceMultiplier
    )
  );

  return {
    rawSignalScore: rawScore,
    finalScore,
    probabilityOfBreakout: Number((clamp(finalScore * 0.72 + ledger.confirmedFamilies * 2 - riskScore(project) * 0.22) / 100).toFixed(2)),
    multipliers: {
      evidenceCoverage: Number(evidenceCoverageMultiplier.toFixed(2)),
      sourceIndependence: Number(sourceIndependenceMultiplier.toFixed(2)),
      freshness: Number(freshnessMultiplier.toFixed(2)),
      identityConfidence: Number(identityConfidenceMultiplier.toFixed(2)),
      safety: Number(safetyMultiplier.toFixed(2)),
      historicalCalibration: Number(calibrationMultiplier.toFixed(2)),
      contractAudit: Number(contractMultiplier.toFixed(2)),
      provenance: Number(provenanceMultiplier.toFixed(2)),
    },
    components: {
      evidenceCoverage: ledger.evidenceCoverage,
      sourceIndependence: ledger.sourceIndependence,
      freshness: freshnessScore,
      identityConfidence,
      safetyScore,
      historicalCalibration,
      contractScore,
      provenanceScore: provenance.score,
      provenanceReadiness: provenance.institutionalReadiness,
      riskScore: riskScore(project),
    },
  };
}

export function buildFinalDecision(project = {}, scoring = {}, ledger = {}, audit = {}, provenance = {}) {
  const blockers = [];
  const warnings = [];
  const promotionRequirements = [];
  const liquidityValue = num(project.liquidityUsd ?? project.liquidity);
  const invalidationTriggers = [
    "Liquidity drops 40% from current baseline",
    "Wallet cluster risk exceeds 70",
    "Catalyst is delayed, disproven, or loses independent source confirmation",
    "Source independence falls below two usable sources",
  ];

  if (project.finalQualified === false || project.finalState === "BLOCKED") blockers.push("Existing final integrity layer blocked this project");
  if (project.identityConflict || project.symbolCollision || num(project.identityRiskScore) >= 70) blockers.push("Identity conflict or ticker collision risk");
  if (["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)) blockers.push(`Instant safety gate ${String(project.instantSafetyStatus).toLowerCase()}`);
  if (["CRITICAL", "RESTRICTED"].includes(project.organicDemandFirewallStatus)) blockers.push(`Organic demand firewall ${String(project.organicDemandFirewallStatus).toLowerCase()}`);
  if (riskScore(project) >= 80) blockers.push("Critical aggregate risk");
  if (num(project.walletClusterRiskScore) >= 70) blockers.push("Wallet cluster risk exceeds 70");
  if (num(project.washTradingRiskScore) >= 70) blockers.push("Wash trading risk exceeds 70");
  if (liquidityValue <= 0 && !project.discoveryLane?.includes("prelaunch")) warnings.push("Liquidity depth not validated");
  else if (liquidityValue > 0 && liquidityValue < 250000 && !project.discoveryLane?.includes("prelaunch")) warnings.push("Liquidity below execution threshold");
  if (ledger.uniqueSourceCount < 2) warnings.push("Fewer than two independent evidence sources");
  if (ledger.confirmedFamilies < 4) warnings.push("Fewer than four confirmed evidence families");
  if (audit.contractPassRate < 50) warnings.push("Engine contract pass rate below 50%");
  if (audit.blockingFailures?.length) blockers.push("Blocking engine contract failed");
  if (provenance.institutionalReadiness === "BLOCKED") blockers.push("Institutional data provenance blocked this project");
  if (num(provenance.score) > 0 && num(provenance.score) < 60) warnings.push("Institutional provenance score is below promotion quality");
  if ((provenance.blockers || []).length) warnings.push(...provenance.blockers.slice(0, 3));

  if (!project.address && !project.pairAddress && !project.projectIdentity) {
    promotionRequirements.push("Resolve token, pool, or project identity");
  }
  if (liquidityValue < 250000) {
    promotionRequirements.push("Confirm active liquidity above $250k or mark as prelaunch research only");
  }
  if (ledger.uniqueSourceCount < 3) promotionRequirements.push("Add at least three independent evidence sources");
  if (!project.purchaseRouteConfirmed && !project.smallCapHunter?.purchaseRoute?.purchasable) {
    promotionRequirements.push("Verify Coinbase or MetaMask purchase route before any execution-grade label");
  }
  if (!["PASS", "WATCH"].includes(project.organicDemandFirewallStatus || "WATCH")) {
    promotionRequirements.push("Pass organic buyer and demand integrity firewall");
  }
  if (num(provenance.score) > 0 && num(provenance.score) < 68) {
    promotionRequirements.push("Raise institutional data provenance score above 68");
  }
  if (["INSUFFICIENT_PROVENANCE", "DEGRADED_USABLE"].includes(provenance.institutionalReadiness)) {
    promotionRequirements.push("Resolve provenance warnings before institutional promotion");
  }

  const forceResearchOnly =
    promotionRequirements.some((requirement) => requirement.startsWith("Resolve token")) ||
    (liquidityValue <= 0 && !project.discoveryLane?.includes("prelaunch")) ||
    ledger.uniqueSourceCount < 2;

  let finalDecision = "INSUFFICIENT_DATA";
  if (blockers.length) finalDecision = "BLOCKED";
  else if (scoring.finalScore >= 80 && scoring.probabilityOfBreakout >= 0.55 && warnings.length <= 1 && promotionRequirements.length === 0) finalDecision = "ARMED";
  else if (forceResearchOnly && (scoring.finalScore >= 35 || ledger.evidenceCoverage >= 35)) finalDecision = "RESEARCH_ONLY";
  else if (scoring.finalScore >= 62 && ledger.confirmedFamilies >= 4) finalDecision = "WATCH";
  else if (scoring.finalScore >= 35 || ledger.evidenceCoverage >= 35) finalDecision = "RESEARCH_ONLY";

  return {
    finalDecision,
    finalScore: scoring.finalScore,
    probabilityOfBreakout: scoring.probabilityOfBreakout,
    confidence:
      scoring.finalScore >= 80 && warnings.length <= 1
        ? "High"
        : scoring.finalScore >= 60 && warnings.length <= 3
        ? "Medium"
        : scoring.finalScore >= 35
        ? "Developing"
        : "Low",
    position:
      finalDecision === "ARMED"
        ? "Paper-watch eligible after manual verification"
        : finalDecision === "WATCH"
        ? "Watchlist only"
        : finalDecision === "RESEARCH_ONLY"
        ? "Research only"
        : "Do not promote",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    promotionRequirements: [...new Set(promotionRequirements)],
    invalidationTriggers,
  };
}

function contradictionSeverity(contradictions = []) {
  return contradictions.reduce((max, contradiction) => {
    const severity =
      contradiction.severity === "CRITICAL" ? 100 :
      contradiction.severity === "HIGH" ? 75 :
      contradiction.severity === "MEDIUM" ? 50 :
      contradiction.severity === "LOW" ? 25 :
      0;
    return Math.max(max, severity);
  }, 0);
}

function buildContradictionMap(project = {}, scoring = {}, ledger = {}, audit = {}, decision = {}) {
  const contradictions = [];
  const liquidityValue = num(project.liquidityUsd ?? project.liquidity);
  const narrativeStrength = average([project.narrativeScore, project.narrativeForecastScore, project.narrativeHeatScore, project.xSocialScore]);
  const marketProof = average([project.liquidityScore, project.activeLiquidityTruthScore, project.organicBuyerScore, project.sourceTruthScore]);
  const developmentProof = average([project.githubProScore, project.githubScore, project.developerActivityScore]);
  const safetyRisk = riskScore(project);

  if (scoring.rawSignalScore >= 78 && scoring.finalScore <= 45) {
    contradictions.push({
      type: "RAW_SCORE_COLLAPSE",
      severity: "HIGH",
      message: "Raw signal score is strong, but evidence-calibrated score collapsed after confidence and safety multipliers.",
    });
  }
  if (narrativeStrength >= 78 && marketProof < 45) {
    contradictions.push({
      type: "NARRATIVE_WITHOUT_MARKET_PROOF",
      severity: "HIGH",
      message: "Narrative heat is strong while liquidity, buyer, and source proof are weak.",
    });
  }
  if (developmentProof >= 78 && liquidityValue <= 0 && !project.discoveryLane?.includes("prelaunch")) {
    contradictions.push({
      type: "BUILDER_SIGNAL_WITHOUT_MARKET_PROOF",
      severity: "MEDIUM",
      message: "Builder evidence is strong, but no live liquidity is validated.",
    });
  }
  if (project.sniperState === "ARMED" && decision.finalDecision !== "ARMED") {
    contradictions.push({
      type: "SNIPER_ARMED_BUT_KERNEL_NOT_ARMED",
      severity: "MEDIUM",
      message: "Sniper layer appears armed, but the kernel did not clear final promotion.",
    });
  }
  if (decision.finalDecision === "ARMED" && ledger.uniqueSourceCount < 3) {
    contradictions.push({
      type: "ARMED_WITH_THIN_SOURCE_STACK",
      severity: "HIGH",
      message: "ARMED decision has fewer than three independent evidence sources.",
    });
  }
  if (
    decision.finalDecision === "ARMED" &&
    (audit.finalDecisionWarnings?.length >= 3 || num(audit.contractPassRate) < 80)
  ) {
    contradictions.push({
      type: "ARMED_WITH_CONTRACT_WARNINGS",
      severity: "MEDIUM",
      message: "ARMED decision still has final-decision contract warnings.",
    });
  }
  if (scoring.rawSignalScore >= 75 && safetyRisk >= 65) {
    contradictions.push({
      type: "HIGH_ALPHA_HIGH_RISK",
      severity: safetyRisk >= 80 ? "CRITICAL" : "HIGH",
      message: "High alpha score coexists with elevated safety or manipulation risk.",
    });
  }
  if (project.finalSelectionState && project.finalSelectionState !== "QUALIFIED" && scoring.rawSignalScore >= 70) {
    contradictions.push({
      type: "SELECTION_LAYER_CONFLICT",
      severity: "HIGH",
      message: `Final selection state is ${project.finalSelectionState}, but raw alpha score remains high.`,
    });
  }

  return {
    count: contradictions.length,
    maxSeverity: contradictionSeverity(contradictions),
    contradictions,
  };
}

function inferMarketRegime(project = {}, ledger = {}, scoring = {}) {
  const risk = riskScore(project);
  const liquidityValue = num(project.liquidityUsd ?? project.liquidity);
  const sourceDepth = ledger.uniqueSourceCount;
  const narrative = average([project.narrativeScore, project.narrativeForecastScore, project.narrativeHeatScore, project.xSocialScore]);
  const fundamentals = average([
    project.githubProScore,
    project.developerActivityScore,
    project.organicBuyerScore,
    project.activeLiquidityTruthScore,
    project.catalystScore,
  ]);

  if (risk >= 70) return "RISK_OFF";
  if (liquidityValue > 0 && liquidityValue < 100000 && narrative >= 70 && fundamentals < 55) return "THIN_LIQUIDITY_HYPE";
  if (sourceDepth >= 4 && fundamentals >= 65 && scoring.finalScore >= 65) return "EVIDENCE_RISK_ON";
  if (sourceDepth < 2 || ledger.evidenceCoverage < 35) return "LOW_VISIBILITY";
  if (narrative >= 65 && fundamentals >= 55) return "SELECTIVE_RISK_ON";
  return "SELECTIVE";
}

function confidenceBand(scoring = {}, ledger = {}, audit = {}, contradictionMap = {}) {
  const uncertainty = clamp(
    28 -
      ledger.evidenceCoverage * 0.12 -
      ledger.uniqueSourceCount * 1.4 -
      audit.contractPassRate * 0.06 +
      contradictionMap.maxSeverity * 0.12,
    5,
    34
  );

  return {
    low: Math.round(clamp(scoring.finalScore - uncertainty)),
    high: Math.round(clamp(scoring.finalScore + uncertainty)),
    uncertainty: Math.round(uncertainty),
    quality:
      uncertainty <= 10 ? "Tight" :
      uncertainty <= 18 ? "Usable" :
      uncertainty <= 26 ? "Wide" :
      "Very Wide",
  };
}

function pressureModel(project = {}, scoring = {}, ledger = {}, audit = {}, contradictionMap = {}) {
  const promotionPressure = Math.round(
    clamp(
      ledger.confirmedFamilies * 7 +
        ledger.uniqueSourceCount * 4 +
        num(project.sniperState === "ARMED" ? 12 : 0) +
        num(project.autonomousCausalProjectState === "ARMED" ? 10 : 0) +
        num(project.alphaEvolutionGovernorVerdict === "Governor Promote" ? 8 : 0) +
        scoring.probabilityOfBreakout * 18
    )
  );
  const demotionPressure = Math.round(
    clamp(
      riskScore(project) * 0.7 +
        audit.finalDecisionWarnings.length * 5 +
        audit.blockingFailures.length * 12 +
        contradictionMap.maxSeverity * 0.35 +
        Math.max(0, 55 - ledger.evidenceCoverage) * 0.35
    )
  );

  return {
    promotionPressure,
    demotionPressure,
    netPressure: promotionPressure - demotionPressure,
  };
}

function brainDecisionFrom(decision = {}, scoring = {}, contradictionMap = {}, pressure = {}, band = {}) {
  if (decision.finalDecision === "BLOCKED") return "BLOCKED";
  if (contradictionMap.maxSeverity >= 100) return "BLOCKED";
  if (contradictionMap.maxSeverity >= 75 && decision.finalDecision === "ARMED" && pressure.netPressure < 20) return "WATCH";
  if (pressure.netPressure <= -25 && ["ARMED", "WATCH"].includes(decision.finalDecision)) return "RESEARCH_ONLY";
  if (band.quality === "Very Wide" && decision.finalDecision === "ARMED" && pressure.netPressure < 20) return "WATCH";
  if (decision.finalDecision === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (decision.finalDecision === "ARMED" && pressure.netPressure >= 20 && contradictionMap.maxSeverity < 75) return "ARMED";
  if (scoring.finalScore >= 82 && pressure.netPressure >= 28 && contradictionMap.maxSeverity < 75) return "ARMED";
  if (scoring.finalScore >= 62 && pressure.netPressure >= 0) return "WATCH";
  if (scoring.finalScore >= 35) return "RESEARCH_ONLY";
  return decision.finalDecision || "INSUFFICIENT_DATA";
}

export function buildAdvancedBrainKernel(project = {}, scoring = {}, ledger = {}, audit = {}, decision = {}) {
  const contradictionMap = buildContradictionMap(project, scoring, ledger, audit, decision);
  const regime = inferMarketRegime(project, ledger, scoring);
  const band = confidenceBand(scoring, ledger, audit, contradictionMap);
  const pressure = pressureModel(project, scoring, ledger, audit, contradictionMap);
  const brainDecision = brainDecisionFrom(decision, scoring, contradictionMap, pressure, band);
  const brainScore = Math.round(
    clamp(
      scoring.finalScore +
        pressure.netPressure * 0.12 -
        contradictionMap.maxSeverity * 0.08 +
        (regime === "EVIDENCE_RISK_ON" ? 4 : 0) -
        (regime === "THIN_LIQUIDITY_HYPE" ? 8 : 0)
    )
  );

  return {
    version: "advanced-brain-kernel-v2",
    brainDecision,
    brainScore,
    regime,
    confidenceBand: band,
    pressure,
    contradictionMap,
    metacognition: {
      isDecisionTight: band.quality === "Tight" || band.quality === "Usable",
      canPromote: ["ARMED", "WATCH"].includes(brainDecision) && contradictionMap.maxSeverity < 75,
      shouldDemote: brainDecision !== decision.finalDecision,
      primaryDoubt:
        contradictionMap.contradictions[0]?.message ||
        (band.quality === "Very Wide" ? "Decision confidence band is too wide." : "No major contradiction detected."),
      strongestSupport:
        ledger.families
          .filter((family) => family.status === "confirmed")
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((family) => `${family.family}:${family.score}`),
    },
  };
}

export function analyzeEvidenceCalibratedProject(project = {}, options = {}) {
  const ledger = buildEvidenceLedger(project);
  const audit = auditProjectContracts(project);
  const provenance = buildInstitutionalDataProvenanceLedger(project, {
    now: options.now,
  });
  const scoring = buildEvidenceCalibratedScore(project, ledger, audit, provenance);
  const decision = buildFinalDecision(project, scoring, ledger, audit, provenance);
  const advancedBrain = buildAdvancedBrainKernel(project, scoring, ledger, audit, decision);

  return {
    projectId: project.projectId || project.identityKey || `${project.chain || "unknown"}:${compactName(project)}`,
    name: project.name || compactName(project),
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    source: project.source || "unknown",
    symbolIdentity: project.symbolIdentity || project.projectIdentity?.symbolIdentity || null,
    symbolIdentityId: project.symbolIdentityId || project.projectIdentity?.symbolIdentityId || null,
    chainSymbolIdentityId: project.chainSymbolIdentityId || project.projectIdentity?.chainSymbolIdentityId || null,
    symbolInstanceId: project.symbolInstanceId || project.projectIdentity?.symbolInstanceId || null,
    ledger,
    provenance,
    contractAudit: {
      totalContracts: audit.totalContracts,
      pass: audit.pass,
      evidenceThin: audit.evidenceThin,
      insufficientInput: audit.insufficientInput,
      outputMissing: audit.outputMissing,
      contractFail: audit.contractFail,
      contractPassRate: audit.contractPassRate,
      blockingFailures: audit.blockingFailures.map((item) => item.engineId),
      finalDecisionWarnings: audit.finalDecisionWarnings.map((item) => ({
        engineId: item.engineId,
        status: item.status,
      })),
      audits: audit.audits,
    },
    scoring,
    decision: {
      ...decision,
      brainDecision: advancedBrain.brainDecision,
      brainScore: advancedBrain.brainScore,
      brainRegime: advancedBrain.regime,
      brainDemoted: advancedBrain.brainDecision !== decision.finalDecision,
    },
    advancedBrain,
  };
}

export function buildSourceHealthKernel(analyzedProjects = [], meta = {}) {
  const discovery = meta.discovery || {};
  const sourceReports = discovery.sourceReports || meta.sourceReports || {};
  const sourceManifest = summarizeSourceManifest();
  const sourceEvidenceCounts = analyzedProjects.reduce((acc, project) => {
    for (const source of project.ledger?.uniqueSources || []) {
      const key = normalizeSource(source);
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});
  const directEntries = sourceReportEntries(sourceReports, sourceEvidenceCounts);
  const providerEntries = Object.entries(sourceReports).flatMap(([source, report]) =>
    providerEntriesFromHealth(source, report?.providerHealth)
  );
  const entries = [...directEntries, ...providerEntries];
  const attempted = entries.filter((entry) => !["SKIPPED", "UNKNOWN"].includes(entry.runtimeState));
  const countState = (states = []) => entries.filter((entry) => states.includes(entry.runtimeState)).length;
  let routerSummary = discovery.sourceRouterReport || null;

  if (!routerSummary) {
    try {
      routerSummary = summarizeSourceRouter();
    } catch (error) {
      routerSummary = {
        status: "UNAVAILABLE",
        error: error.message,
      };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourcesConfigured: sourceManifest.totalSources,
    sourcesImplemented: sourceManifest.implementedSources,
    sourcesAttempted: attempted.length,
    sourcesSucceeded: countState(["SUCCEEDED"]),
    sourcesFailed: countState(["ERROR", "TIMEOUT"]),
    sourcesSkipped: countState(["SKIPPED"]),
    sourcesRateLimited: countState(["RATE_LIMIT"]),
    sourcesRegionBlocked: countState(["REGION_BLOCKED"]),
    sourcesAuthMissing: countState(["AUTH_REQUIRED"]),
    sourcesWithUsableEvidence: Object.values(sourceEvidenceCounts).filter((count) => count > 0).length,
    liveGeneratorCoveragePct:
      discovery.sourceCapabilityAudit?.liveGeneratorCoveragePct ??
      (sourceManifest.candidateGenerators
        ? Math.round((countState(["SUCCEEDED"]) / sourceManifest.candidateGenerators) * 100)
        : 0),
    providerHealth: discovery.providerHealth || null,
    circuitBreaker: {
      coolingDown: (routerSummary.sources || []).filter((source) => source.cooldownUntil).length,
      strongestSources: routerSummary.strongestSources || [],
      weakestSources: routerSummary.weakestSources || [],
      skipped: routerSummary.skipped || [],
    },
    evidenceSourceCounts: Object.entries(sourceEvidenceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    sources: entries.sort((a, b) => b.usableEvidenceCount - a.usableEvidenceCount || b.candidates - a.candidates),
    sourceManifest: getSourceManifest().map((source) => ({
      id: source.id,
      category: source.category,
      evidenceFamily: source.evidenceFamily,
      status: source.status,
      requiresKey: source.requiresKey,
      candidateGenerator: source.candidateGenerator,
      enrichmentProvider: source.enrichmentProvider,
    })),
  };
}

export function buildEngineManifestAudit() {
  const contracts = getEngineContracts();
  const pipeline = readText(path.resolve("src/intelligencePipeline.js"));
  const reportOrchestrator = readText(path.resolve("src/reports/reportOrchestrator.js"));
  const seen = new Set();
  const contractAudits = contracts.map((contract) => {
    const issues = [];
    const warnings = [];
    const modulePath = path.resolve("src", String(contract.module || "").replace(/^\.\//, ""));
    const source = readText(modulePath);
    const exports = exportedFunctions(source);
    const duplicate = seen.has(contract.id);
    seen.add(contract.id);

    if (duplicate) issues.push("duplicate contract id");
    if (!contract.id) issues.push("missing id");
    if (!contract.phase) issues.push("missing phase");
    if (!contract.module) issues.push("missing module");
    if (!contract.exportName) issues.push("missing exportName");
    if (!fs.existsSync(modulePath)) issues.push("module file missing");
    else if (!exports.includes(contract.exportName)) issues.push("exportName not found in module");
    if (!Array.isArray(contract.dependsOn)) warnings.push("dependsOn should be an array");
    if (!contract.inputContract?.requiredAny?.length) warnings.push("input contract has no required groups");
    if (!contract.outputContract?.requiredAny?.length) issues.push("output contract has no required groups");
    if (!contract.outputContract?.scoreFields?.length) warnings.push("no score fields declared");
    if (contract.outputContract?.scoreFields?.length && !contract.outputContract?.evidenceRequiredWhenScored) {
      issues.push("score fields require evidenceRequiredWhenScored");
    }
    if (!num(contract.timeoutMs)) warnings.push("timeout missing");
    if (!Number.isInteger(num(contract.retries))) warnings.push("retry policy missing");
    if (!contract.failureMode) warnings.push("failure mode missing");
    if (!pipeline.includes(path.basename(modulePath))) warnings.push("engine not directly referenced by intelligence pipeline");
    if (contract.affectsFinalDecision && !reportOrchestrator.includes("writeEvidenceCalibratedKernelReport")) {
      warnings.push("final-decision contract has no report layer reference");
    }

    return {
      id: contract.id,
      phase: contract.phase,
      priority: contract.priority,
      module: contract.module,
      exportName: contract.exportName,
      affectsFinalDecision: Boolean(contract.affectsFinalDecision),
      canBlockCandidate: Boolean(contract.canBlockCandidate),
      status: issues.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
      issues,
      warnings,
    };
  });
  const pass = contractAudits.filter((audit) => audit.status === "PASS").length;
  const warn = contractAudits.filter((audit) => audit.status === "WARN").length;
  const fail = contractAudits.filter((audit) => audit.status === "FAIL").length;

  return {
    generatedAt: new Date().toISOString(),
    totalContracts: contractAudits.length,
    pass,
    warn,
    fail,
    manifestScore: Math.round(clamp((pass + warn * 0.55) / Math.max(1, contractAudits.length) * 100)),
    status: fail ? "CONTRACT_FAILURES" : warn ? "CONTRACT_WARNINGS" : "PASS",
    contracts: contractAudits,
  };
}

function kernelAuditBaseProject() {
  const evidence = getEngineContracts().map((contract) => ({
    engine: contract.id,
    source: contract.id,
    family: contract.phase,
    signal: `${contract.id} fixture evidence`,
    score: 84,
    confidence: 0.84,
    observedAt: new Date().toISOString(),
  }));

  return {
    name: "Kernel Fixture Alpha",
    symbol: "KFIX",
    chain: "base",
    address: "0xfixturealpha",
    pairAddress: "0xfixturepair",
    source: "dexscreener",
    discoverySources: ["dexscreener", "github", "coingecko", "native-discovery-mesh"],
    discoveredAt: new Date().toISOString(),
    projectIdentity: { score: 90 },
    projectIdentityVerdict: "Identity Resolved",
    identityResolutionScore: 90,
    identityRiskScore: 4,
    sourceTruthScore: 86,
    sourceTruthVerdict: "Verified Source Stack",
    sourceTruth: { sources: [{ source: "dexscreener" }, { source: "github" }, { source: "coingecko" }] },
    liquidityUsd: 900000,
    volume24h: 200000,
    activeLiquidityTruthScore: 84,
    activeLiquidityTruthVerdict: "Usable Exit Liquidity Confirmed",
    organicBuyerScore: 80,
    organicBuyerVerdict: "Organic Buyer Signal",
    buyerRetentionScore: 76,
    holderGrowthScore: 74,
    walletClusterScore: 78,
    walletClusterRiskScore: 8,
    walletClusterVerdict: "Clean Wallet Cluster",
    smartWalletScore: 76,
    smartWalletArrivalScore: 74,
    smartMoneyAccumulationScore: 78,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 92,
    instantSafetyRiskScore: 4,
    organicDemandFirewallStatus: "PASS",
    organicDemandFirewallScore: 86,
    organicDemandVerdict: "Organic Demand Confirmed",
    organicEconomicIntegrityScore: 84,
    economicIntegrityRiskScore: 8,
    githubRepo: "fixture/alpha",
    githubProScore: 78,
    githubProVerdict: "Healthy Builder Signal",
    developerActivityScore: 76,
    roadmap: "mainnet, exchange routing, integrations",
    description: "Fixture project with full evidence",
    roadmapProfitabilityScore: 76,
    roadmapCatalystVerdict: "bullish",
    roadmapMilestones: [{ title: "mainnet" }],
    catalystScore: 78,
    catalystCalendarScore: 74,
    narrativeScore: 77,
    narrativeForecastScore: 76,
    narrativeHeatScore: 73,
    discoveryPriorityScore: 84,
    discoveryDecisionScore: 86,
    discoveryDecisionTier: "PASS",
    sniperEvidenceFamilySummary: { liquidity: { score: 82, evidence: ["usable liquidity"] } },
    sniperEvidenceConfidence: 86,
    sniperState: "ARMED",
    sniperIntegrityScore: 88,
    sniperIntegrityBlockers: [],
    purchaseRouteConfirmed: true,
    executionTwinVerdict: "Route Verified",
    executionTwinScore: 84,
    alphaEvolutionGovernorScore: 86,
    alphaEvolutionGovernorVerdict: "Governor Promote",
    pipelineScore: 88,
    institutionalScore: 86,
    finalQualified: true,
    finalState: "PROMOTED",
    calibrationScore: 72,
    outcomeLearningScore: 70,
    riskScore: 6,
    trapRiskScore: 4,
    sellPressureScore: 16,
    evidence,
  };
}

export function runKernelFixtureAudit(options = {}) {
  const base = kernelAuditBaseProject();
  // Fixture timestamps are intentionally fixed, so the audit must use a fixed clock too.
  const now = options.now || base.discoveredAt || new Date().toISOString();
  const fixtures = [
    {
      fixture: "clean winner",
      project: base,
      expectation: (decision) => decision.finalDecision === "ARMED",
    },
    {
      fixture: "fake-volume trap",
      project: {
        ...base,
        symbol: "FVOL",
        washTradingRiskScore: 86,
        riskScore: 84,
        evidence: [{ engine: "volume", source: "social", family: "narrative", signal: "huge reported volume", score: 92 }],
      },
      expectation: (decision) => decision.finalDecision === "BLOCKED",
    },
    {
      fixture: "missing identity",
      project: {
        ...base,
        symbol: "MISSID",
        address: null,
        pairAddress: null,
        projectIdentity: null,
        identityResolutionScore: 0,
      },
      expectation: (decision) => decision.finalDecision !== "ARMED",
    },
    {
      fixture: "duplicate ticker",
      project: {
        ...base,
        symbol: "DUP",
        identityConflict: true,
        identityRiskScore: 88,
      },
      expectation: (decision) => decision.finalDecision === "BLOCKED",
    },
    {
      fixture: "low-liquidity hype",
      project: {
        ...base,
        symbol: "HYPE",
        liquidityUsd: 12000,
        narrativeScore: 96,
        pipelineScore: 94,
      },
      expectation: (decision) => decision.finalDecision !== "ARMED",
    },
    {
      fixture: "strong GitHub but no market proof",
      project: {
        ...base,
        symbol: "GITHUB",
        liquidityUsd: 0,
        volume24h: 0,
        activeLiquidityTruthScore: 0,
        githubProScore: 95,
        discoverySources: ["github"],
      },
      expectation: (decision) => decision.finalDecision !== "ARMED",
    },
    {
      fixture: "new native pool",
      project: {
        ...base,
        symbol: "NATIVE",
        source: "native-discovery-mesh",
        discoverySources: ["native-discovery-mesh", "dexscreener", "base-rpc"],
        liquidityUsd: 280000,
      },
      expectation: (decision) => ["ARMED", "WATCH", "RESEARCH_ONLY"].includes(decision.finalDecision),
    },
    {
      fixture: "late pump",
      project: {
        ...base,
        symbol: "LATE",
        riskScore: 58,
        sellPressureScore: 64,
        catalystScore: 20,
      },
      expectation: (decision) => decision.finalDecision !== "ARMED",
    },
    {
      fixture: "quiet accumulation",
      project: {
        ...base,
        symbol: "QUIET",
        volume24h: 45000,
        smartWalletScore: 86,
        narrativeHeatScore: 38,
      },
      expectation: (decision) => ["ARMED", "WATCH", "RESEARCH_ONLY"].includes(decision.finalDecision),
    },
    {
      fixture: "symbol collision across chains",
      project: {
        ...base,
        symbol: "COLLIDE",
        chain: "unknown",
        symbolCollision: true,
      },
      expectation: (decision) => decision.finalDecision === "BLOCKED",
    },
  ];
  const results = fixtures.map((fixture) => {
    const analyzed = analyzeEvidenceCalibratedProject(fixture.project, { now });
    const passed = fixture.expectation(analyzed.decision, analyzed);

    return {
      fixture: fixture.fixture,
      passed,
      finalDecision: analyzed.decision.finalDecision,
      finalScore: analyzed.decision.finalScore,
      blockers: analyzed.decision.blockers,
      warnings: analyzed.decision.warnings,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalFixtures: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed),
    results,
  };
}

export function buildLearningLoopKernel(projects = []) {
  const performance = analyzeSignalPerformance(projects, [
    "finalScore",
    "pipelineScore",
    "institutionalScore",
    "discoveryDecisionScore",
    "sniperIntegrityScore",
    "sourceTruthScore",
    "activeLiquidityTruthScore",
    "organicEconomicIntegrityScore",
    "walletClusterScore",
    "githubProScore",
    "roadmapProfitabilityScore",
    "catalystScore",
    "narrativeScore",
    "smartMoneyAccumulationScore",
    "riskScore",
  ]);

  return {
    generatedAt: new Date().toISOString(),
    tracks: [
      "entryTime",
      "entryPrice",
      "maxUpside7d",
      "maxUpside30d",
      "maxDrawdown7d",
      "liquidityAtEntry",
      "liquidityAtExit",
      "timeToBreakout",
      "earlyOrLateSignal",
      "engineWasRight",
      "engineWasMisleading",
    ],
    sampleCount: performance.sampleCount,
    strongestSignals: performance.strongestSignals,
    weakestSignals: performance.weakestSignals,
    enginePerformanceMemorySchema: {
      engineId: "smartWalletArrival",
      sampleSize: 0,
      precision: 0,
      recall: 0,
      falsePositiveRate: 0,
      bestMarketRegime: "unknown",
      worstMarketRegime: "unknown",
      currentWeight: 1,
    },
  };
}

export function analyzeEvidenceCalibratedKernel(projects = [], meta = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects
    .map((project) => analyzeEvidenceCalibratedProject(project, { now: meta.now || meta.completedAt }))
    .sort((a, b) => b.decision.finalScore - a.decision.finalScore);
  const count = (decision) => analyzed.filter((project) => project.decision.finalDecision === decision).length;
  const brainCount = (decision) => analyzed.filter((project) => project.advancedBrain?.brainDecision === decision).length;
  const provenanceCount = (status) => analyzed.filter((project) => project.provenance?.institutionalReadiness === status).length;
  const contracts = getEngineContracts();
  const phaseGraph = contracts.reduce((acc, contract) => {
    acc[contract.phase] = acc[contract.phase] || [];
    acc[contract.phase].push({
      id: contract.id,
      priority: contract.priority,
      dependsOn: contract.dependsOn || [],
      canBlockCandidate: contract.canBlockCandidate,
      affectsFinalDecision: contract.affectsFinalDecision,
    });
    return acc;
  }, {});
  const opReadiness = meta.discovery?.opModeReadiness || meta.opModeReadiness || null;
  const sourceHealth = buildSourceHealthKernel(analyzed, meta);
  const engineManifestAudit = buildEngineManifestAudit();
  const fixtureAudit = runKernelFixtureAudit({ now: meta.now || meta.completedAt });
  const learningLoop = buildLearningLoopKernel(safeProjects);

  return {
    generatedAt: new Date().toISOString(),
    name: "Evidence-Calibrated Parallel Intelligence Kernel",
    doctrine: [
      "No score without evidence.",
      "No final decision without provenance.",
      "No promotion without safety gates.",
      "No engine without an audit contract.",
    ],
    summary: {
      projectsAnalyzed: analyzed.length,
      armed: count("ARMED"),
      watch: count("WATCH"),
      researchOnly: count("RESEARCH_ONLY"),
      blocked: count("BLOCKED"),
      insufficientData: count("INSUFFICIENT_DATA"),
      averageFinalScore: Math.round(average(analyzed.map((project) => project.decision.finalScore))),
      averageContractPassRate: Math.round(average(analyzed.map((project) => project.contractAudit.contractPassRate))),
      averageEvidenceCoverage: Math.round(average(analyzed.map((project) => project.ledger.evidenceCoverage))),
      averageProvenanceScore: Math.round(average(analyzed.map((project) => project.provenance?.score))),
      institutionalProvenanceReady: provenanceCount("INSTITUTIONAL_READY"),
      provenanceReviewReady: provenanceCount("REVIEW_READY"),
      provenanceBlocked: provenanceCount("BLOCKED"),
      sourcesConfigured: sourceHealth.sourcesConfigured,
      sourcesSucceeded: sourceHealth.sourcesSucceeded,
      sourcesWithUsableEvidence: sourceHealth.sourcesWithUsableEvidence,
      manifestScore: engineManifestAudit.manifestScore,
      fixtureAuditPassRate: Math.round(clamp((fixtureAudit.passed / Math.max(1, fixtureAudit.totalFixtures)) * 100)),
      opModeStatus: opReadiness?.status || "UNKNOWN",
      opModeScore: opReadiness?.score ?? null,
      brain: {
        armed: brainCount("ARMED"),
        watch: brainCount("WATCH"),
        researchOnly: brainCount("RESEARCH_ONLY"),
        blocked: brainCount("BLOCKED"),
        insufficientData: brainCount("INSUFFICIENT_DATA"),
        demotions: analyzed.filter((project) => project.decision.brainDemoted).length,
        averageBrainScore: Math.round(average(analyzed.map((project) => project.advancedBrain?.brainScore))),
        averageUncertainty: Math.round(average(analyzed.map((project) => project.advancedBrain?.confidenceBand?.uncertainty))),
        highContradictionCount: analyzed.filter((project) => project.advancedBrain?.contradictionMap?.maxSeverity >= 75).length,
        regimes: analyzed.reduce((acc, project) => {
          const regime = project.advancedBrain?.regime || "UNKNOWN";
          acc[regime] = (acc[regime] || 0) + 1;
          return acc;
        }, {}),
      },
    },
    phaseGraph,
    engineContracts: contracts,
    engineManifestAudit,
    sourceHealth,
    learningLoop,
    fixtureAudit,
    topDecisions: analyzed.slice(0, 25),
    blocked: analyzed.filter((project) => project.decision.finalDecision === "BLOCKED").slice(0, 25),
    evidenceGaps: analyzed
      .filter((project) => project.ledger.evidenceCoverage < 45 || project.contractAudit.contractPassRate < 50 || num(project.provenance?.score) < 60)
      .slice(0, 25),
  };
}

export function writeEvidenceCalibratedKernelReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = analyzeEvidenceCalibratedKernel(projects, meta);
  const filePath = path.join(reportsDir, "evidence-kernel.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return {
    filePath,
    report,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const latestReportPath = path.resolve("reports/report.json");
  const latestReport = fs.existsSync(latestReportPath)
    ? JSON.parse(fs.readFileSync(latestReportPath, "utf8"))
    : {};
  const projects = latestReport.projects || latestReport.results || [];
  const { filePath, report } = writeEvidenceCalibratedKernelReport(projects);

  console.log(
    JSON.stringify(
      {
        filePath,
        projectsAnalyzed: report.summary.projectsAnalyzed,
        armed: report.summary.armed,
        watch: report.summary.watch,
        researchOnly: report.summary.researchOnly,
        blocked: report.summary.blocked,
        averageFinalScore: report.summary.averageFinalScore,
      },
      null,
      2
    )
  );
}
