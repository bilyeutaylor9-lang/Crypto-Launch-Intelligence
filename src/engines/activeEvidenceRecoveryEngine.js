import { canonicalValue } from "../data/canonicalAliasResolver.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import {
  createActiveEvidenceExecutionState,
  executeActiveEvidenceProviderRequests,
  mapWithBoundedConcurrency,
  summarizeActiveEvidenceExecutionState,
} from "../data/activeEvidenceProviderExecutor.js";
import {
  recoveryDispositionForField,
  sourceFamilyForField,
} from "../data/enrichmentSourceRegistry.js";

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

function localRecoveryProvenance(project = {}, field = "") {
  const existing =
    project.fieldProvenance?.[field] ||
    project.canonicalAliasProvenance?.[field] ||
    {};
  return {
    value: recoveredValueFor(project, field),
    source: existing.source || existing.sourceProvider || project.source || "existing-provider-observation",
    sourceTimestamp:
      existing.sourceTimestamp ||
      existing.observedAt ||
      project.sourceTimestamp ||
      project.updatedAt ||
      project.lastUpdatedAt ||
      project.discoveredAt ||
      null,
    confidence: Number(existing.confidence || project.sourceReliabilityScore || 65) > 1
      ? Number(existing.confidence || project.sourceReliabilityScore || 65) / 100
      : Number(existing.confidence || 0.65),
    verificationStatus:
      existing.verificationStatus ||
      existing.validationStatus ||
      "RECOVERED_EXISTING_OBSERVATION",
    recoveryRun: true,
  };
}

function attachFieldProvenance(project = {}, field = "", record = {}) {
  return {
    ...project,
    fieldProvenance: {
      ...(project.fieldProvenance || {}),
      [field]: {
        ...(project.fieldProvenance?.[field] || {}),
        ...record,
        value: record.value,
        recoveryRun: true,
      },
    },
  };
}

function candidatePriority(project = {}, index = 0) {
  const eligibleBoost = project.starvationRescueEligible ? 25 : 0;
  const routeBoost = (project.dataStarvationBlockingExecutionCount || 0) * 4;
  const researchBoost = Math.min(20, num(project.earlyAsymmetryResearchPriorityScore) / 5);
  const voiBoost = num(project.valueOfInformationScore);
  return eligibleBoost + routeBoost + researchBoost + voiBoost - index * 0.0001;
}

function isDeepCandidate(project = {}) {
  if (project.deepEvaluationState === "DEFERRED_BEFORE_DEEP") return false;
  if (project.deepEvaluationDeferred === true) return false;
  if (project.deepEvaluationSelected === false) return false;
  return true;
}

function recoveryWaveForField(field = "") {
  const family = sourceFamilyForField(field);
  if (
    ["chain", "tokenAddress", "poolAddress", "priceUsd", "liquidityUsd", "stableExitLiquidityUsd", "volume24hUsd", "circulatingMarketCapUsd", "fullyDilutedValuationUsd", "estimatedMarketCapUsd", "buyTransactions24h", "sellTransactions24h", "creatorAddress", "deployerAddress", "creator", "deployer", "contractVerified", "honeypotDetected", "sellRestricted"].includes(field)
  ) return "WAVE1";
  if (["WALLETS", "DEPLOYER", "SECURITY"].includes(family)) return "WAVE2";
  if (family === "EXECUTION") return "WAVE3";
  return null;
}

function planItems(project = {}) {
  const items = [
    ...(Array.isArray(project.targetedEnrichmentPlan?.items) ? project.targetedEnrichmentPlan.items : []),
    ...(Array.isArray(project.starvationRecoveryPlan?.items) ? project.starvationRecoveryPlan.items : []),
    ...(Array.isArray(project.valueOfInformationItems) ? project.valueOfInformationItems : []),
  ];
  const bestByField = new Map();
  for (const item of items) {
    const field = item?.canonicalField || item?.field;
    if (!field || item.recoverable === false) continue;
    const recoveryDisposition = item.recoveryDisposition ||
      recoveryDispositionForField(field, {
        applicability: item.rootCause === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : null,
      });
    if (recoveryDisposition !== "RAW_RECOVERABLE") continue;
    const current = bestByField.get(field);
    const value = num(item.valueOfInformationScore || item.estimatedRecoveryValue);
    if (!current || value > num(current.valueOfInformationScore || current.estimatedRecoveryValue)) {
      bestByField.set(field, { ...item, recoveryDisposition });
    }
  }
  return [...bestByField.values()];
}

