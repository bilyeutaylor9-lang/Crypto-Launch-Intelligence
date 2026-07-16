import fs from "fs";
import path from "path";

import {
  LOCAL_BRAIN_AGENTS,
  LOCAL_BRAIN_JUDGE,
  systemPromptForAgent,
  systemPromptForJudge,
} from "./agentRegistry.js";
import { chatWithOllama, parseModelJson } from "./localAIClient.js";

const DEFAULT_REPORT_PATH = path.resolve("reports/report.json");
const DEFAULT_OUTPUT_PATH = path.resolve("reports/local-ai-brain.json");
const MAX_TEXT_LENGTH = 500;
const MAX_LIST_ITEMS = 8;

function boundedText(value, fallback = "Not supplied", maxLength = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined || value === "") return fallback;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 18))}[truncated]` : text;
}

function boundedNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value) {
  const parsed = boundedNumber(value);
  return parsed === null ? 0 : Math.round(Math.min(100, Math.max(0, parsed)));
}

function boundedList(value, maxItems = MAX_LIST_ITEMS) {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value];
  return values
    .filter((item) => item !== null && item !== undefined && item !== "")
    .slice(0, maxItems)
    .map((item) => boundedText(item, "", 240));
}

function listFromProject(project, fields) {
  return [...new Set(fields.flatMap((field) => boundedList(project?.[field])))]
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
}

function projectIdentity(project = {}) {
  return {
    name: boundedText(project.name, "Unnamed project", 160),
    symbol: boundedText(project.symbol, "Unknown", 48),
    chain: boundedText(project.chain || project.chainId, "Unknown", 80),
    permanentProjectKey: boundedText(project.permanentProjectKey, "Not supplied", 180),
    contractAddress: boundedText(project.contractAddress || project.tokenAddress || project.address, "Not supplied", 180),
    pairAddress: boundedText(project.pairAddress || project.poolAddress, "Not supplied", 180),
  };
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && value !== "Not supplied" && value !== "Unknown";
}

function safeError(error) {
  return boundedText(error?.message || error, "Local model request failed.", 300);
}

function normalizeFinding(parsed, agent) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${agent.name} returned invalid structured output.`);
  }

  return {
    agentId: agent.id,
    agent: agent.name,
    assessment: boundedText(parsed.assessment || parsed.conclusion || parsed.summary, "No assessment returned.", 420),
    evidence: boundedList(parsed.evidence || parsed.evidenceFor),
    risks: boundedList(parsed.risks || parsed.riskFlags),
    missingEvidence: boundedList(parsed.missingEvidence || parsed.unknowns),
    nextChecks: boundedList(parsed.nextChecks || parsed.recommendedChecks),
    confidence: clampScore(parsed.confidence),
  };
}

function normalizeJudge(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Evidence Judge returned invalid structured output.");
  }

  const allowedVerdicts = new Set([
    "RESEARCH_MORE",
    "EVIDENCE_INCOMPLETE",
    "HIGH_RISK",
    "MONITOR_FOR_VERIFIABLE_EVIDENCE",
  ]);
  const requestedVerdict = String(parsed.verdict || "").trim().toUpperCase();

  return {
    status: "COMPLETE",
    verdict: allowedVerdicts.has(requestedVerdict) ? requestedVerdict : "RESEARCH_MORE",
    summary: boundedText(parsed.summary || parsed.assessment, "Evidence requires additional research.", 500),
    keyRisks: boundedList(parsed.keyRisks || parsed.risks),
    missingEvidence: boundedList(parsed.missingEvidence || parsed.unknowns),
    nextChecks: boundedList(parsed.nextChecks || parsed.recommendedChecks),
    confidence: clampScore(parsed.confidence),
  };
}

