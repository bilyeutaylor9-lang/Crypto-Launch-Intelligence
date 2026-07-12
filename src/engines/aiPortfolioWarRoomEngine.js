const NARRATIVES = {
  ai: ["ai", "agent", "agents", "compute", "inference", "model"],
  rwa: ["rwa", "real world asset", "tokenized", "treasury", "credit"],
  depin: ["depin", "gpu", "wireless", "storage", "physical infrastructure"],
  solana: ["solana", "jupiter", "raydium", "jito", "pump"],
  base: ["base", "coinbase", "aerodrome", "onchain"],
  gaming: ["gaming", "gamefi", "nft game", "metaverse"],
  restaking: ["restaking", "staking", "avs", "validator", "delegation"],
  stablecoins: ["stablecoin", "stablecoins", "synthetic dollar", "payments"],
  zk: ["zk", "zero knowledge", "privacy", "proof"],
  modular: ["modular", "rollup", "data availability", "appchain"],
  launchpads: ["launchpad", "launch", "tge", "airdrop", "points", "ido"],
};

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

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.alphaTags || []),
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function projectNarratives(project = {}) {
  const text = textFor(project);
  const matched = Object.entries(NARRATIVES)
    .filter(([, terms]) => terms.some((term) => text.includes(term)))
    .map(([name]) => name);

  if (!matched.length && project.chain && project.chain !== "unknown") return [String(project.chain).toLowerCase()];
  return matched.length ? matched : ["uncategorized"];
}

function projectWarRoomScore(project = {}) {
  return Math.round(
    clamp(
      avg([
        project.alphaInvestigatorScore,
        project.researchCommanderScore,
        project.aiEcosystemScore,
        project.confidenceAdjustedScore,
        project.simulationBrainScore,
        project.roadmapProfitabilityScore,
        project.liveCatalystRadarScore,
        project.sourceReliabilityScore,
      ]) -
        Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.externalRiskScore)) * 0.18
    )
  );
}

function allocation(score = 0, project = {}) {
  const risk = Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.tokenUnlockRiskScore));

  if (risk >= 75) return "Avoid";
  if (score >= 78 && num(project.dataConfidenceScore) >= 58) return "Core Watch";
  if (score >= 64) return "Priority Research";
  if (score >= 48) return "Small Speculative";
  if (score >= 34) return "Wait For Confirmation";
  return "Ignore";
}

function roleFor(project = {}) {
  const roles = [
    { role: "Best Catalyst Setup", score: project.liveCatalystRadarScore || project.catalystCalendarScore },
    { role: "Best GitHub Activity", score: project.developerActivityScore || project.githubQualityScore },
    { role: "Best Risk-Adjusted", score: num(project.confidenceAdjustedScore) - num(project.trapRiskScore) * 0.3 },
    { role: "Best Roadmap Path", score: project.roadmapProfitabilityScore },
    { role: "Best Early Project", score: num(project.discoveryPriorityScore) + num(project.webResearchPriority) * 0.4 },
    { role: "Best Established Project", score: num(project.marketRankScore) + num(project.liquidityScore) * 0.4 },
  ].sort((a, b) => num(b.score) - num(a.score));

  return roles[0]?.score > 0 ? roles[0].role : "Research Candidate";
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.aiPortfolioWarRoomScore || 0,
    allocation: project.aiWarRoomAllocation || "Unknown",
    role: project.aiWarRoomRole || "Research Candidate",
    aiVerdict: project.aiEcosystemVerdict || "Unknown",
    alphaVerdict: project.alphaInvestigatorVerdict || "Unknown",
    commanderVerdict: project.researchCommanderVerdict || "Unknown",
    roadmapProfitabilityVerdict: project.roadmapProfitabilityVerdict || "Unknown",
    risk: Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.externalRiskScore)),
  };
}

