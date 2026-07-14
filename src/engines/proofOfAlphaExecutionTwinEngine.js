function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const DEFAULT_BUDGET_USD = positiveNumber(process.env.EXECUTION_TWIN_BUDGET_USD, 100);
const DEFAULT_TARGET_COUNT = positiveNumber(process.env.EXECUTION_TWIN_TARGET_COUNT, 2);

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

function liquidity(project = {}) {
  return num(project.liquidityUsd || project.liquidity || project.smallCapHunter?.execution?.liquidityUsd);
}

function volume(project = {}) {
  return num(project.volume24h || project.volume || project.smallCapHunter?.execution?.volume24h);
}

function price(project = {}) {
  return num(project.priceUsd || project.price || project.marketData?.priceUsd);
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.riskScore),
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.smallCapRiskScore)
  );
}

function normalizeRouteName(value = "") {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();

  if (!raw) return "Unavailable";
  if (normalized.includes("coinbase")) return "Coinbase";
  if (normalized.includes("metamask")) return "MetaMask";
  return raw;
}

function routeProof(project = {}) {
  const route = project.smallCapHunter?.purchaseRoute || {};
  const routes = Array.isArray(route.routes) ? route.routes : [];
  const preferredRoute = normalizeRouteName(route.preferredRoute || routes[0]?.type || "Unavailable");
  const detected = Boolean(route.purchasable || routes.length);
  const confidence = detected ? clamp(route.score || routes[0]?.confidence || 55) : 0;

  return {
    detected,
    preferredRoute,
    status: route.status || (detected ? "Detected" : "No verified route"),
    confidence,
    routes,
    blockers: detected ? [] : ["No Coinbase or MetaMask-compatible route proof."],
  };
}

function executionQuote(project = {}, budgetUsd = DEFAULT_BUDGET_USD) {
  const liq = liquidity(project);
  const vol = volume(project);
  const px = price(project);
  const tokens = px > 0 ? Number((budgetUsd / px).toFixed(6)) : null;
  const liquidityImpactPct = liq > 0 ? Number(((budgetUsd / liq) * 100).toFixed(4)) : null;
  const volumeImpactPct = vol > 0 ? Number(((budgetUsd / vol) * 100).toFixed(4)) : null;
  const estimatedSlippagePct =
    liquidityImpactPct === null
      ? null
      : Number(Math.min(20, liquidityImpactPct * 1.8 + (liq < 25_000 ? 2.5 : 0.15)).toFixed(3));
  const executionScore =
    liq >= 500_000 ? 92 :
    liq >= 100_000 ? 82 :
    liq >= 50_000 ? 72 :
    liq >= 20_000 ? 58 :
    liq >= 5_000 ? 38 :
    liq > 0 ? 18 :
    25;
  const slippageScore =
    estimatedSlippagePct === null ? 32 :
    estimatedSlippagePct <= 0.5 ? 92 :
    estimatedSlippagePct <= 1 ? 80 :
    estimatedSlippagePct <= 2.5 ? 62 :
    estimatedSlippagePct <= 5 ? 42 :
    15;

  return {
    budgetUsd,
    priceUsd: px || null,
    estimatedTokens: tokens,
    liquidityUsd: liq,
    volume24h: vol,
    liquidityImpactPct,
    volumeImpactPct,
    estimatedSlippagePct,
    score: avg([executionScore, slippageScore]),
    blocker:
      liq > 0 && liq < 5_000
        ? "Visible liquidity is too thin for even a $100 execution simulation."
        : estimatedSlippagePct !== null && estimatedSlippagePct > 5
        ? "Estimated slippage is too high for a clean $100 simulation."
        : null,
  };
}

function safetyScan(project = {}) {
  const risk = maxRisk(project);
  const route = routeProof(project);
  const contractKnown = Boolean(
    project.address ||
      project.tokenAddress ||
      project.contractAddress ||
      route.routes?.some((item) => item.contract)
  );
  const pairKnown = Boolean(project.pairAddress || route.routes?.some((item) => item.pairAddress));
  const sourceProof = avg([
    project.sourceTruthScore,
    project.proofScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
    project.githubProScore,
  ]);
  const blockers = [];

  if (!route.detected) blockers.push("No verified Coinbase/MetaMask execution route.");
  if (risk >= 78) blockers.push("Risk stack is too high for execution verification.");
  if (!contractKnown && route.preferredRoute === "MetaMask") blockers.push("MetaMask route needs exact token contract proof.");
  if (!pairKnown && route.preferredRoute === "MetaMask") blockers.push("MetaMask route needs exact pair/liquidity proof.");
  if (sourceProof > 0 && sourceProof < 45) blockers.push("Source/proof stack is too weak.");
  if (project.redTeamReview?.status === "Block") blockers.push("Red-team block is active.");

  return {
    score: Math.round(
      clamp(
        (route.detected ? 25 : 0) +
          (contractKnown || route.preferredRoute === "Coinbase" ? 18 : 0) +
          (pairKnown || route.preferredRoute === "Coinbase" ? 12 : 0) +
          sourceProof * 0.28 +
          (100 - risk) * 0.17
      )
    ),
    risk,
    contractKnown,
    pairKnown,
    sourceProof,
    blockers,
  };
}

