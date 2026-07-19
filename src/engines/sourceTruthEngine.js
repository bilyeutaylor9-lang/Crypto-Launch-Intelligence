import { summarizeSourceRouter } from "../data/adaptiveSourceRouter.js";
import { calculateEvidenceCoverage, numericMetric } from "../kernel/evidenceCoverage.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function sourceNames(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sources || []),
    ...(project.internetResearch?.sources || []),
  ]
    .filter(Boolean)
    .map((source) => String(source));
}

function normalizeSource(source = "") {
  const lowered = String(source).toLowerCase();

  if (lowered.includes("coingecko")) return "coingecko";
  if (lowered.includes("dexscreener")) return "dexscreener";
  if (lowered.includes("geckoterminal")) return "geckoterminal";
  if (lowered.includes("gecko")) return "geckoterminal";
  if (lowered.includes("birdeye")) return "birdeye";
  if (lowered.includes("github")) return "githubProjectDiscovery";
  if (lowered.includes("google")) return "googleNewsDiscovery";
  if (lowered.includes("seed")) return "researchSeeds";
  if (lowered.includes("ai")) return "aiDiscoverySwarm";
  if (lowered.includes("rescue")) return "candidateRescue";
  if (lowered.includes("expanded")) return "expandedMarketData";
  if (lowered.includes("free")) return "freeMarketData";
  return source || "unknown";
}

function routerTrust(source = "", router = {}) {
  const normalized = normalizeSource(source);
  const found = (router.sources || []).find((item) => item.source === normalized);

  if (found) return num(found.trustScore);
  if (normalized === "unknown") return 35;
  return 50;
}

function evidenceAgreement(project = {}) {
  const positive = [
    project.proofScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
    project.sourceReliabilityScore,
    project.internetResearchScore,
    project.roadmapProfitabilityScore,
    project.githubProScore,
  ].filter((value) => num(value) > 0);
  const risks = [
    project.externalRiskScore,
    project.trapRiskScore,
    project.xBotRiskScore,
  ].filter((value) => num(value) > 0);
  const positiveAvg = positive.length
    ? positive.reduce((sum, value) => sum + num(value), 0) / positive.length
    : 0;
  const riskAvg = risks.length ? risks.reduce((sum, value) => sum + num(value), 0) / risks.length : 0;

  return Math.round(clamp(positiveAvg - riskAvg * 0.35 + Math.min(12, positive.length * 2)));
}

