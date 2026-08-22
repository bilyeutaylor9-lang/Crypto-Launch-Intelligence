import fs from "node:fs";
import path from "node:path";

const REPORT_FILE = path.resolve("reports", "qualification-failure-microscope.json");
const INPUT_FILE = path.resolve(
  process.env.QUALIFICATION_MICROSCOPE_INPUT || "reports/report.json"
);

export const QUALIFICATION_GATE_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
});

const PRODUCTION_GATE_ORDER = Object.freeze([
  "IDENTITY",
  "CORE_EVIDENCE",
  "SAFETY",
  "ROUTE_IDENTITY",
  "BUY_QUOTE",
  "SELL_QUOTE",
  "QUOTE_FRESHNESS",
  "ROUTE_DEPTH",
  "VERIFIED_SLIPPAGE",
  "USER_ACCESS",
  "FINAL_SELECTION_POLICY",
]);

const MECHANISM_GATE_ORDER = Object.freeze([
  "THREE_CLOCK_PRE_CONSENSUS",
  "CAPITAL_ARRIVAL",
  "SUPPLY_SELLER",
  "PRICE_NOT_EXTENDED",
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value = "") {
  return String(value ?? "").trim().toUpperCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function textList(project = {}) {
  return [
    ...array(project.finalBlockingReasons),
    ...array(project.finalWarningReasons),
    ...array(project.opportunityHardBlockers),
    ...array(project.hardBlockers),
    ...array(project.deterministicCandidateBlocks),
    ...array(project.preConsensusHardBlockers),
    ...array(project.economicIntegrityBlockers),
    ...array(project.liveRankingBlocks),
    ...array(project.liveRankingGateReasons),
  ].filter(Boolean).map(String);
}

function textMatches(project = {}, patterns = []) {
  const text = textList(project).join(" | ");
  return patterns.some((pattern) => pattern.test(text));
}

function gate(status, reason, evidence = {}) {
  return { status, reason, evidence };
}

function exactIdentitySnapshot(project = {}) {
  const identity = project.candidateProofState?.identity || {};
  const chain = first([
    identity.chain,
    project.canonicalChain,
    project.finalChain,
    project.chain,
    project.network,
  ]);
  const tokenAddress = first([
    identity.tokenAddress,
    project.finalContractAddress,
    project.tokenAddress,
    project.contractAddress,
    project.canonicalAddress,
    project.address,
  ]);
  const poolAddress = first([
    identity.poolAddress,
    project.primaryTradablePool,
    project.poolAddress,
    project.pairAddress,
    project.finalPairAddress,
  ]);
  return {
    chain: chain || null,
    tokenAddress: tokenAddress || null,
    poolAddress: poolAddress || null,
    exactIdentityVerified:
      identity.exactIdentityVerified === true ||
      project.strictIdentityVerified === true ||
      project.canonicalExecutionRoute?.exactIdentityVerified === true,
    identityStatus: upper(identity.status || project.finalIdentityState || project.identityState),
  };
}

function identityGate(project = {}) {
  const identity = exactIdentitySnapshot(project);
  const finalState = upper(project.finalSelectionState);
  if (
    finalState === "IDENTITY_CONFLICT" ||
    project.canonicalIdentityHardBlock === true ||
    project.identityConflict === true ||
    project.chainMismatch === true ||
    project.contractChainMismatch === true ||
    textMatches(project, [/identity conflict/i, /contract mismatch/i, /chain mismatch/i])
  ) {
    return gate("FAIL", "Known identity conflict or mismatch.", identity);
  }
  if (
    identity.exactIdentityVerified === true &&
    identity.chain &&
    identity.tokenAddress &&
    identity.poolAddress
  ) {
    return gate("PASS", "Exact chain-token-pool identity is explicitly verified.", identity);
  }
  if (
    ["VERIFIED", "VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(identity.identityStatus) &&
    identity.chain &&
    identity.tokenAddress
  ) {
    return gate(
      "UNKNOWN",
      "Identity is verified at project/listing level but exact route identity is not fully proven here.",
      identity
    );
  }
  return gate("UNKNOWN", "Exact identity proof is missing or incomplete.", identity);
}

function coreEvidenceGate(project = {}) {
  const status = upper(
    project.coreEvidenceState ||
      project.engineDataReadinessStatus ||
      project.engineDataReadiness?.status
  );
  const coverage = finite(
    project.coreEvidenceCoveragePct ??
      project.engineDataReadiness?.coreEvidenceCoveragePct
  );
  if (
    project.engineDataReadiness?.coreDataStarved === true ||
    status === "CORE_DATA_STARVED"
  ) {
    return gate("FAIL", "Core evidence is explicitly data-starved.", { status, coverage });
  }
  if (["CORE_READY", "CORE_EVIDENCE_READY"].includes(status)) {
    return gate("PASS", "Core evidence is explicitly ready.", { status, coverage });
  }
  if (["CORE_PARTIAL", "CORE_EVIDENCE_PARTIAL"].includes(status)) {
    return gate("UNKNOWN", "Core evidence is only partial.", { status, coverage });
  }
  return gate("UNKNOWN", "Core evidence readiness is not proven.", { status, coverage });
}

function safetyGate(project = {}) {
  const safety = project.candidateProofState?.safety || {};
  const executionProof = project.executionProof || {};
  const status = upper(
    safety.status ||
      project.safetyProofStatus ||
      project.instantSafetyStatus ||
      project.finalSafetyState
  );
  const deterministicBlocks = [
    ...array(safety.deterministicBlocks),
    ...array(project.deterministicCandidateBlocks),
  ];
  const hard = Boolean(
    deterministicBlocks.length ||
      project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.scamDetected === true ||
      project.sellRestricted === true ||
      ["BLOCKED", "CRITICAL", "UNSAFE", "HONEYPOT_RISK"].includes(status) ||
      textMatches(project, [/honeypot/i, /verified scam/i, /sell restriction/i, /unsafe/i])
  );
  if (hard) {
    return gate("FAIL", "Known deterministic safety block.", {
      status,
      deterministicBlocks,
    });
  }
  if (
    ["VERIFIED_SAFE", "SAFETY_VERIFIED_CLEAN", "PASS"].includes(status) ||
    project.contractSafetyVerified === true ||
    executionProof.safetyVerified === true
  ) {
    return gate("PASS", "Safety is explicitly verified clean.", {
      status,
      testedChecks: array(safety.testedChecks),
      unknownChecks: array(safety.unknownChecks),
    });
  }
  return gate("UNKNOWN", "Safety is partial or unknown, not safe-by-default.", {
    status: status || "UNKNOWN",
    testedChecks: array(safety.testedChecks),
    unknownChecks: array(safety.unknownChecks),
  });
}

function executionSnapshot(project = {}) {
  const global = project.candidateProofState?.globalRoute || {};
  const proof = project.executionProof || {};
  const proofState = upper(
    proof.routeTruthStatus ||
      proof.executionProofState ||
      proof.executionStatus
  );
  const firstBoolean = (values = []) => {
    const value = values.find((item) => typeof item === "boolean");
    return typeof value === "boolean" ? value : false;
  };
  const quoteAgeSeconds = finite(
    proof.quoteFreshnessSeconds ??
      proof.quoteAgeSeconds ??
      global.quoteAgeSeconds ??
      project.quoteAgeSeconds ??
      project.executionProofRecoveryRoute?.quoteAgeSeconds
  );
  const nestedProofPresent = Object.keys(proof).length > 0;
  const liveExecutionReady = nestedProofPresent
    ? proof.liveExecutionReady === true || proofState === "LIVE_EXECUTION_READY"
    : project.liveExecutionReady === true ||
      project.executionProofVerified === true ||
      ["LIVE_EXECUTION_READY", "EXECUTION_READY", "ROUTE_VERIFIED"].includes(
        upper(project.routeTruthStatus || project.executionProofState || global.status)
      );
  return {
    routeStatus: upper(
      proof.routeTruthStatus ||
        proof.executionProofState ||
        project.routeTruthStatus ||
        project.executionProofState ||
        project.executionStatus ||
        global.status
    ),
    proofStatus: proofState || upper(global.status),
    liveExecutionReady,
    buyQuoteVerified: firstBoolean([
      proof.buyQuoteVerified,
      global.buyQuoteVerified,
      project.buyQuoteVerified,
    ]),
    sellQuoteVerified: firstBoolean([
      proof.sellQuoteVerified,
      global.sellQuoteVerified,
      project.sellQuoteVerified,
    ]),
    depthVerified: firstBoolean([
      proof.depthVerified,
      proof.orderBookDepthVerified,
      global.depthVerified,
      project.depthVerified,
      project.orderBookDepthVerified,
    ]) || (
      liveExecutionReady &&
      finite(
        proof.executableDepthUsd ??
          proof.verifiedTradeSizeUsd ??
          proof.orderBookDepthUsd ??
          proof.liquidityUsd
      ) !== null
    ),
    slippageVerified: firstBoolean([
      proof.slippageVerified,
      global.slippageVerified,
      project.slippageVerified,
    ]) || (
      proof.slippageIsHeuristic === false &&
      finite(proof.observedSlippagePct ?? proof.estimatedRoundTripSlippagePct) !== null
    ),
    quoteFresh:
      proof.quoteFresh === true ||
      global.quoteFresh === true ||
      project.quoteFresh === true ||
      project.executionQuoteFresh === true,
    quoteAgeSeconds,
    userAccessStatus: upper(
      project.candidateProofState?.userAccess?.status ||
        project.userAccess?.status ||
        project.userAccess?.regionStatus ||
        project.regionStatus ||
        project.regionAvailability
    ) || (
      proof.userAccessVerified === true
        ? proof.userAccessEvidenceRequired === true
          ? "CONFIRMED_AVAILABLE"
          : "NOT_REQUIRED"
        : ""
    ),
  };
}

function routeIdentityGate(project = {}) {
  const identity = exactIdentitySnapshot(project);
  if (
    project.canonicalIdentityHardBlock === true ||
    textMatches(project, [/identity conflict/i, /contract mismatch/i, /chain mismatch/i])
  ) {
    return gate("FAIL", "Route identity is explicitly conflicted.", identity);
  }
  if (
    identity.exactIdentityVerified &&
    identity.chain &&
    identity.tokenAddress &&
    identity.poolAddress
  ) {
    return gate("PASS", "Exact route identity is proven.", identity);
  }
  return gate("UNKNOWN", "Exact route identity is not proven.", identity);
}

function quoteGate(project, side) {
  const execution = executionSnapshot(project);
  const verified = side === "BUY" ? execution.buyQuoteVerified : execution.sellQuoteVerified;
  if (verified) return gate("PASS", `${side} quote is explicitly verified.`, execution);
  const patterns = side === "BUY"
    ? [/buy quote.*(failed|missing|unavailable|rejected)/i, /no verified buy quote/i]
    : [/sell quote.*(failed|missing|unavailable|rejected)/i, /no verified sell quote/i];
  if (textMatches(project, patterns)) {
    return gate("FAIL", `${side} quote has an explicit failure.`, execution);
  }
  return gate("UNKNOWN", `${side} quote is not verified.`, execution);
}

function freshnessGate(project = {}, options = {}) {
  const execution = executionSnapshot(project);
  const maxAge = Number(
    options.maxQuoteAgeSeconds ||
      process.env.QUALIFICATION_MICROSCOPE_MAX_QUOTE_AGE_SECONDS ||
      900
  );
  if (execution.quoteFresh) {
    return gate("PASS", "Quote is explicitly fresh.", { ...execution, maxAgeSeconds: maxAge });
  }
  if (execution.quoteAgeSeconds !== null) {
    return execution.quoteAgeSeconds <= maxAge
      ? gate("PASS", "Quote age is inside the diagnostic freshness window.", {
          ...execution,
          maxAgeSeconds: maxAge,
        })
      : gate("FAIL", "Quote is stale.", { ...execution, maxAgeSeconds: maxAge });
  }
  if (textMatches(project, [/stale quote/i, /quote.*expired/i])) {
    return gate("FAIL", "Quote is explicitly stale.", { ...execution, maxAgeSeconds: maxAge });
  }
  return gate("UNKNOWN", "Quote freshness is not proven.", {
    ...execution,
    maxAgeSeconds: maxAge,
  });
}

function depthGate(project = {}) {
  const execution = executionSnapshot(project);
  if (execution.depthVerified) {
    return gate("PASS", "Executable depth is explicitly verified.", execution);
  }
  if (
    textMatches(project, [
      /insufficient.*depth/i,
      /depth.*insufficient/i,
      /liquidity.*insufficient/i,
      /verified depth.*missing/i,
    ])
  ) {
    return gate("FAIL", "Executable depth has an explicit failure.", execution);
  }
  return gate("UNKNOWN", "Executable depth is not verified.", execution);
}

function slippageGate(project = {}) {
  const execution = executionSnapshot(project);
  if (execution.slippageVerified) {
    return gate("PASS", "Slippage is explicitly verified from route truth.", execution);
  }
  if (
    textMatches(project, [
      /slippage.*(too high|exceeds|failed|unacceptable)/i,
      /verified slippage.*missing/i,
    ])
  ) {
    return gate("FAIL", "Verified slippage has an explicit failure.", execution);
  }
  return gate(
    "UNKNOWN",
    "Slippage is not verified; heuristic or missing slippage does not pass.",
    execution
  );
}

function userAccessGate(project = {}) {
  const execution = executionSnapshot(project);
  const status = execution.userAccessStatus;
  if (
    ["CONFIRMED_AVAILABLE", "AVAILABLE", "SUPPORTED", "NOT_REQUIRED"].includes(status)
  ) {
    return gate("PASS", "User/region access is explicitly confirmed.", execution);
  }
  if (
    ["CONFIRMED_RESTRICTED", "RESTRICTED", "BLOCKED", "UNAVAILABLE"].includes(status) ||
    textMatches(project, [/region.*restricted/i, /access.*blocked/i, /venue.*unavailable/i])
  ) {
    return gate("FAIL", "User/region access is explicitly restricted.", execution);
  }
  return gate("UNKNOWN", "User/region access is unknown.", execution);
}

function finalPolicyGate(project = {}) {
  const state = upper(project.finalSelectionState);
  const blockers = array(project.finalBlockingReasons).map(String);
  const warnings = array(project.finalWarningReasons).map(String);
  if (state === "QUALIFIED" || project.finalSelectionQualified === true) {
    return gate("PASS", "Final-selection integrity qualified the candidate.", {
      state,
      blockers,
      warnings,
    });
  }
  if (["BLOCKED", "IDENTITY_CONFLICT"].includes(state) || blockers.length) {
    return gate("FAIL", "Final-selection policy has explicit blockers.", {
      state,
      blockers,
      warnings,
    });
  }
  return gate(
    "UNKNOWN",
    "Final selection is research-only or insufficient-data, not a qualification pass.",
    { state: state || "UNKNOWN", blockers, warnings }
  );
}

function threeClockGate(project = {}) {
  const edge = project.canonicalThreeClockEdge || project.threeClockEdge || {};
  const state = upper(
    project.threeClockSequenceState ||
      edge.sequence?.state ||
      project.threeClockState
  );
  const qualifying =
    project.threeClockQualifying === true || edge.qualifying === true;
  if (qualifying && state === "THREE_CLOCK_PRE_CONSENSUS") {
    return gate("PASS", "Canonical Three-Clock is in the required pre-consensus sequence.", {
      state,
      qualifying,
    });
  }
  if (!state || state === "INSUFFICIENT_HISTORY" || state === "NO_SEQUENCE") {
    return gate("UNKNOWN", "Three-Clock evidence is not mature enough to fail safely.", {
      state: state || "UNKNOWN",
      qualifying,
    });
  }
  return gate("FAIL", "Three-Clock is observed but not in the required pre-consensus state.", {
    state,
    qualifying,
  });
}

function capitalArrivalGate(project = {}) {
  const intelligence = project.capitalArrivalIntelligence || {};
  const state = upper(
    intelligence.state ||
      project.capitalArrivalState ||
      project.committedLoadedVacuumState
  );
  const ratio = finite(
    intelligence.expectedArrivalToIgnitionCapitalRatio6h ??
      project.expectedArrivalToIgnitionCapitalRatio6h
  );
  if (state === "COMMITTED_LOADED_VACUUM_SHADOW") {
    return gate("PASS", "Capital-arrival state is committed + loaded vacuum.", {
      state,
      expectedArrivalToIgnitionCapitalRatio6h: ratio,
    });
  }
  if (!state || state === "NO_CALIBRATED_ARRIVAL_EVIDENCE") {
    return gate("UNKNOWN", "Calibrated capital-arrival evidence is missing.", {
      state: state || "UNKNOWN",
      expectedArrivalToIgnitionCapitalRatio6h: ratio,
    });
  }
  return gate("FAIL", "Capital-arrival evidence is present but below the required state.", {
    state,
    expectedArrivalToIgnitionCapitalRatio6h: ratio,
  });
}

function supplySellerGate(project = {}) {
  const arrival = project.capitalArrivalIntelligence || {};
  const vacuum = first([
    project.supplyVacuumSupported,
    arrival.supplyVacuumSupported,
    project.ignitionTwin?.supplyVacuumSupported,
    project.supplyLineageIntelligence?.supplyVacuumSupported,
  ]);
  const sellerState = upper(
    first([
      project.sellerInventoryState,
      project.sellerInventoryTrend,
      project.ignitionTwin?.sellerInventoryState,
      project.marginalSellerCurve?.inventoryState,
      project.supplyLineageIntelligence?.sellerInventoryState,
    ])
  );
  const exhaustion = finite(
    project.sellerExhaustionScore ??
      project.ignitionTwin?.sellerExhaustionScore ??
      project.marginalSellerCurve?.sellerExhaustionScore
  );
  const explicitSellerFailure = /REPLENISH|RISING|EXPANDING/.test(sellerState);
  const sellerSupport =
    /THIN|THINNING|COLLAPS|EXHAUST/.test(sellerState) ||
    (exhaustion !== null && exhaustion >= 60);
  if (
    vacuum === false ||
    explicitSellerFailure ||
    (vacuum === true && exhaustion !== null && exhaustion < 60 && sellerState)
  ) {
    return gate("FAIL", "Supply/seller mechanics explicitly fail the required setup.", {
      supplyVacuumSupported: vacuum,
      sellerState,
      sellerExhaustionScore: exhaustion,
    });
  }
  if (vacuum === true && sellerSupport) {
    return gate("PASS", "Supply vacuum is supported and seller inventory is thinning/exhausted.", {
      supplyVacuumSupported: vacuum,
      sellerState,
      sellerExhaustionScore: exhaustion,
    });
  }
  return gate("UNKNOWN", "Supply-vacuum and seller-exhaustion evidence is incomplete.", {
    supplyVacuumSupported: vacuum ?? null,
    sellerState: sellerState || "UNKNOWN",
    sellerExhaustionScore: exhaustion,
  });
}

function priceExtensionGate(project = {}) {
  const edge = project.canonicalThreeClockEdge || project.threeClockEdge || {};
  const extended = first([
    edge.priceMateriallyExtended,
    project.priceMateriallyExtended,
    project.threeClockPriceMateriallyExtended,
  ]);
  if (extended === false) return gate("PASS", "Price is explicitly not materially extended.", { priceMateriallyExtended: false });
  if (extended === true) return gate("FAIL", "Price is already materially extended.", { priceMateriallyExtended: true });
  return gate("UNKNOWN", "Price-extension state is not proven.", { priceMateriallyExtended: null });
}

export function traceQualificationCandidate(project = {}, options = {}) {
  const productionGates = {
    IDENTITY: identityGate(project),
    CORE_EVIDENCE: coreEvidenceGate(project),
    SAFETY: safetyGate(project),
    ROUTE_IDENTITY: routeIdentityGate(project),
    BUY_QUOTE: quoteGate(project, "BUY"),
    SELL_QUOTE: quoteGate(project, "SELL"),
    QUOTE_FRESHNESS: freshnessGate(project, options),
    ROUTE_DEPTH: depthGate(project),
    VERIFIED_SLIPPAGE: slippageGate(project),
    USER_ACCESS: userAccessGate(project),
    FINAL_SELECTION_POLICY: finalPolicyGate(project),
  };
  const mechanismGates = {
    THREE_CLOCK_PRE_CONSENSUS: threeClockGate(project),
    CAPITAL_ARRIVAL: capitalArrivalGate(project),
    SUPPLY_SELLER: supplySellerGate(project),
    PRICE_NOT_EXTENDED: priceExtensionGate(project),
  };
  const execution = executionSnapshot(project);
  const routeVerified = execution.liveExecutionReady;
  const firstKnownFailure = PRODUCTION_GATE_ORDER.find(
    (name) => productionGates[name].status === "FAIL"
  ) || null;
  const firstUnknown = PRODUCTION_GATE_ORDER.find(
    (name) => productionGates[name].status === "UNKNOWN"
  ) || null;
  const firstMechanismFailure = MECHANISM_GATE_ORDER.find(
    (name) => mechanismGates[name].status === "FAIL"
  ) || null;
  const firstMechanismUnknown = MECHANISM_GATE_ORDER.find(
    (name) => mechanismGates[name].status === "UNKNOWN"
  ) || null;

  const finalQualified =
    project.finalSelectionQualified === true ||
    upper(project.finalSelectionState) === "QUALIFIED";

  let diagnosticClass = "UNRESOLVED_REVIEW";
  if (finalQualified) diagnosticClass = "QUALIFIED";
  else if (firstKnownFailure) diagnosticClass = "KNOWN_PRODUCTION_BLOCK";
  else if (firstUnknown) diagnosticClass = "PROOF_ACQUISITION_GAP";
  else if (firstMechanismFailure) diagnosticClass = "EDGE_MECHANISM_NOT_PRESENT";

  return {
    identityKey:
      project.permanentProjectKey ||
      project.canonicalProjectId ||
      project.identityKey ||
      null,
    symbol: project.symbol || null,
    name: project.name || null,
    chain: project.chain || project.network || null,
    tokenAddress:
      project.tokenAddress ||
      project.contractAddress ||
      project.canonicalAddress ||
      null,
    poolAddress:
      project.poolAddress ||
      project.pairAddress ||
      project.primaryTradablePool ||
      null,
    deepEvaluationState: project.deepEvaluationState || null,
    finalSelectionState: project.finalSelectionState || null,
    finalSelectionQualified: finalQualified,
    routeVerified,
    diagnosticClass,
    firstKnownFailure,
    firstUnknown,
    firstMechanismFailure,
    firstMechanismUnknown,
    productionGates,
    mechanismGates,
    finalBlockingReasons: array(project.finalBlockingReasons).map(String),
    finalWarningReasons: array(project.finalWarningReasons).map(String),
  };
}

function countBy(rows = [], keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

function gateCounts(rows = [], lane = "productionGates", order = PRODUCTION_GATE_ORDER) {
  return Object.fromEntries(order.map((name) => {
    const values = rows.map((row) => row[lane]?.[name]?.status || "UNKNOWN");
    return [name, {
      pass: values.filter((value) => value === "PASS").length,
      fail: values.filter((value) => value === "FAIL").length,
      unknown: values.filter((value) => value === "UNKNOWN").length,
    }];
  }));
}

function extractProjects(payload = {}) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function deepEvaluatedProjects(projects = []) {
  const progressive = projects.some((project) =>
    ["DEEP_EVALUATED", "DEFERRED_BEFORE_DEEP", "SELECTED_FOR_DEEP"].includes(
      upper(project.deepEvaluationState)
    )
  );
  if (!progressive) return projects;
  return projects.filter((project) => upper(project.deepEvaluationState) === "DEEP_EVALUATED");
}

function verifiedRouteDeath(row = {}) {
  if (row.finalSelectionQualified) return "QUALIFIED";
  const postRoutePriority = [
    "SAFETY",
    "USER_ACCESS",
    "FINAL_SELECTION_POLICY",
    "QUOTE_FRESHNESS",
    "ROUTE_DEPTH",
    "VERIFIED_SLIPPAGE",
    "BUY_QUOTE",
    "SELL_QUOTE",
    "ROUTE_IDENTITY",
    "IDENTITY",
    "CORE_EVIDENCE",
  ];
  const known = postRoutePriority.find((name) => row.productionGates[name]?.status === "FAIL");
  if (known) return `FAIL:${known}`;
  const unknown = postRoutePriority.find((name) => row.productionGates[name]?.status === "UNKNOWN");
  if (unknown) return `UNKNOWN:${unknown}`;
  if (row.firstMechanismFailure) return `MECHANISM:${row.firstMechanismFailure}`;
  if (row.firstMechanismUnknown) return `MECHANISM_UNKNOWN:${row.firstMechanismUnknown}`;
  return "UNEXPLAINED";
}

function topEntry(counts = {}) {
  return Object.entries(counts)[0] || [null, 0];
}

export function buildQualificationFailureMicroscope(projects = [], options = {}) {
  const sourceProjects = Array.isArray(projects) ? projects : [];
  const deep = deepEvaluatedProjects(sourceProjects);
  const traces = deep.map((project) => traceQualificationCandidate(project, options));
  const qualified = traces.filter((row) => row.finalSelectionQualified);
  const routeVerified = traces.filter((row) => row.routeVerified);
  const routeDeaths = countBy(
    routeVerified.filter((row) => !row.finalSelectionQualified),
    verifiedRouteDeath
  );
  const knownFailureCounts = countBy(traces, (row) => row.firstKnownFailure);
  const unknownCounts = countBy(traces, (row) => row.firstUnknown);
  const mechanismFailureCounts = countBy(traces, (row) => row.firstMechanismFailure);
  const finalBlockingReasonCounts = countBy(
    traces.flatMap((row) => row.finalBlockingReasons.map((reason) => ({ reason }))),
    (row) => row.reason
  );

  const recoverableProofGates = [
    "ROUTE_IDENTITY",
    "BUY_QUOTE",
    "SELL_QUOTE",
    "QUOTE_FRESHNESS",
    "ROUTE_DEPTH",
    "VERIFIED_SLIPPAGE",
    "USER_ACCESS",
  ];
  const postRouteProofGapCount = routeVerified.filter((row) =>
    !row.finalSelectionQualified &&
    recoverableProofGates.some((name) => row.productionGates[name]?.status !== "PASS")
  ).length;
  const postRouteMechanismFailureCount = routeVerified.filter((row) =>
    !row.finalSelectionQualified &&
    !row.firstKnownFailure &&
    !row.firstUnknown &&
    Boolean(row.firstMechanismFailure)
  ).length;

  let diagnostic = "NO_DEEP_EVALUATED_CANDIDATES";
  let nextAction = "Run a deep scan before interpreting qualification failures.";
  if (qualified.length) {
    diagnostic = "QUALIFIED_CANDIDATES_PRESENT";
    nextAction = "Inspect qualified candidates and preserve the same gates; do not loosen qualification.";
  } else if (traces.length && !routeVerified.length) {
    diagnostic = "PRE_ROUTE_PROOF_BOTTLENECK";
    const [gateName] = topEntry(knownFailureCounts);
    const [unknownName] = topEntry(unknownCounts);
    nextAction = `Improve proof acquisition for ${gateName || unknownName || "the earliest unresolved gate"} without converting UNKNOWN to PASS.`;
  } else if (routeVerified.length) {
    if (postRouteProofGapCount >= Math.max(1, Math.ceil(routeVerified.length / 2))) {
      diagnostic = "POST_ROUTE_PROOF_ACQUISITION_BOTTLENECK";
      const [death] = topEntry(routeDeaths);
      nextAction = `Repair the dominant post-route proof bottleneck (${death || "UNKNOWN"}) before changing the edge hypothesis.`;
    } else if (postRouteMechanismFailureCount >= Math.max(1, Math.ceil(routeVerified.length / 2))) {
      diagnostic = "EDGE_MECHANISM_NOT_PRESENT_IN_VERIFIED_ROUTE_COHORT";
      const [mechanism] = topEntry(mechanismFailureCounts);
      nextAction = `Keep execution gates fixed and test whether ${mechanism || "the current mechanism"} is genuinely too rare or wrong.`;
    } else {
      diagnostic = "MIXED_POST_ROUTE_FAILURES";
      nextAction = "Use the route-death map to fix the largest proof bottleneck first; change only one mechanism if proof is already complete.";
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    diagnostic,
    nextAction,
    sourceCandidates: sourceProjects.length,
    deepEvaluated: traces.length,
    fullyQualified: qualified.length,
    verifiedRouteCandidates: routeVerified.length,
    verifiedRouteQualified: routeVerified.filter((row) => row.finalSelectionQualified).length,
    postRouteProofGapCount,
    postRouteMechanismFailureCount,
    productionGateCounts: gateCounts(traces),
    mechanismGateCounts: gateCounts(traces, "mechanismGates", MECHANISM_GATE_ORDER),
    firstKnownFailureCounts: knownFailureCounts,
    firstUnknownCounts: unknownCounts,
    firstMechanismFailureCounts: mechanismFailureCounts,
    verifiedRouteDeathMap: routeDeaths,
    finalBlockingReasonCounts,
    candidates: traces,
    invariants: {
      missingEvidenceRemainsUnknown: true,
      exactIdentityNotWeakened: true,
      safetyNotWeakened: true,
      executionNotWeakened: true,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticProductionPromotion: false,
    },
  };
}

export function runQualificationFailureMicroscope(options = {}) {
  const inputFile = path.resolve(options.inputFile || INPUT_FILE);
  const reportFile = path.resolve(options.reportFile || REPORT_FILE);
  let payload = options.payload || null;
  let inputState = "OK";

  if (!payload) {
    if (!fs.existsSync(inputFile)) {
      inputState = "INPUT_MISSING";
      payload = {};
    } else {
      try {
        payload = JSON.parse(fs.readFileSync(inputFile, "utf8"));
      } catch {
        inputState = "INPUT_INVALID_JSON";
        payload = {};
      }
    }
  }

  const projects = extractProjects(payload);
  const report = {
    ...buildQualificationFailureMicroscope(projects, options),
    inputFile,
    inputState,
  };

  if (inputState !== "OK") {
    report.diagnostic = `QUALIFICATION_${inputState}`;
    report.nextAction = "Repair scanner report generation before interpreting qualification failures.";
  } else if (!projects.length) {
    report.diagnostic = "QUALIFICATION_INPUT_HAS_NO_PROJECTS";
    report.nextAction = "Repair scanner candidate/report generation before interpreting qualification failures.";
  }

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runQualificationFailureMicroscope();
  console.log(JSON.stringify({
    diagnostic: report.diagnostic,
    deepEvaluated: report.deepEvaluated,
    verifiedRouteCandidates: report.verifiedRouteCandidates,
    fullyQualified: report.fullyQualified,
    verifiedRouteDeathMap: report.verifiedRouteDeathMap,
    nextAction: report.nextAction,
  }, null, 2));
  if (report.inputState !== "OK" || report.sourceCandidates === 0) process.exitCode = 2;
}

export const QUALIFICATION_FAILURE_MICROSCOPE_REPORT = REPORT_FILE;
export const __qualificationFailureMicroscopeHooks = {
  finite,
  exactIdentitySnapshot,
  executionSnapshot,
  extractProjects,
  deepEvaluatedProjects,
  verifiedRouteDeath,
  textMatches,
};
