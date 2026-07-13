function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
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

function marketRegime(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const avgHeat = average(safeProjects.map((project) => project.narrativeHeatScore));
  const avgLiquidity = average(safeProjects.map((project) => project.liquidityScore || project.liquidityExpansionScore));
  const avgRisk = average(safeProjects.map(maxRisk));
  const avgProof = average(safeProjects.map((project) => project.sourceTruthScore || project.proofScore));
  const state =
    avgRisk >= 55
      ? "Risk-Off"
      : avgHeat >= 68 && avgLiquidity >= 50
      ? "Narrative Risk-On"
      : avgHeat >= 68
      ? "Narrative Rotation Without Liquidity"
      : avgProof >= 58
      ? "Proof-Selective"
      : "Selective";

  return {
    state,
    avgHeat,
    avgLiquidity,
    avgRisk,
    avgProof,
    bias:
      state === "Risk-Off"
        ? "Penalize weak proof and liquidity; require hard invalidation checks."
        : state === "Narrative Risk-On"
        ? "Allow stronger narrative upside when liquidity confirms."
        : state === "Narrative Rotation Without Liquidity"
        ? "Demand liquidity before promotion."
        : state === "Proof-Selective"
        ? "Reward evidence quality and builder confirmation."
        : "Use balanced scenario weights.",
  };
}

function normalizeProbabilities(scenarios = []) {
  const total = scenarios.reduce((sum, scenario) => sum + Math.max(1, num(scenario.rawProbability)), 0);
  let used = 0;

  return scenarios.map((scenario, index) => {
    const probability =
      index === scenarios.length - 1
        ? Math.max(0, 100 - used)
        : Math.round((Math.max(1, num(scenario.rawProbability)) / total) * 100);
    used += probability;
    const { rawProbability, ...rest } = scenario;
    return {
      ...rest,
      probability,
    };
  });
}

