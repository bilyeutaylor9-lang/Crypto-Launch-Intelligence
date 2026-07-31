import {
  hasExactRouteIdentity,
  hasVerifiedBuyQuote,
  hasVerifiedRouteDepth,
  hasVerifiedRouteSlippage,
  hasVerifiedSellQuote,
  routeQuoteAgeSeconds,
  routeQuoteFresh,
} from "../execution/routeTruthV2.js";

const DETERMINISTIC_BLOCK_PATTERNS = [
  /confirmed honeypot/i,
  /verified honeypot/i,
  /honeypot evidence/i,
  /verified scam/i,
  /malicious/i,
  /contract (conflict|mismatch)/i,
  /identity conflict/i,
  /chain mismatch/i,
  /confirmed sell restriction/i,
  /liquidity (removal|rug|drain)/i,
  /wash[-\s]?trading confirmed/i,
  /confirmed manipulation/i,
];

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function chainOf(project = {}) {
  return first([
    project.canonicalChain,
    project.finalChain,
    project.chain,
    project.network,
    project.canonicalExecutionRoute?.chain,
  ]);
}

function tokenAddressOf(project = {}) {
  return first([
    project.finalContractAddress,
    project.canonicalAddress,
    project.tokenAddress,
    project.contractAddress,
    project.canonicalExecutionRoute?.tokenAddress,
    project.canonicalExecutionRoute?.contractAddress,
  ]);
}

function poolAddressOf(project = {}) {
  return first([
    project.primaryTradablePool,
    project.poolAddress,
    project.pairAddress,
    project.finalPairAddress,
    project.canonicalExecutionRoute?.poolAddress,
    project.canonicalExecutionRoute?.pairAddress,
  ]);
}

function sourceList(project = {}) {
  return [...new Set([
    project.source,
    ...array(project.sources),
    ...array(project.discoverySources),
    ...array(project.evidenceSources),
  ].filter(Boolean).map((source) => clean(source).toLowerCase()))];
}

function importedBlockers(project = {}) {
  return [...new Set([
    ...array(project.opportunityHardBlockers),
    ...array(project.hardBlockers),
    ...array(project.finalBlockingReasons),
    ...array(project.sniperBlockingReasons),
    ...array(project.preConsensusHardBlockers),
    ...array(project.economicIntegrityBlockers),
  ].filter(Boolean).map(String))];
}

export function deterministicCandidateBlocks(project = {}) {
  const explicit = importedBlockers(project).filter((reason) =>
    DETERMINISTIC_BLOCK_PATTERNS.some((pattern) => pattern.test(reason))
  );
  return [...new Set([
    ...explicit,
    ...(project.canonicalIdentityHardBlock === true ? ["Canonical identity conflict."] : []),
    ...(project.honeypotDetected === true || project.verifiedScam === true || project.scamDetected === true
      ? ["Verified scam or honeypot evidence."]
      : []),
    ...(project.sellRestricted === true ? ["Confirmed sell restriction."] : []),
    ...(project.chainMismatch === true || project.contractChainMismatch === true
      ? ["Confirmed chain mismatch."]
      : []),
    ...(num(project.liquidityRemovalRiskScore) !== null && num(project.liquidityRemovalRiskScore) >= 90
      ? ["Confirmed severe liquidity-removal risk."]
      : []),
    ...(num(project.manipulationRiskScore) !== null && num(project.manipulationRiskScore) >= 95
      ? ["Confirmed severe manipulation risk."]
      : []),
  ])];
}

export function candidateResearchWarnings(project = {}) {
  const deterministic = new Set(deterministicCandidateBlocks(project));
  return importedBlockers(project).filter((reason) => !deterministic.has(reason));
}

export function deriveProjectLifecycleState(project = {}) {
  const explicit = upper(first([
    project.lifecycleStage,
    project.projectLifecycleStage,
    project.launchStatus,
    project.stage,
  ]));
  if (/DEAD|ABANDONED|INACTIVE|DELISTED/.test(explicit)) return "INACTIVE";
  if (/REACTIVATED|REACCELERATION|REVIVAL/.test(explicit)) return "REACTIVATED";

  const tokenAddress = tokenAddressOf(project);
  if (tokenAddress) return "LIVE";

  if (/PRELAUNCH|PRE_LAUNCH|COMING_SOON|TGE_PENDING|TESTNET|MAINNET_PENDING/.test(explicit)) {
    return "PRELAUNCH";
  }
  if (/LIVE|LAUNCHED|NEWLY_LAUNCHED|TRADING|MAINNET/.test(explicit)) return "LIVE";

  const sources = sourceList(project);
  const developmentFirst = Boolean(
    project.github ||
    project.githubUrl ||
    project.website ||
    project.websiteUrl ||
    project.docsUrl ||
    project.roadmap ||
    sources.some((source) => /github|official|roadmap|docs|google-news/.test(source))
  );
  return developmentFirst ? "PRELAUNCH" : "UNKNOWN";
}

