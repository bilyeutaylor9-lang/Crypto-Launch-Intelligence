import fs from "node:fs";
import path from "node:path";
import { normalizeChainId, normalizeTokenAddress, normalizePoolAddress } from "../identity/strictIdentityValidators.js";

const FRESHNESS_CLOCK_POLICY = "ABSOLUTE_QUOTE_TIME_V1";
const SCHEMA_VERSION = 2;

function absoluteTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return value >= 0 && Number.isFinite(new Date(value).getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, zone] = parts;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate() ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function measuredNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function diagnosticClock(options = {}) {
  if (Object.hasOwn(options, "clock") && typeof options.clock !== "function") throw new TypeError("Microscope clock must be a function.");
  const suppliedNow = Object.hasOwn(options, "now") ? absoluteTime(options.now) : undefined;
  if (suppliedNow === null) throw new TypeError("Microscope now must be a valid absolute timestamp.");
  const now = Object.hasOwn(options, "clock") ? absoluteTime(options.clock()) : suppliedNow ?? Date.now();
  if (now === null || (suppliedNow !== undefined && suppliedNow !== now)) throw new TypeError("Microscope clock is invalid or conflicts with now.");
  const asOf = Object.hasOwn(options, "asOf") ? absoluteTime(options.asOf) : now;
  if (asOf === null || asOf > now) throw new TypeError("Microscope asOf must be valid and no later than its clock.");
  const rawMaxAge = Object.hasOwn(options, "maxQuoteAgeSeconds") ? options.maxQuoteAgeSeconds
    : process.env.QUALIFICATION_MICROSCOPE_MAX_QUOTE_AGE_SECONDS ?? 900;
  const maxAge = measuredNumber(rawMaxAge);
  if (maxAge === null || maxAge <= 0) throw new TypeError("Microscope maxQuoteAgeSeconds must be a positive finite number.");
  return { now, asOf, maxAge, asOfTimestamp: new Date(asOf).toISOString() };
}

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
    quoteFresh: firstBoolean([proof.quoteFresh, global.quoteFresh, project.quoteFresh, project.executionQuoteFresh]),
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

