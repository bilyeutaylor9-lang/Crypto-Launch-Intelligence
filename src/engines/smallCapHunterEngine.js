const DEFAULT_TARGET_COUNT = Number(process.env.SMALL_CAP_TARGET_COUNT || 2);
const DEFAULT_BUDGET_USD = Number(process.env.SMALL_CAP_PAPER_BUDGET_USD || 100);
const DEFAULT_MAX_CAP = Number(process.env.SMALL_CAP_MAX_MARKET_CAP || 300_000_000);
const DEFAULT_MIN_LIQUIDITY = Number(process.env.SMALL_CAP_MIN_LIQUIDITY || 5_000);

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

function marketCap(project = {}) {
  return num(project.marketCap || project.fdv || project.marketData?.marketCap || project.rawCandidate?.marketCap);
}

function liquidity(project = {}) {
  return num(project.liquidityUsd || project.liquidity || project.marketData?.liquidityUsd || project.rawCandidate?.liquidityUsd);
}

function volume24h(project = {}) {
  return num(project.volume24h || project.volume || project.marketData?.volume24h || project.rawCandidate?.volume24h);
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

function capBand(cap = 0, maxCap = DEFAULT_MAX_CAP) {
  if (!cap) return { label: "Unknown Cap", score: 46, eligible: true };
  if (cap < 100_000) return { label: "Ultra Micro / Fragile", score: 42, eligible: true };
  if (cap <= 25_000_000) return { label: "Micro Cap", score: 96, eligible: true };
  if (cap <= 100_000_000) return { label: "Small Cap", score: 88, eligible: true };
  if (cap <= maxCap) return { label: "Upper Small Cap", score: 70, eligible: true };
  return { label: "Too Large For Small-Cap Hunt", score: 15, eligible: false };
}

function liquidityImpactPct(liquidityUsd = 0, budgetUsd = DEFAULT_BUDGET_USD) {
  if (!liquidityUsd) return null;
  return Number(((budgetUsd / liquidityUsd) * 100).toFixed(3));
}

function executionScore(project = {}, budgetUsd = DEFAULT_BUDGET_USD, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const liq = liquidity(project);
  const volume = volume24h(project);
  const impact = liquidityImpactPct(liq, budgetUsd);
  const liquidityScore =
    liq >= 500_000 ? 95 :
    liq >= 100_000 ? 84 :
    liq >= 50_000 ? 74 :
    liq >= 20_000 ? 62 :
    liq >= minLiquidity ? 42 :
    liq > 0 ? 18 :
    36;
  const volumeScore =
    volume >= 1_000_000 ? 90 :
    volume >= 250_000 ? 78 :
    volume >= 50_000 ? 64 :
    volume >= 10_000 ? 46 :
    volume > 0 ? 24 :
    35;
  const impactScore =
    impact === null ? 42 :
    impact <= 0.03 ? 95 :
    impact <= 0.1 ? 84 :
    impact <= 0.25 ? 68 :
    impact <= 0.75 ? 46 :
    impact <= 2 ? 28 :
    12;

  return {
    score: average([liquidityScore, volumeScore, impactScore]),
    liquidityUsd: liq,
    volume24h: volume,
    estimatedLiquidityImpactPct: impact,
    warning:
      impact === null
        ? "Liquidity unknown; verify tradability before any real order."
        : impact > 0.75
        ? "$100 would be large relative to visible liquidity; slippage risk is high."
        : "Visible liquidity can likely absorb a small paper-sized order, subject to manual verification.",
  };
}

function structureScore(project = {}) {
  return average([
    project.sourceTruthScore,
    project.proofScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
    project.githubProScore || project.githubScore,
    project.roadmapProfitabilityScore,
    project.alphaKnowledgeGraphScore,
    project.alphaKnowledgeGraph?.moduleScores?.sourceCoverage,
    project.alphaKnowledgeGraph?.moduleScores?.relationStrength,
  ]);
}

function upsideScore(project = {}) {
  return average([
    project.prePump?.score,
    project.prePumpPatternScore,
    project.narrativeHeatScore,
    project.narrativeForecastScore,
    project.liveCatalystRadarScore,
    project.catalystCalendarScore,
    project.breakoutBrainScore,
    project.breakoutProbabilitySoon,
    project.earlyBreakoutScore,
    project.momentumShiftScore,
    project.causalMarketTwinUpsideProbability,
    project.exchangeProbabilityScore,
  ]);
}

function consensusScore(project = {}) {
  return average([
    project.aiEcosystemScore,
    project.autonomousAlphaOSScore,
    project.selfEvolvingAlphaOSScore,
    project.highTechAlphaScore,
    project.alphaEvolutionGovernorScore,
    project.causalMarketTwinScore,
    project.confidenceAdjustedScore,
  ]);
}

function smallCapScore(project = {}, options = {}) {
  const budgetUsd = num(options.budgetUsd || DEFAULT_BUDGET_USD);
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);
  const cap = marketCap(project);
  const band = capBand(cap, num(options.maxMarketCap || DEFAULT_MAX_CAP));
  const execution = executionScore(project, budgetUsd, minLiquidity);
  const structure = structureScore(project);
  const upside = upsideScore(project);
  const consensus = consensusScore(project);
  const risk = maxRisk(project);
  const riskIntegrity = clamp(100 - risk);
  const score = Math.round(
    clamp(
      band.score * 0.14 +
        execution.score * 0.16 +
        structure * 0.23 +
        upside * 0.22 +
        consensus * 0.14 +
        riskIntegrity * 0.11
    )
  );

  return {
    score,
    cap,
    band,
    execution,
    structure,
    upside,
    consensus,
    risk,
    riskIntegrity,
  };
}

