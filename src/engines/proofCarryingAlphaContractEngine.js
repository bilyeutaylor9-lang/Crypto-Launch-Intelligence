import {
  alphaContractProjectKey,
  getProjectAlphaContracts,
  loadAlphaContracts,
} from "../learning/alphaContractStore.js";

const REVIEW_WINDOWS = [
  { id: "1h", ms: 60 * 60 * 1000 },
  { id: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "90d", ms: 90 * 24 * 60 * 60 * 1000 },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function hashText(value = "") {
  let hash = 2166136261;
  const text = String(value || "alpha-contract");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);
  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function confidenceLabel(score = 0) {
  if (score >= 82) return "High";
  if (score >= 68) return "Medium-High";
  if (score >= 52) return "Medium";
  if (score >= 36) return "Developing";
  return "Low";
}

function projectName(project = {}) {
  return project.name || project.symbol || "Unknown";
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore)
  );
}

function scoreOf(project = {}) {
  return Math.round(
    clamp(
      num(project.selfEvolvingAlphaOSScore) * 0.18 +
        num(project.highTechAlphaScore) * 0.14 +
        num(project.breakoutBrainScore) * 0.12 +
        num(project.confidenceAdjustedScore || project.pipelineScore) * 0.14 +
        num(project.sourceTruthScore || project.proofScore) * 0.12 +
        num(project.liveCatalystRadarScore || project.catalystCalendarScore) * 0.1 +
        num(project.liquidityExpansionScore || project.liquidityScore) * 0.08 +
        num(project.narrativeHeatScore || project.narrativeForecastScore) * 0.08 +
        num(project.githubProScore || project.developerActivityScore) * 0.06 -
        maxRisk(project) * 0.14 +
        8
    )
  );
}

function sourceKeys(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source),
    project.internetResearch?.status?.googleNews === "SUCCESS" ? "google-news" : "",
    project.githubIntelligencePro?.repository ? "github" : "",
  ].filter(Boolean);
}