function quoteObjects(source = {}) {
  return [source.buyQuote, source.sellQuote, source.quote, source.quotes?.buy, source.quotes?.sell,
    source.quote?.buy, source.quote?.sell].filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function declaredValues(source, keys) {
  return keys.filter((key) => Object.hasOwn(source, key)).map((key) => source[key]);
}

function quoteStamps(source = {}) {
  return [...declaredValues(source, ["quoteTimestamp", "executionQuoteTimestamp", "quoteRequestedAt", "quoteReceivedAt"]),
    ...quoteObjects(source).flatMap((item) => declaredValues(item, ["timestamp", "requestedAt", "receivedAt"]))];
}

function quoteExpiries(source = {}) {
  return [...declaredValues(source, ["quoteExpiresAt"]),
    ...quoteObjects(source).flatMap((item) => declaredValues(item, ["expiresAt", "quoteExpiresAt"]))];
}

function hasQuoteTiming(source = {}) {
  return quoteStamps(source).length || quoteExpiries(source).length ||
    Object.hasOwn(source, "quoteFreshnessSeconds") || Object.hasOwn(source, "quoteAgeSeconds");
}

function compatibleQuoteIdentity(left, right) {
  for (const [keys, normalize] of [
    [["chain", "chainId"], (value) => normalizeChainId(value)],
    [["contractAddress", "tokenAddress"], (value) => normalizeTokenAddress(value)],
    [["pairAddress", "poolAddress"], (value) => normalizePoolAddress(value)],
  ]) {
    const a = keys.map((key) => left[key]).filter((value) => value !== undefined && value !== null && value !== "").map(normalize);
    const b = keys.map((key) => right[key]).filter((value) => value !== undefined && value !== null && value !== "").map(normalize);
    if (a.some((value) => !value) || b.some((value) => !value) || new Set(a).size > 1 || new Set(b).size > 1) return false;
    if (a.length && b.length && a[0] !== b[0]) return false;
  }
  return true;
}

function quoteClockSources(project) {
  const sources = [project.executionProof, project.candidateProofState?.globalRoute, project,
    project.canonicalExecutionRoute, project.executionProofRecoveryRoute, project.purchaseRoute, project.executionRoute,
    ...array(project.executionRoutes), ...array(project.executionProofRecoveryRoutes)]
    .filter((source) => source && typeof source === "object" && !Array.isArray(source));
  const owner = sources.find(hasQuoteTiming);
  if (!owner) return { owner: null, sources: [] };
  const stamp = quoteStamps(owner)[0];
  const ownerTime = absoluteTime(stamp);
  return { owner, sources: [owner, ...sources.filter((source) => {
    if (source === owner || !quoteExpiries(source).length || !compatibleQuoteIdentity(owner, source)) return false;
    const otherStamps = quoteStamps(source);
    // A same-identity copy without a stamp can only tighten a known quote's
    // deadline. A different stamped quote cannot replace or extend its clock.
    return ownerTime !== null && (!otherStamps.length || absoluteTime(otherStamps[0]) === ownerTime);
  })] };
}

function negativeQuoteProof(source) {
  return source && (source.quoteFresh === false ||
    [source.status, source.executionStatus, source.executionProofState].some((value) => /(?:^|_)(?:STALE|EXPIRED|INVALID|FAILED|REJECTED|UNVERIFIED|NOT_VERIFIED)(?:_|$)/.test(upper(value))) ||
    quoteObjects(source).some((quote) => quote.verified === false || quote.quoteVerified === false ||
      [quote.status, quote.verificationStatus].some((value) => /(?:STALE|EXPIRED|INVALID|FAILED|REJECTED|UNVERIFIED|NOT_VERIFIED)/.test(upper(value)))));
}

function freshnessGate(project = {}, context) {
  const execution = executionSnapshot(project);
  const { owner, sources } = quoteClockSources(project);
  const rawStamps = sources.flatMap(quoteStamps), rawExpiries = sources.flatMap(quoteExpiries);
  const stamps = rawStamps.map(absoluteTime), expiries = rawExpiries.map(absoluteTime);
  const ageValue = owner && first([owner.quoteFreshnessSeconds, owner.quoteAgeSeconds]);
  const cachedAge = ageValue === null ? null : measuredNumber(ageValue);
  const absoluteAge = stamps.length && stamps.every((stamp) => stamp !== null)
    ? (context.asOf - Math.min(...stamps)) / 1000 : null;
  const evidence = { ...execution, quoteAgeSeconds: absoluteAge === null ? null : Math.max(absoluteAge, cachedAge ?? 0),
    cachedQuoteAgeSeconds: cachedAge, maxAgeSeconds: context.maxAge, asOfTimestamp: context.asOfTimestamp,
    freshnessClockPolicy: FRESHNESS_CLOCK_POLICY,
    quoteTimestamp: stamps.length && stamps.every((stamp) => stamp !== null) ? new Date(Math.min(...stamps)).toISOString() : null,
    ...(rawExpiries.length ? { quoteExpiresAt: expiries.every((expiry) => expiry !== null) ? new Date(Math.min(...expiries)).toISOString() : null } : {}),
  };
  const proofOwnsTiming = project.executionProof && hasQuoteTiming(project.executionProof);
  const explicitFresh = (proofOwnsTiming ? [project.executionProof.quoteFresh] :
    [project.executionProof?.quoteFresh, project.candidateProofState?.globalRoute?.quoteFresh,
      project.quoteFresh, project.executionQuoteFresh]).find((value) => typeof value === "boolean");
  if (explicitFresh === false || negativeQuoteProof(project.executionProof) ||
      (!proofOwnsTiming && negativeQuoteProof(project.candidateProofState?.globalRoute)) || negativeQuoteProof(owner)) {
    return gate("FAIL", "Authoritative quote proof explicitly rejects freshness or validity.", evidence);
  }
  if (stamps.some((stamp) => stamp === null || stamp > context.asOf) || expiries.some((expiry) => expiry === null) ||
      (ageValue !== null && (cachedAge === null || cachedAge < 0))) return gate("FAIL", "Quote clock or declared expiry is invalid or future-dated.", evidence);
  if (sources.some((source) => (Object.hasOwn(source, "quoteReceivedAt") &&
      declaredValues(source, ["quoteTimestamp", "executionQuoteTimestamp", "quoteRequestedAt"]).some((stamp) => absoluteTime(stamp) > absoluteTime(source.quoteReceivedAt))) ||
      quoteObjects(source).some((quote) => Object.hasOwn(quote, "receivedAt") &&
      declaredValues(quote, ["timestamp", "requestedAt"]).some((stamp) => absoluteTime(stamp) > absoluteTime(quote.receivedAt))))) {
    return gate("FAIL", "Quote request/receipt clocks are contradictory.", evidence);
  }
  if (expiries.some((expiry) => expiry <= context.asOf || stamps.some((stamp) => stamp >= expiry))) {
    return gate("FAIL", "Quote has reached its declared expiry.", evidence);
  }
  if (cachedAge !== null && cachedAge > context.maxAge) return gate("FAIL", "Quote is stale.", evidence);
  if (!stamps.length) return gate(textMatches(project, [/stale quote/i, /quote.*expired/i]) ? "FAIL" : "UNKNOWN", "Absolute quote observation time is not proven.", evidence);
  return evidence.quoteAgeSeconds <= context.maxAge
    ? gate("PASS", "Absolute quote time is inside the freshness window and declared expiry.", evidence)
    : gate("FAIL", "Quote is stale.", evidence);
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

function traceCandidateAt(project, options, context) {
  const productionGates = {
    IDENTITY: identityGate(project),
    CORE_EVIDENCE: coreEvidenceGate(project),
    SAFETY: safetyGate(project),
    ROUTE_IDENTITY: routeIdentityGate(project),
    BUY_QUOTE: quoteGate(project, "BUY"),
    SELL_QUOTE: quoteGate(project, "SELL"),
    QUOTE_FRESHNESS: freshnessGate(project, context),
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

export function traceQualificationCandidate(project = {}, options = {}) {
  return traceCandidateAt(project, options, diagnosticClock(options));
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
  const states = projects.map((project) => upper(project.deepEvaluationState));
  const progressive = states.some((state) =>
    ["DEEP_EVALUATED", "DEFERRED_BEFORE_DEEP", "SELECTED_FOR_DEEP"].includes(state)
  );
  if (!progressive) return projects;
  return projects.filter((project, index) =>
    states[index] === "DEEP_EVALUATED" ||
    // The production report projection uses DEFERRED_BEFORE_DEEP only for
    // the deferred tail. A missing state on a non-deferred row is evaluated.
    (!states[index] && states[index] !== "DEFERRED_BEFORE_DEEP")
  );
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

function buildMicroscopeAt(projects, options, context) {
  const sourceProjects = Array.isArray(projects) ? projects : [];
  const deep = deepEvaluatedProjects(sourceProjects);
  const traces = deep.map((project) => traceCandidateAt(project, options, context));
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
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date(context.now).toISOString(),
    asOfTimestamp: context.asOfTimestamp,
    freshnessClockPolicy: FRESHNESS_CLOCK_POLICY,
    freshnessMaxQuoteAgeSeconds: context.maxAge,
    freshnessTemporalScope: context.asOf === context.now ? "AS_OF_GENERATION" : "EXPLICIT_HISTORICAL_AS_OF",
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

export function buildQualificationFailureMicroscope(projects = [], options = {}) {
  return buildMicroscopeAt(projects, options, diagnosticClock(options));
}

function reusableFullScan(existing, scanRunId, projects, context, options) {
  if (!existing || typeof existing !== "object") return false;
  if (existing.sourceMode !== "FULL_SCAN" || existing.scanRunId !== scanRunId || existing.sourceCandidates !== projects.length ||
      existing.schemaVersion !== SCHEMA_VERSION || existing.freshnessClockPolicy !== FRESHNESS_CLOCK_POLICY ||
      existing.freshnessMaxQuoteAgeSeconds !== context.maxAge || !Array.isArray(existing.candidates) ||
      existing.deepEvaluated !== existing.candidates.length) return false;
  const asOf = absoluteTime(existing.asOfTimestamp), generatedAt = absoluteTime(existing.generatedAt);
  if (asOf === null || generatedAt === null || asOf > generatedAt || generatedAt > context.now || asOf > context.asOf) return false;
  if (Object.hasOwn(options, "asOf") && asOf !== context.asOf) return false;
  return existing.candidates.every((candidate) => candidate?.productionGates?.QUOTE_FRESHNESS?.evidence?.asOfTimestamp === existing.asOfTimestamp &&
    candidate.productionGates.QUOTE_FRESHNESS.evidence.freshnessClockPolicy === FRESHNESS_CLOCK_POLICY &&
    candidate.productionGates.QUOTE_FRESHNESS.evidence.maxAgeSeconds === context.maxAge);
}

export function runQualificationFailureMicroscope(options = {}) {
  const context = diagnosticClock(options);
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
      } catch (error) {
        if (!(error instanceof SyntaxError) && error.code !== "ENOENT") throw error;
        inputState = error.code === "ENOENT" ? "INPUT_MISSING" : "INPUT_INVALID_JSON";
        payload = {};
      }
    }
  }

  const projects = extractProjects(payload);
  const scanRunId = payload?.meta?.scanRunId || payload?.meta?.runId || null;
  if (inputState === "OK" && scanRunId && fs.existsSync(reportFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(reportFile, "utf8"));
      if (reusableFullScan(existing, scanRunId, projects, context, options)) {
        // Preserve proof omitted from the public projection, not a claim of
        // current execution freshness. Original generation/as-of stay unchanged.
        const frozen = { ...existing, freshnessTemporalScope: "FROZEN_FULL_SCAN_AS_OF",
          cacheReusedAt: new Date(context.now).toISOString() };
        return frozen;
      }
    } catch (error) {
      // Malformed JSON can be rebuilt. A storage failure does not prove the
      // full-proof cache is damaged, and must not replace it with a projection.
      if (!(error instanceof SyntaxError) && error.code !== "ENOENT") throw error;
    }
  }
  const report = {
    ...buildMicroscopeAt(projects, options, context),
    scanRunId,
    sourceMode: "REPORT_PROJECTION",
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

export function writeQualificationFailureMicroscope(projects = [], meta = {}, options = {}) {
  const reportFile = path.resolve(options.reportFile || "reports/qualification-failure-microscope.json");
  const report = {
    ...buildQualificationFailureMicroscope(projects, options),
    scanRunId: meta.scanRunId || meta.runId || null,
    sourceMode: "FULL_SCAN",
    inputFile: null,
    inputState: "OK",
  };
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