function verdictFor(metrics = {}, options = {}) {
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);

  if (metrics.risk >= 78) return "Small-Cap Risk Block";
  if (!metrics.band.eligible) return "Too Large For Small-Cap Hunt";
  if (metrics.execution.liquidityUsd > 0 && metrics.execution.liquidityUsd < minLiquidity) {
    return "Small-Cap Liquidity Block";
  }
  if (metrics.score >= 68 && metrics.structure >= 45 && metrics.execution.score >= 40) {
    return "Small-Cap Research Candidate";
  }
  if (metrics.score >= 52) return "Small-Cap Watch";
  return "Small-Cap Thin Data";
}

function reasons(project = {}, metrics = {}) {
  const output = [];

  output.push(
    metrics.cap
      ? `${metrics.band.label} at about $${Math.round(metrics.cap).toLocaleString()} market cap/FDV.`
      : "Market cap/FDV is unknown, so this needs cap proof before real-world action."
  );
  if (metrics.upside >= 55) output.push("Upside stack has narrative, catalyst, pre-pump, or breakout support.");
  if (metrics.structure >= 55) output.push("Structure stack has usable source, proof, GitHub, graph, or roadmap confirmation.");
  if (metrics.consensus >= 55) output.push("AI/OS/governor consensus is stronger than the scan baseline.");
  if (metrics.execution.score >= 55) output.push("$100 paper-size execution looks structurally reasonable from visible liquidity/volume.");
  if (project.alphaEvolutionGovernorVerdict === "Governor Priority Research") output.push("Alpha Governor marked it as priority research.");
  if (project.breakoutBrainSelected) output.push("Breakout Brain selected it as a best-available breakout setup.");

  return output.slice(0, 7);
}

function warnings(project = {}, metrics = {}) {
  const output = [
    "Research only; not financial advice or a buy recommendation.",
    metrics.execution.warning,
  ];

  if (!metrics.cap) output.push("Market cap/FDV is unknown; verify cap before treating it as a true small cap.");
  if (metrics.risk >= 55) output.push("Risk stack is elevated; review trap, unlock, sell pressure, and false-positive signals.");
  if (metrics.structure < 45) output.push("Structure is not strong enough without more source/GitHub/roadmap proof.");
  if (project.aiDisagreement?.level === "High") output.push("AI council disagreement is high; require manual confirmation.");
  if (project.redTeamReview?.status === "Block") output.push("Red-team block is active; do not promote without resolving it.");

  return [...new Set(output)].slice(0, 8);
}