function executionPriority(project = {}, index = 0) {
  return (
    num(project.preliminaryOpportunityScore || project.progressiveOpportunityScore) * 2 +
    num(project.executionScore || project.executionReadinessScore) +
    num(project.valueOfInformationScore) +
    candidatePriority(project, index)
  );
}

export function buildActiveEvidenceRecoveryWaves(projects = [], options = {}) {
  const input = Array.isArray(projects) ? projects : [];
  const waveLimits = {
    WAVE1: Math.max(0, Number(options.wave1Max ?? process.env.ACTIVE_EVIDENCE_WAVE1_MAX ?? 500)),
    WAVE2: Math.max(0, Number(options.wave2Max ?? process.env.ACTIVE_EVIDENCE_WAVE2_MAX ?? 150)),
    WAVE3: Math.max(0, Number(options.wave3Max ?? process.env.ACTIVE_EVIDENCE_WAVE3_MAX ?? 50)),
  };
  const maxFieldsPerCandidate = Math.max(
    1,
    Number(options.maxFieldsPerCandidate || process.env.ACTIVE_EVIDENCE_RECOVERY_FIELDS_PER_CANDIDATE || 8)
  );
  const eligible = input
    .map((project, projectIndex) => {
      const items = planItems(project);
      const valueOfInformationPriority = Math.max(
        0,
        ...items.map((item) => num(item.valueOfInformationScore || item.estimatedRecoveryValue) * 100)
      );
      return {
        project,
        projectIndex,
        priority: candidatePriority(project, projectIndex) + valueOfInformationPriority,
        executionPriority: executionPriority(project, projectIndex) + valueOfInformationPriority,
        items,
      };
    })
    .filter(({ project }) => isDeepCandidate(project));

  const waves = {};
  for (const wave of ["WAVE1", "WAVE2", "WAVE3"]) {
    const scoreKey = wave === "WAVE3" ? "executionPriority" : "priority";
    waves[wave] = eligible
      .map((candidate) => ({
        ...candidate,
        entries: candidate.items
          .filter((item) => recoveryWaveForField(item.canonicalField || item.field) === wave)
          .map((item) => {
            const field = item.canonicalField || item.field;
            return {
              projectIndex: candidate.projectIndex,
              field,
              family: sourceFamilyForField(field),
              wave,
              item,
              requestCost: Math.max(1, item.estimatedRequests || item.targetSources?.length || 1),
              score:
                num(item.valueOfInformationScore || item.estimatedRecoveryValue) * 100 +
                candidate[scoreKey],
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, maxFieldsPerCandidate),
      }))
      .filter((candidate) => candidate.entries.length)
      .sort((a, b) => b[scoreKey] - a[scoreKey])
      .slice(0, waveLimits[wave]);
  }
  return { waves, waveLimits, deepEvaluatedCandidates: eligible.length };
}

export async function analyzeActiveEvidenceRecoveryBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const hydration = buildActiveEvidenceRecoveryWaves(safeProjects, options);
  const maxRequests = Math.max(
    1,
    Number(options.maxProviderRequests || options.maxRequests || process.env.ACTIVE_EVIDENCE_MAX_PROVIDER_REQUESTS || process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_REQUESTS || 2000)
  );
  const executionState = createActiveEvidenceExecutionState({
    ...options,
    maxProviderRequests: maxRequests,
  });
  const concurrency = Math.max(
    1,
    Number(
      options.concurrency ||
        process.env.ACTIVE_EVIDENCE_CONCURRENCY ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_CONCURRENCY ||
        6
    )
  );
  const currentProjects = safeProjects.map((project) => ({ ...project }));
  const recoveryByProject = new Map();

  async function recoverCandidate({ projectIndex, entries }, wave) {
      const project = currentProjects[projectIndex];
      let next = { ...project };
      const recoveredFields = [];
      const attempts = [];
      const unresolvedEntries = [];

      for (const entry of entries) {
        const value = recoveredValueFor(next, entry.field);
        const planAttempt = {
          field: entry.field,
          family: entry.family,
          wave,
          rootCause: entry.item.rootCause || null,
          valueOfInformationScore:
            entry.item.valueOfInformationScore ||
            entry.item.estimatedRecoveryValue ||
            0,
          targetSources: (entry.item.targetSources || [])
            .map((source) => source.source)
            .slice(0, 4),
        };
        if (value === null || value === undefined || value === "") {
          unresolvedEntries.push(entry);
          attempts.push({ ...planAttempt, status: "PROVIDER_RECOVERY_QUEUED" });
          continue;
        }
        const provenance = localRecoveryProvenance(next, entry.field);
        next = applyRecoveredField(next, entry.field, value);
        next = attachFieldProvenance(next, entry.field, {
          ...provenance,
          value,
        });
        recoveredFields.push(entry.field);
        attempts.push({
          ...planAttempt,
          status: "RECOVERED_EXISTING_OBSERVATION",
          source: provenance.source,
        });
      }

      let providerAttempts = [];
      if (unresolvedEntries.length) {
        const providerResult = await executeActiveEvidenceProviderRequests(
          next,
          unresolvedEntries,
          options,
          executionState
        );
        next = { ...next, ...(providerResult.projectPatch || {}) };
        providerAttempts = providerResult.attempts || [];
        for (const recovered of providerResult.observations || []) {
          next = applyRecoveredField(next, recovered.field, recovered.value);
          next = attachFieldProvenance(next, recovered.field, recovered);
          recoveredFields.push(recovered.field);
        }
      }

      const attemptedFields = [...new Set(entries.map((entry) => entry.field))];
      const uniqueRecovered = [...new Set(recoveredFields)];
      const uniqueUnrecovered = attemptedFields.filter(
        (field) => !uniqueRecovered.includes(field)
      );
      const status = uniqueRecovered.length
        ? uniqueUnrecovered.length
          ? "PARTIAL_RECOVERY"
          : "RECOVERED"
        : "NO_RECOVERY";

      return {
        projectIndex,
        project: {
          ...next,
          activeEvidenceRecoveryStatus: status,
          activeEvidenceRecoveryRecoveredFields: uniqueRecovered,
          activeEvidenceRecoveryAttemptedFields: attemptedFields,
          activeEvidenceRecovery: {
            status,
            waves: [wave],
            changedEvidenceFamilies: [...new Set(uniqueRecovered.map(sourceFamilyForField))],
            recoveredFields: uniqueRecovered,
            attemptedFields,
            unrecoveredFields: uniqueUnrecovered,
            attempts,
            providerAttempts,
            plannedRequestCost: entries.reduce(
              (sum, entry) => sum + entry.requestCost,
              0
            ),
            policy:
              "Exact provider observations are recovered with provenance under bounded request, concurrency, timeout, and circuit-breaker limits. Ambiguous identity and unknown evidence remain unpromoted.",
          },
        },
      };
  }

  for (const wave of ["WAVE1", "WAVE2", "WAVE3"]) {
    const recoveredWave = await mapWithBoundedConcurrency(
      hydration.waves[wave],
      concurrency,
      (candidate) => recoverCandidate(candidate, wave)
    );
    for (const recovered of recoveredWave) {
      const previous = recoveryByProject.get(recovered.projectIndex);
      const previousReport = previous?.activeEvidenceRecovery || {};
      const report = recovered.project.activeEvidenceRecovery || {};
      const mergedReport = {
        ...report,
        waves: [...new Set([...(previousReport.waves || []), ...(report.waves || [])])],
        recoveredFields: [...new Set([...(previousReport.recoveredFields || []), ...(report.recoveredFields || [])])],
        attemptedFields: [...new Set([...(previousReport.attemptedFields || []), ...(report.attemptedFields || [])])],
        unrecoveredFields: [...new Set([...(previousReport.unrecoveredFields || []), ...(report.unrecoveredFields || [])])],
        changedEvidenceFamilies: [...new Set([...(previousReport.changedEvidenceFamilies || []), ...(report.changedEvidenceFamilies || [])])],
        attempts: [...(previousReport.attempts || []), ...(report.attempts || [])],
        providerAttempts: [...(previousReport.providerAttempts || []), ...(report.providerAttempts || [])],
        plannedRequestCost: num(previousReport.plannedRequestCost) + num(report.plannedRequestCost),
      };
      mergedReport.unrecoveredFields = mergedReport.unrecoveredFields.filter(
        (field) => !mergedReport.recoveredFields.includes(field)
      );
      mergedReport.status = mergedReport.recoveredFields.length
        ? mergedReport.unrecoveredFields.length
          ? "PARTIAL_RECOVERY"
          : "RECOVERED"
        : "NO_RECOVERY";
      const merged = {
        ...recovered.project,
        activeEvidenceRecoveryStatus: mergedReport.status,
        activeEvidenceRecoveryRecoveredFields: mergedReport.recoveredFields,
        activeEvidenceRecoveryAttemptedFields: mergedReport.attemptedFields,
        activeEvidenceRecovery: mergedReport,
      };
      currentProjects[recovered.projectIndex] = merged;
      recoveryByProject.set(recovered.projectIndex, merged);
    }
  }

  const providerExecution = summarizeActiveEvidenceExecutionState(executionState);
  const selectedIndexes = new Set(recoveryByProject.keys());
  const selectedWaveCounts = Object.fromEntries(
    Object.entries(hydration.waves).map(([wave, items]) => [wave, items.length])
  );
  const recoveredFieldsByFamily = {};
  const unresolvedFieldsByFamily = {};
  for (const project of recoveryByProject.values()) {
    for (const field of project.activeEvidenceRecovery?.recoveredFields || []) {
      const family = sourceFamilyForField(field);
      recoveredFieldsByFamily[family] = (recoveredFieldsByFamily[family] || 0) + 1;
    }
    for (const field of project.activeEvidenceRecovery?.unrecoveredFields || []) {
      const family = sourceFamilyForField(field);
      unresolvedFieldsByFamily[family] = (unresolvedFieldsByFamily[family] || 0) + 1;
    }
  }
  const batchSummary = {
    deepEvaluatedCandidates: hydration.deepEvaluatedCandidates,
    recoveryCandidatesAttempted: selectedIndexes.size,
    selectedWaveCounts,
    providerRequestsUsed: providerExecution.requestsUsed,
    providerRequestBudget: providerExecution.maxRequests,
    recoveredFieldsByFamily,
    unresolvedFieldsByFamily,
  };

  return safeProjects.map((project, projectIndex) => {
    const recovered = recoveryByProject.get(projectIndex);
    if (recovered) {
      return {
        ...recovered,
        activeEvidenceRecovery: {
          ...recovered.activeEvidenceRecovery,
          providerExecution,
          batchSummary,
        },
      };
    }
    const deferred = !isDeepCandidate(project);
    return {
      ...project,
      activeEvidenceRecoveryStatus: deferred ? "DEFERRED_BEFORE_DEEP" : "NOT_SELECTED",
      activeEvidenceRecovery: {
        status: deferred ? "DEFERRED_BEFORE_DEEP" : "NOT_SELECTED",
        recoveredFields: [],
        attemptedFields: [],
        unrecoveredFields: [],
        providerExecution,
        batchSummary,
        reason: deferred
          ? "Project was deferred before deep evaluation and excluded from recovery."
          : "Project was outside the bounded value-of-information recovery budget.",
      },
    };
  });
}
