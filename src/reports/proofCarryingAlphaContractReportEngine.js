import fs from "fs";
import path from "path";
import { summarizeProofCarryingAlphaContracts } from "../engines/proofCarryingAlphaContractEngine.js";
import {
  loadAlphaContracts,
  summarizeAlphaContracts,
} from "../learning/alphaContractStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactContractProject(project = {}, rank = 0) {
  const contract = project.proofCarryingAlphaContract || {};

  return {
    rank,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    contractId: contract.contractId || "",
    score: project.proofCarryingAlphaContractScore || contract.scoreNow || 0,
    verdict: project.proofCarryingAlphaContractVerdict || contract.verdict || "Unknown",
    confidence: contract.confidenceNow || "Unknown",
    pipelineScore: project.pipelineScore || 0,
    proofScore: project.proofScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    highTechAlphaScore: project.highTechAlphaScore || 0,
    selfEvolvingAlphaOSScore: project.selfEvolvingAlphaOSScore || 0,
    riskScore: Math.max(
      num(project.trapRiskScore),
      num(project.riskScore),
      num(project.sellPressureScore),
      num(project.externalRiskScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore),
      num(project.falsePositiveSimilarity)
    ),
    thesis: contract.thesis || "",
    predictionWindow: contract.predictionWindow || "30d",
    reviewAt: contract.reviewAt || [],
    latestGrade: contract.latestGrade || null,
    historySummary: contract.historySummary || null,
    mustHappen: contract.mustHappen || [],
    invalidatesIf: contract.invalidatesIf || [],
    supportingEngines: contract.supportingEngines || [],
    agentVotes: contract.agentVotes || [],
    sources: contract.sources || [],
    receipt: project.alphaContractReceipt || contract.publicReceipt || null,
  };
}

function leaderboardFromItems(items = [], key = "name") {
  const counts = new Map();

  for (const item of items.filter(Boolean)) {
    const label = String(item[key] || item.engine || item.agent || item.source || item).trim();
    if (!label) continue;
    const current = counts.get(label) || { name: label, appearances: 0, totalScore: 0 };
    current.appearances += 1;
    current.totalScore += num(item.score);
    counts.set(label, current);
  }

  return [...counts.values()]
    .map((item) => ({
      name: item.name,
      appearances: item.appearances,
      averageScore: item.appearances ? Math.round(item.totalScore / item.appearances) : 0,
    }))
    .sort((a, b) => b.appearances - a.appearances || b.averageScore - a.averageScore)
    .slice(0, 25);
}

function memoryLeaderboard(contracts = []) {
  const resolved = contracts.filter((contract) => contract.status === "resolved");
  const bySymbol = new Map();

  for (const contract of contracts) {
    const symbol = contract.symbol || contract.name || "UNKNOWN";
    const entry = bySymbol.get(symbol) || {
      symbol,
      contracts: 0,
      confirmed: 0,
      failed: 0,
      invalidated: 0,
      latestScore: 0,
    };
    entry.contracts += 1;
    entry.latestScore = Math.max(entry.latestScore, num(contract.latestScore || contract.scoreNow));
    if (contract.finalGrade === "confirmed") entry.confirmed += 1;
    if (contract.finalGrade === "failed") entry.failed += 1;
    if (contract.finalGrade === "invalidated") entry.invalidated += 1;
    bySymbol.set(symbol, entry);
  }

  return {
    resolvedContracts: resolved.length,
    projectReputation: [...bySymbol.values()]
      .map((entry) => ({
        ...entry,
        winRate:
          entry.confirmed + entry.failed + entry.invalidated
            ? Math.round((entry.confirmed / (entry.confirmed + entry.failed + entry.invalidated)) * 100)
            : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.latestScore - a.latestScore)
      .slice(0, 30),
  };
}

function falsePositiveAutopsies(projects = []) {
  return projects
    .filter(
      (project) =>
        project.proofCarryingAlphaContractVerdict === "Invalidation Hit" ||
        project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated" ||
        num(project.trapRiskScore) >= 70 ||
        num(project.falsePositiveSimilarity) >= 65
    )
    .sort(
      (a, b) =>
        Math.max(num(b.trapRiskScore), num(b.falsePositiveSimilarity)) -
        Math.max(num(a.trapRiskScore), num(a.falsePositiveSimilarity))
    )
    .slice(0, 25)
    .map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      contractId: project.proofCarryingAlphaContract?.contractId || "",
      verdict: project.proofCarryingAlphaContractVerdict || "Unknown",
      latestGrade: project.proofCarryingAlphaContract?.latestGrade || null,
      trapRiskScore: project.trapRiskScore || 0,
      falsePositiveSimilarity: project.falsePositiveSimilarity || 0,
      riskFlags: project.riskFlags || [],
      invalidatesIf: project.proofCarryingAlphaContract?.invalidatesIf || [],
    }));
}

