import { getProjectAutonomousResearchHistory } from "../learning/autonomousResearchMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function sourceHost(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function projectName(project = {}) {
  return project.name || project.symbol || "Unknown";
}

function hasWebsite(project = {}) {
  return Boolean(project.website || project.homepage || project.url);
}

function hasGithub(project = {}) {
  return Boolean(project.github || project.githubUrl || project.repository || project.githubProScore);
}

function hasContract(project = {}) {
  return Boolean(project.address || project.tokenAddress || project.pairAddress);
}

function confidenceLevel(score = 0) {
  if (score >= 78) return "High";
  if (score >= 58) return "Medium";
  if (score >= 38) return "Developing";
  return "Low";
}

function buildHypotheses(project = {}) {
  const hypotheses = [];

  if (num(project.autonomousAlphaOSScore) >= 70 || num(project.autoLearningWeightScore) >= 70) {
    hypotheses.push({
      id: "early_opportunity",
      statement: "Project may be an early high-quality opportunity.",
      supportScore: Math.max(num(project.autonomousAlphaOSScore), num(project.autoLearningWeightScore)),
    });
  }
  if (num(project.roadmapProfitabilityScore) >= 60 || num(project.liveCatalystRadarScore) >= 60) {
    hypotheses.push({
      id: "near_term_catalyst",
      statement: "Project may have a near-term catalyst worth verifying.",
      supportScore: Math.max(num(project.roadmapProfitabilityScore), num(project.liveCatalystRadarScore)),
    });
  }
  if (num(project.sourceTruthScore) >= 65 || num(project.proofScore) >= 65) {
    hypotheses.push({
      id: "evidence_supported",
      statement: "Project has a potentially verifiable source and proof stack.",
      supportScore: Math.max(num(project.sourceTruthScore), num(project.proofScore)),
    });
  }
  if (num(project.trapRiskScore) >= 55 || num(project.externalRiskScore) >= 55) {
    hypotheses.push({
      id: "risk_hidden",
      statement: "Project may contain hidden risk that must be disproven before promotion.",
      supportScore: Math.max(num(project.trapRiskScore), num(project.externalRiskScore)),
      bearish: true,
    });
  }

  return hypotheses.length
    ? hypotheses
    : [
        {
          id: "needs_discovery",
          statement: "Project needs basic legitimacy and catalyst verification.",
          supportScore: 35,
        },
      ];
}

function requiredQuestions(project = {}) {
  const sourceCount = num(project.sourceTruth?.sourceCount || project.internetResearch?.sourceCount);
  const questions = [
    {
      id: "official_identity",
      question: "Can the official website, documentation, or announcement source be identified?",
      answered: hasWebsite(project) || (project.internetResearch?.pages || []).length > 0,
      priority: "High",
    },
    {
      id: "independent_sources",
      question: "Do at least two independent sources support the key claims?",
      answered: sourceCount >= 2 || num(project.sourceTruthScore) >= 58,
      priority: "High",
    },
    {
      id: "roadmap",
      question: "Is the roadmap or catalyst confirmed by official/project-side evidence?",
      answered:
        Boolean(project.fullRoadmap?.milestoneCount) ||
        (project.roadmapMilestones || []).length > 0 ||
        num(project.roadmapProfitabilityScore) >= 60,
      priority: num(project.catalystScore || project.catalystCalendarScore) >= 55 ? "High" : "Medium",
    },
    {
      id: "github",
      question: "Is builder activity visible through GitHub or developer signals?",
      answered: hasGithub(project) || num(project.developerActivityScore || project.githubQualityScore) >= 50,
      priority: "Medium",
    },
    {
      id: "tokenomics",
      question: "Are tokenomics, unlocks, and supply risks sufficiently understood?",
      answered:
        Boolean(project.tokenomics) ||
        num(project.tokenomicsScore) >= 55 ||
        (num(project.tokenUnlockRiskScore) === 0 && num(project.vestingPressureScore) === 0),
      priority: "High",
    },
    {
      id: "liquidity",
      question: "Is liquidity depth and market quality adequate for the claimed opportunity?",
      answered: num(project.liquidityScore || project.liquidityExpansionScore) >= 50 || num(project.liquidityUsd) >= 100000,
      priority: "Medium",
    },
    {
      id: "security_risk",
      question: "Have exploit, scam, bot, unlock, and trap risks been challenged?",
      answered:
        num(project.trapRiskScore) < 45 &&
        num(project.externalRiskScore) < 45 &&
        num(project.xBotRiskScore) < 45,
      priority: "High",
    },
  ];

  return questions;
}

