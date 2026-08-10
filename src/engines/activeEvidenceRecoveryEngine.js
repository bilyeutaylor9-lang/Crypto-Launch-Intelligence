import { canonicalValue } from "../data/canonicalAliasResolver.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value = "") {
  return String(value ?? "").trim();
}

function first(values = []) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function positiveNumber(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function booleanEvidence(values = []) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function timestampEvidence(values = []) {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const timestamp = new Date(raw).getTime();
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function chainOf(project = {}) {
  return normalizeChainId(
    first([
      project.chain,
      project.chainId,
      project.network,
      project.baseToken?.chain,
      project.rawCandidate?.chain,
      project.marketData?.chain,
      canonicalValue(project, "chain"),
    ])
  );
}

function tokenAddressOf(project = {}, chain = null) {
  const raw = first([
    project.tokenAddress,
    project.contractAddress,
    project.address,
    project.canonicalAddress,
    project.baseToken?.address,
    project.rawCandidate?.tokenAddress,
    project.rawCandidate?.contractAddress,
    project.rawCandidate?.address,
    project.marketData?.tokenAddress,
    project.executionProofRecoveryRoute?.tokenAddress,
    project.executionProofRecoveryRoute?.contract,
    project.canonicalExecutionRoute?.tokenAddress,
    project.canonicalExecutionRoute?.contract,
    canonicalValue(project, "tokenAddress"),
  ]);
  return normalizeTokenAddress(raw, chain);
}

function poolAddressOf(project = {}, chain = null) {
  const raw = first([
    project.poolAddress,
    project.pairAddress,
    project.primaryPool,
    project.pair?.address,
    project.rawCandidate?.poolAddress,
    project.rawCandidate?.pairAddress,
    project.marketData?.poolAddress,
    project.executionProofRecoveryRoute?.poolAddress,
    project.canonicalExecutionRoute?.poolAddress,
    canonicalValue(project, "poolAddress"),
  ]);
  return normalizePoolAddress(raw, chain);
}

function stringEvidence(values = []) {
  const value = first(values);
  return value ? text(value) : null;
}

function recoveredValueFor(project = {}, field = "") {
  const chain = chainOf(project);

  switch (field) {
    case "chain":
      return chain;
    case "tokenAddress":
      return tokenAddressOf(project, chain);
    case "poolAddress":
      return poolAddressOf(project, chain);
    case "priceUsd":
      return positiveNumber([project.priceUsd, project.price, project.marketData?.priceUsd, project.rawCandidate?.priceUsd, canonicalValue(project, "priceUsd")]);
    case "liquidityUsd":
    case "stableExitLiquidityUsd":
      return positiveNumber([project.liquidityUsd, project.dexLiquidityUsd, project.liquidity?.usd, project.marketData?.liquidityUsd, project.rawCandidate?.liquidityUsd, canonicalValue(project, "liquidityUsd")]);
    case "volume24hUsd":
      return positiveNumber([project.volume24hUsd, project.volume24h, project.volume?.h24, project.marketData?.volume24h, project.rawCandidate?.volume24h, canonicalValue(project, "volume24hUsd")]);
    case "circulatingMarketCapUsd":
      return positiveNumber([project.circulatingMarketCapUsd, project.circulatingMarketCap, project.verifiedMarketCap, project.marketCap, project.marketData?.marketCap, canonicalValue(project, "circulatingMarketCapUsd")]);
    case "fullyDilutedValuationUsd":
      return positiveNumber([project.fullyDilutedValuationUsd, project.fullyDilutedValueUsd, project.fdv, project.fullyDilutedValue, project.marketData?.fdv, canonicalValue(project, "fullyDilutedValuationUsd")]);
    case "estimatedMarketCapUsd":
      return positiveNumber([project.estimatedMarketCapUsd, project.estimatedMarketCap, project.marketCap, project.rawCandidate?.marketCap, canonicalValue(project, "estimatedMarketCapUsd")]);
    case "uniqueBuyers24h":
      return positiveNumber([project.uniqueBuyers24h, project.buyers24h, project.clusterAdjustedUniqueBuyers, project.clusterAdjustedUniqueBuyers24h, canonicalValue(project, "uniqueBuyers24h")]);
    case "holderCount":
      return positiveNumber([project.holderCount, project.holders, project.marketData?.holderCount, canonicalValue(project, "holderCount")]);
    case "githubRepo":
      return stringEvidence([project.githubRepo, project.github, project.githubUrl, project.repository, canonicalValue(project, "githubRepo")]);
    case "website":
      return stringEvidence([project.website, project.projectUrl, project.links?.website, project.links?.homepage?.[0], canonicalValue(project, "website")]);
    case "honeypotDetected":
      return booleanEvidence([project.honeypotDetected, project.securityEvidence?.honeypotDetected, canonicalValue(project, "honeypotDetected")]);
    case "sellRestricted":
      return booleanEvidence([project.sellRestricted, project.securityEvidence?.sellRestricted, canonicalValue(project, "sellRestricted")]);
    case "contractVerified":
      return booleanEvidence([project.contractVerified, project.securityEvidence?.contractVerified, canonicalValue(project, "contractVerified")]);
    case "ownerRenounced":
      return booleanEvidence([project.ownerRenounced, project.securityEvidence?.ownerRenounced, canonicalValue(project, "ownerRenounced")]);
    case "mintAuthorityEnabled":
      return booleanEvidence([project.mintAuthorityEnabled, project.securityEvidence?.mintAuthorityEnabled, canonicalValue(project, "mintAuthorityEnabled")]);
    case "purchaseRouteConfirmed":
      return project.buyQuoteVerified === true || project.executionProofRecoveryRoute?.buyQuoteVerified === true ? true : null;
    case "sellRouteAvailable":
      return project.sellQuoteVerified === true || project.executionProofRecoveryRoute?.sellQuoteVerified === true ? true : null;
    case "quoteTimestamp":
      return timestampEvidence([project.quoteTimestamp, project.executionProofRecoveryRoute?.quoteTimestamp, project.routeQuoteTimestamp, canonicalValue(project, "quoteTimestamp")]);
    default:
      return canonicalValue(project, field) ?? null;
  }
}

function applyRecoveredField(project = {}, field = "", value = null) {
  if (value === null || value === undefined || value === "") return project;
  const next = { ...project };

  if (field === "chain") {
    next.chain = value;
    next.chainId = next.chainId || value;
  } else if (field === "tokenAddress") {
    next.tokenAddress = value;
    next.contractAddress = next.contractAddress || value;
    next.address = next.address || value;
  } else if (field === "poolAddress") {
    next.poolAddress = value;
    next.pairAddress = next.pairAddress || value;
  } else if (field === "volume24hUsd") {
    next.volume24hUsd = value;
    next.volume24h = next.volume24h ?? value;
  } else if (field === "circulatingMarketCapUsd") {
    next.circulatingMarketCapUsd = value;
    next.marketCap = next.marketCap ?? value;
  } else if (field === "fullyDilutedValuationUsd") {
    next.fullyDilutedValuationUsd = value;
    next.fdv = next.fdv ?? value;
    next.fullyDilutedValue = next.fullyDilutedValue ?? value;
  } else if (field === "stableExitLiquidityUsd") {
    next.stableExitLiquidityUsd = value;
    next.liquidityUsd = next.liquidityUsd ?? value;
  } else {
    next[field] = value;
  }

  return next;
}

function candidatePriority(project = {}, index = 0) {
  const eligibleBoost = project.starvationRescueEligible ? 25 : 0;
  const routeBoost = (project.dataStarvationBlockingExecutionCount || 0) * 4;
  const researchBoost = Math.min(20, num(project.earlyAsymmetryResearchPriorityScore) / 5);
  const voiBoost = num(project.valueOfInformationScore);
  return eligibleBoost + routeBoost + researchBoost + voiBoost - index * 0.0001;
}

function recoveryTargets(projects = [], options = {}) {
  const maxCandidates = Math.max(1, Number(options.maxCandidates || process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_CANDIDATES || 750));
  const maxFieldsPerCandidate = Math.max(1, Number(options.maxFieldsPerCandidate || process.env.ACTIVE_EVIDENCE_RECOVERY_FIELDS_PER_CANDIDATE || 4));
  const maxRequests = Math.max(1, Number(options.maxRequests || process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_REQUESTS || 2000));
  const perCandidate = new Map();

  (Array.isArray(projects) ? projects : []).forEach((project, projectIndex) => {
    const planItems = [
      ...(Array.isArray(project.targetedEnrichmentPlan?.items) ? project.targetedEnrichmentPlan.items : []),
      ...(Array.isArray(project.starvationRecoveryPlan?.items) ? project.starvationRecoveryPlan.items : []),
      ...(Array.isArray(project.valueOfInformationItems) ? project.valueOfInformationItems : []),
    ];
    for (const item of planItems) {
      if (!item || item.recoverable === false || item.rootCause === "NOT_APPLICABLE") continue;
      const field = item.canonicalField || item.field;
      if (!field) continue;
      const requestCost = Math.max(1, item.estimatedRequests || item.targetSources?.length || 1);
      const score =
        num(item.valueOfInformationScore || item.estimatedRecoveryValue) * 100 +
        candidatePriority(project, projectIndex);
      const current = perCandidate.get(projectIndex) || [];
      current.push({ projectIndex, field, item, requestCost, score });
      perCandidate.set(projectIndex, current);
    }
  });

  const selected = [];
  let requests = 0;
  for (const entries of [...perCandidate.values()]
    .map((items) => items.sort((a, b) => b.score - a.score).slice(0, maxFieldsPerCandidate))
    .sort((a, b) => (b[0]?.score || 0) - (a[0]?.score || 0))
    .slice(0, maxCandidates)) {
    for (const entry of entries) {
      if (requests + entry.requestCost > maxRequests) continue;
      requests += entry.requestCost;
      selected.push(entry);
    }
  }

  return { selected, requestBudgetUsed: requests, maxRequests, maxCandidates, maxFieldsPerCandidate };
}

export function analyzeActiveEvidenceRecoveryBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const targets = recoveryTargets(safeProjects, options);
  const byProject = new Map();

  for (const target of targets.selected) {
    const list = byProject.get(target.projectIndex) || [];
    list.push(target);
    byProject.set(target.projectIndex, list);
  }

  return safeProjects.map((project, projectIndex) => {
    const entries = byProject.get(projectIndex) || [];
    if (!entries.length) {
      return {
        ...project,
        activeEvidenceRecoveryStatus: "NOT_SELECTED",
        activeEvidenceRecovery: {
          status: "NOT_SELECTED",
          recoveredFields: [],
          attemptedFields: [],
          unrecoveredFields: [],
          reason: "Project was outside the bounded value-of-information recovery budget.",
        },
      };
    }

    let next = { ...project };
    const recoveredFields = [];
    const unrecoveredFields = [];
    const attempts = [];

    for (const entry of entries) {
      const value = recoveredValueFor(next, entry.field);
      attempts.push({
        field: entry.field,
        rootCause: entry.item.rootCause || null,
        valueOfInformationScore: entry.item.valueOfInformationScore || entry.item.estimatedRecoveryValue || 0,
        targetSources: (entry.item.targetSources || []).map((source) => source.source).slice(0, 4),
      });
      if (value === null || value === undefined || value === "") {
        unrecoveredFields.push(entry.field);
        continue;
      }
      next = applyRecoveredField(next, entry.field, value);
      recoveredFields.push(entry.field);
    }

    const uniqueRecovered = [...new Set(recoveredFields)];
    const uniqueUnrecovered = [...new Set(unrecoveredFields.filter((field) => !uniqueRecovered.includes(field)))];
    const status = uniqueRecovered.length
      ? uniqueUnrecovered.length
        ? "PARTIAL_RECOVERY"
        : "RECOVERED"
      : "NO_RECOVERY";

    return {
      ...next,
      activeEvidenceRecoveryStatus: status,
      activeEvidenceRecoveryRecoveredFields: uniqueRecovered,
      activeEvidenceRecoveryAttemptedFields: [...new Set(attempts.map((item) => item.field))],
      activeEvidenceRecovery: {
        status,
        recoveredFields: uniqueRecovered,
        attemptedFields: [...new Set(attempts.map((item) => item.field))],
        unrecoveredFields: uniqueUnrecovered,
        attempts,
        requestBudgetUsed: entries.reduce((sum, entry) => sum + entry.requestCost, 0),
        policy:
          "Only already-observed raw/provider evidence may be promoted. Unknowns remain null and final gates must rerun before selection.",
      },
    };
  });
}
