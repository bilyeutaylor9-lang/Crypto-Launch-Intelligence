import { getInternetProjectResearchBatch } from "../data/internetResearchConnector.js";

const RESEARCH_TERMS = [
  "launch",
  "mainnet",
  "airdrop",
  "tge",
  "listing",
  "funding",
  "partnership",
  "staking",
  "restaking",
  "ai",
  "agent",
  "rwa",
  "depin",
  "stablecoin",
  "prediction",
  "zk",
  "modular",
  "base",
  "solana",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function positiveInteger(value, fallback = 0) {
  const parsed = Math.floor(num(value));
  return parsed > 0 ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function projectKey(project = {}) {
  return String(
    project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function textOf(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function researchPriority(project = {}) {
  const text = textOf(project);
  const narrativeHits = RESEARCH_TERMS.filter((term) => text.includes(term)).length;
  const sourceCount = (project.discoverySources || []).length;
  const liquidity = Math.log10(Math.max(1, num(project.liquidityUsd ?? project.liquidity)));
  const volume = Math.log10(Math.max(1, num(project.volume24h ?? project.volume)));
  const marketCap = Math.log10(Math.max(1, num(project.marketCap ?? project.circulatingMarketCap ?? project.circulatingMarketCapUsd)));
  const discovery = num(project.discoveryPriorityScore);
  const existingScore = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const seedPenalty = project.researchSeed ? 18 : 0;

  return Math.round(
    clamp(
      discovery * 0.28 +
        existingScore * 0.28 +
        narrativeHits * 6 +
        sourceCount * 7 +
        liquidity * 5 +
        volume * 4 +
        marketCap * 2 -
        seedPenalty
    )
  );
}

function buildResearchPlan(project = {}, priority = 0) {
  const text = textOf(project);
  const topics = RESEARCH_TERMS.filter((term) => text.includes(term)).slice(0, 5);
  const name = project.name || project.symbol || "Unknown";

  return {
    priority,
    queries: [
      `${name} crypto launch mainnet token`,
      `${name} crypto funding partnership listing`,
      `${name} crypto risk exploit rug`,
      ...topics.map((topic) => `${name} crypto ${topic}`),
    ].slice(0, 8),
    topics,
    reason:
      priority >= 70
        ? "High-priority candidate selected for web research."
        : priority >= 45
        ? "Medium-priority candidate selected for web confirmation."
        : "Low-priority candidate kept in the research queue.",
  };
}

export function resolveWebResearchAgentLimit(projectCount = 0, options = {}, env = process.env) {
  const fallbackLimit = env.WIDE_SCAN === "true" ? 100 : 25;
  const requested = Math.floor(
    num(options.limit ?? env.WEB_RESEARCH_AGENT_LIMIT ?? env.INTERNET_RESEARCH_PROJECT_LIMIT ?? fallbackLimit)
  );
  if (requested <= 0 || projectCount <= 0) return 0;

  const timeoutMs = positiveInteger(
    options.engineTimeoutMs ?? options.timeoutMs ?? env.WEB_RESEARCH_AGENT_TIMEOUT_MS,
    0
  );
  const projectBudgetMs = positiveInteger(
    options.projectBudgetMs ?? env.WEB_RESEARCH_AGENT_PROJECT_BUDGET_MS,
    2_500
  );
  const maxProjectsPerRun = positiveInteger(
    options.maxProjectsPerRun ?? env.WEB_RESEARCH_AGENT_MAX_PROJECTS_PER_RUN,
    env.WIDE_SCAN === "true" ? 30 : 12
  );
  const timeoutCap = timeoutMs > 0 ? Math.max(1, Math.floor((timeoutMs * 0.75) / projectBudgetMs)) : requested;

  return Math.max(0, Math.min(projectCount, requested, maxProjectsPerRun, timeoutCap));
}

export async function analyzeWebResearchAgentBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const ranked = safeProjects
    .map((project) => {
      const priority = researchPriority(project);
      return {
        ...project,
        webResearchPriority: priority,
        webResearchPlan: buildResearchPlan(project, priority),
      };
    })
    .sort((a, b) => b.webResearchPriority - a.webResearchPriority);
  const requestedLimit = Math.floor(
    num(
      options.limit ??
        process.env.WEB_RESEARCH_AGENT_LIMIT ??
        process.env.INTERNET_RESEARCH_PROJECT_LIMIT ??
        (process.env.WIDE_SCAN === "true" ? 100 : 25)
    )
  );
  const limit = resolveWebResearchAgentLimit(ranked.length, options);
  const targets = ranked.slice(0, limit);
  const targetKeys = new Set(targets.map(projectKey));
  const deferredKeys = new Set(
    ranked
      .slice(limit, Math.max(limit, requestedLimit))
      .map(projectKey)
  );
  const researchMap = await getInternetProjectResearchBatch(targets, {
    ...options.internet,
    limit: targets.length,
    signal: options.signal,
  });

  return ranked.map((project) => {
    const research = researchMap.get(projectKey(project));

    if (!research) {
      return {
        ...project,
        webResearchStatus: targetKeys.has(projectKey(project))
          ? "SEARCH_ATTEMPTED_NO_RESULT"
          : deferredKeys.has(projectKey(project))
            ? "QUEUED_BUDGET_DEFERRED"
            : "QUEUED_NOT_SEARCHED",
        webResearchBudget: {
          requestedLimit,
          searchedLimit: limit,
          engineTimeoutMs: options.engineTimeoutMs ?? null,
        },
      };
    }

    const internetResearchScore = num(research.signalScore);
    const internetResearchRiskScore = num(research.riskScore);
    const externalSignalScore = Math.max(num(project.externalSignalScore), internetResearchScore);
    const externalRiskScore = Math.max(num(project.externalRiskScore), internetResearchRiskScore);

    return {
      ...project,
      webResearchStatus: "SEARCHED",
      webResearchBudget: {
        requestedLimit,
        searchedLimit: limit,
        engineTimeoutMs: options.engineTimeoutMs ?? null,
      },
      internetResearch: research,
      internetResearchScore,
      internetResearchRiskScore,
      externalSignalScore,
      externalRiskScore,
      externalIntelligence: {
        ...(project.externalIntelligence || {}),
        internet: research,
        narrativeHits: [
          ...new Set([
            ...(project.externalIntelligence?.narrativeHits || []),
            ...(research.narrativeHits || []),
          ]),
        ],
        catalystHits: [
          ...new Set([
            ...(project.externalIntelligence?.catalystHits || []),
            ...(research.catalystHits || []),
          ]),
        ],
        riskHits: [
          ...new Set([
            ...(project.externalIntelligence?.riskHits || []),
            ...(research.riskHits || []),
          ]),
        ],
      },
      evidence: [
        ...(project.evidence || []),
        {
          engine: "Web Research Agent",
          signal: "autonomous web research",
          score: internetResearchScore,
          confidence: num(research.sourceCount) > 0 ? 0.72 : 0.35,
          impact:
            internetResearchRiskScore >= 45
              ? "Negative"
              : internetResearchScore >= 60
              ? "Positive"
              : "Neutral",
          reasons: [
            research.summary || "Web research completed.",
            `${num(research.sourceCount)} sources, ${num(research.crawlPageCount)} crawled pages, ${(research.catalystHits || []).length} catalyst hits, ${(research.riskHits || []).length} risk hits.`,
          ],
        },
      ],
    };
  });
}