function supportingEngines(project = {}) {
  const candidates = [
    ["Self-Evolving Alpha OS", project.selfEvolvingAlphaOSScore],
    ["High-Tech Alpha Stack", project.highTechAlphaScore],
    ["Breakout Brain", project.breakoutBrainScore],
    ["AI Council", project.aiEcosystemScore],
    ["Autonomous Alpha OS", project.autonomousAlphaOSScore],
    ["Source Truth", project.sourceTruthScore],
    ["Opportunity Proof", project.proofScore],
    ["Catalyst Radar", project.liveCatalystRadarScore],
    ["GitHub Pro", project.githubProScore],
    ["Simulation Brain", project.simulationBrainScore],
    ["Causal Alpha Brain", project.causalAlphaScore],
    ["Strategy Lab", project.strategyLabScore],
    ["Outcome Learning", project.outcomeLearningScore],
    ["Signal Combination", project.signalCombinationScore],
  ];

  return candidates
    .map(([engine, score]) => ({ engine, score: Math.round(clamp(score)) }))
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function agentVotes(project = {}) {
  return (
    project.selfEvolvingAlphaOS?.agentSociety?.agents ||
    project.aiEcosystemCouncil?.agents ||
    []
  ).map((agent) => ({
    agent: agent.name || "Agent",
    vote: agent.vote || agent.status || "Unknown",
    score: Math.round(clamp(agent.score)),
  }));
}

function thesisText(project = {}) {
  return (
    project.alphaThesis?.summary ||
    project.selfEvolvingAlphaOS?.thesis?.summary ||
    project.opportunityThesis?.summary ||
    `${projectName(project)} has a research thesis based on catalyst, liquidity, narrative, evidence, and risk alignment.`
  );
}

function entrySnapshot(project = {}) {
  return {
    priceUsd: num(project.priceUsd || project.price),
    liquidityUsd: num(project.liquidityUsd || project.liquidity),
    volume24h: num(project.volume24h || project.volume),
    marketCap: num(project.marketCap || project.fdv),
    pipelineScore: num(project.pipelineScore || project.opportunityScore),
    contractScore: scoreOf(project),
    riskScore: maxRisk(project),
    sourceTruthScore: num(project.sourceTruthScore),
    proofScore: num(project.proofScore),
    catalystScore: num(project.liveCatalystRadarScore || project.catalystCalendarScore),
  };
}

function mustHappen(project = {}) {
  const snapshot = entrySnapshot(project);
  return [
    {
      id: "score_holds",
      rule: `Contract score stays at or above ${Math.max(35, snapshot.contractScore - 8)}.`,
      metric: "contractScore",
      operator: ">=",
      target: Math.max(35, snapshot.contractScore - 8),
    },
    {
      id: "risk_control",
      rule: `Risk score remains below ${Math.min(78, Math.max(45, snapshot.riskScore + 18))}.`,
      metric: "riskScore",
      operator: "<",
      target: Math.min(78, Math.max(45, snapshot.riskScore + 18)),
    },
    {
      id: "liquidity_survives",
      rule: snapshot.liquidityUsd > 0
        ? "Liquidity does not drop more than 30% from entry."
        : "Liquidity data becomes available or other proof compensates.",
      metric: "liquidityChangePct",
      operator: ">",
      target: -30,
    },
    {
      id: "evidence_confirms",
      rule: "Source truth or proof score stays above 45.",
      metric: "evidenceScore",
      operator: ">=",
      target: 45,
    },
    {
      id: "catalyst_or_flow",
      rule: "Catalyst, liquidity expansion, or capital flow remains active.",
      metric: "catalystOrFlowScore",
      operator: ">=",
      target: 45,
    },
  ];
}

function invalidatesIf(project = {}) {
  return [
    {
      id: "risk_spike",
      rule: "Risk, sell pressure, trap, unlock, or bot risk rises above 70.",
      metric: "riskScore",
      operator: ">=",
      target: 70,
    },
    {
      id: "liquidity_break",
      rule: "Liquidity falls more than 40% from entry.",
      metric: "liquidityChangePct",
      operator: "<=",
      target: -40,
    },
    {
      id: "evidence_break",
      rule: "Both source truth and proof fall below 35.",
      metric: "evidenceScore",
      operator: "<",
      target: 35,
    },
    {
      id: "committee_block",
      rule: "Agent committee or Alpha OS flips to a block decision.",
      metric: "committeeBlock",
      operator: "==",
      target: true,
    },
  ];
}

function metricValue(project = {}, contract = {}, metric = "") {
  const current = entrySnapshot(project);
  const entry = contract.entrySnapshot || {};

  if (metric === "contractScore") return scoreOf(project);
  if (metric === "riskScore") return current.riskScore;
  if (metric === "liquidityChangePct") return pctChange(entry.liquidityUsd, current.liquidityUsd);
  if (metric === "evidenceScore") return Math.max(current.sourceTruthScore, current.proofScore);
  if (metric === "catalystOrFlowScore") {
    return Math.max(
      num(project.liveCatalystRadarScore || project.catalystCalendarScore),
      num(project.liquidityExpansionScore),
      num(project.capitalFlowScore)
    );
  }
  if (metric === "committeeBlock") {
    return (
      project.selfEvolvingAlphaOS?.agentSociety?.committeeDecision === "Committee Block" ||
      project.selfEvolvingAlphaOSDecision === "Research Block" ||
      project.autonomousAlphaOSVerdict === "OS Risk Block"
    );
  }

  return 0;
}

function conditionPassed(value, operator, target) {
  if (operator === ">=") return num(value) >= num(target);
  if (operator === ">") return num(value) > num(target);
  if (operator === "<=") return num(value) <= num(target);
  if (operator === "<") return num(value) < num(target);
  if (operator === "==") return value === target;
  return false;
}

function evaluateRules(project = {}, contract = {}, rules = []) {
  return rules.map((rule) => {
    const value = metricValue(project, contract, rule.metric);
    const passed = conditionPassed(value, rule.operator, rule.target);

    return {
      ...rule,
      currentValue: typeof value === "number" ? Number(value.toFixed(2)) : value,
      passed,
    };
  });
}

function dueWindows(contract = {}, now = Date.now()) {
  const created = new Date(contract.createdAt || 0).getTime();
  if (!created) return [];

  return REVIEW_WINDOWS.filter((window) => now - created >= window.ms).map((window) => window.id);
}

function gradeContract(project = {}, contract = {}, now = Date.now()) {
  const due = dueWindows(contract, now);
  const confirmations = evaluateRules(project, contract, contract.mustHappen || []);
  const invalidations = evaluateRules(project, contract, contract.invalidatesIf || []);
  const confirmationRate = confirmations.length
    ? Math.round((confirmations.filter((rule) => rule.passed).length / confirmations.length) * 100)
    : 0;
  const invalidated = invalidations.some((rule) => rule.passed);
  const entry = contract.entrySnapshot || {};
  const current = entrySnapshot(project);
  const scoreDelta = current.contractScore - num(entry.contractScore);
  const priceChangePct = pctChange(entry.priceUsd, current.priceUsd);
  const liquidityChangePct = pctChange(entry.liquidityUsd, current.liquidityUsd);
  const grade =
    invalidated
      ? "invalidated"
      : due.includes("30d") && confirmationRate >= 70 && (priceChangePct >= 15 || scoreDelta >= 8)
      ? "confirmed"
      : due.includes("30d") && confirmationRate < 45
      ? "failed"
      : due.length && confirmationRate >= 65
      ? "on_track"
      : due.length
      ? "needs_more_time"
      : "open";

  return {
    contractId: contract.contractId,
    dueWindows: due,
    grade,
    resolved: ["confirmed", "failed", "invalidated"].includes(grade),
    confirmationRate,
    scoreDelta: Number(scoreDelta.toFixed(2)),
    priceChangePct: Number(priceChangePct.toFixed(2)),
    liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
    confirmations,
    invalidations,
    summary:
      grade === "confirmed"
        ? "Contract is confirmed by outcome and condition evidence."
        : grade === "invalidated"
        ? "Contract hit an invalidation condition."
        : grade === "failed"
        ? "Contract failed enough required conditions to grade as failed."
        : grade === "on_track"
        ? "Contract is on track but not fully resolved."
        : "Contract remains open for future review windows.",
  };
}

function buildContract(project = {}, history = []) {
  const createdAt = new Date().toISOString();
  const key = alphaContractProjectKey(project);
  const scoreNow = scoreOf(project);
  const confidenceNow = confidenceLabel(
    Math.max(scoreNow, num(project.selfEvolvingAlphaOSScore), num(project.sourceTruthScore || project.proofScore))
  );
  const thesis = thesisText(project);
  const fingerprint = hashText(`${key}:${thesis}:${Math.round(scoreNow / 5) * 5}`);

  return {
    contractId: `alpha-contract:${key}:${fingerprint}`,
    projectKey: key,
    name: projectName(project),
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    createdAt,
    status: "open",
    thesis,
    predictionWindow: "30d",
    reviewAt: REVIEW_WINDOWS.map((window) => window.id),
    scoreNow,
    confidenceNow,
    entrySnapshot: entrySnapshot(project),
    mustHappen: mustHappen(project),
    invalidatesIf: invalidatesIf(project),
    supportingEngines: supportingEngines(project),
    agentVotes: agentVotes(project),
    sources: sourceKeys(project),
    evidenceRefs: (project.evidence || []).slice(-25).map((item) => ({
      engine: item.engine || "Unknown",
      signal: item.signal || "",
      score: item.score || 0,
      impact: item.impact || "Neutral",
    })),
    priorContractCount: history.length,
    priorResolvedCount: history.filter((contract) => contract.status === "resolved").length,
    publicReceipt: {
      headline: `${project.symbol || projectName(project)} contract: ${confidenceNow} confidence, score ${scoreNow}.`,
      mustProve: mustHappen(project).map((item) => item.rule),
      invalidationRules: invalidatesIf(project).map((item) => item.rule),
      accountability: "This contract must be re-judged at 1h, 24h, 7d, 30d, and 90d.",
    },
  };
}

function summarizeContractHistory(project = {}, history = []) {
  const currentGrades = history
    .map((contract) => contract.latestGrade || contract.finalGrade)
    .filter(Boolean);
  const wins = currentGrades.filter((grade) => grade === "confirmed").length;
  const losses = currentGrades.filter((grade) => ["failed", "invalidated"].includes(grade)).length;

  return {
    total: history.length,
    resolved: wins + losses,
    wins,
    losses,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    latest: history.at(-1) || null,
  };
}

export function analyzeProofCarryingAlphaContract(project = {}, options = {}) {
  const history = options.history || getProjectAlphaContracts(project, 30);
  const latestOpen = [...history].reverse().find((contract) => contract.status !== "resolved");
  const latestGrade = latestOpen ? gradeContract(project, latestOpen) : null;
  const contract = buildContract(project, history);
  const historySummary = summarizeContractHistory(project, history);
  const contractScore = Math.round(
    clamp(
      contract.scoreNow * 0.52 +
        (latestGrade?.confirmationRate || 50) * 0.18 +
        (100 - maxRisk(project)) * 0.12 +
        Math.min(100, contract.supportingEngines.length * 9) * 0.1 +
        (historySummary.winRate || 50) * 0.08
    )
  );
  const verdict =
    latestGrade?.grade === "invalidated"
      ? "Invalidation Hit"
      : contractScore >= 76
      ? "Proof-Carrying Alpha Candidate"
      : contractScore >= 60
      ? "Accountable Priority Research"
      : contractScore >= 42
      ? "Open Research Contract"
      : "Weak Contract";

  return {
    ...project,
    proofCarryingAlphaContractScore: contractScore,
    proofCarryingAlphaContractVerdict: verdict,
    proofCarryingAlphaContract: {
      ...contract,
      scoreNow: contractScore,
      verdict,
      latestGrade,
      historySummary,
    },
    alphaContractReceipt: contract.publicReceipt,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Proof-Carrying Alpha Contract",
        signal: "falsifiable alpha thesis with confirmation, invalidation, review windows, and reputation accounting",
        score: contractScore,
        confidence: contract.confidenceNow === "High" ? 0.84 : contract.confidenceNow === "Medium-High" ? 0.72 : 0.52,
        impact: verdict === "Invalidation Hit" ? "Negative" : contractScore >= 65 ? "Positive" : "Neutral",
        reasons: [
          verdict,
          `${contract.supportingEngines.length} supporting engines and ${contract.agentVotes.length} agent votes attached.`,
          latestGrade ? `Latest grade: ${latestGrade.grade} (${latestGrade.confirmationRate}% confirmation).` : "No prior open contract to grade yet.",
        ],
      },
    ],
  };
}