function scenarioSet(project = {}, regime = {}) {
  const risk = maxRisk(project);
  const proof = average([project.alphaKnowledgeGraphConfidenceScore, project.sourceTruthScore, project.proofScore, project.dataConfidenceScore]);
  const catalyst = average([project.liveCatalystRadarScore, project.roadmapProfitabilityScore, project.catalystCalendarScore]);
  const liquidity = average([project.liquidityExpansionScore, project.liquidityScore, project.capitalFlowScore, project.buyPressureScore]);
  const narrative = average([project.narrativeHeatScore, project.narrativeForecastScore, project.infrastructureNarrativeScore]);
  const smartMoney = average([
    project.smartMoneyAccumulationScore,
    project.smartWalletPerformanceScore,
    project.smartWalletScore,
    project.whaleScore || project.whaleActivityScore,
  ]);
  const engineCore = average([
    project.alphaKnowledgeGraphScore,
    project.causalAlphaScore,
    project.simulationBrainScore,
    project.breakoutBrainScore,
    project.autonomousAlphaOSScore,
    project.selfEvolvingAlphaOSScore,
  ]);
  const contract = average([project.proofCarryingAlphaContractScore, project.alphaEvolutionGovernorScore]);
  const listing = average([project.exchangeProbabilityScore, project.cexListingScore, catalyst]);
  const riskOnBoost = regime.state === "Narrative Risk-On" ? 12 : regime.state === "Risk-Off" ? -12 : 0;
  const liquidityNeed = liquidity < 40 ? 14 : 0;

  return normalizeProbabilities([
    {
      id: "bull_case",
      label: "Bull Case",
      rawProbability: engineCore * 0.36 + narrative * 0.2 + catalyst * 0.16 + liquidity * 0.14 + smartMoney * 0.1 + riskOnBoost - risk * 0.18,
      expectedMovePct: Math.round(clamp(engineCore * 0.32 + narrative * 0.22 + catalyst * 0.2 + liquidity * 0.12 - risk * 0.1, -35, 160)),
      triggers: [
        "Narrative heat keeps expanding.",
        "Catalyst proof confirms on schedule.",
        "Liquidity and smart-money signals remain supportive.",
      ],
      invalidatesIf: [
        "Liquidity expansion stalls while attention rises.",
        "Source truth or proof score drops below 45.",
      ],
    },
    {
      id: "base_case",
      label: "Base Case",
      rawProbability: 48 + proof * 0.22 + contract * 0.12 + engineCore * 0.12 - Math.abs(risk - 35) * 0.12,
      expectedMovePct: Math.round(clamp(engineCore * 0.14 + proof * 0.08 + catalyst * 0.08 - risk * 0.08, -25, 60)),
      triggers: [
        "Existing evidence remains valid.",
        "No major catalyst surprise appears.",
      ],
      invalidatesIf: [
        "Risk flags rise faster than source quality.",
      ],
    },
    {
      id: "bear_case",
      label: "Bear Case",
      rawProbability: risk * 0.48 + Math.max(0, 45 - proof) * 0.26 + Math.max(0, 45 - liquidity) * 0.18 + liquidityNeed,
      expectedMovePct: -Math.round(clamp(risk * 0.34 + Math.max(0, 50 - proof) * 0.22 + liquidityNeed, 8, 85)),
      triggers: [
        "Trap, unlock, sell-pressure, or false-positive risk dominates.",
        "Evidence stays thin across independent sources.",
      ],
      invalidatesIf: [
        "Risk compresses and proof quality rises above 60.",
      ],
    },
    {
      id: "catalyst_delay",
      label: "Catalyst Delay",
      rawProbability: Math.max(8, catalyst * 0.18 + Math.max(0, 60 - proof) * 0.18),
      expectedMovePct: -Math.round(clamp(8 + Math.max(0, 60 - catalyst) * 0.18, 5, 35)),
      triggers: [
        "Roadmap or listing catalyst slips.",
        "Research queue finds missing official confirmation.",
      ],
      invalidatesIf: [
        "Official roadmap evidence confirms timing.",
      ],
    },
    {
      id: "listing_surprise",
      label: "Listing Surprise",
      rawProbability: listing * 0.22 + catalyst * 0.14 + liquidity * 0.1 - risk * 0.08,
      expectedMovePct: Math.round(clamp(12 + listing * 0.42 + liquidity * 0.12 - risk * 0.12, -10, 120)),
      triggers: [
        "Exchange probability rises with liquidity and source confirmation.",
        "CEX or launchpad signal appears in verified sources.",
      ],
      invalidatesIf: [
        "Listing evidence remains rumor-only.",
      ],
    },
    {
      id: "liquidity_drain",
      label: "Liquidity Drain",
      rawProbability: Math.max(6, Math.max(0, 58 - liquidity) * 0.38 + num(project.sellPressureScore) * 0.28 + risk * 0.18),
      expectedMovePct: -Math.round(clamp(10 + Math.max(0, 60 - liquidity) * 0.34 + risk * 0.12, 8, 70)),
      triggers: [
        "Liquidity depth falls or sell pressure rises.",
        "Narrative attention outpaces tradable depth.",
      ],
      invalidatesIf: [
        "Liquidity expansion and capital flow both confirm above 60.",
      ],
    },
    {
      id: "narrative_rotation",
      label: "Narrative Rotation",
      rawProbability: narrative * 0.2 + (project.alphaKnowledgeGraph?.graph?.memoryRelations?.narrativeClusters?.[0]?.count || 0) * 5 + riskOnBoost,
      expectedMovePct: Math.round(clamp(narrative * 0.3 + engineCore * 0.12 - risk * 0.12, -20, 95)),
      triggers: [
        "Peer projects in the same narrative start moving.",
        "Knowledge graph shows clustered narrative attention.",
      ],
      invalidatesIf: [
        "Narrative cluster cools or related projects underperform.",
      ],
    },
    {
      id: "invalidation_case",
      label: "Invalidation Case",
      rawProbability:
        (project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated" ? 90 : 0) +
        risk * 0.22 +
        Math.max(0, 45 - proof) * 0.2,
      expectedMovePct: -Math.round(clamp(15 + risk * 0.38 + Math.max(0, 55 - proof) * 0.2, 12, 95)),
      triggers: [
        "Alpha contract invalidation fires.",
        "Red-team, source, or risk firewall blocks the thesis.",
      ],
      invalidatesIf: [
        "Invalidation evidence is disproven and proof quality recovers.",
      ],
    },
  ]);
}

function expectedValue(scenarios = []) {
  return Math.round(
    scenarios.reduce((sum, scenario) => sum + (num(scenario.probability) / 100) * num(scenario.expectedMovePct), 0)
  );
}

function scenarioStats(scenarios = []) {
  const byId = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario]));
  const upsideProbability =
    num(byId.bull_case?.probability) +
    num(byId.listing_surprise?.probability) +
    num(byId.narrative_rotation?.probability);
  const downsideProbability =
    num(byId.bear_case?.probability) +
    num(byId.liquidity_drain?.probability) +
    num(byId.invalidation_case?.probability);
  const best = [...scenarios].sort((a, b) => num(b.expectedMovePct) - num(a.expectedMovePct))[0] || null;
  const worst = [...scenarios].sort((a, b) => num(a.expectedMovePct) - num(b.expectedMovePct))[0] || null;

  return {
    upsideProbability,
    downsideProbability,
    bestScenario: best,
    worstScenario: worst,
    expectedReturnPct: expectedValue(scenarios),
  };
}