function thesisScore(project = {}) {
  return avg([
    project.proofCarryingAlphaContractScore,
    project.alphaEvolutionGovernorScore,
    project.autonomousAlphaOSScore,
    project.selfEvolvingAlphaOSScore,
    project.causalMarketTwinScore,
    project.breakoutBrainScore,
    project.smallCapHunterScore,
    project.confidenceAdjustedScore,
  ]);
}

function outcomeMemoryScore(project = {}) {
  return avg([
    project.paperOutcomeLabScore,
    project.outcomeLearningScore,
    project.calibrationScore,
    project.autoLearningWeightScore,
    project.outcomeJudgeScore,
  ]);
}

function verdictFor({ score = 0, route = {}, quote = {}, safety = {}, thesis = 0 } = {}) {
  if (!route.detected) return "Execution Route Block";
  if (quote.blocker) return "Execution Liquidity Block";
  if (safety.blockers.length) return "Execution Safety Block";
  if (score >= 70 && thesis >= 58) return "Execution-Verified Alpha Candidate";
  if (score >= 58) return "Execution Watch";
  return "Execution Thin Data";
}

function confidenceFor({ route = {}, quote = {}, safety = {}, score = 0 } = {}) {
  if (!route.detected || safety.blockers.length) return "Low";
  if (score >= 78 && quote.score >= 70 && safety.score >= 70) return "High";
  if (score >= 60) return "Medium";
  return "Developing";
}

function buildTwin(project = {}, options = {}) {
  const budgetUsd = positiveNumber(options.budgetUsd, DEFAULT_BUDGET_USD);
  const route = routeProof(project);
  const quote = executionQuote(project, budgetUsd);
  const safety = safetyScan(project);
  const thesis = thesisScore(project);
  const memory = outcomeMemoryScore(project);
  const score = Math.round(
    clamp(
      route.confidence * 0.18 +
        quote.score * 0.22 +
        safety.score * 0.24 +
        thesis * 0.24 +
        memory * 0.12
    )
  );
  const verdict = verdictFor({ score, route, quote, safety, thesis });
  const confidence = confidenceFor({ route, quote, safety, score });
  const invalidationRules = [
    "Route disappears from Coinbase or MetaMask-compatible liquidity sources.",
    "Estimated $100 slippage rises above 5%.",
    "Risk, trap, unlock, or sell-pressure score rises above 78.",
    "Token contract or pair cannot be manually verified.",
    "Alpha thesis/gov/proof score drops below 50 on the next scan.",
  ];

  return {
    name: "Proof-of-Alpha Execution Twin",
    score,
    verdict,
    confidence,
    route,
    quote,
    safety,
    thesisScore: thesis,
    outcomeMemoryScore: memory,
    paperExecution: {
      mode: "Paper execution simulation only",
      budgetUsd,
      preferredRoute: route.preferredRoute,
      estimatedTokens: quote.estimatedTokens,
      estimatedSlippagePct: quote.estimatedSlippagePct,
      simulatedEntryPriceUsd: quote.priceUsd,
      reviewWindows: ["1h", "24h", "7d", "30d", "90d"],
    },
    alphaContractLink: {
      contractId: project.proofCarryingAlphaContract?.contractId || null,
      contractVerdict: project.proofCarryingAlphaContractVerdict || null,
      governorVerdict: project.alphaEvolutionGovernorVerdict || null,
      smallCapVerdict: project.smallCapHunterVerdict || null,
    },
    invalidationRules,
    requiredManualChecks: [
      "Confirm Coinbase regional availability or exact MetaMask network/contract/pair.",
      "Confirm slippage and fees inside the actual trade screen before any real order.",
      "Confirm token taxes, honeypot status, contract ownership, and liquidity lock.",
      "Confirm unlocks, emissions, insiders, and top-holder concentration.",
    ],
  };
}

