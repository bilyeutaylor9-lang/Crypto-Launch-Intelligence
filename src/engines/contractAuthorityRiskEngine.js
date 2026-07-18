import { getFreeSecurityEvidence } from "../data/security/freeSecurityEvidenceConnector.js";
import { summarizeSecurityEvidence } from "../data/security/securityEvidenceUtils.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function existingSummary(project = {}) {
  if (project.securityEvidenceSummary) return project.securityEvidenceSummary;
  if (Array.isArray(project.securityEvidence)) return summarizeSecurityEvidence(project.securityEvidence);
  if (project.freeSecurityEvidence?.summary) return project.freeSecurityEvidence.summary;
  return null;
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

export async function analyzeContractAuthorityRisk(project = {}, options = {}) {
  let summary = existingSummary(project);
  let evidence = project.securityEvidence || project.freeSecurityEvidence?.evidence || [];
  const shouldCollect =
    options.collectSecurityEvidence === true || process.env.SECURITY_EVIDENCE_COLLECT === "true";

  if (!summary && shouldCollect) {
    const collected = await getFreeSecurityEvidence(project, options.securityEvidence || options);
    summary = collected.summary;
    evidence = collected.evidence;
  }

  if (!summary) {
    const score = 58;
    return {
      ...project,
      securityEvidence: evidence,
      securityEvidenceSummary: null,
      securityEvidenceStatus: "UNKNOWN",
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

  return {
    ...project,
    securityEvidence: evidence,
    securityEvidenceSummary: summary,
    securityEvidenceStatus: summary.status || "UNKNOWN",
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
  const results = [];
  for (const project of projects) {
    results.push(await analyzeContractAuthorityRisk(project, options));
  }
  return results;
}
