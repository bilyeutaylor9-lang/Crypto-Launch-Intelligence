import fs from "fs";
import path from "path";
import { summarizeEngineHealthFromProjects } from "../kernel/scannerVNextScoringKernel.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.finalChain || "unknown",
    legacyScore: project.legacyScore || 0,
    legacyRank: project.legacyRank || null,
    vNextScore: project.vNextScore || 0,
    vNextRank: project.vNextRank || null,
    vNextBuyRank: project.vNextBuyRank || null,
    recommendationDifference: project.recommendationDifference || "UNKNOWN",
    reasonForDifference: project.reasonForDifference || "",
    vNextRecommendation: project.vNextRecommendation || "Unknown",
    vNextConfidence: project.vNextConfidence || "Unknown",
    vNextProjectCategory: project.vNextProjectCategory || "Unknown",
    vNextMarketStage: project.vNextMarketStage || "UNKNOWN",
    vNextSafetyState: project.vNextSafetyState || "UNKNOWN",
    vNextBuyEligible: Boolean(project.vNextBuyEligible),
    evidenceCoverageScore: project.evidenceCoverageScore || 0,
    dataConfidenceScore: project.dataConfidenceScore || 0,
    uncertaintyScore: project.uncertaintyScore || 0,
    missingEvidenceCount: project.missingEvidenceCount || 0,
    staleEvidenceCount: project.staleEvidenceCount || 0,
    failedEngineCount: project.failedEngineCount || 0,
    alphaScore: project.alphaScore || 0,
    evidenceConfidenceMultiplier: project.evidenceConfidenceMultiplier || 0,
    timingMultiplier: project.timingMultiplier || 0,
    executionMultiplier: project.executionMultiplier || 0,
    explicitRiskPenalty: project.explicitRiskPenalty || 0,
    scoreFormula: project.vNextScoreFormula || {},
    familyScores: project.deduplicatedEvidenceFamilyScores || {},
    tradeQualityRatings: project.tradeQualityRatings || {},
    practicalLiquidity: project.practicalLiquidity || {},
    safetyBlockers: project.vNextSafetyBlockers || [],
    safetyWarnings: project.vNextSafetyWarnings || [],
    qualitySeparationSummary: project.qualitySeparationSummary || "",
  };
}

export function writeScannerVNextReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const analyzed = (Array.isArray(projects) ? projects : []).filter((project) => project.vNextScore !== undefined);
  const ranked = [...analyzed].sort((a, b) => num(b.vNextScore) - num(a.vNextScore));
  const report = {
    generatedAt: new Date().toISOString(),
    name: "Scanner vNext Shadow Scorecard",
    mode: analyzed[0]?.scoringPrimaryModel || "legacy",
    disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a profit guarantee.",
    operatingRules: [
      "Legacy scoring remains visible as legacyScore and legacyRank.",
      "vNext scoring groups overlapping signals into evidence families before scoring.",
      "UNKNOWN, STALE, and FAILED evidence reduces confidence instead of disappearing from the denominator.",
      "Coverage below 40% cannot become a strong recommendation.",
      "Coverage below 60% cannot become High Confidence.",
      "Coverage below 75% cannot become Institutional Confidence.",
      "Hard safety blocks cannot appear in buy-oriented rankings.",
    ],
    engineHealth: summarizeEngineHealthFromProjects(projects),
    counts: {
      analyzed: analyzed.length,
      buyEligible: analyzed.filter((project) => project.vNextBuyEligible).length,
      blocked: analyzed.filter((project) => project.vNextSafetyState === "BLOCKED").length,
      restricted: analyzed.filter((project) => project.vNextSafetyState === "RESTRICTED_RESEARCH").length,
      speculativeOnly: analyzed.filter((project) => project.vNextSafetyState === "SPECULATIVE_ONLY").length,
      lowCoverage: analyzed.filter((project) => num(project.evidenceCoverageScore) < 40).length,
      upgrades: analyzed.filter((project) => project.recommendationDifference === "VNEXT_UPGRADE").length,
      downgrades: analyzed.filter((project) => project.recommendationDifference === "VNEXT_DOWNGRADE").length,
    },
    topVNext: ranked.slice(0, 50).map(compact),
    buyEligibleRanking: ranked.filter((project) => project.vNextBuyEligible).slice(0, 25).map(compact),
    largestDowngrades: [...analyzed]
      .sort((a, b) => num(a.vNextScore) - num(a.legacyScore) - (num(b.vNextScore) - num(b.legacyScore)))
      .slice(0, 25)
      .map(compact),
    largestUpgrades: [...analyzed]
      .sort((a, b) => num(b.vNextScore) - num(b.legacyScore) - (num(a.vNextScore) - num(a.legacyScore)))
      .slice(0, 25)
      .map(compact),
    lowCoverageWatchlist: analyzed
      .filter((project) => num(project.evidenceCoverageScore) < 40)
      .sort((a, b) => num(b.legacyScore) - num(a.legacyScore))
      .slice(0, 25)
      .map(compact),
    hardBlocked: analyzed
      .filter((project) => project.vNextSafetyState === "BLOCKED")
      .sort((a, b) => num(b.legacyScore) - num(a.legacyScore))
      .slice(0, 25)
      .map(compact),
  };
  const filePath = path.join(reportsDir, "scanner-vnext.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