export function analyzeProofOfAlphaExecutionTwin(project = {}, options = {}) {
  const twin = buildTwin(project, options);

  return {
    ...project,
    proofOfAlphaExecutionTwinScore: twin.score,
    proofOfAlphaExecutionTwinVerdict: twin.verdict,
    proofOfAlphaExecutionTwinConfidence: twin.confidence,
    proofOfAlphaExecutionTwinRoute: twin.route.preferredRoute,
    proofOfAlphaExecutionTwinSlippagePct: twin.quote.estimatedSlippagePct,
    proofOfAlphaExecutionTwinSelected: false,
    proofOfAlphaExecutionTwin: twin,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Proof-of-Alpha Execution Twin",
        signal: twin.verdict,
        score: twin.score,
        confidence: twin.confidence === "High" ? 0.82 : twin.confidence === "Medium" ? 0.62 : 0.38,
        impact: twin.verdict.includes("Block") ? "Negative" : twin.verdict.includes("Candidate") ? "Positive" : "Neutral",
        reasons: [
          `Route ${twin.route.preferredRoute}: ${twin.route.status}.`,
          `Execution score ${twin.quote.score}, safety score ${twin.safety.score}, thesis score ${twin.thesisScore}.`,
          twin.quote.blocker || twin.safety.blockers[0] || "Paper execution simulation passed current route checks.",
        ],
      },
    ],
  };
}

function selectable(project = {}) {
  return (
    project.proofOfAlphaExecutionTwin &&
    project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate" &&
    !project.proofOfAlphaExecutionTwin.safety.blockers.length &&
    !project.proofOfAlphaExecutionTwin.quote.blocker
  );
}

export function analyzeProofOfAlphaExecutionTwinBatch(projects = [], options = {}) {
  const targetCount = Math.max(1, Math.round(positiveNumber(options.targetCount, DEFAULT_TARGET_COUNT)));
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeProofOfAlphaExecutionTwin(project, options)
  );
  const selected = new Map(
    analyzed
      .map((project, index) => ({ project, key: `${index}:${project.symbol || project.name || "unknown"}` }))
      .filter(({ project }) => selectable(project))
      .sort((a, b) => num(b.project.proofOfAlphaExecutionTwinScore) - num(a.project.proofOfAlphaExecutionTwinScore))
      .slice(0, targetCount)
      .map(({ key }, index) => [key, index + 1])
  );

  return analyzed.map((project, index) => {
    const key = `${index}:${project.symbol || project.name || "unknown"}`;
    const rank = selected.get(key) || null;

    return {
      ...project,
      proofOfAlphaExecutionTwinSelected: Boolean(rank),
      proofOfAlphaExecutionTwinRank: rank,
      alphaTags: rank
        ? [...new Set([...(project.alphaTags || []), "Proof-of-Alpha Execution Verified"])]
        : project.alphaTags,
      proofOfAlphaExecutionTwin: {
        ...(project.proofOfAlphaExecutionTwin || {}),
        selected: Boolean(rank),
        rank,
      },
    };
  });
}

function compact(project = {}) {
  return {
    rank: project.proofOfAlphaExecutionTwinRank || null,
    selected: Boolean(project.proofOfAlphaExecutionTwinSelected),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.proofOfAlphaExecutionTwinScore || 0,
    verdict: project.proofOfAlphaExecutionTwinVerdict || "Unknown",
    confidence: project.proofOfAlphaExecutionTwinConfidence || "Unknown",
    route: project.proofOfAlphaExecutionTwinRoute || "Unavailable",
    slippagePct: project.proofOfAlphaExecutionTwinSlippagePct ?? null,
    quote: project.proofOfAlphaExecutionTwin?.quote || {},
    safety: project.proofOfAlphaExecutionTwin?.safety || {},
    paperExecution: project.proofOfAlphaExecutionTwin?.paperExecution || {},
    invalidationRules: project.proofOfAlphaExecutionTwin?.invalidationRules || [],
    requiredManualChecks: project.proofOfAlphaExecutionTwin?.requiredManualChecks || [],
  };
}

export function summarizeProofOfAlphaExecutionTwin(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const twins = safeProjects.filter((project) => project.proofOfAlphaExecutionTwin);
  const selected = twins
    .filter((project) => project.proofOfAlphaExecutionTwinSelected)
    .sort((a, b) => num(a.proofOfAlphaExecutionTwinRank) - num(b.proofOfAlphaExecutionTwinRank));

  return {
    generatedAt: new Date().toISOString(),
    name: "Proof-of-Alpha Execution Twin",
    disclaimer: "Research and paper-execution simulation only. Not financial advice, not a buy recommendation, and not a live trade quote.",
    totalProjects: safeProjects.length,
    twinProjects: twins.length,
    selectedCount: selected.length,
    routeBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Route Block").length,
    liquidityBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Liquidity Block").length,
    safetyBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Safety Block").length,
    topExecutions: selected.map(compact),
    topProjects: [...twins]
      .sort((a, b) => num(b.proofOfAlphaExecutionTwinScore) - num(a.proofOfAlphaExecutionTwinScore))
      .slice(0, 50)
      .map(compact),
  };
}
