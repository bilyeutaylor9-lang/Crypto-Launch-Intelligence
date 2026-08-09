import fs from "fs";
import path from "path";

function ensureReportsDir() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function writeJson(reportsDir = "reports", fileName = "", value = {}) {
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

export function buildSelectionLaneAudit(plan = {}) {
  const report = plan.report || {};
  return {
    generatedAt: new Date().toISOString(),
    policy: report.policy,
    allocation: report.allocation || {},
    selectedByReason: report.selectedByReason || {},
    selectedByChain: report.selectedByChain || {},
    selectedBySource: report.selectedBySource || {},
    selectedByNarrative: report.selectedByNarrative || {},
    selectedByLifecycle: report.selectedByLifecycle || {},
    selectedByMarketCapGroup: report.selectedByMarketCapGroup || {},
    selectedByEvidenceFamily: report.selectedByEvidenceFamily || {},
    concentration: report.concentration || {},
    note: "Concentration above 35% is reported for review. It is not automatically treated as failure because the eligible universe may itself be concentrated.",
  };
}

export function buildCandidateRescueReport(plan = {}) {
  return {
    generatedAt: new Date().toISOString(),
    rescuedCount: (plan.rescued || []).length,
    rescuedCandidates: (plan.rescued || []).slice(0, 500).map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      originalCompositeRank: project.standardSelectionCompositeRank || null,
      newStage: project.standardSelectionReason || "STANDARD",
      rescueReason: project.standardSelectionRescueReason || "reserve lane selection",
      score: project.preIntelligenceOpportunityScore || 0,
      components: project.preIntelligenceComponents || {},
      evidence: project.preIntelligenceSignals || {},
    })),
    hardSafetyPolicy: "Rescue does not bypass confirmed pre-intelligence hard dangers or later final safety gates.",
  };
}

export function buildStandardSelectionReport(plan = {}) {
  return {
    generatedAt: new Date().toISOString(),
    status: "PASS",
    funnel: plan.report?.funnel || {},
    allocation: plan.report?.allocation || {},
    policy: plan.report?.policy || "",
    selectedCount: plan.selected?.length || 0,
    advancedCount: plan.advanced?.length || 0,
    deepCount: plan.deep?.length || 0,
    crawlerCount: plan.crawler?.length || 0,
    llama3Count: plan.llama3?.length || 0,
    debateCount: plan.debate?.length || 0,
    finalistCount: plan.finalists?.length || 0,
    preIntelligenceLeader: plan.preIntelligenceLeader || plan.winner
      ? {
          name: (plan.preIntelligenceLeader || plan.winner).name || "Unknown",
          symbol: (plan.preIntelligenceLeader || plan.winner).symbol || "UNKNOWN",
          chain: (plan.preIntelligenceLeader || plan.winner).chain || "unknown",
          score: (plan.preIntelligenceLeader || plan.winner).preIntelligenceOpportunityScore || 0,
          reason: (plan.preIntelligenceLeader || plan.winner).standardSelectionReason || "",
          status: "PRELIMINARY_RESEARCH_ROUTING_ONLY",
        }
      : null,
    stageLeaders: plan.report?.stageLeaders || {},
    disclaimer: "This is a preliminary selection audit for research routing, not a capital candidate or buy recommendation.",
  };
}

export function buildStandardExclusionsReport(plan = {}) {
  const shadow = plan.shadowAudit || {};
  return {
    generatedAt: new Date().toISOString(),
    selectedCount: shadow.selectedCount || 0,
    excludedCount: shadow.excludedCount || 0,
    top250ExcludedBySelectionScore: shadow.topExcluded || [],
    randomEligibleExclusionSample: shadow.randomSample || [],
    accelerationAnomalyExclusions: shadow.accelerationAnomalies || [],
    questionsAnswered: [
      "why was each excluded project excluded?",
      "what was its score?",
      "what lane almost selected it?",
      "which evidence was missing?",
      "which selector component caused the miss?",
    ],
  };
}

export function writeCandidateSelectionAuditReports(plan = {}) {
  const reportsDir = ensureReportsDir();
  const standard4000SelectionPath = writeJson(reportsDir, "standard-4000-selection.json", buildStandardSelectionReport(plan));
  const standard4000ExclusionsPath = writeJson(reportsDir, "standard-4000-exclusions.json", buildStandardExclusionsReport(plan));
  const selectionLaneAuditPath = writeJson(reportsDir, "selection-lane-audit.json", buildSelectionLaneAudit(plan));
  const candidateRescueReportPath = writeJson(reportsDir, "candidate-rescue-report.json", buildCandidateRescueReport(plan));
  const missedOpportunityAuditPath = writeJson(reportsDir, "missed-opportunity-audit.json", {
    generatedAt: new Date().toISOString(),
    ...(plan.missedOpportunityAudit || {}),
  });

  return {
    standard4000SelectionPath,
    standard4000ExclusionsPath,
    selectionLaneAuditPath,
    candidateRescueReportPath,
    missedOpportunityAuditPath,
  };
}
