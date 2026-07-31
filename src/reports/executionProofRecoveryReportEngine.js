import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function projectIdentity(project = {}, rank = null) {
  const recovery = project.executionProofRecovery || {};
  const route = project.executionProofRecoveryRoute || project.bestGlobalRoute || project.canonicalExecutionRoute || {};
  const proofState = project.candidateProofState || {};
  const executionReadinessState = project.executionReadinessState || "RESEARCH_ONLY";
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || project.projectName || "Unknown",
    chain: first([project.chain, project.canonicalChain, route.chain]) || null,
    tokenAddress: first([project.tokenAddress, project.contractAddress, route.tokenAddress, route.contractAddress]) || null,
    poolAddress: first([project.poolAddress, project.pairAddress, route.poolAddress, route.pairAddress]) || null,
    marketPair: first([project.marketPair, route.marketPair]) || null,
    marketCapUsd: num(first([project.circulatingMarketCapUsd, project.marketCapUsd, project.marketCap])),
    liquidityUsd: num(first([project.stableExitLiquidityUsd, project.dexLiquidityUsd, project.liquidityUsd, route.liquidityUsd])),
    recoveryStatus: recovery.status || "UNKNOWN",
    recoverySource: recovery.executionRecoverySource || route.executionRecoverySource || route.source || null,
    venue: route.venue || route.provider || null,
    routeType: route.routeType || null,
    routeTruthStatus: recovery.routeTruthStatus || route.routeTruthStatus || null,
    buyQuoteVerified: recovery.buyQuoteVerified === true || route.buyQuoteVerified === true,
    sellQuoteVerified: recovery.sellQuoteVerified === true || route.sellQuoteVerified === true,
    quoteTimestamp: recovery.quoteTimestamp || route.quoteTimestamp || null,
    quoteAgeSeconds: recovery.quoteAgeSeconds ?? route.quoteAgeSeconds ?? null,
    estimatedRoundTripSlippagePct: route.estimatedRoundTripSlippagePct ?? null,
    orderBookDepthUsd: route.orderBookDepthUsd ?? null,
    failures: array(recovery.executionRecoveryFailures || route.executionRecoveryFailures)
      .filter((failure) => !["ROUTE_RECOVERED", "SUCCESS_WITH_DATA"].includes(String(failure)))
      .slice(0, 8),
    nextSingleProofToPromote:
      recovery.sellQuoteVerified !== true
        ? "fresh sell quote"
        : recovery.buyQuoteVerified !== true
          ? "fresh buy quote"
          : proofState.userAccess?.status !== "CONFIRMED_AVAILABLE"
            ? "region/accessibility confirmation"
            : null,
    optionalSourceGaps: array(recovery.optionalSourceGaps).slice(0, 5),
    globalRouteStatus: proofState.globalRoute?.status || null,
    userAccessStatus: proofState.userAccess?.status || "UNKNOWN",
    executionReadinessState,
    newlyPromotedToExecutionReview:
      recovery.newlyPromotedToExecutionReview === true &&
      ["EXECUTION_REVIEW", "READY"].includes(executionReadinessState),
    executionReady: executionReadinessState === "READY",
  };
}

function statusFor({ attempted = 0, recovered = 0, buyOnly = 0, providerFailures = 0 }) {
  if (!attempted) return "NO_RECOVERY_ATTEMPTED";
  if (recovered) return "ROUTES_RECOVERED";
  if (buyOnly) return "BUY_ONLY_NEEDS_SELL_PROOF";
  if (providerFailures) return "PROVIDERS_FAILED_OR_UNAVAILABLE";
  return "NO_ROUTES_RECOVERED";
}

