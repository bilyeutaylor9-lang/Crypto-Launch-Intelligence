import { getFreeSecurityEvidence } from "../data/security/freeSecurityEvidenceConnector.js";
import {
  BLOCKSCOUT_DEFAULTS,
  evmChainId,
  summarizeSecurityEvidence,
  tokenAddress,
} from "../data/security/securityEvidenceUtils.js";
import { securityWalletEvidencePatch } from "../data/security/securityWalletEvidence.js";
import { normalizeChainId, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function positiveInt(value, fallback, maximum = 1000) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(maximum, parsed) : fallback;
}

function existingSummary(project = {}) {
  if (project.securityEvidenceSummary) return project.securityEvidenceSummary;
  if (Array.isArray(project.securityEvidence)) return summarizeSecurityEvidence(project.securityEvidence);
  if (project.freeSecurityEvidence?.summary) return project.freeSecurityEvidence.summary;
  return null;
}

function securityRecoveryIdentity(project = {}) {
  if (project.canonicalIdentityHardBlock === true || project.chainMismatch === true || project.contractChainMismatch === true) return null;
  const chains = [project.chain, project.chainId, project.canonicalChain, project.network,
    project.canonicalExecutionRoute?.chain].filter((value) => value !== undefined && value !== null && value !== "");
  const chain = normalizeChainId(chains[0]);
  if (!chain || !(chain === "solana" || evmChainId(chain) || BLOCKSCOUT_DEFAULTS[chain]) ||
      !chains.every((value) => normalizeChainId(value) === chain)) return null;
  const address = normalizeTokenAddress(tokenAddress(project), chain);
  const addresses = [project.finalContractAddress, project.canonicalAddress, project.contractAddress,
    project.tokenAddress, project.address, project.baseToken?.address,
    project.canonicalExecutionRoute?.tokenAddress, project.canonicalExecutionRoute?.contractAddress]
    .filter((value) => value !== undefined && value !== null && value !== "");
  if (!address || !addresses.every((value) => normalizeTokenAddress(value, chain) === address)) return null;
  return `${chain}:${address}`;
}

function summaryIsStale(summary = {}, project = {}, options = {}) {
  const now = options.now ? new Date(typeof options.now === "function" ? options.now() : options.now).getTime() : Date.now();
  const configuredAge = Number(options.securityEvidenceMaxAgeMs ?? options.securityEvidence?.cacheTtlMs ??
    process.env.SECURITY_EVIDENCE_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
  const maxAge = normalizeChainId(project.chain || project.chainId || project.canonicalChain || project.network) === "solana"
    ? Math.min(configuredAge, 300_000) : configuredAge;
  const timestamps = Array.isArray(summary.knownProviders) && summary.knownProviders.length
    ? summary.knownProviders.map((provider) => summary.sourceTimestamps?.[provider])
    : Object.values(summary.sourceTimestamps || {});
  return !Number.isFinite(now) || !Number.isFinite(maxAge) || maxAge <= 0 || !timestamps.length ||
    timestamps.some((value) => {
      const observed = typeof value === "string" ? Date.parse(value) : NaN;
      return !Number.isFinite(observed) || observed <= 0 || observed > now || now - observed > maxAge;
    });
}

function needsSecurityRecovery(project = {}, options = {}) {
  if (project.deepEvaluationState === "DEFERRED_BEFORE_DEEP" || project.deepEvaluationDeferred === true ||
      !securityRecoveryIdentity(project)) return false;
  const summary = existingSummary(project);
  if (summary?.malicious === true || summary?.honeypot === true) return false;
  return !summary || summary.status === "UNKNOWN" || summary.verifiedSource !== true ||
    summary.unknownChecks?.length > 0 || summaryIsStale(summary, project, options);
}

function securityRecoveryPriority(project = {}) {
  return Math.max(
    num(project.researchOpportunityScore),
    num(project.earlyAsymmetryResearchPriorityScore),
    num(project.progressiveOpportunityScore),
    num(project.marketOpportunityScore),
    num(project.pipelineScore),
    num(project.marketRankScore)
  );
}

function securityRecoverySelection(projects = [], limit = 25, options = {}) {
  const candidates = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => needsSecurityRecovery(project, options))
    .sort((left, right) => securityRecoveryPriority(right.project) - securityRecoveryPriority(left.project));
  const selected = new Set();
  const identities = new Set();
  for (const candidate of candidates) {
    const project = candidate.project;
    const identity = securityRecoveryIdentity(project);
    if (identities.has(identity)) continue;
    identities.add(identity);
    selected.add(candidate.index);
    if (selected.size >= limit) break;
  }
  return selected;
}