function queryForQuestion(project = {}, question = {}) {
  const name = projectName(project);
  const symbol = project.symbol || "";

  switch (question.id) {
    case "official_identity":
      return `"${name}" ${symbol} official website docs`;
    case "independent_sources":
      return `"${name}" ${symbol} crypto announcement partnership funding`;
    case "roadmap":
      return `"${name}" roadmap mainnet token launch announcement`;
    case "github":
      return `site:github.com "${name}" ${symbol}`;
    case "tokenomics":
      return `"${name}" tokenomics unlock vesting supply`;
    case "security_risk":
      return `"${name}" ${symbol} exploit hack scam rug warning`;
    default:
      return `"${name}" ${symbol} crypto research`;
  }
}

function baseEvidence(project = {}) {
  const evidence = [];

  for (const item of project.evidence || []) {
    evidence.push({
      type: "engine_signal",
      claim: item.signal || item.engine || "Engine signal",
      sourceTitle: item.engine || "Engine",
      sourceUrl: "",
      sourceType: "internal_engine",
      supportsClaim: item.impact !== "Negative",
      confidence: clamp(num(item.confidence) * 100 || num(item.score), 0, 100),
      score: num(item.score),
      reasons: item.reasons || [],
    });
  }

  for (const article of project.internetResearch?.articles || []) {
    evidence.push({
      type: "web_article",
      claim: article.title || "Article evidence",
      sourceTitle: article.title || article.source || "Article",
      sourceUrl: article.url || "",
      publisher: article.source || sourceHost(article.url),
      publishedAt: article.publishedAt || "",
      sourceType: "news_or_rss",
      supportsClaim: true,
      confidence: 58,
      extractedText: article.description || "",
    });
  }

  for (const page of project.internetResearch?.pages || []) {
    evidence.push({
      type: "project_page",
      claim: page.title || "Official/project page evidence",
      sourceTitle: page.title || page.url || "Project page",
      sourceUrl: page.url || "",
      publisher: sourceHost(page.url),
      sourceType: page.crawlDepth !== undefined ? "official_or_project_page" : "web_page",
      supportsClaim: true,
      confidence: page.relevanceScore >= 20 ? 70 : 55,
      extractedText: page.description || "",
    });
  }

  for (const source of project.sourceTruth?.sources || []) {
    evidence.push({
      type: "source_reliability",
      claim: `${source.source} provided project evidence`,
      sourceTitle: source.source,
      sourceUrl: "",
      sourceType: "source_router",
      supportsClaim: num(source.trustScore) >= 45,
      confidence: clamp(source.trustScore),
    });
  }

  if (project.githubIntelligencePro) {
    evidence.push({
      type: "github",
      claim: project.githubIntelligencePro.summary || "GitHub activity analyzed",
      sourceTitle: project.githubIntelligencePro.repository || "GitHub Intelligence Pro",
      sourceUrl: project.githubIntelligencePro.repository || "",
      sourceType: "github",
      supportsClaim: num(project.githubProScore) >= 42,
      confidence: clamp(project.githubProScore),
    });
  }

  return evidence.slice(0, 80);
}

