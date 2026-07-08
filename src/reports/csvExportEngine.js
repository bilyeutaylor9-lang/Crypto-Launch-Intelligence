import fs from "fs";
import path from "path";

function clean(value = "") {
  return String(value ?? "")
    .replace(/"/g, '""')
    .replace(/\n/g, " ")
    .trim();
}

export function writeCsvReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const headers = [
    "rank",
    "name",
    "symbol",
    "chain",
    "opportunityScore",
    "marketAdjustedScore",
    "rawPipelineScore",
    "pipelineRank",
    "pipelinePercentile",
    "conviction",
    "allocationBucket",
    "watchlistPriority",
    "action",
    "xSocialScore",
    "institutionalWatchScore",
    "learningEdgeScore",
    "scoreTrend",
    "quantumOpportunityScore",
    "quantumFieldState",
    "quantumExpectedReturnPct",
    "quantumBestCaseReturnPct",
    "quantumWorstCaseReturnPct",
    "quantumPositiveProbability",
    "quantumCollapseProbability",
    "riskScore",
    "riskFlags",
    "alphaTags",
    "marketRegime",
    "confidence",
    "marketCap",
    "volume24h",
    "liquidity",
    "narrative",
    "tier",
  ];

  const rows = projects.map((p, index) => [
    index + 1,
    p.name,
    p.symbol,
    p.chain,
    p.opportunityScore ?? p.score ?? 0,
    p.marketAdjustedScore ?? p.pipelineScore ?? 0,
    p.rawPipelineScore ?? "",
    p.pipelineRank ?? index + 1,
    p.pipelinePercentile ?? "",
    p.conviction ?? "",
    p.allocationBucket ?? "",
    p.watchlistPriority ?? "",
    p.executionPlan?.action ?? "",
    p.xSocialScore ?? "",
    p.institutionalWatchScore ?? "",
    p.learningEdgeScore ?? "",
    p.projectWatchChange?.scoreTrend ?? p.institutionalLearning?.scoreTrend ?? "",
    p.quantumOpportunityScore ?? "",
    p.quantumFieldState ?? "",
    p.quantumOutcomeField?.expectedReturnPct ?? "",
    p.quantumOutcomeField?.bestCaseReturnPct ?? "",
    p.quantumOutcomeField?.worstCaseReturnPct ?? "",
    p.quantumOutcomeField?.positiveProbability ?? "",
    p.quantumOutcomeField?.collapseProbability ?? "",
    p.riskScore ?? 0,
    Array.isArray(p.riskFlags) ? p.riskFlags.join("; ") : "",
    Array.isArray(p.alphaTags) ? p.alphaTags.join("; ") : "",
    p.marketRegime ?? "",
    p.confidence ?? "",
    p.marketCap ?? "",
    p.volume24h ?? p.volume ?? "",
    p.liquidity ?? "",
    p.narrative ?? "",
    p.tier ?? "",
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((v) => `"${clean(v)}"`).join(",")),
  ].join("\n");

  const filePath = path.join(reportsDir, "opportunities.csv");
  fs.writeFileSync(filePath, csv);

  return filePath;
}