function riskPoints(summary = {}) {
  const points = [];
  if (summary.malicious) points.push({ points: 55, reason: "Malicious or scam security flag." });
  if (summary.honeypot) points.push({ points: 50, reason: "Honeypot signal detected." });
  if (summary.blacklistRisk) points.push({ points: 32, reason: "Blacklist or sell-restriction authority detected." });
  if (summary.mintRisk) points.push({ points: 24, reason: "Mint authority appears active." });
  if (summary.freezeRisk) points.push({ points: 20, reason: "Pause, freeze, cooldown, or transfer-control authority detected." });
  if (summary.ownerRisk) points.push({ points: 18, reason: "Owner authority is not cleanly removed." });
  if (summary.proxy) points.push({ points: 12, reason: "Upgradeable proxy or implementation indirection found." });
  if (summary.highTaxRisk) points.push({ points: 18, reason: "Buy/sell tax requires review." });
  if (!summary.verifiedSource) points.push({ points: 10, reason: "Verified source code was not confirmed." });
  return points;
}

function safetyProofStatus(summary = null, riskScore = 100) {
  if (!summary || summary.status === "UNKNOWN") return "SAFETY_UNKNOWN";
  if (summary.malicious || summary.honeypot || riskScore >= 80) return "SAFETY_BLOCKED";
  if (summary.verifiedSource === true && riskScore < 35) return "SAFETY_VERIFIED_CLEAN";
  return "SAFETY_PARTIAL";
}

function safetyProofFields(summary = null, evidence = []) {
  const known = (Array.isArray(evidence) ? evidence : []).filter((item) => item?.status !== "UNKNOWN");
  const testedChecks = [
    ...(summary?.testedChecks || []),
    ...known.flatMap((item) => item.testedChecks || []),
  ];
  const sourceTimestamps = {
    ...(summary?.sourceTimestamps || {}),
    ...Object.fromEntries(
      known
        .filter((item) => item.provider && item.observedAt)
        .map((item) => [item.provider, item.observedAt])
    ),
  };
  return {
    testedChecks: [...new Set(testedChecks)],
    unknownChecks: [...new Set([...(summary?.unknownProviders || []), ...(summary?.unknownChecks || [])])],
    deterministicBlocks: [
      ...(summary?.malicious ? ["Verified malicious-token evidence."] : []),
      ...(summary?.honeypot ? ["Verified honeypot evidence."] : []),
    ],
    safetyEvidenceProvenance: summary?.knownProviders || [],
    safetySourceTimestamps: sourceTimestamps,
  };
}