function buildClaims(project = {}) {
  const claims = [];

  if (num(project.narrativeHeatScore || project.narrativeScore) > 0) {
    claims.push({
      id: "narrative",
      subject: projectName(project),
      relation: "has narrative exposure",
      object: project.primaryNarrative || project.narrative || (project.narratives || [])[0] || "crypto narrative",
      confidence: avg([project.narrativeHeatScore, project.narrativeScore, project.narrativeForecastScore]),
    });
  }
  if (num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore) > 0) {
    claims.push({
      id: "catalyst",
      subject: projectName(project),
      relation: "has potential catalyst",
      object:
        project.liveCatalystEvents?.[0]?.label ||
        project.strongestCatalyst?.label ||
        project.nextCatalyst?.type ||
        "launch or roadmap catalyst",
      confidence: avg([project.liveCatalystRadarScore, project.catalystCalendarScore, project.roadmapProfitabilityScore]),
    });
  }
  if (hasGithub(project)) {
    claims.push({
      id: "builder_activity",
      subject: projectName(project),
      relation: "has builder activity",
      object: project.repository || project.github || project.githubUrl || "repository signal",
      confidence: avg([project.githubProScore, project.developerActivityScore, project.githubQualityScore]),
    });
  }
  if (num(project.fundingBackerScore) >= 45) {
    claims.push({
      id: "funding_backers",
      subject: projectName(project),
      relation: "has funding or backer signal",
      object: "investor/backer evidence",
      confidence: num(project.fundingBackerScore),
    });
  }
  if (num(project.partnershipScore) >= 45) {
    claims.push({
      id: "partnership",
      subject: projectName(project),
      relation: "has partnership or integration signal",
      object: "partner/integration evidence",
      confidence: num(project.partnershipScore),
    });
  }

  return claims;
}

function buildRisks(project = {}) {
  const risks = [];
  const addRisk = (id, label, score, severity = "Medium") => {
    if (num(score) > 0) risks.push({ id, label, score: Math.round(num(score)), severity });
  };

  addRisk("trap", "Trap or false-positive risk", project.trapRiskScore, num(project.trapRiskScore) >= 65 ? "High" : "Medium");
  addRisk("external", "External web/social risk language", project.externalRiskScore, num(project.externalRiskScore) >= 55 ? "High" : "Medium");
  addRisk("sell_pressure", "Sell pressure risk", project.sellPressureScore, num(project.sellPressureScore) >= 65 ? "High" : "Medium");
  addRisk("unlock", "Token unlock or vesting pressure", Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)), "High");
  addRisk("bot", "Bot or social-quality risk", project.xBotRiskScore, num(project.xBotRiskScore) >= 55 ? "High" : "Medium");

  for (const flag of project.riskFlags || []) {
    risks.push({ id: "risk_flag", label: String(flag), score: 55, severity: "Medium" });
  }

  return risks.sort((a, b) => b.score - a.score).slice(0, 12);
}

function detectContradictions(project = {}, evidence = [], unanswered = []) {
  const contradictions = [];
  const risk = Math.max(num(project.trapRiskScore), num(project.externalRiskScore), num(project.xBotRiskScore));
  const sourceConfidence = avg([project.sourceTruthScore, project.sourceReliabilityScore, project.dataConfidenceScore]);

  if (risk >= 60 && sourceConfidence < 55) {
    contradictions.push({
      claim: "Opportunity signal conflicts with weak source confidence and elevated risk.",
      contradicted: true,
      severity: risk >= 75 ? "Critical" : "High",
      reason: `Risk ${risk}, source confidence ${sourceConfidence}.`,
    });
  }
  if (num(project.pipelineScore) >= 75 && unanswered.filter((item) => item.priority === "High").length >= 3) {
    contradictions.push({
      claim: "High score has too many high-priority unanswered research questions.",
      contradicted: true,
      severity: "High",
      reason: "Research confidence must be lowered until the missing proof is resolved.",
    });
  }
  if (evidence.length && evidence.filter((item) => item.supportsClaim === false).length >= 3) {
    contradictions.push({
      claim: "Multiple evidence items are negative or unsupportive.",
      contradicted: true,
      severity: "High",
      reason: "Critic stage found repeated negative support markers.",
    });
  }

  return contradictions;
}

