import { resolveStrictCandidateGate } from "../execution/routeResolver.js";

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

const DEFAULT_BUDGET_USD = positiveNumber(process.env.EXECUTION_TWIN_BUDGET_USD, 100);
const DEFAULT_TARGET_COUNT = positiveNumber(process.env.EXECUTION_TWIN_TARGET_COUNT, 2);
const CEX_NAMES = [
  "coinbase",
  "kraken",
  "binance",
  "binance.us",
  "gemini",
  "okx",
  "bybit",
  "kucoin",
  "gate",
  "mexc",
  "bitget",
  "crypto.com",
  "htx",
  "upbit",
  "bithumb",
];

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
  return num(project.executionProof?.liquidityUsd || project.canonicalExecutionRoute?.liquidityUsd || project.liquidityUsd || project.liquidity || project.smallCapHunter?.execution?.liquidityUsd);
}

function volume(project = {}) {
  return num(project.executionProof?.volume24hUsd || project.canonicalExecutionRoute?.volume24hUsd || project.volume24h || project.volume || project.smallCapHunter?.execution?.volume24h);
}

function price(project = {}) {
  return num(project.executionProof?.price || project.canonicalExecutionRoute?.priceUsd || project.priceUsd || project.price || project.marketData?.priceUsd);
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

function legacyRouteLooksCex(route = {}) {
  const routeText = [
    route.preferredRoute,
    route.status,
    ...(route.routes || []).flatMap((item) => [item.type, item.venue, item.exchange, item.routeType]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return CEX_NAMES.some((name) => routeText.includes(name)) ||
    (route.routes || []).some((item) => ["CEX", "CEX_SPOT"].includes(item.routeType));
}

function routeProof(project = {}) {
  const gate = resolveStrictCandidateGate(project);
  if (!gate.strictRankEligible) {
    return {
      detected: false,
      preferredRoute: gate.marketBenchmarkLane === "MARKET_BENCHMARK" ? "Market Benchmark" : "Strict Route Proof Required",
      status: gate.strictCandidateLane || "QUARANTINED_IDENTITY_OR_ROUTE",
      confidence: 0,
      routes: [],
      strictCandidateGate: gate,
      blockers: gate.strictCandidateMissingProof?.length
        ? gate.strictCandidateMissingProof.map((item) => `Strict route proof missing: ${item}.`)
        : ["Strict chain, contract, token, pair, venue, liquidity, volume, provenance, timestamp, buy quote, and sell quote proof is missing."],
    };
  }

  return {
    detected: true,
    preferredRoute: normalizeRouteName(gate.dexName || project.bestVerifiedVenue || "Verified Route"),
    status: "LIVE_EXECUTION_READY",
    confidence: 95,
    routes: [
      {
        type: gate.dexName || "Verified Route",
        status: "LIVE_EXECUTION_READY",
        confidence: 95,
        contract: gate.contractAddress,
        pairAddress: gate.pairAddress,
        routeType: project.canonicalExecutionRoute?.routeType || "STRICT_VERIFIED_ROUTE",
      },
    ],
    strictCandidateGate: gate,
    blockers: [],
  };

  if (project.routeAccessibility) {
    const best =
      project.bestVerifiedRoute ||
      project.bestBuyRoute ||
      project.canonicalRoutes?.find((route) => route.buyRouteAvailable || route.sellRouteAvailable) ||
      null;
    const detected = project.executionReady === true && best?.buyRouteAvailable === true && best?.sellRouteAvailable === true;
    return {
      detected,
      preferredRoute: normalizeRouteName(project.bestVerifiedVenue || best?.venue || "Route Research Required"),
      status: project.accessibilityLane || (detected ? "EXECUTION_READY" : "ROUTE_RESEARCH_REQUIRED"),
      confidence: detected ? clamp(project.routeAccessibility.accessibilityScore || best?.accessibilityScore || 70) : 0,
      routes: project.canonicalRoutes || [],
      blockers: detected ? [] : project.missingRouteEvidence || ["Verified fresh buy and sell route proof is missing."],
    };
  }

  const proof = project.executionProof || {};
  if (proof.executionStatus || project.executionStatus) {
    const status = proof.executionStatus || project.executionStatus;
    const detected = ["VERIFIED", "PARTIALLY_VERIFIED"].includes(status);
    return {
      detected,
      preferredRoute: normalizeRouteName(proof.venue || project.canonicalExecutionRoute?.venue || "Execution Proof"),
      status,
      confidence: detected ? (status === "VERIFIED" ? 88 : 66) : 24,
      routes: [
        {
          type: proof.venue || project.canonicalExecutionRoute?.venue || "Execution Proof",
          status,
          confidence: detected ? 88 : 24,
          contract: proof.contractAddress,
          pairAddress: proof.pairAddress,
          routeType: project.canonicalExecutionRoute?.routeType || "UNKNOWN",
        },
      ],
      blockers: detected ? [] : proof.failureReasons || project.moneyMissingEvidence || ["Execution proof did not verify a buy and sell route."],
    };
  }

  const canonical = project.canonicalExecutionRoute;
  if (canonical) {
    const detected = ["VERIFIED", "PARTIALLY_VERIFIED", "DETECTED"].includes(canonical.status);
    return {
      detected,
      preferredRoute: normalizeRouteName(canonical.venue || "Canonical Route"),
      status: canonical.status,
      confidence: canonical.confidence || (canonical.status === "VERIFIED" ? 82 : canonical.status === "PARTIALLY_VERIFIED" ? 62 : 36),
      routes: [
        {
          type: canonical.venue,
          status: canonical.status,
          confidence: canonical.confidence,
          contract: canonical.contractAddress,
          pairAddress: canonical.pairAddress,
          routeType: canonical.routeType,
          url: canonical.routeUrl,
        },
      ],
      blockers: canonical.status === "VERIFIED" ? [] : canonical.missingEvidence || ["Canonical route is not fully verified."],
    };
  }

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
    blockers: detected ? [] : ["No verified exchange, wallet, DEX, aggregator, or bridge-aware route proof."],
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
    project.executionProof?.contractAddress ||
      project.canonicalExecutionRoute?.contractAddress ||
      project.address ||
      project.tokenAddress ||
      project.contractAddress ||
      route.routes?.some((item) => item.contract)
  );
  const pairKnown = Boolean(project.executionProof?.pairAddress || project.canonicalExecutionRoute?.pairAddress || project.pairAddress || route.routes?.some((item) => item.pairAddress));
  const sourceProof = avg([
    project.sourceTruthScore,
    project.proofScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
    project.githubProScore,
  ]);
  const blockers = [];

  const routeIsCex = legacyRouteLooksCex(route);
  if (risk >= 78) blockers.push("Risk stack is too high for execution verification.");
  if (sourceProof > 0 && sourceProof < 45) blockers.push("Source/proof stack is too weak.");
  if (project.redTeamReview?.status === "Block") blockers.push("Red-team block is active.");

  return {
    score: Math.round(
      clamp(
        (route.detected ? 25 : 0) +
          (contractKnown || routeIsCex ? 18 : 0) +
          (pairKnown || routeIsCex ? 12 : 0) +
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
  if (safety.blockers.length) return "Execution Safety Block";
  if (!route.detected) return "RESEARCH_ONLY_ROUTE_UNVERIFIED";
  if (quote.blocker) return "Execution Liquidity Block";
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
    "Verified buy or sell route disappears from the chosen exchange, wallet, DEX, aggregator, or bridge path.",
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
      mode: route.detected ? "Paper execution simulation only" : "No paper execution until strict route proof passes",
      budgetUsd: route.detected ? budgetUsd : 0,
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
      "Confirm regional availability, exact network, contract, pool/market, buy path, and sell path in the chosen route.",
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
    project.proofOfAlphaExecutionTwin.route?.strictCandidateGate?.strictRankEligible === true &&
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
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
    finalBlockingReasons: project.finalBlockingReasons || [],
    finalWarningReasons: project.finalWarningReasons || [],
    confidence: project.proofOfAlphaExecutionTwinConfidence || "Unknown",
    route: project.proofOfAlphaExecutionTwinRoute || "Unavailable",
    routeStatus: project.proofOfAlphaExecutionTwin?.route?.status || project.executionStatus || project.canonicalExecutionRoute?.status || "NO_ROUTE",
    canonicalId: project.canonicalId || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.canonicalId || null,
    contractAddress: project.contractAddress || project.tokenAddress || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.contractAddress || null,
    pairAddress: project.pairAddress || project.poolAddress || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.pairAddress || null,
    routeVerificationStatus: project.routeVerificationStatus || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.routeVerificationStatus || "UNKNOWN",
    strictRankEligible: Boolean(project.strictRankEligible || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.strictRankEligible),
    candidateQuarantineReason: project.candidateQuarantineReason || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.candidateQuarantineReason || null,
    candidateQuarantineReasons: project.candidateQuarantineReasons || project.proofOfAlphaExecutionTwin?.route?.strictCandidateGate?.candidateQuarantineReasons || [],
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
  const verified = twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate");
  const partial = twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Watch");
  const providerUnavailable = twins.filter((project) =>
    ["PROVIDER_UNAVAILABLE", "UNKNOWN"].includes(project.executionStatus) ||
    project.canonicalExecutionRoute?.status === "PROVIDER_UNAVAILABLE"
  );
  const noRoute = twins.filter((project) =>
    project.proofOfAlphaExecutionTwinVerdict === "RESEARCH_ONLY_ROUTE_UNVERIFIED" ||
    project.canonicalExecutionRoute?.status === "NO_ROUTE"
  );
  const researchCandidates = [...twins]
    .filter((project) => !["Execution Safety Block"].includes(project.proofOfAlphaExecutionTwinVerdict))
    .sort((a, b) => num(b.proofOfAlphaExecutionTwinScore) - num(a.proofOfAlphaExecutionTwinScore))
    .slice(0, 25);
  const reasonSummary = {
    verifiedCount: verified.length,
    partiallyVerifiedCount: partial.length,
    providerUnavailableCount: providerUnavailable.length,
    noRouteCount: noRoute.length,
    topReason:
      verified.length === 0
        ? noRoute.length
          ? "No execution-verified routes were available; research candidates are route-unverified."
          : providerUnavailable.length
          ? "Execution providers were unavailable for some candidates."
          : "No candidate passed route, liquidity, safety, and thesis requirements."
        : "Verified execution candidates available.",
  };

  return {
    generatedAt: new Date().toISOString(),
    name: "Proof-of-Alpha Execution Twin",
    disclaimer: "Research and paper-execution simulation only. Not financial advice, not a buy recommendation, and not a live trade quote.",
    totalProjects: safeProjects.length,
    twinProjects: twins.length,
    selectedCount: selected.length,
    verifiedCount: verified.length,
    partiallyVerifiedCount: partial.length,
    providerUnavailableCount: providerUnavailable.length,
    noRouteCount: noRoute.length,
    routeBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Route Block").length,
    liquidityBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Liquidity Block").length,
    safetyBlocks: twins.filter((project) => project.proofOfAlphaExecutionTwinVerdict === "Execution Safety Block").length,
    reasonSummary,
    topVerifiedExecutions: selected.map(compact),
    topExecutionResearchCandidates: researchCandidates.map(compact),
    topExecutions: selected.map(compact),
    topProjects: [...twins]
      .sort((a, b) => num(b.proofOfAlphaExecutionTwinScore) - num(a.proofOfAlphaExecutionTwinScore))
      .slice(0, 50)
      .map(compact),
  };
}