export function summarizeExecutionProofRecovery(projects = [], meta = {}) {
  const safe = Array.isArray(projects) ? projects : [];
  const attemptedProjects = safe.filter((project) => project.executionProofRecovery?.attempted === true);
  const recoveredProjects = attemptedProjects.filter((project) => project.executionProofRecovery?.status === "ROUTE_RECOVERED");
  const buyOnlyProjects = attemptedProjects.filter((project) => project.executionProofRecovery?.status === "BUY_ONLY_ROUTE");
  const sellProofFailures = attemptedProjects.filter((project) =>
    project.executionProofRecovery?.buyQuoteVerified === true &&
      project.executionProofRecovery?.sellQuoteVerified !== true
  );
  const staleQuotes = attemptedProjects.filter((project) => num(project.executionProofRecovery?.quoteAgeSeconds) > 3600);
  const providerFailures = attemptedProjects.filter((project) =>
    array(project.executionProofRecovery?.adapterResults).some((result) =>
      ["PROVIDER_FAILED", "TIMED_OUT", "RATE_LIMITED"].includes(result.status)
    )
  );
  const optionalSourceGaps = attemptedProjects.flatMap((project) =>
    array(project.executionProofRecovery?.optionalSourceGaps).map((gap) => ({
      symbol: project.symbol || "UNKNOWN",
      source: gap.source,
      missingKey: gap.missingKey,
      reason: gap.reason,
    }))
  );
  const routesRecovered = recoveredProjects.length;
  const newlyPromotedToExecutionReview = recoveredProjects.filter((project) =>
    project.executionProofRecovery?.newlyPromotedToExecutionReview === true &&
      ["EXECUTION_REVIEW", "READY"].includes(project.executionReadinessState)
  );
  const executionReady = recoveredProjects.filter(
    (project) => project.executionReadinessState === "READY"
  );

  const adapterHealth = attemptedProjects
    .flatMap((project) => array(project.executionProofRecovery?.adapterResults))
    .reduce((acc, result) => {
      const key = result.adapter || "unknown";
      acc[key] ||= { adapter: key, attempts: 0, recovered: 0, buyOnly: 0, optionalKeyMissing: 0, providerFailures: 0 };
      acc[key].attempts += 1;
      if (result.status === "ROUTE_RECOVERED") acc[key].recovered += 1;
      if (result.status === "NO_SELL_QUOTE" || result.status === "BUY_ONLY_ROUTE") acc[key].buyOnly += 1;
      if (result.status === "OPTIONAL_KEY_MISSING") acc[key].optionalKeyMissing += 1;
      if (["PROVIDER_FAILED", "TIMED_OUT", "RATE_LIMITED"].includes(result.status)) acc[key].providerFailures += 1;
      return acc;
    }, {});

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
    status: statusFor({
      attempted: attemptedProjects.length,
      recovered: routesRecovered,
      buyOnly: buyOnlyProjects.length,
      providerFailures: providerFailures.length,
    }),
    objective:
      "Recover fresh execution quote or order-book proof for the strongest research candidates before final execution-oriented reports.",
    disclaimer:
      "Execution proof recovery fetches research and paper-execution evidence only. It does not place trades and is not financial advice.",
    projectsAnalyzed: safe.length,
    candidatesAttempted: attemptedProjects.length,
    routesRecovered,
    buyOnlyRoutes: buyOnlyProjects.length,
    sellProofFailures: sellProofFailures.length,
    staleQuotes: staleQuotes.length,
    providerFailures: providerFailures.length,
    optionalSourceGaps,
    newlyPromotedToExecutionReview: newlyPromotedToExecutionReview.length,
    newlyExecutionReady: executionReady.length,
    adapterHealth: Object.values(adapterHealth),
    topRecoveredRoutes: recoveredProjects.map((project, index) => projectIdentity(project, index + 1)).slice(0, 25),
    buyOnlyRouteFailures: buyOnlyProjects.map((project, index) => projectIdentity(project, index + 1)).slice(0, 25),
    sellProofFailureExamples: sellProofFailures.map((project, index) => projectIdentity(project, index + 1)).slice(0, 25),
    remainingActions: [
      ...(optionalSourceGaps.length ? ["Add optional ZEROX_API_KEY to improve EVM quote recovery breadth."] : []),
      ...(sellProofFailures.length ? ["Prioritize sell quote recovery before any execution-ready decision."] : []),
      ...(providerFailures.length ? ["Check provider cooldowns, rate limits, and network availability."] : []),
      ...(!routesRecovered ? ["No route proof was recovered in this scan; candidates remain research-only."] : []),
    ],
  };
}

export function writeExecutionProofRecoveryReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeExecutionProofRecovery(projects, meta);
  const filePath = path.join(reportsDir, "execution-proof-recovery.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