function buildEvidenceGraph(project = {}, claims = [], evidence = [], contradictions = []) {
  const projectNode = `project:${projectName(project).toLowerCase()}`;
  const nodes = [
    {
      id: projectNode,
      type: "project",
      label: projectName(project),
    },
  ];
  const edges = [];
  const sourceMap = new Map();

  for (const claim of claims) {
    const claimNode = `claim:${claim.id}`;
    nodes.push({ id: claimNode, type: "claim", label: `${claim.relation}: ${claim.object}`, confidence: claim.confidence });
    edges.push({ from: projectNode, to: claimNode, relation: "makes_claim" });
  }

  evidence.forEach((item, index) => {
    const sourceId = item.sourceUrl
      ? `source:${item.sourceUrl}`
      : `source:${item.sourceTitle || item.sourceType || index}`;

    if (!sourceMap.has(sourceId)) {
      sourceMap.set(sourceId, {
        id: sourceId,
        type: "source",
        label: item.sourceTitle || item.publisher || item.sourceType || "Source",
        url: item.sourceUrl || "",
        sourceType: item.sourceType || "unknown",
      });
    }

    const matchedClaim = claims[index % Math.max(1, claims.length)];
    const target = matchedClaim ? `claim:${matchedClaim.id}` : projectNode;
    edges.push({
      from: target,
      to: sourceId,
      relation: item.supportsClaim === false ? "contradicted_by" : "supported_by",
      confidence: item.confidence || 0,
    });
  });

  contradictions.forEach((item, index) => {
    const contradictionNode = `contradiction:${index}`;
    nodes.push({ id: contradictionNode, type: "contradiction", label: item.claim, severity: item.severity });
    edges.push({ from: projectNode, to: contradictionNode, relation: "challenged_by" });
  });

  return {
    nodes: [...nodes, ...sourceMap.values()],
    edges,
    claims,
    sources: [...sourceMap.values()],
    contradictions,
  };
}

function scoreResearch(project = {}, state = {}) {
  const securityRisk = Math.max(
    num(project.trapRiskScore),
    num(project.externalRiskScore),
    num(project.riskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.xBotRiskScore)
  );
  const liquidityRisk = Math.max(
    num(project.sellPressureScore),
    num(project.liquidityScore) > 0 ? 100 - num(project.liquidityScore) : 0,
    num(project.liquidityExpansionScore) > 0 ? 100 - num(project.liquidityExpansionScore) : 0
  );
  const sourceCount = new Set((state.evidence || []).map((item) => item.sourceUrl || item.sourceTitle || item.sourceType).filter(Boolean)).size;
  const unansweredPenalty = (state.unansweredQuestions || []).filter((item) => item.priority === "High").length * 8;
  const contradictionPenalty = (state.contradictions || []).length * 12;
  const legitimacyScore = Math.round(
    clamp(avg([project.proofScore, project.sourceTruthScore, project.sourceReliabilityScore, project.dataConfidenceScore, project.confidenceAdjustedScore]) - securityRisk * 0.12)
  );
  const narrativeScore = avg([
    project.narrativeHeatScore,
    project.narrativeScore,
    project.narrativeForecastScore,
    project.infrastructureNarrativeScore,
    project.aiEcosystemScore,
  ]);
  const catalystScore = avg([
    project.liveCatalystRadarScore,
    project.catalystCalendarScore,
    project.catalystScore,
    project.roadmapProfitabilityScore,
    project.exchangeProbabilityScore,
  ]);
  const developerScore = avg([
    project.githubProScore,
    project.developerActivityScore,
    project.githubQualityScore,
    project.githubScore,
  ]);
  const adoptionScore = avg([
    project.communityGrowthScore,
    project.holderGrowthScore,
    project.liquidityScore,
    project.xSocialScore,
    project.smartMoneyAccumulationScore,
    project.ecosystemIntegrationScore,
  ]);
  const evidenceConfidence = Math.round(
    clamp(
      avg([project.proofScore, project.sourceTruthScore, project.dataConfidenceScore, project.internetResearchScore]) +
        Math.min(18, sourceCount * 3) -
        unansweredPenalty -
        contradictionPenalty
    )
  );
  const autonomousResearchScore = Math.round(
    clamp(
      legitimacyScore * 0.22 +
        narrativeScore * 0.16 +
        catalystScore * 0.18 +
        developerScore * 0.12 +
        adoptionScore * 0.14 +
        evidenceConfidence * 0.18 -
        securityRisk * 0.18 -
        liquidityRisk * 0.08
    )
  );

  return {
    legitimacyScore,
    narrativeScore,
    catalystScore,
    developerScore,
    adoptionScore,
    liquidityRiskScore: Math.round(clamp(liquidityRisk)),
    securityRiskScore: Math.round(clamp(securityRisk)),
    evidenceConfidence,
    autonomousResearchScore,
  };
}