function missedWinnerReviewQueue(projects = []) {
  return projects
    .filter(
      (project) =>
        project.proofCarryingAlphaContractVerdict !== "Proof-Carrying Alpha Candidate" &&
        num(project.breakoutBrainScore) >= 70 &&
        num(project.sourceTruthScore || project.proofScore) >= 55 &&
        num(project.trapRiskScore) < 45
    )
    .sort((a, b) => num(b.breakoutBrainScore) - num(a.breakoutBrainScore))
    .slice(0, 25)
    .map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      breakoutBrainScore: project.breakoutBrainScore || 0,
      proofScore: project.proofScore || 0,
      sourceTruthScore: project.sourceTruthScore || 0,
      reason: "Breakout/proof stack is stronger than the current contract verdict.",
      researchChecklist: project.researchChecklist || [],
    }));
}

export function buildProofCarryingAlphaContractReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const summary = summarizeProofCarryingAlphaContracts(safeProjects);
  const memory = loadAlphaContracts();
  const memorySummary = summarizeAlphaContracts(memory);
  const ranked = [...safeProjects]
    .filter((project) => project.proofCarryingAlphaContract)
    .sort((a, b) => num(b.proofCarryingAlphaContractScore) - num(a.proofCarryingAlphaContractScore));
  const topContracts = ranked.slice(0, 50).map((project, index) => compactContractProject(project, index + 1));
  const alphaCandidates = topContracts.filter(
    (project) => project.verdict === "Proof-Carrying Alpha Candidate"
  );
  const priorityResearch = topContracts.filter(
    (project) => project.verdict === "Accountable Priority Research"
  );
  const invalidationHits = topContracts.filter((project) => project.verdict === "Invalidation Hit");
  const allCurrentContracts = ranked.map((project, index) => compactContractProject(project, index + 1));

  return {
    generatedAt: new Date().toISOString(),
    name: "Proof-Carrying Alpha Contracts",
    description:
      "Accountability layer that turns alpha ideas into falsifiable contracts with confirmation rules, invalidation rules, review windows, public receipts, and outcome memory.",
    totalProjects: safeProjects.length,
    generatedContracts: summary.generatedContracts,
    memory: memorySummary,
    memoryLeaderboard: memoryLeaderboard(memory),
    alphaCandidates: alphaCandidates.length,
    priorityResearch: priorityResearch.length,
    invalidationHits: invalidationHits.length,
    openContracts: memorySummary.openContracts,
    resolvedContracts: memorySummary.resolvedContracts,
    historicalWinRate: memorySummary.winRate,
    topContracts,
    alphaCandidateContracts: alphaCandidates,
    priorityResearchContracts: priorityResearch,
    invalidationHitContracts: invalidationHits,
    publicReceipts: allCurrentContracts
      .slice(0, 50)
      .map((project) => ({
        contractId: project.contractId,
        symbol: project.symbol,
        score: project.score,
        verdict: project.verdict,
        confidence: project.confidence,
        thesis: project.thesis,
        receipt: project.receipt,
      })),
    engineLeaderboard: leaderboardFromItems(
      allCurrentContracts.flatMap((contract) => contract.supportingEngines || []),
      "engine"
    ),
    agentLeaderboard: leaderboardFromItems(
      allCurrentContracts.flatMap((contract) => contract.agentVotes || []),
      "agent"
    ),
    sourceLeaderboard: leaderboardFromItems(
      allCurrentContracts.flatMap((contract) =>
        (contract.sources || []).map((source) => ({ source, score: contract.score }))
      ),
      "source"
    ),
    falsePositiveAutopsies: falsePositiveAutopsies(safeProjects),
    missedWinnerReviewQueue: missedWinnerReviewQueue(safeProjects),
    operatingDoctrine: [
      "Every promoted idea needs a thesis, proof requirements, invalidation rules, and a review window.",
      "Old contracts are graded before new confidence is trusted.",
      "A high score without evidence becomes priority research, not a buy signal.",
      "Invalidation hits are useful because they teach the system which signals were noise.",
      "This is research software only and never financial advice.",
    ],
    commandMap: {
      report: "npm run alpha:contracts",
      leaderboard: "npm run alpha:judge",
      receipts: "npm run alpha:receipts",
      memory: "npm run contract-memory",
      scan: "npm run scan:op",
    },
  };
}

export function writeProofCarryingAlphaContractReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildProofCarryingAlphaContractReport(projects);
  const filePath = path.join(reportsDir, "alpha-contracts.json");
  const leaderboardPath = path.join(reportsDir, "alpha-contract-leaderboard.json");
  const receiptsPath = path.join(reportsDir, "alpha-contract-receipts.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    leaderboardPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        topContracts: report.topContracts,
        engineLeaderboard: report.engineLeaderboard,
        agentLeaderboard: report.agentLeaderboard,
        sourceLeaderboard: report.sourceLeaderboard,
        memoryLeaderboard: report.memoryLeaderboard,
        falsePositiveAutopsies: report.falsePositiveAutopsies,
        missedWinnerReviewQueue: report.missedWinnerReviewQueue,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    receiptsPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalReceipts: report.publicReceipts.length,
        publicReceipts: report.publicReceipts,
      },
      null,
      2
    )
  );

  return {
    filePath,
    leaderboardPath,
    receiptsPath,
    report,
  };
}