export async function analyzeContractAuthorityRisk(project = {}, options = {}) {
  let summary = existingSummary(project);
  let evidence = Array.isArray(project.securityEvidence) ? project.securityEvidence
    : Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : [];
  const shouldCollect =
    options.collectSecurityEvidence === true ||
    (options.collectSecurityEvidence !== false &&
      process.env.SECURITY_EVIDENCE_COLLECT === "true");

  if (shouldCollect && needsSecurityRecovery(project, options)) {
    const collected = await getFreeSecurityEvidence(project, options.securityEvidence || options);
    const incoming = collected.summary;
    if (incoming?.status === "UNKNOWN" && summary) {
      evidence = [...evidence, ...(collected.evidence || [])];
      summary = { ...summary, unknownChecks: [...new Set([
        ...(summary.unknownChecks || []), ...(incoming.unknownChecks || []), "security.refresh_unverified",
      ])], warnings: [...new Set([...(summary.warnings || []), ...(incoming.warnings || [])])] };
    } else {
      const confirmed = new Set(incoming?.testedChecks || []);
      const unresolvedPrevious = [...(summary?.unknownChecks || []), ...(summary?.testedChecks || [])]
        .filter((check) => !confirmed.has(check));
      summary = incoming ? { ...incoming,
        unknownChecks: [...new Set([...(incoming.unknownChecks || []), ...unresolvedPrevious])],
      } : summary;
      evidence = collected.evidence || evidence;
    }
  }
  if (summary && summaryIsStale(summary, project, options)) {
    summary = { ...summary, unknownChecks: [...new Set([...(summary.unknownChecks || []), "security.evidence_stale"])] };
  }
  const walletPatch = securityWalletEvidencePatch(project, evidence, options.securityEvidence || options);

  if (!summary || summary.status === "UNKNOWN" || (summary.unknownChecks?.length && !summary.malicious && !summary.honeypot)) {
    const observedRisk = summary?.status !== "UNKNOWN" && summary
      ? riskPoints(summary).reduce((sum, item) => sum + item.points, 0) + Math.max(0, 40 - num(summary.confidence)) * 0.35
      : 0;
    const score = Math.round(clamp(Math.max(58, observedRisk)));
    const safetyStatus = score >= 80 ? "SAFETY_BLOCKED" : summary && summary.status !== "UNKNOWN" ? "SAFETY_PARTIAL" : "SAFETY_UNKNOWN";
    return {
      ...project,
      ...walletPatch,
      securityEvidence: evidence,
      securityEvidenceSummary: summary || null,
      securityEvidenceStatus: summary?.status || "UNKNOWN",
      safetyProofStatus: safetyStatus,
      safetyProofLane: safetyStatus,
      ...safetyProofFields(summary, evidence),
      contractAuthorityRiskScore: score,
      contractAuthoritySafetyScore: 100 - score,
      contractAuthorityVerdict: score >= 80 ? "BLOCK_CONTRACT_RISK" : "SECURITY_UNKNOWN_REVIEW",
      contractSafetyVerified: false,
      riskFlags: [
        ...(project.riskFlags || []),
        "Contract authority evidence missing",
      ],
      evidence: [
        ...(project.evidence || []),
        {
          engine: "Contract Authority Risk",
          signal: "missing contract-security evidence",
          score,
          confidence: 0.35,
          impact: "Negative",
          reasons: ["No free security provider evidence was available."],
        },
      ],
    };
  }

  const points = riskPoints(summary);
  const rawRisk = points.reduce((sum, item) => sum + item.points, 0);
  const riskScore = Math.round(clamp(rawRisk + Math.max(0, 40 - num(summary.confidence)) * 0.35));
  const safetyScore = Math.round(clamp(100 - riskScore + (summary.verifiedSource ? 5 : 0)));
  const verdict =
    riskScore >= 80
      ? "BLOCK_CONTRACT_RISK"
      : riskScore >= 60
      ? "HIGH_AUTHORITY_REVIEW"
      : riskScore >= 35
      ? "AUTHORITY_WATCH"
      : summary.verifiedSource
      ? "CONTRACT_EVIDENCE_CLEAN"
      : "CONTRACT_EVIDENCE_INCOMPLETE";
  const safetyStatus = safetyProofStatus(summary, riskScore);

  return {
    ...project,
    ...walletPatch,
    securityEvidence: evidence,
    securityEvidenceSummary: summary,
    securityEvidenceStatus: summary.status || "UNKNOWN",
    safetyProofStatus: safetyStatus,
    safetyProofLane: safetyStatus,
    ...safetyProofFields(summary, evidence),
    contractAuthorityRiskScore: riskScore,
    contractAuthoritySafetyScore: safetyScore,
    contractAuthorityVerdict: verdict,
    contractSafetyVerified: summary.status !== "UNKNOWN" && safetyStatus !== "SAFETY_BLOCKED" && summary.verifiedSource === true && riskScore < 60,
    riskFlags: [
      ...(project.riskFlags || []).filter((flag) => flag !== "Contract authority evidence missing"),
      ...(riskScore >= 60 ? ["High contract authority risk"] : []),
      ...(summary.status === "UNKNOWN" ? ["Contract authority evidence missing"] : []),
    ],
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Contract Authority Risk",
        signal: "free security provider contract evidence",
        score: safetyScore,
        riskScore,
        confidence: Math.max(0.35, num(summary.confidence) / 100),
        impact: riskScore >= 60 ? "Negative" : "Neutral",
        reasons: points.slice(0, 5).map((item) => item.reason),
        providers: summary.knownProviders || summary.providers || [],
      },
    ],
  };
}

export async function analyzeContractAuthorityRiskBatch(projects = [], options = {}) {
  const input = Array.isArray(projects) ? projects : [];
  const collectionEnabled =
    options.collectSecurityEvidence === true ||
    (options.collectSecurityEvidence !== false &&
      process.env.SECURITY_EVIDENCE_COLLECT === "true");
  const maxCandidates = positiveInt(
    options.maxSecurityRecoveryCandidates ||
      process.env.SAFETY_RECOVERY_MAX_CANDIDATES,
    25,
    250
  );
  const concurrency = positiveInt(
    options.securityEvidenceConcurrency ||
      process.env.SAFETY_RECOVERY_CONCURRENCY,
    2,
    10
  );
  const requestTimeoutMs = positiveInt(
    options.securityEvidenceRequestTimeoutMs ||
      process.env.SAFETY_RECOVERY_REQUEST_TIMEOUT_MS,
    8_000,
    30_000
  );
  const selected = collectionEnabled
    ? securityRecoverySelection(input, maxCandidates, options)
    : new Set();
  const results = new Array(input.length);
  let cursor = 0;

  async function worker() {
    while (cursor < input.length) {
      const index = cursor;
      cursor += 1;
      const project = input[index];
      const attempted = selected.has(index);
      const recoveryNeeded = needsSecurityRecovery(project, options);
      const result = await analyzeContractAuthorityRisk(project, {
        ...options,
        collectSecurityEvidence: attempted,
        securityEvidence: {
          ...(options.securityEvidence || {}),
          signal: options.signal,
          timeoutMs: requestTimeoutMs,
        },
      });
      results[index] = {
        ...result,
        safetyRecoveryAttempted: attempted,
        safetyRecoveryDeferred:
          collectionEnabled && recoveryNeeded && !attempted,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, input.length)) }, () => worker())
  );
  return results;
}