function twinScore(project = {}, stats = {}, confidence = 0) {
  const risk = maxRisk(project);
  return Math.round(
    clamp(
      average([
        project.alphaKnowledgeGraphScore,
        project.causalAlphaScore,
        project.simulationBrainScore,
        project.breakoutBrainScore,
        project.autonomousAlphaOSScore,
        project.sourceTruthScore,
      ]) *
        0.58 +
        confidence * 0.14 +
        stats.upsideProbability * 0.16 +
        clamp(50 + stats.expectedReturnPct, 0, 100) * 0.18 -
        stats.downsideProbability * 0.12 -
        risk * 0.16
    )
  );
}

function twinConfidence(project = {}) {
  return Math.round(
    clamp(
      average([
        project.alphaKnowledgeGraphConfidenceScore,
        project.causalAlphaConfidenceScore,
        project.sourceTruthScore,
        project.proofScore,
        project.dataConfidenceScore,
        project.evidenceQualityScore,
      ]) * 0.84 +
        Math.min(12, num(project.alphaKnowledgeGraph?.memoryContext?.scans) * 2) +
        (project.aiDisagreement?.level === "High" ? -8 : 5)
    )
  );
}

function decisionFor(project = {}, score = 0, confidence = 0, stats = {}) {
  const risk = maxRisk(project);
  const invalidated = project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated";
  if (stats.downsideProbability >= 62 || (risk >= 82 && stats.downsideProbability >= 50)) return "Twin Risk Block";
  if (invalidated && confidence < 38 && stats.downsideProbability >= 50) return "Twin Risk Block";
  if (score >= 78 && confidence >= 62 && stats.expectedReturnPct >= 18) return "Twin Strong Buy Research Candidate";
  if (score >= 64 && confidence >= 50 && stats.expectedReturnPct >= 5) return "Twin Priority Research";
  if (score >= 48) return "Twin Watch";
  return "Twin Reject";
}

function primaryDriver(project = {}, scenarios = []) {
  const graphDriver = project.alphaKnowledgeGraph?.dominantRelation;
  const causalDriver = project.causalSignalGraph?.primaryDriver?.label;
  const topScenario = [...scenarios].sort((a, b) => num(b.probability) - num(a.probability))[0];

  return causalDriver || graphDriver || topScenario?.label || "Unknown";
}

function nextExperiments(project = {}, stats = {}, decision = "") {
  const experiments = [];

  if (num(project.sourceTruthScore) < 55) experiments.push("Verify official website, docs, contract, and exchange/DEX source identity.");
  if (num(project.githubProScore || project.githubScore) < 50) experiments.push("Find the official GitHub and check recent commits, releases, and contributors.");
  if (num(project.liquidityExpansionScore || project.liquidityScore) < 50) experiments.push("Recheck liquidity depth, concentration, migration, and sell pressure.");
  if (num(project.liveCatalystRadarScore || project.roadmapProfitabilityScore) < 55) experiments.push("Confirm the next roadmap catalyst from multiple sources.");
  if (stats.downsideProbability >= 45) experiments.push("Run a risk autopsy before any promotion.");
  if (decision.includes("Strong") || decision.includes("Priority")) experiments.push("Paper-track the thesis at 1d, 7d, and 30d before increasing trust.");

  return experiments.slice(0, 7);
}

