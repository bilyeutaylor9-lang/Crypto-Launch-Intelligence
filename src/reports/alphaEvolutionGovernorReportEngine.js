import fs from "fs";
import path from "path";
import { summarizeAlphaEvolutionGovernor } from "../engines/alphaEvolutionGovernorEngine.js";
import {
  loadAlphaEvolutionMemory,
  summarizeAlphaEvolutionMemory,
} from "../learning/alphaEvolutionMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactProject(project = {}, rank = 0) {
  const governor = project.alphaEvolutionGovernor || {};

  return {
    rank,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.alphaEvolutionGovernorScore || 0,
    verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
    action: governor.actionPlan?.primaryAction || "Review",
    reviewCadence: governor.actionPlan?.reviewCadence || "",
    pipelineScore: project.pipelineScore || 0,
    proofContractScore: project.proofCarryingAlphaContractScore || 0,
    proofContractVerdict: project.proofCarryingAlphaContractVerdict || "Unknown",
    outcomeJudgeScore: project.outcomeJudgeScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    riskScore: Math.max(
      num(project.trapRiskScore),
      num(project.riskScore),
      num(project.sellPressureScore),
      num(project.externalRiskScore),
      num(project.falsePositiveSimilarity)
    ),
    moduleScores: governor.moduleScores || {},
    blockers: governor.blockers || [],
    missingProof: governor.missingProof || [],
    nextSteps: governor.actionPlan?.nextSteps || [],
    upgradeDirectives: governor.upgradeDirectives || [],
    explanation: governor.explanation || "",
  };
}

function groupDirectives(projects = []) {
  const groups = new Map();

  for (const project of projects) {
    for (const directive of project.alphaEvolutionGovernor?.upgradeDirectives || []) {
      const key = directive.system || "Unknown";
      const entry = groups.get(key) || {
        system: key,
        critical: 0,
        high: 0,
        medium: 0,
        examples: [],
      };
      const priority = String(directive.priority || "Medium").toLowerCase();
      if (priority === "critical") entry.critical += 1;
      else if (priority === "high") entry.high += 1;
      else entry.medium += 1;
      if (entry.examples.length < 5) {
        entry.examples.push({
          symbol: project.symbol || "UNKNOWN",
          task: directive.task || "",
          priority: directive.priority || "Medium",
        });
      }
      groups.set(key, entry);
    }
  }

  return [...groups.values()].sort(
    (a, b) => b.critical - a.critical || b.high - a.high || b.medium - a.medium
  );
}

export function buildAlphaEvolutionGovernorReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const summary = summarizeAlphaEvolutionGovernor(safeProjects);
  const memory = summarizeAlphaEvolutionMemory(loadAlphaEvolutionMemory());
  const ranked = [...safeProjects]
    .filter((project) => project.alphaEvolutionGovernor)
    .sort((a, b) => num(b.alphaEvolutionGovernorScore) - num(a.alphaEvolutionGovernorScore));
  const topProjects = ranked.slice(0, 50).map((project, index) => compactProject(project, index + 1));
  const queue = (verdict) =>
    topProjects.filter((project) => project.verdict === verdict).slice(0, 25);

  return {
    generatedAt: new Date().toISOString(),
    name: "Alpha Evolution Governor",
    description:
      "Meta-governor that fuses alpha contracts, outcome accountability, source proof, agent alignment, discovery breadth, research completeness, risk firewall, and learning memory into one operating queue.",
    totalProjects: summary.totalProjects,
    governedProjects: summary.governedProjects,
    counts: {
      promote: summary.promote,
      priorityResearch: summary.priorityResearch,
      recheckSoon: summary.recheckSoon,
      evidenceGaps: summary.evidenceGaps,
      riskBlocks: summary.riskBlocks,
    },
    memory,
    topProjects,
    promoteQueue: queue("Governor Promote"),
    priorityResearchQueue: queue("Governor Priority Research"),
    recheckQueue: queue("Governor Recheck Soon"),
    evidenceGapQueue: queue("Governor Evidence Gap"),
    riskBlockQueue: queue("Governor Risk Block"),
    directiveLeaderboard: groupDirectives(ranked),
    operatingDoctrine: [
      "Promote only when contract, evidence, outcome, agent, source, and risk modules agree.",
      "When no setup clears promotion, surface best-available research candidates with caveats.",
      "Treat missing proof as a task queue, not as confidence.",
      "Grade old contracts and outcome memory before increasing trust.",
      "This is research software only and never financial advice.",
    ],
    commandMap: {
      report: "npm run alpha:governor",
      memory: "npm run evolution-memory",
      contracts: "npm run alpha:contracts",
      scan: "npm run scan:op",
    },
  };
}

export function writeAlphaEvolutionGovernorReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildAlphaEvolutionGovernorReport(projects);
  const filePath = path.join(reportsDir, "alpha-evolution-governor.json");
  const queuePath = path.join(reportsDir, "alpha-evolution-queue.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    queuePath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        counts: report.counts,
        promoteQueue: report.promoteQueue,
        priorityResearchQueue: report.priorityResearchQueue,
        recheckQueue: report.recheckQueue,
        evidenceGapQueue: report.evidenceGapQueue,
        riskBlockQueue: report.riskBlockQueue,
        directiveLeaderboard: report.directiveLeaderboard,
      },
      null,
      2
    )
  );

  return {
    filePath,
    queuePath,
    report,
  };
}
