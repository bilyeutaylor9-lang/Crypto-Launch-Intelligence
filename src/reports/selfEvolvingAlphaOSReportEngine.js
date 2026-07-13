import fs from "fs";
import path from "path";
import { summarizeSelfEvolvingAlphaOS } from "../engines/selfEvolvingAlphaOSEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactProject(project = {}, rank = 0) {
  return {
    rank,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.selfEvolvingAlphaOSScore || 0,
    decision: project.selfEvolvingAlphaOSDecision || "Unknown",
    confidence: project.selfEvolvingAlphaOSConfidence || "Unknown",
    pipelineScore: project.pipelineScore || 0,
    highTechAlphaScore: project.highTechAlphaScore || 0,
    breakoutBrainScore: project.breakoutBrainScore || 0,
    autonomousResearchScore: project.autonomousResearchScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    proofScore: project.proofScore || 0,
    riskScore: Math.max(
      num(project.trapRiskScore),
      num(project.sellPressureScore),
      num(project.externalRiskScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore),
      num(project.falsePositiveSimilarity)
    ),
    thesis: project.alphaThesis || null,
    identityGraph: project.selfEvolvingAlphaOS?.identityGraph || null,
    agentSociety: project.selfEvolvingAlphaOS?.agentSociety || null,
    worldModel: project.selfEvolvingAlphaOS?.worldModel || null,
    hypothesisLab: project.selfEvolvingAlphaOS?.hypothesisLab || null,
    experimentLab: project.selfEvolvingAlphaOS?.experimentLab || null,
    alphaAutopsy: project.selfEvolvingAlphaOS?.alphaAutopsy || null,
    regimeAdaptation: project.selfEvolvingAlphaOS?.regimeAdaptation || null,
    operatorPlan: project.selfEvolvingAlphaOS?.operatorPlan || null,
  };
}

export function buildSelfEvolvingAlphaOSReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const summary = summarizeSelfEvolvingAlphaOS(safeProjects);
  const ranked = [...safeProjects]
    .filter((project) => project.selfEvolvingAlphaOS)
    .sort((a, b) => num(b.selfEvolvingAlphaOSScore) - num(a.selfEvolvingAlphaOSScore));
  const topProjects = ranked.slice(0, 50).map((project, index) => compactProject(project, index + 1));

  return {
    generatedAt: new Date().toISOString(),
    name: "Self-Evolving Alpha OS",
    description:
      "Master research OS that fuses identity graph, world model, hypothesis lab, experiment lab, agent society, alpha autopsy, regime adaptation, and thesis generation.",
    totalProjects: safeProjects.length,
    scoredProjects: ranked.length,
    alphaCandidates: summary.alphaCandidates,
    priorityResearch: summary.priorityResearch,
    researchBlocks: summary.researchBlocks,
    topProject: topProjects[0] || null,
    topProjects,
    thesisBook: topProjects.slice(0, 12).map((project) => project.thesis).filter(Boolean),
    operatingDoctrine: [
      "Promote only when committee, world model, evidence, and risk controls agree.",
      "Treat every output as research, not financial advice.",
      "Run autopsy on failed candidates and reduce influence of noisy signals.",
      "Use regime adaptation so fixed weights do not dominate every market.",
      "Keep top candidates in watch memory and demand confirmation before promotion.",
    ],
    commandMap: {
      master: "npm run alpha:os",
      thesis: "npm run alpha:thesis",
      debate: "npm run alpha:debate",
      autopsy: "npm run alpha:autopsy",
      regime: "npm run alpha:regime",
      opScan: "npm run scan:op",
    },
  };
}

export function writeSelfEvolvingAlphaOSReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildSelfEvolvingAlphaOSReport(projects);
  const filePath = path.join(reportsDir, "self-evolving-alpha-os.json");
  const thesisPath = path.join(reportsDir, "alpha-theses.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    thesisPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalTheses: report.thesisBook.length,
        theses: report.thesisBook,
      },
      null,
      2
    )
  );

  return {
    filePath,
    thesisPath,
    report,
  };
}