function paperPlan(project = {}, metrics = {}, options = {}) {
  const budgetUsd = num(options.budgetUsd || DEFAULT_BUDGET_USD);
  const perCandidateUsd = Number((budgetUsd / Math.max(1, num(options.targetCount || DEFAULT_TARGET_COUNT))).toFixed(2));

  return {
    label: "$100 Paper Plan",
    mode: "Paper research plan only",
    totalPaperBudgetUsd: budgetUsd,
    maxPaperBudgetForThisCandidateUsd: perCandidateUsd,
    starterTrancheUsd: Number((perCandidateUsd * 0.4).toFixed(2)),
    confirmationTrancheUsd: Number((perCandidateUsd * 0.35).toFixed(2)),
    finalValidationTrancheUsd: Number((perCandidateUsd * 0.25).toFixed(2)),
    estimatedLiquidityImpactPct: metrics.execution.estimatedLiquidityImpactPct,
    confirmationTriggers: [
      "Verify official contract/pair and source identity.",
      "Confirm visible liquidity and expected slippage manually.",
      "Confirm roadmap/catalyst and GitHub/source proof are real.",
      "Reject if trap risk, sell pressure, unlock risk, or red-team block rises.",
    ],
    note: "This is a research simulation for a small account size, not a recommendation to buy.",
  };
}

export function analyzeSmallCapHunter(project = {}, options = {}) {
  const metrics = smallCapScore(project, options);
  const verdict = verdictFor(metrics, options);

  return {
    ...project,
    smallCapHunterScore: metrics.score,
    smallCapHunterVerdict: verdict,
    smallCapMarketCap: metrics.cap,
    smallCapBand: metrics.band.label,
    smallCapStructureScore: metrics.structure,
    smallCapUpsideScore: metrics.upside,
    smallCapExecutionScore: metrics.execution.score,
    smallCapRiskScore: metrics.risk,
    smallCapHunter: {
      name: "Small-Cap Hunter",
      score: metrics.score,
      verdict,
      marketCap: metrics.cap,
      capBand: metrics.band,
      moduleScores: {
        capFit: metrics.band.score,
        execution: metrics.execution.score,
        structure: metrics.structure,
        upside: metrics.upside,
        consensus: metrics.consensus,
        riskIntegrity: metrics.riskIntegrity,
      },
      execution: metrics.execution,
      reasons: reasons(project, metrics),
      warnings: warnings(project, metrics),
      paperPlan: paperPlan(project, metrics, options),
      mustVerify: [
        "Official token contract, pair, chain, and website.",
        "Actual liquidity depth, slippage, taxes, honeypot status, and lock status.",
        "Recent roadmap/catalyst evidence from official or trusted sources.",
        "Token unlocks, emissions, team allocation, and insider sell pressure.",
        "Whether the token is available in your jurisdiction and exchange/wallet setup.",
      ],
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Small-Cap Hunter",
        signal: verdict,
        score: metrics.score,
        confidence: metrics.structure >= 60 ? 0.7 : metrics.structure >= 45 ? 0.55 : 0.36,
        impact: verdict === "Small-Cap Research Candidate" ? "Positive" : verdict.includes("Block") ? "Negative" : "Neutral",
        reasons: [
          `Cap band: ${metrics.band.label}.`,
          `Structure ${metrics.structure}, upside ${metrics.upside}, execution ${metrics.execution.score}, risk ${metrics.risk}.`,
          metrics.execution.warning,
        ],
      },
    ],
  };
}

function eligibleForSelection(project = {}) {
  return (
    project.smallCapHunter &&
    !["Small-Cap Risk Block", "Small-Cap Liquidity Block", "Too Large For Small-Cap Hunt"].includes(project.smallCapHunterVerdict) &&
    num(project.smallCapHunterScore) > 0 &&
    project.redTeamReview?.status !== "Block"
  );
}