export function analyzeCausalMarketTwin(project = {}, context = {}) {
  const regime = context.regime || marketRegime(context.projects || [project]);
  const scenarios = scenarioSet(project, regime);
  const stats = scenarioStats(scenarios);
  const confidenceScore = twinConfidence(project);
  const score = twinScore(project, stats, confidenceScore);
  const decision = decisionFor(project, score, confidenceScore, stats);
  const experiments = nextExperiments(project, stats, decision);
  const driver = primaryDriver(project, scenarios);

  return {
    ...project,
    causalMarketTwinScore: score,
    causalMarketTwinConfidenceScore: confidenceScore,
    causalMarketTwinConfidence:
      confidenceScore >= 72 ? "High" : confidenceScore >= 55 ? "Medium" : confidenceScore >= 38 ? "Developing" : "Low",
    causalMarketTwinVerdict: decision,
    causalMarketTwinExpectedReturnPct: stats.expectedReturnPct,
    causalMarketTwinUpsideProbability: stats.upsideProbability,
    causalMarketTwinDownsideProbability: stats.downsideProbability,
    causalMarketTwin: {
      name: "Causal Market Twin",
      score,
      confidenceScore,
      verdict: decision,
      regime,
      primaryCausalDriver: driver,
      expectedReturnPct: stats.expectedReturnPct,
      upsideProbability: stats.upsideProbability,
      downsideProbability: stats.downsideProbability,
      scenarios,
      bestScenario: stats.bestScenario,
      worstScenario: stats.worstScenario,
      experiments,
      thesis:
        `${project.name || project.symbol || "Project"} is modeled through ${scenarios.length} causal scenarios. ` +
        `Expected return ${stats.expectedReturnPct}%, upside probability ${stats.upsideProbability}%, downside probability ${stats.downsideProbability}%.`,
      invalidation:
        stats.worstScenario?.invalidatesIf?.[0] ||
        "Invalidate if risk, proof, liquidity, or catalyst evidence breaks the modeled path.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Causal Market Twin",
        signal: decision,
        score,
        confidence: confidenceScore / 100,
        impact: decision === "Twin Risk Block" ? "Negative" : score >= 64 ? "Positive" : "Neutral",
        reasons: [
          `Expected return ${stats.expectedReturnPct}%, upside ${stats.upsideProbability}%, downside ${stats.downsideProbability}%.`,
          `Primary driver: ${driver}. Regime: ${regime.state}.`,
          experiments[0] || "No immediate experiment required.",
        ],
      },
    ],
  };
}

export function analyzeCausalMarketTwinBatch(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const regime = marketRegime(safeProjects);

  return safeProjects.map((project) =>
    analyzeCausalMarketTwin(project, {
      projects: safeProjects,
      regime,
    })
  );
}

export function summarizeCausalMarketTwin(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const twinned = safeProjects.filter((project) => project.causalMarketTwin);
  const regime = marketRegime(safeProjects);

  return {
    generatedAt: new Date().toISOString(),
    name: "Causal Market Twin",
    totalProjects: safeProjects.length,
    twinnedProjects: twinned.length,
    marketRegime: regime,
    strongBuyResearch: twinned.filter((project) => project.causalMarketTwinVerdict === "Twin Strong Buy Research Candidate").length,
    priorityResearch: twinned.filter((project) => project.causalMarketTwinVerdict === "Twin Priority Research").length,
    riskBlocks: twinned.filter((project) => project.causalMarketTwinVerdict === "Twin Risk Block").length,
    averageExpectedReturnPct: average(twinned.map((project) => project.causalMarketTwinExpectedReturnPct)),
    topProjects: [...twinned]
      .sort((a, b) => num(b.causalMarketTwinScore) - num(a.causalMarketTwinScore))
      .slice(0, 50)
      .map((project, index) => ({
        rank: index + 1,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        score: project.causalMarketTwinScore || 0,
        confidence: project.causalMarketTwinConfidence || "Unknown",
        verdict: project.causalMarketTwinVerdict || "Unknown",
        expectedReturnPct: project.causalMarketTwinExpectedReturnPct || 0,
        upsideProbability: project.causalMarketTwinUpsideProbability || 0,
        downsideProbability: project.causalMarketTwinDownsideProbability || 0,
        primaryCausalDriver: project.causalMarketTwin?.primaryCausalDriver || "Unknown",
        bestScenario: project.causalMarketTwin?.bestScenario || null,
        worstScenario: project.causalMarketTwin?.worstScenario || null,
        experiments: project.causalMarketTwin?.experiments || [],
      })),
  };
}
