import { getEngineContracts } from "../kernel/engineContractManifest.js";
import { applyCanonicalAliases, canonicalValue } from "../data/canonicalAliasResolver.js";
import { INTERNAL_ENGINE_OUTPUT_FIELDS, canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { evaluateEvidenceFreshness } from "../data/evidenceFreshnessPolicy.js";
import { buildTargetedEnrichmentPlan } from "../data/targetedEnrichmentRouter.js";
import { sourceFamilyForField } from "../data/enrichmentSourceRegistry.js";
import { normalizeChainId, chainKind } from "../identity/strictIdentityValidators.js";

const INTERNAL_FIELD_PRODUCERS = Object.freeze({
  marketOpportunityRank: "marketOpportunityRank",
  opportunityEvidenceRecord: "progressiveOpportunityRanking",
  recommendedHorizon: "marketOpportunityRank",
  progressiveOpportunityScore: "progressiveOpportunityRanking",
  trustScore: "progressiveOpportunityRanking",
  executionScore: "executionProof",
  attentionGapScore: "attentionGap",
  opportunityTimingScore: "opportunityTiming",
  capitalMigrationScore: "capitalMigrationCore",
  preBreakoutRadarScore: "preBreakoutRadar",
  preConsensusBreakoutScore: "preConsensusBreakoutHunter",
  preConsensusOpportunityScore: "preConsensusBreakoutHunter",
  sniperIntegrityScore: "sniperIntegrityGate",
  confidenceAdjustedSniperScore: "sniperIntegrityGate",
  earlyAsymmetryResearchPriorityScore: "earlyAsymmetryTriage",
  researchReadinessScore: "researchReadiness",
});

function outputProducerMap(contracts = []) {
  const producers = new Map(Object.entries(INTERNAL_FIELD_PRODUCERS));
  for (const contract of contracts) {
    const outputFields = [
      ...(contract.outputContract?.requiredAny || []).flatMap((group) =>
        Array.isArray(group) ? group : [group]
      ),
      ...(contract.outputContract?.scoreFields || []),
    ];
    for (const field of outputFields.filter(Boolean)) {
      const canonicalField = canonicalFieldForAlias(field) || field;
      if (!producers.has(canonicalField)) producers.set(canonicalField, contract.id);
    }
  }
  return producers;
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function hasValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function clean(value = "") {
  return String(value || "").trim().toLowerCase();
}

function values(project = {}, fields = []) {
  return fields.map((field) => canonicalValue(project, field));
}

function providerStatus(project = {}, field = "") {
  const providerHealth = project.providerHealth || project.sourceHealth || project.discoverySourceHealth || {};
  const statusText = [
    providerHealth[field],
    providerHealth.status,
    project.providerStatus,
    project.sourceStatus,
    ...(Array.isArray(project.providerWarnings) ? project.providerWarnings : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (statusText.includes("429") || statusText.includes("rate limit")) return "PROVIDER_RATE_LIMITED";
  if (statusText.includes("451") || statusText.includes("region")) return "REGION_RESTRICTED";
  if (statusText.includes("failed") || statusText.includes("timeout") || statusText.includes("unavailable")) {
    return "PROVIDER_UNAVAILABLE";
  }
  return "UNKNOWN";
}

function engineRecord(project = {}, producer = "") {
  const key = String(producer || "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
  return project.engineResults?.[key] || null;
}

function lifecycle(project = {}) {
  return clean(project.lifecycleStage || project.candidateLifecycleStage || project.preIntelligenceLane || project.discoveryLane);
}

function projectType(project = {}) {
  return clean(project.projectType || project.category || project.narrative || project.primaryNarrative);
}

function venueType(project = {}) {
  const sourceType = clean(project.sourceType || project.dex || project.venueType);
  if (sourceType === "cex" || project.exchange || project.cex) return "cex";
  if (sourceType === "dex" || project.poolAddress || project.pairAddress || clean(project.source).includes("dex")) return "dex";
  return "unknown";
}

function developmentEvidenceApplicable(project = {}) {
  const type = projectType(project);
  const text = [project.description, project.websiteText, project.name, project.category, project.narrative]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (type.includes("meme") && !/ai|gaming|protocol|infrastructure|defi|depin|rwa|utility|sdk|app/.test(text)) {
    return false;
  }
  return true;
}

export function fieldApplicability(project = {}, canonicalField = "", contract = {}) {
  const chain = normalizeChainId(
    project.chain ||
      project.chainId ||
      project.network ||
      project.canonicalAliases?.chain ||
      canonicalValue(project, "chain", { disableSemanticScan: true })
  );
  const family = chain ? chainKind(chain) : null;
  const venue = venueType(project);
  const life = lifecycle(project);
  const tokenAddress =
    project.tokenAddress ||
    project.contractAddress ||
    project.address ||
    project.canonicalAliases?.tokenAddress ||
    canonicalValue(project, "tokenAddress", { disableSemanticScan: true });

  if (
    contract.id === "deployerReputation" &&
    (!tokenAddress || venue === "cex" || life.includes("prelaunch"))
  ) {
    return {
      status: "NOT_APPLICABLE",
      reason: "Deployer history requires a launched on-chain token identity; CEX-only, contractless, and prelaunch records remain research-only.",
    };
  }
  if (contract.id === "deployerReputation" && family === "solana") {
    return {
      status: "NOT_APPLICABLE",
      reason: "Solana authority and mint safety are evaluated by chain-specific engines; EVM deployer reputation is not applicable.",
    };
  }
  if (["lpLockedPct", "lpBurnedPct", "ownerLpSharePct", "poolAddress"].includes(canonicalField) && venue === "cex") {
    return { status: "NOT_APPLICABLE", reason: "CEX-only project does not require DEX pool or LP-lock evidence." };
  }
  if (
    [
      "ownerRenounced",
      "contractVerified",
      "buyTaxPct",
      "sellTaxPct",
      "deployer",
      "deployerAddress",
      "deployerHistory",
      "priorDeployments",
      "successfulLaunches",
      "walletAgeDays",
      "reusedBytecodeRisk",
      "fundingSourceRisk",
    ].includes(canonicalField) &&
    family === "solana"
  ) {
    return { status: "NOT_APPLICABLE", reason: "Solana project does not use EVM ownership, tax, or contract-deployer semantics." };
  }
  if (["mintAuthorityEnabled"].includes(canonicalField) && family === "evm") {
    return { status: "NOT_APPLICABLE", reason: "EVM project does not use Solana mint-authority semantics." };
  }
  if (["liquidityUsd", "stableExitLiquidityUsd", "poolAddress"].includes(canonicalField) && life.includes("prelaunch")) {
    return { status: "NOT_APPLICABLE", reason: "Prelaunch project is research eligible without current liquidity." };
  }
  if (["githubRepo", "developerActivityScore", "commits30d", "contributors30d"].includes(canonicalField) && !developmentEvidenceApplicable(project)) {
    return { status: "NOT_APPLICABLE", reason: "Meme or social token does not claim a repository-backed product requirement." };
  }
  if (!chain && ["tokenAddress", "poolAddress", "contractVerified", "ownerRenounced", "mintAuthorityEnabled"].includes(canonicalField)) {
    return { status: "APPLICABLE", reason: "Identity is unresolved; chain-specific evidence remains recoverable." };
  }
  if (contract.applicableChains?.length && chain && !contract.applicableChains.includes(chain)) {
    return { status: "NOT_APPLICABLE", reason: `Engine ${contract.id} does not apply to ${chain}.` };
  }

  return { status: "APPLICABLE", reason: "Evidence is applicable to this project and engine contract." };
}

function rootCauseForMissing(project = {}, canonicalField = "", contract = {}, applicability = {}, producers = new Map()) {
  if (applicability.status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (project.canonicalAliasConflicts?.[canonicalField]?.length) return "CONFLICTED_DATA";
  if (canonicalField === "chain" && (project.chain || project.network || project.chainId) && !normalizeChainId(project.chain || project.network || project.chainId)) {
    return "UNSUPPORTED_CHAIN";
  }
  if (["tokenAddress", "poolAddress"].includes(canonicalField) && !canonicalValue(project, "chain")) return "IDENTITY_UNRESOLVED";
  if (Array.isArray(project.enrichmentDeferredFields) && project.enrichmentDeferredFields.includes(canonicalField)) return "ENRICHMENT_DEFERRED";

  const evidenceFamily = sourceFamilyForField(canonicalField);
  const producer = producers.get(canonicalField) || INTERNAL_FIELD_PRODUCERS[canonicalField];
  const derivedOutput =
    evidenceFamily === "DERIVED" ||
    (Boolean(producer) && evidenceFamily === "UNKNOWN");
  if (derivedOutput || INTERNAL_ENGINE_OUTPUT_FIELDS.includes(canonicalField)) {
    const producingEngine = producer || contract.id;
    const record = engineRecord(project, producingEngine);
    if (!record) return "PIPELINE_STAGE_NOT_RUN";
    if (record.status === "FAILED") {
      return /timeout|timed out/i.test(record.failureReason || "") ? "PIPELINE_STAGE_TIMED_OUT" : "PIPELINE_STAGE_FAILED";
    }
    return "PIPELINE_OUTPUT_MISSING";
  }

  const provider = providerStatus(project, canonicalField);
  if (provider !== "UNKNOWN") return provider;

  if (contract.phase === "execution" || ["purchaseRouteConfirmed", "sellRouteAvailable", "executionStatus"].includes(canonicalField)) {
    return "EXECUTION_EVIDENCE_MISSING";
  }

  return "RAW_SOURCE_MISSING";
}

function missingRecord(project = {}, field = "", contract = {}, now = new Date(), producers = new Map()) {
  const canonicalField = canonicalFieldForAlias(field) || field;
  const applicability = fieldApplicability(project, canonicalField, contract);
  const provenance = project.canonicalAliasProvenance?.[canonicalField] || null;
  const freshness = provenance ? evaluateEvidenceFreshness(provenance.sourceTimestamp || provenance.observedAt, canonicalField, now) : null;
  const rootCause = freshness?.status === "STALE_DATA"
    ? "STALE_DATA"
    : rootCauseForMissing(project, canonicalField, contract, applicability, producers);
  const evidenceFamily = sourceFamilyForField(canonicalField);
  const producer = producers.get(canonicalField) || INTERNAL_FIELD_PRODUCERS[canonicalField] || null;
  const derivedOutput =
    evidenceFamily === "DERIVED" ||
    (Boolean(producer) && evidenceFamily === "UNKNOWN");
  const fieldProviderStatus = derivedOutput ? "UNKNOWN" : providerStatus(project, canonicalField);
  const recoverable =
    !derivedOutput &&
    !["NOT_APPLICABLE", "UNSUPPORTED_CHAIN"].includes(rootCause);
  const evidenceClass =
    contract.affectsFinalDecision || contract.canBlockCandidate
      ? "CORE"
      : "ADVISORY";

  return {
    field,
    canonicalField,
    rootCause,
    producingEngine: producer || contract.id || null,
    expectedSource: derivedOutput ? `internal:${producer || contract.id}` : null,
    sourceAttempted: fieldProviderStatus !== "UNKNOWN",
    providerStatus: fieldProviderStatus,
    applicability: applicability.status,
    applicabilityReason: applicability.reason,
    firstMissingAt: new Date().toISOString(),
    lastAttemptedAt: provenance?.sourceTimestamp || null,
    recoverable,
    recomputeAfterRecovery: derivedOutput,
    recoveryDisposition:
      applicability.status === "NOT_APPLICABLE"
        ? "NOT_APPLICABLE"
        : derivedOutput
          ? "DERIVED_RECOMPUTE"
          : recoverable
            ? "RAW_RECOVERABLE"
            : "UNAVAILABLE_WITH_CURRENT_PROVIDERS",
    evidenceClass,
    estimatedRecoveryCost: recoverable ? 1 : 0,
    estimatedRecoveryValue: recoverable ? 0.5 : 0,
    blockingResearch: Boolean(
      evidenceClass === "CORE" && rootCause !== "NOT_APPLICABLE"
    ),
    blockingExecution: contract.phase === "execution" || ["purchaseRouteConfirmed", "sellRouteAvailable"].includes(canonicalField),
  };
}

export function analyzeDataStarvationRootCause(project = {}, options = {}) {
  if (project.deepEvaluationState === "DEFERRED_BEFORE_DEEP") {
    return {
      ...project,
      dataStarvationStatus: "DEFERRED_BEFORE_DEEP",
      dataStarvationRootCauses: {},
      dataStarvationMissingEvidence: [],
      coreMissingEvidence: [],
      advisoryMissingEvidence: [],
      coreDataStarved: false,
      advisoryDataGaps: false,
      dataStarvationBlockingResearchCount: 0,
      dataStarvationBlockingExecutionCount: 0,
      dataStarvationNotApplicableCount: 0,
      dataStarvationSatisfiedGroups: 0,
      starvationRecoveryPlan: buildTargetedEnrichmentPlan([]),
      dataStarvationPolicy:
        "Candidate was deferred before deep evaluation and is excluded from starvation and recovery denominators.",
    };
  }
  const now = options.now ? new Date(options.now) : new Date();
  const contracts = options.contracts || getEngineContracts();
  const producers = outputProducerMap(contracts);
  const contractFields = contracts.flatMap((contract) =>
    (contract.inputContract?.requiredAny || []).flatMap((group) => (Array.isArray(group) ? group : [group]))
  );
  const aliased = applyCanonicalAliases(project, {
    fields: [...new Set(contractFields.map((field) => canonicalFieldForAlias(field) || field))],
    disableSemanticScan: options.disableSemanticScan ?? false,
  });
  const missing = [];
  const notApplicable = [];
  const satisfied = [];

  for (const contract of contracts) {
    for (const group of contract.inputContract?.requiredAny || []) {
      const fields = Array.isArray(group) ? group : [group].filter(Boolean);
      const canonicalFields = [...new Set(fields.map((field) => canonicalFieldForAlias(field) || field))];
      const applicableFields = canonicalFields.filter((field) => fieldApplicability(aliased, field, contract).status !== "NOT_APPLICABLE");
      const groupValues = applicableFields.length ? values(aliased, applicableFields) : [];
      if (!applicableFields.length) {
        notApplicable.push(...canonicalFields.map((field) => missingRecord(aliased, field, contract, now, producers)));
      } else if (groupValues.some(hasValue)) {
        satisfied.push({ engineId: contract.id, fields: applicableFields });
      } else {
        missing.push(...applicableFields.map((field) => missingRecord(aliased, field, contract, now, producers)));
      }
    }
  }

  const unresolvedEvidence = [...missing, ...notApplicable].map((item) => {
    const plan = buildTargetedEnrichmentPlan([item]);
    const target = plan.items[0] || {};
    return {
      ...item,
      expectedSource: target.targetSources?.[0]?.source || item.expectedSource,
      targetSources: target.targetSources || [],
      estimatedRecoveryCost: target.targetSources?.[0]?.cost ?? item.estimatedRecoveryCost,
      estimatedRecoveryValue: target.valueOfInformationScore ?? item.estimatedRecoveryValue,
    };
  });
  const mergedMissing = [
    ...new Map(
      unresolvedEvidence.map((item) => [
        `${item.canonicalField}|${item.producingEngine}|${item.rootCause}`,
        item,
      ])
    ).values(),
  ];
  const countsByRootCause = mergedMissing.reduce((acc, item) => {
    acc[item.rootCause] = (acc[item.rootCause] || 0) + 1;
    return acc;
  }, {});
  const blockingResearch = mergedMissing.filter((item) => item.blockingResearch && item.rootCause !== "NOT_APPLICABLE");
  const blockingExecution = mergedMissing.filter((item) => item.blockingExecution && item.rootCause !== "NOT_APPLICABLE");
  const coreMissingEvidence = mergedMissing.filter(
    (item) => item.evidenceClass === "CORE" && item.rootCause !== "NOT_APPLICABLE"
  );
  const advisoryMissingEvidence = mergedMissing.filter(
    (item) => item.evidenceClass === "ADVISORY" && item.rootCause !== "NOT_APPLICABLE"
  );
  const recoveryItems = mergedMissing.filter(
    (item) =>
      item.recoveryDisposition === "RAW_RECOVERABLE" &&
      item.recoverable
  );

  return {
    ...aliased,
    dataStarvationStatus:
      coreMissingEvidence.length
        ? "CORE_DATA_STARVED"
        : advisoryMissingEvidence.length
          ? "ADVISORY_DATA_GAPS"
          : "ENOUGH_EVIDENCE_TO_RANK",
    dataStarvationRootCauses: countsByRootCause,
    dataStarvationMissingEvidence: mergedMissing,
    coreMissingEvidence,
    advisoryMissingEvidence,
    coreDataStarved: coreMissingEvidence.length > 0,
    advisoryDataGaps: advisoryMissingEvidence.length > 0,
    dataStarvationBlockingResearchCount: blockingResearch.length,
    dataStarvationBlockingExecutionCount: blockingExecution.length,
    dataStarvationNotApplicableCount: notApplicable.length,
    dataStarvationSatisfiedGroups: satisfied.length,
    starvationRecoveryPlan: buildTargetedEnrichmentPlan(recoveryItems),
    dataStarvationPolicy:
      "Core and advisory gaps are reported separately. Derived fields are recomputed, deferred projects are excluded, and missing data remains unknown and cannot qualify a project.",
  };
}

export function analyzeDataStarvationRootCauseBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeDataStarvationRootCause(project, options));
}