export function buildEvidenceBrief(project = {}) {
  const identity = projectIdentity(project);
  const usableSources = listFromProject(project, ["sourcesWithUsableEvidence", "discoverySources"]);
  const configuredSources = listFromProject(project, ["sourcesConfigured"]);
  const failedSources = listFromProject(project, ["sourcesFailed", "sourcesSkipped", "sourcesRateLimited", "sourcesRegionBlocked"]);
  const riskFlags = listFromProject(project, ["riskFlags", "finalBlockingReasons", "finalWarningReasons"]);
  const marketFields = [project.liquidityUsd, project.volume24h, project.marketCap, project.fdv].filter(
    (value) => boundedNumber(value) !== null
  );
  const identityComplete = [identity.chain, identity.contractAddress, identity.permanentProjectKey].every(hasValue);
  const coverageFamilies = [
    identityComplete,
    usableSources.length >= 2,
    marketFields.length >= 2,
    hasValue(project.finalIntegrityScore) || riskFlags.length > 0,
  ];

  return {
    identity,
    scannerDecision: {
      finalSelectionState: boundedText(project.finalSelectionState, "Not supplied", 80),
      finalIntegrityVerdict: boundedText(project.finalIntegrityVerdict, "Not supplied", 100),
      identityState: boundedText(project.finalIdentityState || project.identityState, "Not supplied", 100),
      dataConfidenceScore: boundedNumber(project.dataConfidenceScore),
      sourceTruthScore: boundedNumber(project.sourceTruthScore),
      finalIntegrityScore: boundedNumber(project.finalIntegrityScore),
    },
    marketEvidence: {
      liquidityUsd: boundedNumber(project.liquidityUsd),
      volume24h: boundedNumber(project.volume24h),
      marketCap: boundedNumber(project.marketCap),
      fdv: boundedNumber(project.fdv),
      buyers24h: boundedNumber(project.buyers24h || project.buyerCount24h),
      priceChange24h: boundedNumber(project.priceChange24h),
    },
    safetyEvidence: {
      riskScore: boundedNumber(project.riskScore),
      contractVerified: project.contractVerified === true ? true : project.contractVerified === false ? false : null,
      liquidityVerified: project.liquidityVerified === true ? true : project.liquidityVerified === false ? false : null,
      identityVerified: project.identityVerified === true ? true : project.identityVerified === false ? false : null,
      blockingReasons: riskFlags,
    },
    narrativeEvidence: {
      primaryNarrative: boundedText(project.primaryNarrative || project.narrative, "Not supplied", 240),
      narratives: boundedList(project.narratives),
      catalysts: boundedList(project.catalysts || project.catalystEvidence),
    },
    sourceProvenance: {
      usableSources,
      configuredSources,
      unavailableOrFailedSources: failedSources,
      independentUsableSourceCount: usableSources.length,
    },
    evidenceCoverage: {
      score: Math.round((coverageFamilies.filter(Boolean).length / coverageFamilies.length) * 100),
      completeFamilies: coverageFamilies.filter(Boolean).length,
      totalFamilies: coverageFamilies.length,
      note: "Coverage measures supplied record completeness only. It is not an investment score.",
    },
    researchGuardrails: [
      "Treat unsupported claims as unknown.",
      "Do not infer profitability or give trading instructions.",
      "The scanner's existing selection state remains authoritative.",
    ],
  };
}

export function demoProject() {
  return {
    name: "Demo Protocol",
    symbol: "DEMO",
    chain: "demo-chain",
    permanentProjectKey: "demo:protocol",
    contractAddress: "Not supplied",
    discoverySources: ["demo-fixture", "documentation-fixture"],
    liquidityUsd: 250_000,
    volume24h: 80_000,
    primaryNarrative: "Fictional testing record for the local research command.",
    finalSelectionState: "RESEARCH_ONLY",
    finalIntegrityVerdict: "NOT_EVALUATED",
    riskFlags: ["Fictional record: do not treat as a live asset."],
  };
}