export function analyzeProofCarryingAlphaContractBatch(projects = []) {
  const memory = loadAlphaContracts();
  const historyByKey = new Map();

  for (const contract of memory) {
    const key = contract.projectKey || "";
    if (!key) continue;
    historyByKey.set(key, [...(historyByKey.get(key) || []), contract]);
  }

  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeProofCarryingAlphaContract(project, {
      history: (historyByKey.get(alphaContractProjectKey(project)) || []).slice(-30),
    })
  );

  const rankByContractId = new Map(
    [...analyzed]
      .filter((project) => project.proofCarryingAlphaContract?.contractId)
      .sort((a, b) => num(b.proofCarryingAlphaContractScore) - num(a.proofCarryingAlphaContractScore))
      .map((project, index) => [project.proofCarryingAlphaContract.contractId, index + 1])
  );
  const minimumResearchContracts = Math.max(0, Number(process.env.ALPHA_CONTRACT_MIN_RESEARCH || 3));
  const alreadyPromoted = analyzed.filter((project) =>
    ["Proof-Carrying Alpha Candidate", "Accountable Priority Research"].includes(
      project.proofCarryingAlphaContractVerdict
    )
  ).length;
  const fallbackSlots = Math.max(0, minimumResearchContracts - alreadyPromoted);
  const fallbackContractIds = new Set(
    [...analyzed]
      .filter(
        (project) =>
          project.proofCarryingAlphaContract?.contractId &&
          !["Proof-Carrying Alpha Candidate", "Accountable Priority Research", "Invalidation Hit"].includes(
            project.proofCarryingAlphaContractVerdict
          ) &&
          num(project.proofCarryingAlphaContractScore) >= 38 &&
          maxRisk(project) < 80
      )
      .sort((a, b) => num(b.proofCarryingAlphaContractScore) - num(a.proofCarryingAlphaContractScore))
      .slice(0, fallbackSlots)
      .map((project) => project.proofCarryingAlphaContract.contractId)
  );

  return analyzed.map((project) => {
    const rank = rankByContractId.get(project.proofCarryingAlphaContract?.contractId) || 0;
    const bestAvailableFallback = fallbackContractIds.has(project.proofCarryingAlphaContract?.contractId);
    const verdict = bestAvailableFallback
      ? "Accountable Priority Research"
      : project.proofCarryingAlphaContractVerdict;
    const fallbackCaveat =
      "Best-available research floor: promoted for accountable research only, not as a buy signal.";

    return {
      ...project,
      proofCarryingAlphaContractVerdict: verdict,
      proofCarryingAlphaContractRank: rank,
      proofCarryingAlphaContract: project.proofCarryingAlphaContract
        ? {
            ...project.proofCarryingAlphaContract,
            rank,
            verdict,
            bestAvailableFallback,
            fallbackCaveat: bestAvailableFallback ? fallbackCaveat : undefined,
          }
        : project.proofCarryingAlphaContract,
      alphaContractReceipt: bestAvailableFallback
        ? {
            ...(project.alphaContractReceipt || {}),
            caveat: fallbackCaveat,
          }
        : project.alphaContractReceipt,
    };
  });
}

