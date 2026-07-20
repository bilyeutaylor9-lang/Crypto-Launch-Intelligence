import fs from "fs";
import path from "path";

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
    limitations: ["The rescue queue is research-only and cannot make a project execution-ready or buy-qualified."],
    sampleSize: projects.length,
  };
}

function compact(project = {}) {
  return {
    rescueRank: project.rescueRank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalAliases?.chain || null,
    marketCap: project.circulatingMarketCapUsd ?? project.marketCap ?? null,
    liquidity: project.liquidityUsd ?? project.dexLiquidityUsd ?? null,
    poolAge: project.poolAgeHours ?? project.poolAge ?? null,
    researchPriority: project.earlyAsymmetryResearchPriorityScore ?? project.researchPriorityScore ?? 0,
    coverage: project.earlyAsymmetryCoveragePct ?? project.engineDataReadinessScore ?? 0,
    observedEvidenceFamilies: project.observedSignals || project.earlyAsymmetryIndependentEvidenceFamilies || [],
    missingEvidence: project.missingSignals || project.earlyAsymmetryMissingEvidence || [],
    targetSource: project.targetSources?.[0] || project.targetedEnrichmentPlan?.nextSources?.[0] || null,
    reasonForRescue: project.reasonForRescue,
    reasonNotQualified: project.reasonNotQualified,
    lateChaseStatus: project.preBreakoutTimingState || "UNKNOWN",
    safetyStatus: project.instantSafetyStatus || project.safetyStatus || "UNKNOWN",
    rescueLane: project.rescueLane,
    researchOnly: project.researchOnly !== false,
  };
}

export function writeStarvationRescueQueueReport(projects = [], extra = {}) {
  const queue = projects
    .filter((project) => project.starvationRescueEligible)
    .sort((a, b) => (a.rescueRank || 999999) - (b.rescueRank || 999999))
    .map(compact);
  const report = {
    ...base(projects, extra),
    status: queue.length ? "QUEUE_READY" : "NO_RESCUE_CANDIDATES",
    rescueCandidates: queue.length,
    queue,
    top25RescueCandidates: queue.slice(0, 25),
    byLane: queue.reduce((acc, item) => {
      acc[item.rescueLane || "UNKNOWN"] = (acc[item.rescueLane || "UNKNOWN"] || 0) + 1;
      return acc;
    }, {}),
  };
  return {
    filePath: writeJson("starvation-rescue-queue.json", report),
    report,
  };
}
