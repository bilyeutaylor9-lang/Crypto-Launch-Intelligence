import { getEngineContracts } from "../kernel/engineContractManifest.js";
import { applyCanonicalAliases, canonicalValue } from "../data/canonicalAliasResolver.js";
import { INTERNAL_ENGINE_OUTPUT_FIELDS, canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { evaluateEvidenceFreshness } from "../data/evidenceFreshnessPolicy.js";
import { buildTargetedEnrichmentPlan } from "../data/targetedEnrichmentRouter.js";
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
  earlyAsymmetryResearchPriorityScore: "earlyAsymmetryTriage",
  researchReadinessScore: "researchReadiness",
});

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
  const chain = normalizeChainId(canonicalValue(project, "chain") || project.chain || project.chainId);
  const family = chain ? chainKind(chain) : null;
  const venue = venueType(project);
  const life = lifecycle(project);

  if (["lpLockedPct", "lpBurnedPct", "ownerLpSharePct", "poolAddress"].includes(canonicalField) && venue === "cex") {
    return { status: "NOT_APPLICABLE", reason: "CEX-only project does not require DEX pool or LP-lock evidence." };
  }
  if (["ownerRenounced", "contractVerified"].includes(canonicalField) && family === "solana") {
    return { status: "NOT_APPLICABLE", reason: "Solana project does not use EVM ownership/source-verification semantics." };
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

function rootCauseForMissing(project = {}, canonicalField = "", contract = {}, applicability = {}) {
  if (applicability.status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (project.canonicalAliasConflicts?.[canonicalField]?.length) return "CONFLICTED_DATA";
  if (canonicalField === "chain" && (project.chain || project.network || project.chainId) && !normalizeChainId(project.chain || project.network || project.chainId)) {
    return "UNSUPPORTED_CHAIN";
  }
  if (["tokenAddress", "poolAddress"].includes(canonicalField) && !canonicalValue(project, "chain")) return "IDENTITY_UNRESOLVED";
  if (Array.isArray(project.enrichmentDeferredFields) && project.enrichmentDeferredFields.includes(canonicalField)) return "ENRICHMENT_DEFERRED";

  const provider = providerStatus(project, canonicalField);
  if (provider !== "UNKNOWN") return provider;

  if (INTERNAL_ENGINE_OUTPUT_FIELDS.includes(canonicalField)) {
    const producer = INTERNAL_FIELD_PRODUCERS[canonicalField] || contract.id;
    const record = engineRecord(project, producer);
    if (!record) return "PIPELINE_STAGE_NOT_RUN";
    if (record.status === "FAILED") {
      return /timeout|timed out/i.test(record.failureReason || "") ? "PIPELINE_STAGE_TIMED_OUT" : "PIPELINE_STAGE_FAILED";
    }
    return "PIPELINE_OUTPUT_MISSING";
  }

  if (contract.phase === "execution" || ["purchaseRouteConfirmed", "sellRouteAvailable", "executionStatus"].includes(canonicalField)) {
    return "EXECUTION_EVIDENCE_MISSING";
  }

  return "RAW_SOURCE_MISSING";
}

function missingRecord(project = {}, field = "", contract = {}, now = new Date()) {
  const canonicalField = canonicalFieldForAlias(field) || field;
  const applicability = fieldApplicability(project, canonicalField, contract);
  const provenance = project.canonicalAliasProvenance?.[canonicalField] || null;
  const freshness = provenance ? evaluateEvidenceFreshness(provenance.sourceTimestamp || provenance.observedAt, canonicalField, now) : null;
  const rootCause = freshness?.status === "STALE_DATA"
    ? "STALE_DATA"
    : rootCauseForMissing(project, canonicalField, contract, applicability);
  const recoverable = !["NOT_APPLICABLE", "UNSUPPORTED_CHAIN"].includes(rootCause);

  return {
    field,
    canonicalField,
    rootCause,
    producingEngine: INTERNAL_FIELD_PRODUCERS[canonicalField] || contract.id || null,
    expectedSource: null,
    sourceAttempted: providerStatus(project, canonicalField) !== "UNKNOWN",
    providerStatus: providerStatus(project, canonicalField),
    applicability: applicability.status,
    applicabilityReason: applicability.reason,
    firstMissingAt: new Date().toISOString(),
    lastAttemptedAt: provenance?.sourceTimestamp || null,
    recoverable,
    estimatedRecoveryCost: recoverable ? 1 : 0,
    estimatedRecoveryValue: recoverable ? 0.5 : 0,
    blockingResearch: Boolean(contract.affectsFinalDecision && rootCause !== "NOT_APPLICABLE"),
    blockingExecution: contract.phase === "execution" || ["purchaseRouteConfirmed", "sellRouteAvailable"].includes(canonicalField),
  };
}

export function analyzeDataStarvationRootCause(project = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const aliased = applyCanonicalAliases(project);
  const contracts = options.contracts || getEngineContracts();
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
        notApplicable.push(...canonicalFields.map((field) => missingRecord(aliased, field, contract, now)));
      } else if (groupValues.some(hasValue)) {
        satisfied.push({ engineId: contract.id, fields: applicableFields });
      } else {
        missing.push(...applicableFields.map((field) => missingRecord(aliased, field, contract, now)));
      }
    }
  }

  const mergedMissing = [...missing, ...notApplicable].map((item) => {
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
  const countsByRootCause = mergedMissing.reduce((acc, item) => {
    acc[item.rootCause] = (acc[item.rootCause] || 0) + 1;
    return acc;
  }, {});
  const blockingResearch = mergedMissing.filter((item) => item.blockingResearch && item.rootCause !== "NOT_APPLICABLE");
  const blockingExecution = mergedMissing.filter((item) => item.blockingExecution && item.rootCause !== "NOT_APPLICABLE");

  return {
    ...aliased,
    dataStarvationStatus:
      blockingResearch.length ? "RESEARCH_BLOCKED_BY_EVIDENCE" : missing.length ? "RECOVERABLE_GAPS" : "ENOUGH_EVIDENCE_TO_RANK",
    dataStarvationRootCauses: countsByRootCause,
    dataStarvationMissingEvidence: mergedMissing,
    dataStarvationBlockingResearchCount: blockingResearch.length,
    dataStarvationBlockingExecutionCount: blockingExecution.length,
    dataStarvationNotApplicableCount: notApplicable.length,
    dataStarvationSatisfiedGroups: satisfied.length,
    starvationRecoveryPlan: buildTargetedEnrichmentPlan(mergedMissing.filter((item) => item.recoverable)),
    dataStarvationPolicy:
      "Missing, stale, failed, skipped, and not-applicable evidence are separated. Missing data remains unknown and cannot qualify a project.",
  };
}

export function analyzeDataStarvationRootCauseBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeDataStarvationRootCause(project, options));
}
