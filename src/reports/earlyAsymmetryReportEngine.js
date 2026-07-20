import fs from "fs";
import path from "path";
import { analyzeEarlyOpportunityOutcomes } from "../learning/earlyOpportunityOutcomeLab.js";

function writeJson(fileName = "", payload = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function base(projects = [], extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: "PASS",
    warnings: [],
    limitations: ["Early asymmetry rank is research priority only and is not a calibrated probability or financial advice."],
    sampleSize: projects.length,
  };
}

function compact(project = {}, index = 0) {
  return {
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalAliases?.chain || null,
    marketCap: project.circulatingMarketCapUsd ?? project.marketCap ?? null,
    liquidity: project.liquidityUsd ?? project.dexLiquidityUsd ?? null,
    rawScore: project.earlyAsymmetryResearchPriorityRawScore || 0,
    finalResearchPriorityScore: project.earlyAsymmetryResearchPriorityScore || 0,
    coveragePct: project.earlyAsymmetryCoveragePct || 0,
    confidenceState: project.earlyAsymmetryConfidenceState || "UNKNOWN",
    timingState: project.preBreakoutTimingState || "UNKNOWN",
    independentEvidenceFamilies: project.earlyAsymmetryIndependentEvidenceFamilies || [],
    correlatedEvidenceFamilies: project.earlyAsymmetryCorrelatedEvidenceFamilies || [],
    missingEvidence: project.earlyAsymmetryMissingEvidence || [],
    topPositiveDrivers: project.earlyAsymmetryTopPositiveDrivers || [],
    topNegativeDrivers: project.earlyAsymmetryTopNegativeDrivers || [],
    researchEligible: project.researchEligible === true,
    executionReady: project.executionReady === true,
  };
}

export function writeEarlyAsymmetryReport(projects = [], extra = {}) {
  const ranking = projects
    .slice()
    .sort((a, b) => (b.earlyAsymmetryResearchPriorityScore || 0) - (a.earlyAsymmetryResearchPriorityScore || 0))
    .map(compact);
  const earlyPath = writeJson("early-asymmetry-ranking.json", {
    ...base(projects, extra),
    ranking,
    topResearchCandidates: ranking.slice(0, 100),
  });
  const sequencePath = writeJson("pre-breakout-sequence-analysis.json", {
    ...base(projects, extra),
    byTimingState: projects.reduce((acc, project) => {
      const state = project.preBreakoutTimingState || "UNKNOWN";
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {}),
    projects: projects
      .slice()
      .sort((a, b) => (b.preBreakoutSequenceScore || 0) - (a.preBreakoutSequenceScore || 0))
      .slice(0, 250)
      .map((project) => ({
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || project.canonicalAliases?.chain || null,
        timingState: project.preBreakoutTimingState || "UNKNOWN",
        score: project.preBreakoutSequenceScore || 0,
        priceExtension: project.priceExtension || 0,
        constructiveAcceleration: project.constructiveAcceleration || 0,
        compression: project.compression || 0,
      })),
  });
  const outcomesPath = writeJson("early-opportunity-outcomes.json", {
    ...base(projects, extra),
    outcomes: analyzeEarlyOpportunityOutcomes(projects, extra),
  });
  return {
    filePath: earlyPath,
    preBreakoutSequencePath: sequencePath,
    earlyOpportunityOutcomesPath: outcomesPath,
    report: { ranking },
  };
}