export function analyzeSmallCapHunterBatch(projects = [], options = {}) {
  const targetCount = Math.max(1, Math.round(num(options.targetCount || DEFAULT_TARGET_COUNT)));
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeSmallCapHunter(project, {
      ...options,
      targetCount,
    })
  );
  const selectedKeys = new Map(
    analyzed
      .map((project, index) => ({
        project,
        key: `${index}:${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`,
      }))
      .filter(({ project }) => eligibleForSelection(project))
      .sort((a, b) => num(b.project.smallCapHunterScore) - num(a.project.smallCapHunterScore))
      .slice(0, targetCount)
      .map(({ key }, index) => [key, index + 1])
  );

  return analyzed.map((project, index) => {
    const key = `${index}:${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`;
    const selectionRank = selectedKeys.get(key) || null;
    const selected = Boolean(selectionRank);

    return {
      ...project,
      smallCapHunterSelected: selected,
      smallCapHunterSelectionRank: selectionRank,
      smallCapHunterVerdict: selected
        ? "Top-2 Small-Cap Research Candidate"
        : project.smallCapHunterVerdict,
      alphaTags: selected
        ? [...new Set([...(project.alphaTags || []), "Top-2 Small-Cap Research Candidate"])]
        : project.alphaTags,
      smallCapHunter: {
        ...(project.smallCapHunter || {}),
        selected,
        selectionRank,
        caveat: selected
          ? "Top-2 best-available small-cap research candidate. This is not a buy recommendation; verify manually before any real trade."
          : project.smallCapHunter?.caveat,
      },
    };
  });
}

export function summarizeSmallCapHunter(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const hunted = safeProjects.filter((project) => project.smallCapHunter);
  const selected = hunted
    .filter((project) => project.smallCapHunterSelected)
    .sort((a, b) => num(a.smallCapHunterSelectionRank) - num(b.smallCapHunterSelectionRank));

  return {
    generatedAt: new Date().toISOString(),
    name: "Small-Cap Hunter",
    disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a guarantee of future performance.",
    totalProjects: safeProjects.length,
    huntedProjects: hunted.length,
    targetCount: DEFAULT_TARGET_COUNT,
    selectedCount: selected.length,
    topTwo: selected.map((project) => compact(project)),
    researchCandidates: hunted.filter((project) => project.smallCapHunterVerdict === "Top-2 Small-Cap Research Candidate").length,
    watchCount: hunted.filter((project) => project.smallCapHunterVerdict === "Small-Cap Watch").length,
    riskBlocks: hunted.filter((project) => project.smallCapHunterVerdict === "Small-Cap Risk Block").length,
    topProjects: [...hunted]
      .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
      .slice(0, 50)
      .map((project) => compact(project)),
  };
}

function compact(project = {}) {
  return {
    selectionRank: project.smallCapHunterSelectionRank || null,
    selected: Boolean(project.smallCapHunterSelected),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.smallCapHunterScore || 0,
    verdict: project.smallCapHunterVerdict || "Unknown",
    marketCap: project.smallCapMarketCap || 0,
    capBand: project.smallCapBand || "Unknown",
    structureScore: project.smallCapStructureScore || 0,
    upsideScore: project.smallCapUpsideScore || 0,
    executionScore: project.smallCapExecutionScore || 0,
    riskScore: project.smallCapRiskScore || 0,
    liquidityUsd: project.smallCapHunter?.execution?.liquidityUsd || 0,
    volume24h: project.smallCapHunter?.execution?.volume24h || 0,
    estimatedLiquidityImpactPct: project.smallCapHunter?.execution?.estimatedLiquidityImpactPct ?? null,
    paperPlan: project.smallCapHunter?.paperPlan || {},
    reasons: project.smallCapHunter?.reasons || [],
    warnings: project.smallCapHunter?.warnings || [],
    mustVerify: project.smallCapHunter?.mustVerify || [],
  };
}