function comparableFields(project = {}) {
  return [
    project.permanentProjectKey,
    project.contractAddress,
    project.tokenAddress,
    project.address,
    project.pairAddress,
    project.poolAddress,
    project.symbol,
    project.name,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
}

export function selectProjectForResearch(projects = [], query = "") {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return { project: demoProject(), selection: "DEMO" };

  const matches = safeProjects.filter((project) => comparableFields(project).includes(normalizedQuery));
  if (matches.length === 1) return { project: matches[0], selection: "REPORT" };
  if (matches.length > 1) {
    throw new Error(`"${query}" matches multiple projects. Use a contract address or permanent project key.`);
  }

  throw new Error(`No project matching "${query}" was found in the scanner report.`);
}

export function readProjectFromScannerReport(query = "", reportPath = DEFAULT_REPORT_PATH) {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Scanner report not found at ${reportPath}. Run npm run scan before selecting a live project.`);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  return selectProjectForResearch(report?.projects, query);
}

export async function runLocalResearchSwarm(project = {}, options = {}) {
  const agents = options.agents || LOCAL_BRAIN_AGENTS;
  const chat = options.chat || chatWithOllama;
  const evidence = buildEvidenceBrief(project);
  const runs = [];

  for (const agent of agents) {
    try {
      const response = await chat(
        [
          { role: "system", content: systemPromptForAgent(agent) },
          { role: "user", content: `Analyze this evidence brief:\n${JSON.stringify(evidence)}` },
        ],
        options.chatOptions
      );
      const finding = normalizeFinding(parseModelJson(response?.content), agent);
      runs.push({ status: "COMPLETE", ...finding });
    } catch (error) {
      runs.push({
        status: "FAILED",
        agentId: agent.id,
        agent: agent.name,
        error: safeError(error),
      });
    }
  }

  const findings = runs.filter((run) => run.status === "COMPLETE");
  const failedAgents = runs.filter((run) => run.status === "FAILED");
  let judge = {
    status: "SKIPPED",
    verdict: "EVIDENCE_INCOMPLETE",
    summary: "No valid specialist findings were available for reconciliation.",
    keyRisks: ["Local specialist execution did not complete."],
    missingEvidence: ["Valid local-model findings"],
    nextChecks: ["Confirm Ollama availability and rerun the research command."],
    confidence: 0,
  };

  if (findings.length) {
    try {
      const response = await chat(
        [
          { role: "system", content: systemPromptForJudge() },
          {
            role: "user",
            content: `Evidence brief:\n${JSON.stringify(evidence)}\n\nSpecialist findings:\n${JSON.stringify({
              findings,
              failedAgents: failedAgents.map(({ agent, error }) => ({ agent, error })),
            })}`,
          },
        ],
        options.chatOptions
      );
      judge = normalizeJudge(parseModelJson(response?.content));
    } catch (error) {
      judge = {
        status: "FAILED",
        verdict: "EVIDENCE_INCOMPLETE",
        summary: "The evidence judge did not return a valid structured result.",
        keyRisks: ["Final local-model reconciliation failed."],
        missingEvidence: ["A valid evidence-judge response"],
        nextChecks: ["Review the specialist findings and rerun the local research command."],
        confidence: 0,
        error: safeError(error),
      };
    }
  }

  const complete = findings.length === agents.length && judge.status === "COMPLETE";
  return {
    generatedAt: new Date().toISOString(),
    status: complete ? "COMPLETE" : findings.length ? "PARTIAL" : "UNAVAILABLE",
    advisoryOnly: true,
    project: projectIdentity(project),
    evidence,
    agents: {
      activated: agents.map((agent) => ({ id: agent.id, name: agent.name })),
      completedCount: findings.length,
      failedCount: failedAgents.length,
      findings,
      failures: failedAgents,
    },
    judge,
    disclaimer: "Local-model output is research assistance only. It does not change scanner scores, override integrity gates, or provide financial advice.",
  };
}

export function unavailableLocalBrainReport(availability = {}, selection = "DEMO") {
  return {
    generatedAt: new Date().toISOString(),
    status: "UNAVAILABLE",
    advisoryOnly: true,
    selection,
    localModel: {
      baseUrl: availability?.config?.baseUrl,
      model: availability?.config?.model,
      reachable: availability?.reachable === true,
      modelInstalled: availability?.modelInstalled === true,
      error: availability?.error || null,
    },
    nextChecks: [
      "Start Ollama locally.",
      `Install the configured model with: ollama pull ${availability?.config?.model || "qwen3:4b"}`,
      "Rerun npm run ai:brain after the local service is available.",
    ],
    disclaimer: "No model analysis was performed. This report is not financial advice.",
  };
}

export function writeLocalBrainReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}
