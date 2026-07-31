import { getFreeSecurityEvidence } from "../data/security/freeSecurityEvidenceConnector.js";
import {
  chainKey,
  evmChainId,
  summarizeSecurityEvidence,
  tokenAddress,
} from "../data/security/securityEvidenceUtils.js";

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

function securityRecoveryEligible(project = {}) {
  const chain = chainKey(project.chain || project.canonicalChain || project.network);
  return Boolean(tokenAddress(project) && (chain === "solana" || evmChainId(chain)));
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

function securityRecoverySelection(projects = [], limit = 25) {
  const candidates = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => !existingSummary(project) && securityRecoveryEligible(project))
    .sort((left, right) => securityRecoveryPriority(right.project) - securityRecoveryPriority(left.project));
  const selected = new Set();
  const identities = new Set();
  for (const candidate of candidates) {
    const project = candidate.project;
    const identity = `${chainKey(project.chain || project.canonicalChain || project.network)}:${tokenAddress(project).toLowerCase()}`;
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
    unknownChecks: summary?.unknownProviders || [],
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
  let evidence = project.securityEvidence || project.freeSecurityEvidence?.evidence || [];
  const shouldCollect =
    options.collectSecurityEvidence === true ||
    (options.collectSecurityEvidence !== false &&
      process.env.SECURITY_EVIDENCE_COLLECT === "true");

  if (!summary && shouldCollect) {
    const collected = await getFreeSecurityEvidence(project, options.securityEvidence || options);
    summary = collected.summary;
    evidence = collected.evidence;
  }

  if (!summary) {
    const score = 58;
    const safetyStatus = safetyProofStatus(null, score);
    return {
      ...project,
      securityEvidence: evidence,
      securityEvidenceSummary: null,
      securityEvidenceStatus: "UNKNOWN",
      safetyProofStatus: safetyStatus,
      safetyProofLane: safetyStatus,
      ...safetyProofFields(null, evidence),
      contractAuthorityRiskScore: score,
      contractAuthoritySafetyScore: 42,
      contractAuthorityVerdict: "SECURITY_UNKNOWN_REVIEW",
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
    securityEvidence: evidence,
    securityEvidenceSummary: summary,
    securityEvidenceStatus: summary.status || "UNKNOWN",
    safetyProofStatus: safetyStatus,
    safetyProofLane: safetyStatus,
    ...safetyProofFields(summary, evidence),
    contractAuthorityRiskScore: riskScore,
    contractAuthoritySafetyScore: safetyScore,
    contractAuthorityVerdict: verdict,
    contractSafetyVerified: summary.status !== "UNKNOWN" && summary.verifiedSource === true && riskScore < 60,
    riskFlags: [
      ...(project.riskFlags || []),
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
    ? securityRecoverySelection(input, maxCandidates)
    : new Set();
  const results = new Array(input.length);
  let cursor = 0;

  async function worker() {
    while (cursor < input.length) {
      const index = cursor;
      cursor += 1;
      const project = input[index];
      const attempted = selected.has(index);
      const eligible = securityRecoveryEligible(project);
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
          collectionEnabled && eligible && !existingSummary(project) && !attempted,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, input.length)) }, () => worker())
  );
  return results;
}
