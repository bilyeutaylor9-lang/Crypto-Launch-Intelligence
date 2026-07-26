import fs from "fs";
import path from "path";
import { HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES } from "../engines/highUpsideScalpClassificationEngine.js";

const DECISION_REPORTS = [
  {
    reportFile: "high-upside-scalp-research.json",
    fieldsConsumed: HIGH_UPSIDE_SCALP_REQUIRED_FIELD_NAMES,
    decisionsRecalculated: false,
    missingBecomesZero: false,
    possibleSilentCategories: [],
    repairPriority: "REPAIRED",
    note:
      "High-upside scalp classification is now stored by the pipeline before report compaction; the report presents stored lanes and enforces lane accounting.",
  },
  {
    reportFile: "hottest-ten-now.json",
    fieldsConsumed: [
      "hottestTenNowScore",
      "highUpsideScalpScore",
      "realUtilityScore",
      "utilityQualityScore",
      "progressiveOpportunityScore",
      "executionStatus",
      "routeTruthStatus",
    ],
    decisionsRecalculated: true,
    missingBecomesZero: true,
    possibleSilentCategories: ["confirmation gaps", "best-available fallback candidates"],
    repairPriority: "P1_AUDIT_REQUIRED",
  },
  {
    reportFile: "progressive-opportunities.json",
    fieldsConsumed: [
      "progressiveOpportunityScore",
      "finalSelectionState",
      "trustScore",
      "executionScore",
      "marketOpportunityRank",
      "preBreakoutRadarScore",
    ],
    decisionsRecalculated: true,
    missingBecomesZero: true,
    possibleSilentCategories: ["lower-priority research", "blocked projects"],
    repairPriority: "P1_AUDIT_REQUIRED",
  },
  {
    reportFile: "small-cap-hunter.json",
    fieldsConsumed: ["smallCapHunterScore", "smallCapHunterLane", "marketCap", "liquidityUsd", "executionStatus"],
    decisionsRecalculated: false,
    missingBecomesZero: false,
    possibleSilentCategories: [],
    repairPriority: "LOW",
  },
  {
    reportFile: "scalp-microstructure.json",
    fieldsConsumed: [
      "scalpMicrostructureScore",
      "scalpMicrostructureLane",
      "buyQuoteVerified",
      "sellQuoteVerified",
      "quoteAgeSeconds",
      "estimatedRoundTripSlippagePct",
    ],
    decisionsRecalculated: false,
    missingBecomesZero: false,
    possibleSilentCategories: [],
    repairPriority: "LOW",
  },
];

function atRiskFields(projects = [], fields = []) {
  const fullKeys = new Set();
  for (const project of projects) {
    Object.keys(project || {}).forEach((key) => fullKeys.add(key));
  }
  return fields.filter((field) => {
    const root = String(field || "").split(".")[0];
    return fullKeys.has(root);
  });
}

export function summarizeDecisionReportCompactionAudit(projects = [], meta = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    status: "PASS",
    objective:
      "Identify decision reports that would be unsafe if they recalculated classifications after project payload compaction.",
    projectsAnalyzed: safeProjects.length,
    reportsAudited: DECISION_REPORTS.length,
    repairedReports: DECISION_REPORTS.filter((report) => report.repairPriority === "REPAIRED").length,
    p1AuditRequired: DECISION_REPORTS.filter((report) => report.repairPriority === "P1_AUDIT_REQUIRED").length,
    reports: DECISION_REPORTS.map((report) => ({
      ...report,
      fieldsAtRiskOfRemoval: atRiskFields(safeProjects, report.fieldsConsumed),
    })),
    limitations: [
      "This audit documents risk and repair priority; it does not rewrite every decision report in this patch.",
      "High Upside Scalp is fully repaired in this patch and has lane-accounting tests.",
    ],
  };
}

function markdown(report = {}) {
  const lines = [
    "# Decision Report Compaction Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Projects analyzed: ${report.projectsAnalyzed}`,
    `Reports audited: ${report.reportsAudited}`,
    "",
  ];

  for (const item of report.reports || []) {
    lines.push(`## ${item.reportFile}`);
    lines.push(`- repairPriority: ${item.repairPriority}`);
    lines.push(`- decisionsRecalculated: ${item.decisionsRecalculated}`);
    lines.push(`- missingBecomesZero: ${item.missingBecomesZero}`);
    lines.push(`- fieldsAtRiskOfRemoval: ${item.fieldsAtRiskOfRemoval.join(", ") || "none observed"}`);
    lines.push(`- possibleSilentCategories: ${item.possibleSilentCategories.join(", ") || "none"}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function writeDecisionReportCompactionAudit(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeDecisionReportCompactionAudit(projects, meta);
  const filePath = path.join(reportsDir, "decision-report-compaction-audit.json");
  const markdownPath = path.join(reportsDir, "decision-report-compaction-audit.md");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, markdown(report));
  return { filePath, markdownPath, report };
}
