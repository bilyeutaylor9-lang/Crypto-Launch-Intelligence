import { getXProjectIntelligenceBatch } from "../data/xIntelligenceConnector.js";
import { getNewsProjectIntelligenceBatch } from "../data/newsIntelligenceConnector.js";
import { getInternetProjectResearchBatch } from "../data/internetResearchConnector.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
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

function localTextSignals(project = {}) {
  const text = [
    project.name,
    project.symbol,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.alphaTags || []),
  ].filter(Boolean).join(" ").toLowerCase();
  const catalystHits = [
    "launch",
    "mainnet",
    "listing",
    "airdrop",
    "staking",
    "partnership",
    "testnet",
    "funding",
  ].filter((word) => text.includes(word));
  const riskWords = [
    "scam",
    "rug",
    "hack",
    "exploit",
    "fake",
    "drain",
    "lawsuit",
  ];
  const riskHits = riskWords.filter((word) => {
    if (!text.includes(word)) return false;
    if (text.includes(`no ${word}`) || text.includes(`not ${word}`) || text.includes(`without ${word}`)) {
      return false;
    }
    return true;
  });

  return {
    catalystHits,
    riskHits,
    score: clamp(catalystHits.length * 9 - riskHits.length * 14 + num(project.xSocialScore) * 0.2),
    riskScore: clamp(riskHits.length * 25),
  };
}

export async function analyzeExternalIntelligenceBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const xMap = await getXProjectIntelligenceBatch(safeProjects, options.x || {});
  const newsMap = await getNewsProjectIntelligenceBatch(safeProjects, options.news || {});
  const inlineInternetEnabled =
    options.internet?.enabled === true || process.env.EXTERNAL_INLINE_INTERNET === "true";
  const internetMap = inlineInternetEnabled
    ? await getInternetProjectResearchBatch(safeProjects, options.internet || {})
    : new Map();

  return safeProjects.map((project) => {
    const key = projectKey(project);
    const x = xMap.get(key) || {};
    const news = newsMap.get(key) || {};
    const internet = internetMap.get(key) || {};
    const local = localTextSignals(project);
    const externalSignalScore = Math.round(
      clamp(
        num(x.signalScore) * 0.3 +
          num(news.signalScore) * 0.25 +
          num(internet.signalScore) * 0.3 +
          local.score * 0.15
      )
    );
    const externalRiskScore = Math.round(
      clamp(
        Math.max(num(x.riskScore), num(news.riskScore), num(internet.riskScore), local.riskScore)
      )
    );
    const catalystHits = [
      ...(x.announcementHits || []),
      ...(news.catalystHits || []),
      ...(internet.catalystHits || []),
      ...local.catalystHits,
    ];
    const riskHits = [
      ...(x.riskHits || []),
      ...(news.riskHits || []),
      ...(internet.riskHits || []),
      ...local.riskHits,
    ];
    const status = {
      x: x.status || "NOT_RUN",
      news: news.status || "NOT_RUN",
      internet: internet.status || "NOT_RUN",
    };
    const confidence =
      status.x === "SUCCESS" || status.news === "SUCCESS" || num(internet.sourceCount) > 0
        ? 0.75
        : catalystHits.length || riskHits.length
        ? 0.45
        : 0.25;

    return {
      ...project,
      externalSignalScore,
      externalRiskScore,
      internetResearch: internet,
      internetResearchScore: num(internet.signalScore),
      internetResearchRiskScore: num(internet.riskScore),
      externalIntelligence: {
        status,
        x,
        news,
        internet,
        local,
        catalystHits: [...new Set(catalystHits)],
        narrativeHits: [...new Set(internet.narrativeHits || [])],
        riskHits: [...new Set(riskHits)],
        summary:
          externalSignalScore >= 65
            ? "External attention confirms the setup."
            : externalRiskScore >= 45
            ? "External sources show elevated risk language."
            : "External intelligence is neutral or not fully connected.",
      },
      evidence: [
        ...(project.evidence || []),
        {
          engine: "External Intelligence Engine",
          signal: "X/news/source intelligence",
          score: externalSignalScore,
          confidence,
          impact:
            externalSignalScore >= 65
              ? "Positive"
              : externalRiskScore >= 45
              ? "Negative"
              : "Neutral",
          reasons: [
            `X status: ${status.x}. News status: ${status.news}. Internet sources: ${num(internet.sourceCount)}. Crawled pages: ${num(internet.crawlPageCount)}.`,
            `${[...new Set(catalystHits)].length} catalyst terms and ${[...new Set(riskHits)].length} risk terms detected.`,
          ],
        },
      ],
    };
  });
}