function initialState(project = {}, options = {}) {
  const allQuestions = requiredQuestions(project);
  const unansweredQuestions = allQuestions.filter((item) => !item.answered);
  const evidence = baseEvidence(project);
  const claims = buildClaims(project);
  const contradictions = detectContradictions(project, evidence, unansweredQuestions);
  const history = options.history || getProjectAutonomousResearchHistory(project, 8);
  const evidenceGraph = buildEvidenceGraph(project, claims, evidence, contradictions);

  return {
    project: {
      name: projectName(project),
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      address: project.address || project.tokenAddress || null,
    },
    objective: "Determine whether this is an early high-quality opportunity with verifiable evidence.",
    hypotheses: buildHypotheses(project),
    requiredQuestions: allQuestions,
    unansweredQuestions,
    searchesPerformed: [],
    toolCalls: [],
    evidence,
    claims,
    evidenceGraph,
    contradictions,
    risks: buildRisks(project),
    priorMemory: history.map((record) => ({
      researchedAt: record.researchedAt,
      verdict: record.verdict,
      score: record.score,
      confidence: record.confidence,
    })),
    roundsCompleted: 0,
    noNewEvidenceRounds: 0,
    finished: false,
    stoppingReasons: [],
  };
}

function decideNextAction(state = {}, project = {}, limits = {}) {
  const unanswered = state.unansweredQuestions || [];
  const searchedQueries = new Set((state.searchesPerformed || []).map((item) => item.query));

  if (state.roundsCompleted >= limits.maxResearchRounds) {
    return { action: "finish", reason: "Maximum research rounds reached." };
  }
  if ((state.searchesPerformed || []).length >= limits.maxSearches) {
    return { action: "finish", reason: "Maximum searches reached." };
  }
  if (state.noNewEvidenceRounds >= limits.maxNoNewEvidenceRounds) {
    return { action: "finish", reason: "No new evidence found in repeated rounds." };
  }
  if (state.contradictions?.some((item) => item.severity === "Critical")) {
    return { action: "finish", reason: "Critical contradiction requires human review." };
  }
  if (unanswered.length) {
    const question = unanswered[0];
    const query = queryForQuestion(project, question);
    if (!searchedQueries.has(query)) {
      return {
        action: "web_search",
        query,
        reason: question.question,
        expectedEvidence: question.id,
      };
    }
  }
  if (hasWebsite(project) && !state.toolCalls.some((item) => item.action === "fetch_official_url")) {
    return {
      action: "fetch_official_url",
      url: project.website || project.homepage || project.url,
      reason: "Verify official/project-side source and roadmap pages.",
    };
  }
  if (!state.toolCalls.some((item) => item.action === "check_github")) {
    return {
      action: "check_github",
      repository: project.repository || project.github || project.githubUrl || "",
      reason: "Verify builder activity and repo risk.",
    };
  }
  if (hasContract(project) && !state.toolCalls.some((item) => item.action === "check_contract")) {
    return {
      action: "check_contract",
      address: project.address || project.tokenAddress || project.pairAddress,
      chain: project.chain || "unknown",
      reason: "Confirm contract identity from market/on-chain fields.",
    };
  }
  if (!state.toolCalls.some((item) => item.action === "critic_review")) {
    return {
      action: "critic_review",
      reason: "Challenge strongest claims, single-source claims, stale evidence, and promotional assumptions.",
    };
  }

  return { action: "finish", reason: "All required controlled research stages completed." };
}