function safetyState(project = {}) {
  const deterministicBlocks = deterministicCandidateBlocks(project);
  const declared = upper(first([
    project.safetyProofStatus,
    project.safetyProofLane,
    project.instantSafetyStatus,
  ]));
  if (deterministicBlocks.length || /BLOCK|CRITICAL|HONEYPOT|UNSAFE|RESTRICTED/.test(declared)) {
    return {
      status: "BLOCKED",
      deterministicBlocks,
      unknownChecks: array(project.securityEvidenceMissingFields),
    };
  }

  const securityEvidence = array(project.securityEvidence);
  const testedChecks = array(project.securityEvidence?.checks).length
    ? array(project.securityEvidence.checks)
    : securityEvidence.length
      ? securityEvidence
      : array(project.safetyTestedChecks);
  const sourceCount = new Set([
    ...array(project.securityEvidenceSources),
    ...array(project.securityEvidenceSummary?.knownProviders),
    ...array(project.securityEvidenceSummary?.providers),
    ...array(project.freeSecurityEvidence?.summary?.knownProviders),
    ...array(project.freeSecurityEvidence?.summary?.providers),
    ...array(project.contractAuthorityRisk?.sources),
    ...array(project.evidence)
      .filter((item) => /security|safety/i.test(String(item?.family || item?.engine || "")))
      .map((item) => item.source),
  ].filter(Boolean)).size;
  const explicitlyClean = Boolean(
    project.safetyProofStatus === "VERIFIED_SAFE" ||
    project.safetyProofStatus === "SAFETY_VERIFIED_CLEAN" ||
    project.instantSafetyStatus === "PASS" ||
    project.contractSafetyVerified === true
  );
  const partial = Boolean(
    explicitlyClean ||
    testedChecks.length ||
    sourceCount ||
    project.contractVerified === true ||
    project.honeypotDetected === false
  );
  return {
    status: explicitlyClean && (testedChecks.length > 0 || sourceCount > 0) ? "VERIFIED_SAFE" : partial ? "PARTIAL" : "UNKNOWN",
    deterministicBlocks: [],
    testedChecks,
    unknownChecks: array(project.securityEvidenceMissingFields),
    sourceCount,
    provenance: [
      ...new Set([
        ...array(project.safetyEvidenceProvenance),
        ...array(project.securityEvidenceSummary?.knownProviders),
        ...array(project.freeSecurityEvidence?.summary?.knownProviders),
      ].filter(Boolean)),
    ],
    sourceTimestamps: {
      ...(project.securityEvidenceSummary?.sourceTimestamps || {}),
      ...(project.freeSecurityEvidence?.summary?.sourceTimestamps || {}),
      ...(project.safetySourceTimestamps || {}),
    },
  };
}

function userAccessState(project = {}) {
  const region = upper(first([
    project.userAccess?.regionStatus,
    project.regionStatus,
    project.regionAvailability,
    project.canonicalExecutionRoute?.regionStatus,
    project.executionProofRecoveryRoute?.regionStatus,
  ]));
  if (/RESTRICTED|BLOCKED|UNAVAILABLE/.test(region)) return "CONFIRMED_RESTRICTED";
  if (/CONFIRMED_AVAILABLE|AVAILABLE|SUPPORTED/.test(region)) return "CONFIRMED_AVAILABLE";
  return "UNKNOWN";
}

