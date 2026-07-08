import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function writeQuantumFieldReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects]
    .filter((project) => project.quantumOutcomeField)
    .sort((a, b) => {
      const aScore =
        num(a.quantumOpportunityScore) * 0.55 +
        num(a.quantumOutcomeField?.expectedReturnPct) * 0.25 -
        num(a.quantumOutcomeField?.collapseProbability) * 0.2;
      const bScore =
        num(b.quantumOpportunityScore) * 0.55 +
        num(b.quantumOutcomeField?.expectedReturnPct) * 0.25 -
        num(b.quantumOutcomeField?.collapseProbability) * 0.2;

      return bScore - aScore;
    })
    .slice(0, 100)
    .map((project, index) => ({
      rank: index + 1,
      pipelineRank: project.pipelineRank || null,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      chain: project.chain || "unknown",
      pipelineScore: project.pipelineScore || 0,
      quantumOpportunityScore: project.quantumOpportunityScore || 0,
      fieldState: project.quantumFieldState || "Unknown",
      expectedReturnPct: project.quantumOutcomeField?.expectedReturnPct || 0,
      bestCaseReturnPct: project.quantumOutcomeField?.bestCaseReturnPct || 0,
      baseCaseReturnPct: project.quantumOutcomeField?.baseCaseReturnPct || 0,
      worstCaseReturnPct: project.quantumOutcomeField?.worstCaseReturnPct || 0,
      positiveProbability: project.quantumOutcomeField?.positiveProbability || 0,
      doubleProbability: project.quantumOutcomeField?.doubleProbability || 0,
      collapseProbability: project.quantumOutcomeField?.collapseProbability || 0,
      asymmetryRatio: project.quantumOutcomeField?.asymmetryRatio || 0,
      conviction: project.conviction || "Unknown",
      allocationBucket: project.allocationBucket || "Unknown",
      alphaTags: project.alphaTags || [],
      riskFlags: project.riskFlags || [],
      thesis: project.opportunityThesis || "",
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    description:
      "Quantum outcome field scenarios are deterministic research simulations, not predictions or financial advice.",
    totalProjects: projects.length,
    projectedProjects: ranked.length,
    topFields: ranked,
  };
  const filePath = path.join(reportsDir, "quantum-field.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