function applyAction(state = {}, project = {}, decision = {}) {
  const priorEvidence = state.evidence.length;
  const next = {
    ...state,
    toolCalls: [
      ...(state.toolCalls || []),
      {
        ...decision,
        calledAt: new Date().toISOString(),
      },
    ],
  };

  if (decision.action === "web_search") {
    next.searchesPerformed = [
      ...(state.searchesPerformed || []),
      {
        query: decision.query,
        reason: decision.reason,
        expectedEvidence: decision.expectedEvidence,
        searchedAt: new Date().toISOString(),
        provider:
          project.internetResearch?.status?.googleNews === "SUCCESS" || project.internetResearch
            ? "existing-free-research-layer"
            : "queued-for-live-search-provider",
      },
    ];

    if (project.internetResearch) {
      next.evidence = baseEvidence(project);
    }
  }

  if (decision.action === "fetch_official_url" && decision.url) {
    next.evidence = [
      ...next.evidence,
      {
        type: "official_url",
        claim: "Official/project URL is available for source verification.",
        sourceTitle: decision.url,
        sourceUrl: decision.url,
        sourceType: "official_or_project_url",
        supportsClaim: true,
        confidence: 62,
      },
    ];
  }

  if (decision.action === "check_github") {
    next.evidence = [
      ...next.evidence,
      {
        type: "github_review",
        claim: hasGithub(project)
          ? project.githubIntelligencePro?.summary || "GitHub repository signal exists."
          : "No public GitHub repository signal found.",
        sourceTitle: project.repository || project.github || project.githubUrl || "GitHub Pro",
        sourceUrl: project.repository || project.github || project.githubUrl || "",
        sourceType: "github",
        supportsClaim: hasGithub(project),
        confidence: hasGithub(project) ? clamp(project.githubProScore || 55) : 30,
      },
    ];
  }

  if (decision.action === "check_contract") {
    next.evidence = [
      ...next.evidence,
      {
        type: "contract_reference",
        claim: "Contract or pair address is present for downstream on-chain verification.",
        sourceTitle: `${decision.chain}:${decision.address}`,
        sourceUrl: "",
        sourceType: "market_api_contract_reference",
        supportsClaim: true,
        confidence: 58,
      },
    ];
  }

  if (decision.action === "critic_review") {
    next.contradictions = detectContradictions(project, next.evidence, next.unansweredQuestions);
  }

  if (decision.action === "finish") {
    next.finished = true;
    next.stoppingReasons = [...(next.stoppingReasons || []), decision.reason || "Finished."];
  }

  next.claims = buildClaims(project);
  next.evidenceGraph = buildEvidenceGraph(project, next.claims, next.evidence, next.contradictions);
  next.noNewEvidenceRounds = next.evidence.length > priorEvidence ? 0 : state.noNewEvidenceRounds + 1;
  next.roundsCompleted = state.roundsCompleted + (decision.action === "finish" ? 0 : 1);

  return next;
}

function verdictFor(scores = {}, state = {}) {
  const criticalContradiction = state.contradictions?.some((item) => item.severity === "Critical");
  const highRisk = Math.max(num(scores.securityRiskScore), num(scores.liquidityRiskScore));

  if (criticalContradiction || scores.securityRiskScore >= 75) return "Blocked By Research Risk";
  if (scores.autonomousResearchScore >= 75 && scores.evidenceConfidence >= 65 && highRisk < 65) {
    return "Research-Verified Priority";
  }
  if (scores.autonomousResearchScore >= 60 && scores.evidenceConfidence >= 48) return "Autonomous Research Watch";
  if (scores.evidenceConfidence < 42 || state.unansweredQuestions?.length >= 4) return "Evidence Incomplete";
  return "Low Priority Research";
}

export function runControlledResearchLoop(project = {}, options = {}) {
  const limits = {
    maxResearchRounds: Number(options.maxResearchRounds || process.env.AUTONOMOUS_RESEARCH_MAX_ROUNDS || 8),
    maxSearches: Number(options.maxSearches || process.env.AUTONOMOUS_RESEARCH_MAX_SEARCHES || 12),
    maxNoNewEvidenceRounds: Number(options.maxNoNewEvidenceRounds || 2),
  };
  let state = initialState(project, options);

  while (!state.finished && state.roundsCompleted < limits.maxResearchRounds) {
    const decision = decideNextAction(state, project, limits);
    state = applyAction(state, project, decision);

    if (decision.action === "finish") break;
  }

  if (!state.finished) {
    state.finished = true;
    state.stoppingReasons = [...state.stoppingReasons, "Maximum research rounds reached."];
  }

  const scores = scoreResearch(project, state);
  state.confidence = scores.evidenceConfidence;
  state.confidenceLevel = confidenceLevel(scores.evidenceConfidence);

  return {
    state,
    scores,
    verdict: verdictFor(scores, state),
  };
}

