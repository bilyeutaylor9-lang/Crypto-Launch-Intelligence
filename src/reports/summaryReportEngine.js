import fs from "fs";
import path from "path";

export function writeSummaryReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const total = projects.length;

  const ranked = [...projects].sort((a, b) => {
    const aScore = Number(a.opportunityScore ?? a.score ?? 0);
    const bScore = Number(b.opportunityScore ?? b.score ?? 0);
    return bScore - aScore;
  });

  const topProject = ranked[0];

  const avgScore =
    total === 0
      ? 0
      : ranked.reduce(
          (sum, p) => sum + Number(p.opportunityScore ?? p.score ?? 0),
          0
        ) / total;

  const strongBuy = ranked.filter(
    (p) => Number(p.opportunityScore ?? p.score ?? 0) >= 80
  );
  const marketContext = ranked[0]?.marketContext || {};
  const priorityResearch = ranked.filter((p) =>
    ["Core Watch", "Priority Research"].includes(p.allocationBucket)
  );
  const highConviction = ranked.filter((p) =>
    ["Institutional", "High"].includes(p.conviction)
  );
  const defensive = ranked.filter((p) => p.conviction === "Defensive");
  const socialSetups = ranked.filter((p) => Number(p.xSocialScore || 0) >= 65);
  const learningSetups = ranked.filter((p) => Number(p.learningEdgeScore || 0) >= 70);
  const acceleratingWatched = ranked.filter(
    (p) =>
      p.projectWatchChange?.scoreTrend === "accelerating" ||
      Number(p.institutionalLearning?.scoreDelta || 0) >= 8
  );
  const quantumUpside = ranked.filter(
    (p) =>
      Number(p.quantumOpportunityScore || 0) >= 70 &&
      Number(p.quantumOutcomeField?.collapseProbability || 0) < 35
  );
  const outcomeMemoryWinners = ranked.filter(
    (p) => Number(p.outcomeLearningScore || 0) >= 70
  );
  const trapMemoryFits = ranked.filter((p) => Number(p.outcomeTrapRisk || 0) >= 55);
  const winningCombos = ranked.filter(
    (p) =>
      Number(p.signalCombinationScore || 0) >= 70 &&
      (p.winningSignalCombinations || []).length > (p.trapSignalCombinations || []).length
  );
  const trapCombos = ranked.filter((p) => (p.trapSignalCombinations || []).length > 0);
  const calibratedEdges = ranked.filter((p) => Number(p.calibrationAdjustment || 0) >= 5);
  const calibratedWarnings = ranked.filter((p) => Number(p.calibrationAdjustment || 0) <= -5);
  const aiPriority = ranked.filter((p) => p.aiDecision === "Priority Watch");
  const aiRejected = ranked.filter((p) => p.aiDecision === "Reject");
  const externalConfirmed = ranked.filter((p) => Number(p.externalSignalScore || 0) >= 65);
  const topQuantum = quantumUpside
    .slice(0, 5)
    .map((p, index) => {
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - field ${p.quantumOpportunityScore || 0}, expected ${p.quantumOutcomeField?.expectedReturnPct || 0}%, best ${p.quantumOutcomeField?.bestCaseReturnPct || 0}%`;
    })
    .join("\n");
  const topOutcomeLearning = outcomeMemoryWinners
    .slice(0, 5)
    .map((p, index) => {
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - outcome ${p.outcomeLearningScore || 0}, win fit ${p.outcomeLearning?.estimatedWinRate || p.outcomeWinRate || 0}%, trap ${p.outcomeTrapRisk || 0}%`;
    })
    .join("\n");
  const topSignalCombos = winningCombos
    .slice(0, 5)
    .map((p, index) => {
      const combos = (p.winningSignalCombinations || [])
        .map((combo) => combo.name)
        .slice(0, 2)
        .join(" + ");
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - combo ${p.signalCombinationScore || 0}${combos ? ` - ${combos}` : ""}`;
    })
    .join("\n");
  const topCalibratedEdges = calibratedEdges
    .slice(0, 5)
    .map((p, index) => {
      const support = (p.calibrationSignals || [])
        .map((signal) => signal.label)
        .slice(0, 2)
        .join(" + ");
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - adjustment +${p.calibrationAdjustment || 0}${support ? ` - ${support}` : ""}`;
    })
    .join("\n");
  const topAIAnalyst = aiPriority
    .slice(0, 5)
    .map((p, index) => {
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - AI ${p.aiAnalystScore || 0} - ${p.aiThesis?.memo || "No memo"}`;
    })
    .join("\n");
  const researchQueue = priorityResearch
    .slice(0, 8)
    .map((p, index) => {
      const score = Number(p.opportunityScore ?? p.score ?? 0).toFixed(1);
      return `${index + 1}. ${p.name || "Unknown"} (${p.symbol || "N/A"}) - ${score} - ${p.allocationBucket || "Unbucketed"} - ${p.executionPlan?.action || "Review"}`;
    })
    .join("\n");

  const summary = `
CRYPTO LAUNCH INTELLIGENCE REPORT
Generated: ${new Date().toLocaleString()}

Projects scanned: ${total}
Market regime: ${marketContext.regime || "Unknown"}
Healthy breadth: ${marketContext.healthyBreadth ?? "N/A"}%
High-conviction breadth: ${marketContext.highConvictionBreadth ?? "N/A"}%
Average opportunity score: ${avgScore.toFixed(2)}
Strong buy candidates: ${strongBuy.length}
High-conviction candidates: ${highConviction.length}
Priority research queue: ${priorityResearch.length}
Defensive / avoid candidates: ${defensive.length}
X/social acceleration setups: ${socialSetups.length}
Positive learning-edge setups: ${learningSetups.length}
Accelerating watched projects: ${acceleratingWatched.length}
Quantum upside fields: ${quantumUpside.length}
Outcome-memory winner fits: ${outcomeMemoryWinners.length}
Outcome-memory trap fits: ${trapMemoryFits.length}
Winning signal combinations: ${winningCombos.length}
Trap signal combinations: ${trapCombos.length}
Calibrated edges: ${calibratedEdges.length}
Calibrated warnings: ${calibratedWarnings.length}
AI priority watches: ${aiPriority.length}
AI rejections: ${aiRejected.length}
External confirmations: ${externalConfirmed.length}

Top project:
${topProject ? `${topProject.name || "Unknown"} (${topProject.symbol || "N/A"})` : "None"}

Top score:
${topProject ? Number(topProject.opportunityScore ?? topProject.score ?? 0).toFixed(2) : "N/A"}

Top research queue:
${researchQueue || "None"}

Top quantum fields:
${topQuantum || "None"}

Top outcome-learning fits:
${topOutcomeLearning || "None"}

Top signal-combination setups:
${topSignalCombos || "None"}

Top calibrated edges:
${topCalibratedEdges || "None"}

Top AI analyst theses:
${topAIAnalyst || "None"}

Files generated:
- reports/report.html
- reports/report.json
- reports/opportunities.csv
- reports/quantum-field.json
- reports/outcome-calibration.json
- reports/watchlist.json
- reports/summary.txt
`.trim();

  const filePath = path.join(reportsDir, "summary.txt");
  fs.writeFileSync(filePath, summary);

  return filePath;
}