export function summarizeProofCarryingAlphaContracts(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const contracts = safeProjects.map((project) => project.proofCarryingAlphaContract).filter(Boolean);
  const memory = loadAlphaContracts();
  const openGrades = contracts.map((contract) => contract.latestGrade).filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    generatedContracts: contracts.length,
    memoryContracts: memory.length,
    alphaCandidates: safeProjects.filter((project) => project.proofCarryingAlphaContractVerdict === "Proof-Carrying Alpha Candidate").length,
    priorityResearch: safeProjects.filter((project) => project.proofCarryingAlphaContractVerdict === "Accountable Priority Research").length,
    invalidationHits: safeProjects.filter((project) => project.proofCarryingAlphaContractVerdict === "Invalidation Hit").length,
    openGrades,
    topContracts: [...safeProjects]
      .filter((project) => project.proofCarryingAlphaContract)
      .sort((a, b) => num(b.proofCarryingAlphaContractScore) - num(a.proofCarryingAlphaContractScore))
      .slice(0, 50)
      .map((project, index) => ({
        rank: index + 1,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        score: project.proofCarryingAlphaContractScore || 0,
        verdict: project.proofCarryingAlphaContractVerdict || "Unknown",
        contractId: project.proofCarryingAlphaContract?.contractId,
        thesis: project.proofCarryingAlphaContract?.thesis,
        confidence: project.proofCarryingAlphaContract?.confidenceNow,
        reviewAt: project.proofCarryingAlphaContract?.reviewAt || [],
        latestGrade: project.proofCarryingAlphaContract?.latestGrade || null,
        mustHappen: project.proofCarryingAlphaContract?.mustHappen || [],
        invalidatesIf: project.proofCarryingAlphaContract?.invalidatesIf || [],
      })),
  };
}
