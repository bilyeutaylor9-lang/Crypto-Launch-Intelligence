import { inspectBlockingVerdicts, normalizeDecisionText } from "../selection/blockingVerdictHelper.js";

export const FINAL_SELECTION_STATES = {
  QUALIFIED: "QUALIFIED",
  RESEARCH_ONLY: "RESEARCH_ONLY",
  BLOCKED: "BLOCKED",
  IDENTITY_CONFLICT: "IDENTITY_CONFLICT",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

export const FINAL_IDENTITY_STATES = {
  VERIFIED_CONTRACT: "VERIFIED_CONTRACT",
  VERIFIED_LISTING: "VERIFIED_LISTING",
  PROBABLE_MATCH: "PROBABLE_MATCH",
  SYMBOL_ONLY: "SYMBOL_ONLY",
  CONFLICTED_IDENTITY: "CONFLICTED_IDENTITY",
  UNRESOLVED_IDENTITY: "UNRESOLVED_IDENTITY",
};

const SELECTION_FLAGS = [
  "smallCapHunterSelected",
  "proofOfAlphaExecutionTwinSelected",
  "executionVerifiedSelected",
  "strongBuySelected",
  "researchPickSelected",
  "preConsensusCandidateSelected",
  "finalCandidateSelected",
];

const COLLISION_PRONE_SYMBOLS = new Set(["PERP", "AI", "ACT", "TRAC", "SPX", "REN"]);

const TRUSTED_CONTRACT_SOURCES = new Set([
  "dexscreener",
  "dexscreener-search",
  "dexscreener-profiles",
  "dexscreener-boosts",
  "geckoterminal",
  "birdeye",
  "coinbase",
  "uniswap",
  "pancakeswap",
  "raydium",
  "orca",
]);

const DEFAULT_OPTIONS = {
  minimumPipelineScore: Number(process.env.FINAL_SELECTION_MIN_PIPELINE_SCORE || 60),
  maximumRiskScore: Number(process.env.FINAL_SELECTION_MAX_RISK_SCORE || 70),
  maximumTrapRiskScore: Number(process.env.FINAL_SELECTION_MAX_TRAP_RISK_SCORE || 60),
  minimumLiquidityUsd: Number(process.env.FINAL_SELECTION_MIN_LIQUIDITY_USD || 5_000),
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function symbolOf(project = {}) {
  return clean(project.symbol || project.ticker || project.baseToken?.symbol).toUpperCase();
}

function chainOf(project = {}) {
  return lower(
    project.chainId ||
      project.chain ||
      project.network ||
      project.baseToken?.chain ||
      project.marketData?.chain ||
      ""
  );
}

function firstString(values = []) {
  return values.map(clean).find(Boolean) || "";
}

function contractAddressOf(project = {}) {
  return firstString([
    project.contractAddress,
    project.tokenAddress,
    project.address,
    project.baseToken?.address,
    project.rawCandidate?.contractAddress,
    project.rawCandidate?.tokenAddress,
    project.rawCandidate?.address,
    project.smallCapHunter?.purchaseRoute?.routes?.find((route) => route.contract)?.contract,
    project.proofOfAlphaExecutionTwin?.route?.routes?.find((route) => route.contract)?.contract,
  ]).toLowerCase();
}

function pairAddressOf(project = {}) {
  return firstString([
    project.pairAddress,
    project.poolAddress,
    project.pair?.address,
    project.rawCandidate?.pairAddress,
    project.rawCandidate?.poolAddress,
    project.smallCapHunter?.purchaseRoute?.routes?.find((route) => route.pairAddress)?.pairAddress,
    project.proofOfAlphaExecutionTwin?.route?.routes?.find((route) => route.pairAddress)?.pairAddress,
  ]).toLowerCase();
}

function officialDomain(project = {}) {
  const value = firstString([
    project.website,
    project.projectUrl,
    project.links?.homepage?.[0],
    project.links?.website,
    project.officialUrl,
  ]);

  if (!value) return "";

  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const match = value.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : "";
  }
}

function exchangeAssetId(project = {}) {
  return firstString([
    project.verifiedExchangeAssetId,
    project.exchangeAssetId,
    project.coinbaseAssetId,
    project.binanceAssetId,
    project.krakenAssetId,
    project.listingAssetId,
  ]);
}

function externalAssetId(project = {}) {
  return firstString([
    project.verifiedCoinGeckoId,
    project.coinGeckoId,
    project.coingeckoId,
    project.verifiedCoinMarketCapId,
    project.coinMarketCapId,
    project.cmcId,
    project.assetId,
  ]);
}

function truthy(value) {
  return value === true || ["true", "verified", "pass", "confirmed", "resolved"].includes(lower(value));
}

function explicitlyFalse(value) {
  return value === false || ["false", "unverified", "failed", "missing", "mismatch", "conflict", "blocked"].includes(lower(value));
}

function statusText(project = {}, fields = []) {
  return fields
    .map((field) => project[field])
    .filter((value) => value != null)
    .map((value) => String(value))
    .join(" ");
}

function sourceSet(project = {}) {
  return new Set(
    [
      project.source,
      project.dex,
      project.exchange,
      project.listingExchange,
      ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
    ]
      .map(lower)
      .filter(Boolean)
  );
}

function hasTrustedContractSource(project = {}) {
  const sources = sourceSet(project);
  if ([...sources].some((source) => TRUSTED_CONTRACT_SOURCES.has(source))) return true;
  const url = lower(project.url || project.pairUrl || project.marketUrl);
  return ["dexscreener.com", "geckoterminal.com", "birdeye.so", "coinbase.com"].some((host) =>
    url.includes(host)
  );
}

function contractVerified(project = {}) {
  const contract = contractAddressOf(project);
  if (!contract) return false;

  const status = statusText(project, [
    "contractVerified",
    "contractVerificationStatus",
    "contractVerdict",
    "tokenIdentityStatus",
    "identityState",
    "projectIdentityState",
  ]);

  if (explicitlyFalse(status)) return false;
  if (truthy(project.contractVerified) || truthy(project.contractVerificationStatus)) return true;
  if (["VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(project.identityState || project.projectIdentityState)) return true;
  if (project.projectIdentityVerdict === "Identity Resolved") return true;
  if (project.sourceTruthVerdict === "Verified Source Stack") return true;
  if (hasTrustedContractSource(project)) return true;

  return false;
}

function chainVerified(project = {}) {
  const chain = chainOf(project);
  if (!chain || chain === "unknown" || chain === "research") return false;

  const status = statusText(project, [
    "chainVerified",
    "chainVerificationStatus",
    "chainIdentityStatus",
    "identityState",
    "projectIdentityState",
  ]);

  if (explicitlyFalse(status) || project.chainMismatch || project.contractChainMismatch) return false;
  if (truthy(project.chainVerified) || truthy(project.chainVerificationStatus)) return true;
  if (contractVerified(project)) return true;
  if (project.projectIdentityVerdict === "Identity Resolved") return true;

  return false;
}

function listingVerified(project = {}) {
  return Boolean(
    exchangeAssetId(project) &&
      (truthy(project.listingVerified) ||
        truthy(project.exchangeListingVerified) ||
        lower(project.source) === "coinbase" ||
        lower(project.exchange).includes("coinbase"))
  );
}

function routeFrom(project = {}) {
  const purchaseRoute = project.purchaseRoute || project.smallCapHunter?.purchaseRoute || {};
  const twinRoute = project.proofOfAlphaExecutionTwin?.route || {};
  const purchasable = purchaseRoute.purchasable === true || project.purchaseRouteAvailable === true;
  const executionDetected = twinRoute.detected === true;
  const routeStatus = firstString([
    purchaseRoute.status,
    project.routeStatus,
    project.routeVerdict,
    twinRoute.status,
    project.proofOfAlphaExecutionTwinRoute,
  ]);
  const preferredRoute = firstString([
    purchaseRoute.preferredRoute,
    project.purchaseRouteName,
    project.proofOfAlphaExecutionTwinRoute,
    twinRoute.preferredRoute,
  ]);

  return {
    purchasable,
    executionDetected,
    status: routeStatus,
    preferredRoute,
    confirmed: purchasable || executionDetected,
  };
}

function executionRouteAvailable(project = {}) {
  if (project.executionRouteAvailable === true) return true;
  if (project.executionRouteAvailable === false) return false;
  if (normalizeDecisionText(project.executionVerdict).includes("block")) return false;
  if (normalizeDecisionText(project.proofOfAlphaExecutionTwinVerdict).includes("block")) return false;
  if (project.proofOfAlphaExecutionTwin?.quote?.blocker) return false;
  if ((project.proofOfAlphaExecutionTwin?.safety?.blockers || []).length) return false;
  if (project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate") return true;

  return routeFrom(project).executionDetected || project.proofOfAlphaExecutionTwinSelected === true;
}

function liquidityUsd(project = {}) {
  return Math.max(
    num(project.liquidityUsd),
    num(project.liquidity),
    num(project.marketData?.liquidityUsd),
    num(project.rawCandidate?.liquidityUsd),
    num(project.smallCapHunter?.execution?.liquidityUsd),
    num(project.proofOfAlphaExecutionTwin?.quote?.liquidityUsd)
  );
}

function marketCapUsd(project = {}) {
  return Math.max(
    num(project.marketCap),
    num(project.circulatingMarketCap),
    num(project.verifiedMarketCap),
    num(project.fdv),
    num(project.fullyDilutedValue),
    num(project.smallCapMarketCap),
    num(project.marketData?.marketCap),
    num(project.rawCandidate?.marketCap)
  );
}

function strategyRequiresMarketCap(project = {}) {
  return Boolean(
    project.smallCapHunter ||
      project.smallCapHunterSelected ||
      project.smallCapHunterVerdict ||
      project.smallCapBand ||
      project.smallCapMarketCap
  );
}

function maxRiskScore(project = {}) {
  return Math.max(
    num(project.riskScore),
    num(project.signalProfile?.risk),
    num(project.smallCapRiskScore),
    num(project.economicIntegrityRiskScore),
    num(project.activityAuthenticityRiskScore),
    num(project.supplyIntegrityRiskScore),
    num(project.deployerRiskScore),
    num(project.walletClusterRiskScore),
    num(project.washTradingRiskScore),
    num(project.bundledLaunchRiskScore),
    num(project.instantSafetyRiskScore),
    num(project.organicDemandFirewallRisk)
  );
}

function trapRiskScore(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.outcomeTrapRisk),
    num(project.falsePositiveSimilarity)
  );
}

function hasExplicitIdentityConflict(project = {}) {
  const text = normalizeDecisionText(
    [
      project.identityVerdict,
      project.projectIdentityVerdict,
      project.identityState,
      project.projectIdentityState,
      project.chainIdentityStatus,
      project.contractVerdict,
      ...(Array.isArray(project.identityWarnings) ? project.identityWarnings : []),
      ...(Array.isArray(project.projectIdentityGraph?.warnings) ? project.projectIdentityGraph.warnings : []),
    ].join(" ")
  );

  return Boolean(
    project.identityConflict ||
      project.conflictedIdentity ||
      project.chainMismatch ||
      project.contractChainMismatch ||
      project.externalIdMismatch ||
      project.symbolCollisionRisk ||
      text.includes("identity risk") ||
      text.includes("conflict") ||
      text.includes("mismatch")
  );
}

function buildPermanentProjectKey(project = {}, identity = {}) {
  const chain = identity.chain || chainOf(project);
  const contract = identity.contractAddress || contractAddressOf(project);
  const listing = exchangeAssetId(project);
  const external = externalAssetId(project);
  const domain = officialDomain(project);
  const symbol = symbolOf(project);
  const name = lower(project.name || project.canonicalName || "");

  if (chain && contract) return `${chain}:${contract}`;
  if (listing) return `exchange:${lower(project.exchange || project.source || "asset")}:${lower(listing)}`;
  if (external) return `asset:${lower(external)}`;
  if (domain && chain) return `${chain}:domain:${domain}`;
  return `temporary:symbol:${chain || "unknown"}:${symbol || name || "unknown"}`;
}

function buildCollisionContext(projects = []) {
  const groups = new Map();

  for (const project of Array.isArray(projects) ? projects : []) {
    const symbol = symbolOf(project);
    if (!symbol) continue;
    const chain = chainOf(project) || "unknown";
    const contract = contractAddressOf(project) || "";
    const key = `${chain}:${contract || officialDomain(project) || exchangeAssetId(project) || externalAssetId(project) || "symbol-only"}`;
    const current = groups.get(symbol) || {
      symbol,
      count: 0,
      keys: new Set(),
      chains: new Set(),
      contracts: new Set(),
    };
    current.count += 1;
    current.keys.add(key);
    if (chain) current.chains.add(chain);
    if (contract) current.contracts.add(contract);
    groups.set(symbol, current);
  }

  return groups;
}

export function resolveFinalIdentity(project = {}, collisionContext = new Map()) {
  const symbol = symbolOf(project);
  const chain = chainOf(project);
  const contractAddress = contractAddressOf(project);
  const pairAddress = pairAddressOf(project);
  const exchangeId = exchangeAssetId(project);
  const externalId = externalAssetId(project);
  const domain = officialDomain(project);
  const hasContract = Boolean(contractAddress);
  const hasChain = Boolean(chain && chain !== "unknown" && chain !== "research");
  const isContractVerified = contractVerified(project);
  const isChainVerified = chainVerified(project);
  const isListingVerified = listingVerified(project);
  const collision = collisionContext.get(symbol);
  const collisionProne = COLLISION_PRONE_SYMBOLS.has(symbol) || (collision?.keys?.size || 0) > 1;
  const explicitConflict = hasExplicitIdentityConflict(project);

  let state = FINAL_IDENTITY_STATES.UNRESOLVED_IDENTITY;
  const warnings = [];
  const blockers = [];

  if (explicitConflict) {
    state = FINAL_IDENTITY_STATES.CONFLICTED_IDENTITY;
    blockers.push("Identity conflict or chain/contract mismatch detected.");
  } else if (hasChain && hasContract && isContractVerified && isChainVerified) {
    state = FINAL_IDENTITY_STATES.VERIFIED_CONTRACT;
  } else if (isListingVerified) {
    state = FINAL_IDENTITY_STATES.VERIFIED_LISTING;
  } else if (hasChain && hasContract) {
    state = FINAL_IDENTITY_STATES.PROBABLE_MATCH;
    warnings.push("Contract and chain exist, but final contract verification is incomplete.");
  } else if (symbol && !contractAddress && !exchangeId && !externalId && !domain) {
    state = FINAL_IDENTITY_STATES.SYMBOL_ONLY;
    warnings.push("Only symbol/name identity is available; ticker symbols are not unique.");
  }

  if (collisionProne && [FINAL_IDENTITY_STATES.SYMBOL_ONLY, FINAL_IDENTITY_STATES.UNRESOLVED_IDENTITY].includes(state)) {
    state = FINAL_IDENTITY_STATES.CONFLICTED_IDENTITY;
    blockers.push(`${symbol} is collision-prone and lacks verified contract or listing identity.`);
  }

  const permanentProjectKey = buildPermanentProjectKey(project, {
    chain,
    contractAddress,
  });

  return {
    finalIdentityState: state,
    permanentProjectKey,
    identityVerified: [
      FINAL_IDENTITY_STATES.VERIFIED_CONTRACT,
      FINAL_IDENTITY_STATES.VERIFIED_LISTING,
    ].includes(state),
    contractVerified: state === FINAL_IDENTITY_STATES.VERIFIED_CONTRACT || (isListingVerified && !hasContract),
    chainVerified: isChainVerified || isListingVerified,
    contractAddress,
    pairAddress,
    chain,
    symbol,
    exchangeAssetId: exchangeId,
    externalAssetId: externalId,
    officialDomain: domain,
    collisionProne,
    collisionSize: collision?.keys?.size || 0,
    warnings,
    blockers,
  };
}

function previousSelectionFlags(project = {}) {
  return Object.fromEntries(SELECTION_FLAGS.map((flag) => [flag, Boolean(project[flag])]));
}

function selectedEarlier(project = {}, flags = previousSelectionFlags(project)) {
  return Boolean(
    Object.values(flags).some(Boolean) ||
      project.smallCapHunterVerdict === "Top-2 Small-Cap Research Candidate" ||
      project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate" ||
      ["AI Strong Buy", "Best Available Strong Buy Candidate"].includes(project.aiEcosystemVerdict)
  );
}

function hasStrongBuyEvidence(project = {}) {
  return [
    project.aiEcosystemVerdict,
    project.autonomousAlphaOSVerdict,
    project.causalMarketTwinVerdict,
    project.strategyLabVerdict,
    project.selfEvolvingAlphaOSDecision,
  ].some((value) => normalizeDecisionText(value).includes("strong buy"));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function buildAuditTrail(project = {}, previousFlags = {}, newFlags = {}, reasons = []) {
  const existing = Array.isArray(project.selectionAuditTrail) ? project.selectionAuditTrail : [];
  const timestamp = new Date().toISOString();
  const added = [];

  for (const flag of SELECTION_FLAGS) {
    if (previousFlags[flag] === true && newFlags[flag] !== true) {
      added.push({
        stage: "final-selection-integrity",
        previousState: `${flag}=true`,
        newState: `${flag}=false`,
        reason: reasons[0] || "Final selection integrity removed stale early selection.",
        engine: "Final Selection Integrity",
        timestamp,
      });
    }
  }

  return [...existing, ...added];
}

function buildInvariantViolations(project = {}, gates = {}) {
  const selected = SELECTION_FLAGS.some((flag) => project[flag] === true);
  if (!selected) return [];

  const violations = [];
  const verdicts = gates.verdicts || inspectBlockingVerdicts(project);

  if (project.aiDecision === "Reject") violations.push("selected && aiDecision === Reject");
  if (project.allocationBucket === "Defensive Avoid") violations.push("selected && allocationBucket === Defensive Avoid");
  if (verdicts.hasBlockingVerdict) violations.push("selected && hasBlockingVerdict === true");
  if (!gates.purchaseRouteConfirmed) violations.push("selected && purchaseRoute.purchasable !== true");
  if (!gates.executionAvailable) violations.push("selected && executionRouteAvailable !== true");
  if (!gates.identity?.identityVerified) violations.push("selected && identityVerified !== true");
  if (!gates.identity?.contractVerified) violations.push("selected && contractVerified !== true");
  if (!gates.liquidityVerified) violations.push("selected && liquidityVerified !== true");
  if (gates.pipelineScore < gates.options.minimumPipelineScore) violations.push("selected && pipelineScore < minimumPipelineScore");
  if (gates.riskScore >= gates.options.maximumRiskScore) violations.push("selected && riskScore >= maximumRiskScore");
  if (gates.trapRiskScore >= gates.options.maximumTrapRiskScore) violations.push("selected && trapRiskScore >= maximumTrapRiskScore");
  if (project.finalSelectionState !== FINAL_SELECTION_STATES.QUALIFIED) violations.push("selected && finalSelectionState !== QUALIFIED");
  if (project.finalSelectionQualified !== true) violations.push("selected && finalSelectionQualified !== true");
  if (project.finalSelectionQualified === true && project.aiDecision === "Reject") violations.push("Qualified + Reject");
  if (project.finalSelectionQualified === true && project.allocationBucket === "Defensive Avoid") violations.push("Qualified + Defensive Avoid");
  if (project.finalSelectionQualified === true && project.finalIdentityState === FINAL_IDENTITY_STATES.CONFLICTED_IDENTITY) {
    violations.push("Qualified + Identity Conflict");
  }
  if (project.finalSelectionQualified === true && !gates.identity?.contractAddress && !gates.identity?.exchangeAssetId) {
    violations.push("Qualified + Missing Contract");
  }

  return unique(violations);
}

export function analyzeFinalSelectionIntegrity(project = {}, options = {}, collisionContext = new Map()) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const previousFlags = previousSelectionFlags(project);
  const wasSelectedEarlier = selectedEarlier(project, previousFlags);
  const verdicts = inspectBlockingVerdicts(project);
  const identity = resolveFinalIdentity(project, collisionContext);
  const route = routeFrom(project);
  const executionAvailable = executionRouteAvailable(project);
  const pipelineScore = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const riskScore = maxRiskScore(project);
  const trapScore = trapRiskScore(project);
  const liquidity = liquidityUsd(project);
  const marketCap = marketCapUsd(project);
  const capRequired = strategyRequiresMarketCap(project);
  const blockingReasons = [];
  const warningReasons = [];
  const missingDataReasons = [];

  if (project.aiDecision === "Reject") blockingReasons.push("AI decision rejected the project.");
  if (project.allocationBucket === "Defensive Avoid") blockingReasons.push("Allocation bucket is Defensive Avoid.");
  blockingReasons.push(...verdicts.blockingVerdictReasons);
  blockingReasons.push(...identity.blockers);
  warningReasons.push(...identity.warnings);

  if (!route.confirmed) {
    const reason = "Purchase route is not confirmed as purchasable.";
    if (wasSelectedEarlier || normalizeDecisionText(route.status).includes("unavailable") || normalizeDecisionText(route.status).includes("no ")) {
      blockingReasons.push(reason);
    } else {
      missingDataReasons.push(reason);
    }
  }

  if (!executionAvailable) {
    const reason = "Execution route is not verified as available.";
    if (wasSelectedEarlier || normalizeDecisionText(project.proofOfAlphaExecutionTwinVerdict).includes("block")) {
      blockingReasons.push(reason);
    } else {
      missingDataReasons.push(reason);
    }
  }

  if (!identity.contractVerified) {
    missingDataReasons.push("Contract address is missing or not verified.");
  }

  if (!identity.chainVerified) {
    missingDataReasons.push("Chain identity is missing, mismatched, or not verified.");
  }

  if (!identity.identityVerified) {
    missingDataReasons.push(`Identity state is ${identity.finalIdentityState}.`);
  }

  if (pipelineScore < config.minimumPipelineScore) {
    blockingReasons.push(`Pipeline score ${pipelineScore} is below required minimum ${config.minimumPipelineScore}.`);
  }

  if (riskScore >= config.maximumRiskScore) {
    blockingReasons.push(`Risk score ${riskScore} exceeds threshold ${config.maximumRiskScore}.`);
  }

  if (trapScore >= config.maximumTrapRiskScore) {
    blockingReasons.push(`Trap-risk score ${trapScore} exceeds threshold ${config.maximumTrapRiskScore}.`);
  }

  if (!liquidity) {
    missingDataReasons.push("Liquidity data is missing.");
  } else if (liquidity < config.minimumLiquidityUsd) {
    blockingReasons.push(`Liquidity $${Math.round(liquidity)} is below required minimum $${config.minimumLiquidityUsd}.`);
  }

  if (capRequired && !marketCap) {
    missingDataReasons.push("Market-cap/FDV data is missing for a small-cap validation strategy.");
  }

  if (identity.finalIdentityState === FINAL_IDENTITY_STATES.SYMBOL_ONLY) {
    missingDataReasons.push("Project only has a symbol/name match without verified contract or listing identity.");
  }

  const finalBlockingReasons = unique(blockingReasons);
  const finalWarningReasons = unique([...warningReasons, ...missingDataReasons]);
  const finalSelectionReasons = [];

  let finalSelectionState = FINAL_SELECTION_STATES.RESEARCH_ONLY;

  if (identity.finalIdentityState === FINAL_IDENTITY_STATES.CONFLICTED_IDENTITY) {
    finalSelectionState = FINAL_SELECTION_STATES.IDENTITY_CONFLICT;
  } else if (finalBlockingReasons.length) {
    finalSelectionState = FINAL_SELECTION_STATES.BLOCKED;
  } else if (missingDataReasons.length) {
    finalSelectionState = FINAL_SELECTION_STATES.INSUFFICIENT_DATA;
  } else {
    finalSelectionState = FINAL_SELECTION_STATES.QUALIFIED;
    finalSelectionReasons.push(
      "Final identity, route, execution, liquidity, score, risk, and verdict gates passed."
    );
  }

  const finalSelectionQualified = finalSelectionState === FINAL_SELECTION_STATES.QUALIFIED;
  const recalculatedFlags = {
    smallCapHunterSelected:
      finalSelectionQualified &&
      Boolean(previousFlags.smallCapHunterSelected) &&
      !normalizeDecisionText(project.smallCapHunterVerdict).includes("block"),
    proofOfAlphaExecutionTwinSelected:
      finalSelectionQualified &&
      project.proofOfAlphaExecutionTwinVerdict === "Execution-Verified Alpha Candidate",
    executionVerifiedSelected: finalSelectionQualified && executionAvailable,
    strongBuySelected: finalSelectionQualified && hasStrongBuyEvidence(project),
    researchPickSelected:
      finalSelectionQualified &&
      (wasSelectedEarlier || hasStrongBuyEvidence(project) || pipelineScore >= config.minimumPipelineScore + 10),
    preConsensusCandidateSelected:
      finalSelectionQualified &&
      Boolean(previousFlags.preConsensusCandidateSelected) &&
      num(project.preConsensusOpportunityScore || project.regimeAdjustedOpportunityScore) >= 70 &&
      !["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage),
    finalCandidateSelected: finalSelectionQualified,
  };
  const deselectionReasons = unique([
    ...finalBlockingReasons,
    ...finalWarningReasons,
  ]);
  const finalIntegrityScore = Math.round(
    clamp(
      100 -
        finalBlockingReasons.length * 14 -
        missingDataReasons.length * 9 -
        warningReasons.length * 4 -
        Math.max(0, riskScore - 45) * 0.5 -
        Math.max(0, trapScore - 35) * 0.6
    )
  );
  const finalIntegrityVerdict =
    finalSelectionState === FINAL_SELECTION_STATES.QUALIFIED
      ? "Qualified Final Candidate"
      : finalSelectionState === FINAL_SELECTION_STATES.IDENTITY_CONFLICT
      ? "Identity Conflict - Blocked"
      : finalSelectionState === FINAL_SELECTION_STATES.BLOCKED
      ? "Blocked By Final Integrity"
      : finalSelectionState === FINAL_SELECTION_STATES.INSUFFICIENT_DATA
      ? "Research Only - Insufficient Data"
      : "Research Only - Not Actionable";
  const initiallySelectedBy = Object.entries(previousFlags)
    .filter(([, selected]) => selected)
    .map(([flag]) => flag);

  const enriched = {
    ...project,
    ...recalculatedFlags,
    finalSelectionState,
    finalSelectionQualified,
    finalSelectionReasons,
    finalBlockingReasons,
    finalWarningReasons,
    finalIntegrityScore,
    finalIntegrityVerdict,
    hasBlockingVerdict: verdicts.hasBlockingVerdict,
    blockingVerdictMatches: verdicts.blockingVerdictMatches,
    finalIdentityState: identity.finalIdentityState,
    permanentProjectKey: identity.permanentProjectKey,
    identityVerified: identity.identityVerified,
    contractVerified: identity.contractVerified,
    chainVerified: identity.chainVerified,
    finalContractAddress: identity.contractAddress,
    finalPairAddress: identity.pairAddress,
    finalChain: identity.chain,
    purchaseRouteConfirmed: route.confirmed,
    executionRouteAvailable: executionAvailable,
    liquidityVerified: Boolean(liquidity >= config.minimumLiquidityUsd),
    finalLiquidityUsd: liquidity,
    finalMarketCapUsd: marketCap,
    finalRiskScore: riskScore,
    finalTrapRiskScore: trapScore,
    preFinalSelectionFlags: previousFlags,
    initiallySelectedBy,
    deselectedBy: initiallySelectedBy.length && !finalSelectionQualified ? "Final Selection Integrity" : project.deselectedBy || null,
    deselectionReasons: initiallySelectedBy.length && !finalSelectionQualified ? deselectionReasons : project.deselectionReasons || [],
    finalAuthorityEngine: "Final Selection Integrity",
  };

  enriched.selectionAuditTrail = buildAuditTrail(project, previousFlags, recalculatedFlags, deselectionReasons);
  enriched.finalSelectionInvariantViolations = buildInvariantViolations(enriched, {
    verdicts,
    identity,
    purchaseRouteConfirmed: route.confirmed,
    executionAvailable,
    liquidityVerified: enriched.liquidityVerified,
    pipelineScore,
    riskScore,
    trapRiskScore: trapScore,
    options: config,
  });
  enriched.finalSelectionInvariantStatus = enriched.finalSelectionInvariantViolations.length ? "CRITICAL" : "PASS";
  enriched.criticalIntegrityWarning = enriched.finalSelectionInvariantViolations.length
    ? `Final selection invariant violation: ${enriched.finalSelectionInvariantViolations.join("; ")}`
    : "";

  if (enriched.smallCapHunter) {
    enriched.smallCapHunter = {
      ...enriched.smallCapHunter,
      selected: enriched.smallCapHunterSelected,
      selectionRank: enriched.smallCapHunterSelected ? enriched.smallCapHunterSelectionRank || null : null,
      finalSelectionState,
      finalIntegrityVerdict,
    };
  }

  if (enriched.proofOfAlphaExecutionTwin) {
    enriched.proofOfAlphaExecutionTwin = {
      ...enriched.proofOfAlphaExecutionTwin,
      selected: enriched.proofOfAlphaExecutionTwinSelected,
      rank: enriched.proofOfAlphaExecutionTwinSelected ? enriched.proofOfAlphaExecutionTwinRank || null : null,
      finalSelectionState,
      finalIntegrityVerdict,
    };
  }

  if (enriched.preConsensusBreakoutHunter) {
    enriched.preConsensusBreakoutHunter = {
      ...enriched.preConsensusBreakoutHunter,
      selected: enriched.preConsensusCandidateSelected,
      finalSelectionState,
      finalSelectionQualified,
      finalIntegrityVerdict,
      finalBlockingReasons,
      finalWarningReasons,
    };
  }

  if (!enriched.smallCapHunterSelected) enriched.smallCapHunterSelectionRank = null;
  if (!enriched.proofOfAlphaExecutionTwinSelected) enriched.proofOfAlphaExecutionTwinRank = null;

  return enriched;
}

function rerankSelections(projects = []) {
  const output = projects.map((project) => ({ ...project }));
  const byKey = new Map(output.map((project, index) => [project.permanentProjectKey || `${index}`, project]));

  [...output]
    .filter((project) => project.smallCapHunterSelected)
    .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
    .forEach((project, index) => {
      const target = byKey.get(project.permanentProjectKey);
      if (!target) return;
      target.smallCapHunterSelectionRank = index + 1;
      if (target.smallCapHunter) {
        target.smallCapHunter = {
          ...target.smallCapHunter,
          selectionRank: index + 1,
        };
      }
    });

  [...output]
    .filter((project) => project.proofOfAlphaExecutionTwinSelected)
    .sort((a, b) => num(b.proofOfAlphaExecutionTwinScore) - num(a.proofOfAlphaExecutionTwinScore))
    .forEach((project, index) => {
      const target = byKey.get(project.permanentProjectKey);
      if (!target) return;
      target.proofOfAlphaExecutionTwinRank = index + 1;
      if (target.proofOfAlphaExecutionTwin) {
        target.proofOfAlphaExecutionTwin = {
          ...target.proofOfAlphaExecutionTwin,
          rank: index + 1,
        };
      }
    });

  [...output]
    .filter((project) => project.finalCandidateSelected)
    .sort(
      (a, b) =>
        num(b.finalIntegrityScore) - num(a.finalIntegrityScore) ||
        num(b.pipelineScore) - num(a.pipelineScore)
    )
    .forEach((project, index) => {
      const target = byKey.get(project.permanentProjectKey);
      if (target) target.finalCandidateRank = index + 1;
    });

  return output;
}

export function analyzeFinalSelectionIntegrityBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const collisionContext = buildCollisionContext(safeProjects);
  return rerankSelections(
    safeProjects.map((project) => analyzeFinalSelectionIntegrity(project, options, collisionContext))
  );
}

export function validateFinalSelectionInvariants(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const violations = safeProjects.flatMap((project) =>
    (project.finalSelectionInvariantViolations || []).map((violation) => ({
      project: project.name || project.symbol || "Unknown",
      symbol: project.symbol || "",
      permanentProjectKey: project.permanentProjectKey || "",
      violation,
    }))
  );

  return {
    status: violations.length ? "CRITICAL" : "PASS",
    violationCount: violations.length,
    violations,
  };
}

export function summarizeFinalSelectionIntegrity(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const count = (predicate) => safeProjects.filter(predicate).length;

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    qualifiedCandidates: count((project) => project.finalSelectionState === FINAL_SELECTION_STATES.QUALIFIED),
    researchOnly: count((project) => project.finalSelectionState === FINAL_SELECTION_STATES.RESEARCH_ONLY),
    blockedCandidates: count((project) => project.finalSelectionState === FINAL_SELECTION_STATES.BLOCKED),
    identityConflicts: count((project) => project.finalSelectionState === FINAL_SELECTION_STATES.IDENTITY_CONFLICT),
    insufficientData: count((project) => project.finalSelectionState === FINAL_SELECTION_STATES.INSUFFICIENT_DATA),
    deselectedEarlyPicks: count((project) => (project.selectionAuditTrail || []).some((entry) => entry.engine === "Final Selection Integrity")),
    invariantStatus: validateFinalSelectionInvariants(safeProjects),
  };
}
