import fs from "node:fs";
import path from "node:path";

const microMode = process.argv.includes("--micro");
const reportPath = path.resolve(
  microMode ? "reports/micro-test-watchlist.json" : "reports/live-core-ranking.json"
);

if (!fs.existsSync(reportPath)) {
  console.error(`Missing ${reportPath}. Run the scanner first.`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const projects = microMode
  ? report.candidates || []
  : report.top10 || report.ranked?.slice(0, 10) || [];

console.log("");
console.log(microMode ? "MANUAL MICRO-TEST WATCHLIST" : "GUARDED LIVE CORE RANKING");
console.log("======================================================================");
console.log(`Generated: ${report.generatedAt || "unknown"}`);
console.log(`Scan: ${report.scanRunId || "unknown"}`);
console.log("Automatic trading: disabled");
console.log(
  `Backtest winner: ${report.policy?.winnerPublished ? report.policy.bestModel : "none; guarded canary remains unproven"}`
);
console.log("");

if (!projects.length) {
  console.log("No candidates passed the requested gate.");
  process.exit(0);
}

for (const project of projects) {
  console.log(`#${project.liveRank || "-"} ${project.name || "Unknown"} (${project.symbol || "-"})`);
  console.log(
    `  Live score: ${project.guardedLiveScore ?? "-"} | Status: ${project.liveActionStatus || "-"}`
  );
  console.log(
    `  Chain: ${project.chain || "-"} | Identity: ${project.tokenAddress || project.identityKey || "-"}`
  );
  console.log(
    `  Evidence: ${project.liveRankingCoverage ?? "-"} | Execution ready: ${project.liveExecutionReady === true ? "yes" : "no"} | Safety verified: ${project.safetyVerified === true ? "yes" : "no"}`
  );
  console.log(
    `  Route depth: $${project.routeDepthUsd ?? "-"} | Slippage: ${project.estimatedRoundTripSlippagePct ?? "-"}% | Quote age: ${project.quoteAgeSeconds ?? "-"}s`
  );
  console.log(
    `  Old score/rank: ${project.legacyProductionScore ?? "-"} / #${project.legacyRank ?? "-"}`
  );
  console.log(
    `  Experiment ceiling: ${project.microTestPlan?.maximumExperimentAllocationUsd ?? "not configured"} USD`
  );
  console.log(`  Missing: ${(project.liveRankingMissingEvidence || []).join(", ") || "none"}`);
  console.log(`  Blocks: ${(project.liveRankingBlocks || []).join(", ") || "none"}`);
  console.log("");
}

console.log("Manual research only. No automatic execution. No leverage.");