export function buildCandidateProofState(project = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project);
  const poolAddress = poolAddressOf(project);
  const buyQuoteVerified = hasVerifiedBuyQuote(project);
  const sellQuoteVerified = hasVerifiedSellQuote(project);
  const depthVerified = hasVerifiedRouteDepth(project);
  const slippageVerified = hasVerifiedRouteSlippage(project);
  const quoteFresh = routeQuoteFresh(project);
  const exactIdentityVerified = Boolean(
    project.canonicalExecutionRoute?.exactIdentityVerified === true ||
    project.strictIdentityVerified === true ||
    hasExactRouteIdentity(project)
  );
  const globalRouteStatus =
    exactIdentityVerified && buyQuoteVerified && sellQuoteVerified && depthVerified && slippageVerified && quoteFresh
      ? "ROUTE_VERIFIED"
      : exactIdentityVerified && buyQuoteVerified && sellQuoteVerified
        ? "TWO_WAY_QUOTE_VERIFIED"
        : exactIdentityVerified && buyQuoteVerified
          ? "BUY_QUOTE_VERIFIED"
          : exactIdentityVerified
            ? "MARKET_IDENTIFIED"
            : "UNRESOLVED";
  const safety = safetyState(project);

  return {
    identity: {
      status: exactIdentityVerified ? "VERIFIED" : chain && tokenAddress ? "PARTIAL" : "UNRESOLVED",
      chain: chain || null,
      tokenAddress: tokenAddress || null,
      poolAddress: poolAddress || null,
      exactIdentityVerified,
      confidence: num(first([project.identityConfidence, project.identityResolutionScore])),
      provenance: sourceList(project),
    },
    safety,
    globalRoute: {
      status: globalRouteStatus,
      buyQuoteVerified,
      sellQuoteVerified,
      depthVerified,
      slippageVerified,
      quoteFresh,
      quoteTimestamp: first([
        project.quoteTimestamp,
        project.executionProofRecoveryRoute?.quoteTimestamp,
        project.canonicalExecutionRoute?.quoteTimestamp,
      ]),
      quoteAgeSeconds: routeQuoteAgeSeconds(project),
      verifiedTradeSizeUsd: num(first([
        project.verifiedTradeSizeUsd,
        project.executionProofRecoveryRoute?.verifiedTradeSizeUsd,
        project.canonicalExecutionRoute?.verifiedTradeSizeUsd,
      ])),
      tradeSizeUsd: num(first([
        project.verifiedTradeSizeUsd,
        project.executionProofRecoveryRoute?.verifiedTradeSizeUsd,
        project.canonicalExecutionRoute?.verifiedTradeSizeUsd,
      ])),
      provenance: [...new Set([
        project.executionRecoverySource,
        project.executionProofRecoveryRoute?.source,
        ...array(project.canonicalExecutionRoute?.supportingSources),
      ].filter(Boolean))],
    },
    userAccess: {
      status: userAccessState(project),
      regionStatus: upper(first([
        project.regionStatus,
        project.regionAvailability,
        project.canonicalExecutionRoute?.regionStatus,
      ])) || "UNKNOWN",
      walletCompatibility: first([
        project.preferredWalletCompatibility,
        project.walletFamily,
        project.canonicalExecutionRoute?.walletFamily,
      ]),
      venueAvailability: first([
        project.venueAvailability,
        project.routeAccessibility?.venueAvailability,
        project.canonicalExecutionRoute?.venueAvailability,
      ]),
    },
  };
}

export function attachCandidateTruthState(project = {}) {
  const candidateProofState = buildCandidateProofState(project);
  const projectLifecycleState = deriveProjectLifecycleState(project);
  const deterministicBlocks = candidateProofState.safety.deterministicBlocks;
  const identityResolved = candidateProofState.identity.status === "VERIFIED";
  const globalRouteStatus = candidateProofState.globalRoute.status;
  const executionReadinessState =
    deterministicBlocks.length
      ? "BLOCKED"
      : globalRouteStatus === "ROUTE_VERIFIED" &&
          candidateProofState.safety.status === "VERIFIED_SAFE" &&
          candidateProofState.userAccess.status === "CONFIRMED_AVAILABLE"
        ? "READY"
        : globalRouteStatus === "ROUTE_VERIFIED" || globalRouteStatus === "TWO_WAY_QUOTE_VERIFIED"
          ? "EXECUTION_REVIEW"
          : "RESEARCH_ONLY";
  const tradabilityState =
    executionReadinessState === "READY"
      ? "EXECUTION_READY"
      : globalRouteStatus === "ROUTE_VERIFIED"
        ? "ROUTE_QUOTED"
        : globalRouteStatus === "TWO_WAY_QUOTE_VERIFIED" || globalRouteStatus === "BUY_QUOTE_VERIFIED"
          ? "ROUTE_QUOTED"
          : globalRouteStatus === "MARKET_IDENTIFIED"
            ? "MARKET_IDENTIFIED"
            : "UNRESOLVED";
  const researchEligibilityState =
    deterministicBlocks.length
      ? "BLOCKED"
      : projectLifecycleState === "PRELAUNCH"
        ? "WATCH"
        : identityResolved
          ? "ELIGIBLE"
          : "NEEDS_PROOF";

  return {
    ...project,
    projectLifecycleState,
    researchEligibilityState,
    tradabilityState,
    executionReadinessState,
    candidateProofState,
    deterministicCandidateBlocks: deterministicBlocks,
    researchWarnings: candidateResearchWarnings(project),
  };
}

export function attachCandidateTruthStateBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(attachCandidateTruthState);
}