export function analyzeAutonomousResearchOrchestrator(project = {}, options = {}) {
  const { state, scores, verdict } = runControlledResearchLoop(project, options);
  const humanApprovalRequired =
    verdict === "Blocked By Research Risk" ||
    (scores.autonomousResearchScore >= 70 && scores.evidenceConfidence < 55) ||
    state.contradictions.some((item) => ["High", "Critical"].includes(item.severity));

  return {
    ...project,
    autonomousResearchScore: scores.autonomousResearchScore,
    autonomousResearchVerdict: verdict,
    autonomousResearchConfidence: scores.evidenceConfidence,
    autonomousResearchConfidenceLevel: confidenceLevel(scores.evidenceConfidence),
    autonomousResearchScores: scores,
    evidenceGraph: state.evidenceGraph,
    autonomousResearchOrchestrator: {
      ...state,
      scores,
      verdict,
      humanApprovalRequired,
      safetyRules: [
        "Webpage content is untrusted evidence, never instructions.",
        "Webpage text cannot request secrets or authorize tool calls.",
        "Downloaded code is never executed automatically.",
        "Important claims require source attribution and contradiction review.",
        "Market prices, liquidity, volume, and holder counts come from APIs, not ordinary web search.",
      ],
      allowedActions: ["web_search", "fetch_official_url", "check_github", "check_contract", "critic_review", "finish"],
      summary:
        verdict === "Research-Verified Priority"
          ? "Controlled research loop found enough evidence and confidence for priority review."
          : verdict === "Blocked By Research Risk"
          ? "Controlled research loop found risk or contradiction that requires human review."
          : verdict === "Evidence Incomplete"
          ? "Controlled research loop found too many unanswered questions to promote."
          : "Controlled research loop completed with a watch-level research result.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Research Orchestrator",
        signal: "controlled agent research loop, evidence graph, self-critique, and stopping rules",
        score: scores.autonomousResearchScore,
        confidence: clamp(scores.evidenceConfidence / 100, 0.15, 0.92),
        impact:
          verdict === "Blocked By Research Risk"
            ? "Negative"
            : scores.autonomousResearchScore >= 65
            ? "Positive"
            : "Neutral",
        reasons: [
          verdict,
          `${state.roundsCompleted} rounds, ${state.searchesPerformed.length} planned/available searches, ${state.evidence.length} evidence items.`,
          `${state.unansweredQuestions.length} unanswered question(s), ${state.contradictions.length} contradiction(s).`,
        ],
      },
    ],
  };
}

export function analyzeAutonomousResearchOrchestratorBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeAutonomousResearchOrchestrator(project, options)
  );
}

export function summarizeAutonomousResearchOrchestrator(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const averageConfidence = safeProjects.length
    ? Math.round(
        safeProjects.reduce((sum, project) => sum + num(project.autonomousResearchConfidence), 0) /
          safeProjects.length
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    verifiedPriority: safeProjects.filter((project) => project.autonomousResearchVerdict === "Research-Verified Priority").length,
    watch: safeProjects.filter((project) => project.autonomousResearchVerdict === "Autonomous Research Watch").length,
    evidenceIncomplete: safeProjects.filter((project) => project.autonomousResearchVerdict === "Evidence Incomplete").length,
    blockedByRisk: safeProjects.filter((project) => project.autonomousResearchVerdict === "Blocked By Research Risk").length,
    averageConfidence,
    topProjects: [...safeProjects]
      .sort((a, b) => num(b.autonomousResearchScore) - num(a.autonomousResearchScore))
      .slice(0, 50)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.autonomousResearchScore || 0,
        verdict: project.autonomousResearchVerdict || "Unknown",
        confidence: project.autonomousResearchConfidence || 0,
        unansweredQuestions: project.autonomousResearchOrchestrator?.unansweredQuestions || [],
        contradictions: project.autonomousResearchOrchestrator?.contradictions || [],
        stoppingReasons: project.autonomousResearchOrchestrator?.stoppingReasons || [],
      })),
  };
}