export function buildAIPortfolioWarRoom(projects = []) {
  const annotated = (Array.isArray(projects) ? projects : []).map((project) => {
    const narratives = projectNarratives(project);
    const score = projectWarRoomScore(project);
    return {
      ...project,
      aiPortfolioWarRoomScore: score,
      aiWarRoomNarratives: narratives,
      aiWarRoomRole: roleFor(project),
      aiWarRoomAllocation: allocation(score, project),
    };
  });

  const narrativeMap = new Map();
  for (const project of annotated) {
    for (const narrative of project.aiWarRoomNarratives || ["uncategorized"]) {
      const group = narrativeMap.get(narrative) || [];
      group.push(project);
      narrativeMap.set(narrative, group);
    }
  }

  const battleMap = [...narrativeMap.entries()]
    .map(([narrative, members]) => {
      const sorted = [...members].sort((a, b) => num(b.aiPortfolioWarRoomScore) - num(a.aiPortfolioWarRoomScore));
      const momentum = avg(sorted.map((project) => project.narrativeHeatScore || project.momentumShiftScore || project.projectChangeScore));
      const github = avg(sorted.map((project) => project.developerActivityScore || project.githubQualityScore || project.githubActivityScore));
      const liquidity = avg(sorted.map((project) => project.liquidityExpansionScore || project.liquidityScore));
      const catalysts = avg(sorted.map((project) => project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore));
      const risk = avg(sorted.map((project) => Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.externalRiskScore))));
      const score = Math.round(clamp(momentum * 0.25 + github * 0.16 + liquidity * 0.2 + catalysts * 0.24 + avg(sorted.map((p) => p.aiPortfolioWarRoomScore)) * 0.25 - risk * 0.18));

      return {
        narrative,
        score,
        projectCount: sorted.length,
        momentum,
        github,
        liquidity,
        catalysts,
        risk,
        state: score >= 75 ? "Dominant" : score >= 60 ? "Active" : score >= 42 ? "Developing" : "Quiet",
        bestInClass: {
          bestOverall: compact(sorted[0]),
          bestEarly: compact([...sorted].sort((a, b) => num(b.discoveryPriorityScore) - num(a.discoveryPriorityScore))[0]),
          bestCatalyst: compact([...sorted].sort((a, b) => num(b.liveCatalystRadarScore || b.catalystCalendarScore) - num(a.liveCatalystRadarScore || a.catalystCalendarScore))[0]),
          bestGithub: compact([...sorted].sort((a, b) => num(b.developerActivityScore || b.githubQualityScore) - num(a.developerActivityScore || a.githubQualityScore))[0]),
          bestRiskAdjusted: compact([...sorted].sort((a, b) => (num(b.confidenceAdjustedScore) - num(b.trapRiskScore) * 0.3) - (num(a.confidenceAdjustedScore) - num(a.trapRiskScore) * 0.3))[0]),
          needsMoreProof: compact(sorted.find((project) => project.researchCommanderVerdict === "Needs More Proof") || sorted[0]),
        },
      };
    })
    .sort((a, b) => num(b.score) - num(a.score));

  const topProjects = [...annotated].sort((a, b) => num(b.aiPortfolioWarRoomScore) - num(a.aiPortfolioWarRoomScore));
  const battlePlan = {
    generatedAt: new Date().toISOString(),
    totalProjects: annotated.length,
    narrativeBattleMap: battleMap,
    topNarratives: battleMap.slice(0, 8),
    bestInClassBoard: battleMap.slice(0, 12).map((item) => ({
      narrative: item.narrative,
      state: item.state,
      score: item.score,
      ...item.bestInClass,
    })),
    capitalAllocation: {
      coreWatch: topProjects.filter((project) => project.aiWarRoomAllocation === "Core Watch").map(compact),
      priorityResearch: topProjects.filter((project) => project.aiWarRoomAllocation === "Priority Research").map(compact),
      smallSpeculative: topProjects.filter((project) => project.aiWarRoomAllocation === "Small Speculative").slice(0, 25).map(compact),
      waitForConfirmation: topProjects.filter((project) => project.aiWarRoomAllocation === "Wait For Confirmation").slice(0, 25).map(compact),
      avoid: topProjects.filter((project) => project.aiWarRoomAllocation === "Avoid").slice(0, 25).map(compact),
    },
    commanderBrief:
      battleMap.length > 0
        ? `Focus on ${battleMap.slice(0, 4).map((item) => item.narrative).join(", ")}. Highest ranked project: ${topProjects[0]?.name || "none"}.`
        : "No narrative battle map available yet.",
  };

  return { annotated, battlePlan };
}

export function analyzeAIPortfolioWarRoomBatch(projects = []) {
  const { annotated, battlePlan } = buildAIPortfolioWarRoom(projects);
  return annotated.map((project) => ({
    ...project,
    aiPortfolioWarRoom: {
      score: project.aiPortfolioWarRoomScore,
      allocation: project.aiWarRoomAllocation,
      role: project.aiWarRoomRole,
      narratives: project.aiWarRoomNarratives,
      topNarratives: battlePlan.topNarratives.map((item) => ({
        narrative: item.narrative,
        score: item.score,
        state: item.state,
      })),
      commanderBrief: battlePlan.commanderBrief,
    },
  }));
}