export function analyzeSourceTruth(project = {}, context = {}) {
  const router = context.router || summarizeSourceRouter();
  const sources = sourceNames(project);
  const normalized = [...new Set(sources.map(normalizeSource))];
  const trustScores = normalized.map((source) => ({
    source,
    trustScore: routerTrust(source, router),
  }));
  const avgTrust = trustScores.length
    ? Math.round(trustScores.reduce((sum, source) => sum + source.trustScore, 0) / trustScores.length)
    : 35;
  const sourceCountScore = Math.min(100, normalized.length * 18);
  const agreement = evidenceAgreement(project);
  const conflictPenalty =
    num(project.externalRiskScore) >= 50 || num(project.trapRiskScore) >= 65
      ? 12
      : num(project.xBotRiskScore) >= 50
      ? 8
      : 0;
  const rankedTrustScores = [...trustScores].sort((a, b) => b.trustScore - a.trustScore);
  const sourceTruthScore = Math.round(
    clamp(avgTrust * 0.34 + agreement * 0.34 + sourceCountScore * 0.18 + num(project.sourceReliabilityScore) * 0.14 - conflictPenalty)
  );
  const evidenceCoverage = calculateEvidenceCoverage([
    {
      label: "source stack",
      status: normalized.length ? "VERIFIED" : "MISSING",
    },
    numericMetric({
      label: "average source trust",
      value: trustScores.length ? avgTrust : null,
      source: "source-truth",
      timestamp: project.scannedAt || project.updatedAt || new Date().toISOString(),
      confidence: trustScores.length ? 75 : 0,
      freshness: project.staleEvidenceCount > 0 ? "STALE" : "CURRENT_OR_UNKNOWN",
      provenance: "sourceTruth.averageTrust",
    }),
    numericMetric({
      label: "evidence agreement",
      value: agreement > 0 ? agreement : null,
      source: "source-truth",
      timestamp: project.scannedAt || project.updatedAt || new Date().toISOString(),
      confidence: agreement > 0 ? 70 : 0,
      freshness: project.staleEvidenceCount > 0 ? "STALE" : "CURRENT_OR_UNKNOWN",
      provenance: "sourceTruth.evidenceAgreement",
    }),
    numericMetric({
      label: "source reliability",
      value: project.sourceReliabilityScore,
      source: "source-truth",
      timestamp: project.scannedAt || project.updatedAt || new Date().toISOString(),
      confidence: project.sourceReliabilityScore === undefined ? 0 : 70,
      freshness: project.staleEvidenceCount > 0 ? "STALE" : "CURRENT_OR_UNKNOWN",
      provenance: "sourceReliabilityScore",
    }),
  ]);
  const calibratedSourceTruthScore = Math.round(
    clamp(sourceTruthScore - evidenceCoverage.confidencePenalty * 0.25)
  );

  return {
    ...project,
    sourceTruthScore: calibratedSourceTruthScore,
    sourceTruthVerdict:
      calibratedSourceTruthScore >= 75
        ? "Verified Source Stack"
        : calibratedSourceTruthScore >= 58
        ? "Usable Source Stack"
        : calibratedSourceTruthScore >= 40
        ? "Thin Source Stack"
        : "Weak Source Stack",
    sourceTruth: {
      score: calibratedSourceTruthScore,
      sources: trustScores,
      sourceCount: normalized.length,
      averageTrust: avgTrust,
      evidenceAgreement: agreement,
      evidenceCoverage,
      conflictPenalty,
      strongestSource: rankedTrustScores[0] || null,
      weakestSource: rankedTrustScores[rankedTrustScores.length - 1] || null,
      summary:
        normalized.length > 0
          ? `${normalized.length} source groups with ${avgTrust} average router trust.`
          : "No clear source stack found for this project.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Source Truth Engine",
        signal: "source reliability, provider history, and cross-evidence agreement",
        score: calibratedSourceTruthScore,
        confidence: Math.min(0.86, (evidenceCoverage.evidenceCoveragePercent / 100) * (0.35 + normalized.length * 0.08)),
        impact: calibratedSourceTruthScore >= 65 ? "Positive" : calibratedSourceTruthScore <= 35 ? "Negative" : "Neutral",
        reasons: [
          `${normalized.length} normalized source groups.`,
          `Average source trust ${avgTrust}; evidence agreement ${agreement}.`,
        ],
      },
    ],
  };
}

export function analyzeSourceTruthBatch(projects = []) {
  const router = summarizeSourceRouter();
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeSourceTruth(project, { router })
  );
}

export function summarizeSourceTruth(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const sourceMap = new Map();

  for (const project of safeProjects) {
    for (const source of project.sourceTruth?.sources || []) {
      const current = sourceMap.get(source.source) || {
        source: source.source,
        projects: 0,
        avgTrustScore: 0,
      };
      const projectsCount = current.projects + 1;
      sourceMap.set(source.source, {
        ...current,
        projects: projectsCount,
        avgTrustScore: Math.round(
          (current.avgTrustScore * current.projects + num(source.trustScore)) / projectsCount
        ),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    verifiedStacks: safeProjects.filter((project) => project.sourceTruthVerdict === "Verified Source Stack").length,
    weakStacks: safeProjects.filter((project) => project.sourceTruthVerdict === "Weak Source Stack").length,
    sources: [...sourceMap.values()].sort((a, b) => b.avgTrustScore - a.avgTrustScore),
    topProjects: [...safeProjects]
      .sort((a, b) => num(b.sourceTruthScore) - num(a.sourceTruthScore))
      .slice(0, 50)
      .map((project) => ({
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        score: project.sourceTruthScore || 0,
        verdict: project.sourceTruthVerdict || "Unknown",
        sources: project.sourceTruth?.sources || [],
      })),
  };
}
