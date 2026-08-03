import { resolveCanonicalAliases } from "../data/canonicalAliasResolver.js";
import {
  hasCleanDisplayIdentity,
  isGenericMarketIdentity,
  isLikelyAggregateCandidate,
} from "../identity/displayIdentityGuard.js";

const UTILITY_TERMS = {
  product: ["app", "dapp", "platform", "protocol", "mainnet", "testnet", "sdk", "api", "docs", "developer", "product", "game", "marketplace", "wallet", "payments", "storage", "compute"],
  infrastructure: ["infrastructure", "oracle", "bridge", "rollup", "sequencer", "data availability", "indexer", "middleware", "interoperability", "depin", "gpu", "wireless"],
  finance: ["defi", "lending", "dex", "amm", "staking", "restaking", "perp", "derivatives", "rwa", "tokenized", "treasury", "settlement"],
  adoption: ["users", "usage", "transactions", "revenue", "fees", "integrations", "partners", "ecosystem", "customers", "active wallets"],
  token: ["governance", "fee capture", "burn", "buyback", "staking", "validator", "utility token", "access token", "gas token", "rewards"],
};

const MEME_TERMS = [
  "meme",
  "memecoin",
  "meme coin",
  "dog",
  "cat",
  "pepe",
  "bonk",
  "shib",
  "wif",
  "wojak",
  "chad",
  "viral token",
  "community coin",
  "culture coin",
];

const UTILITY_ALIAS_FIELDS = Object.freeze([
  "website",
  "description",
  "websiteText",
  "roadmap",
  "githubRepo",
  "developerActivityScore",
  "commits30d",
  "contributors30d",
  "socialFollowers",
  "socialAccelerationScore",
  "catalystScore",
  "liveCatalystEvents",
]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function hasRawValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function hasExactTokenIdentity(project = {}) {
  const chain = clean(project.chain || project.network || project.chainId);
  const tokenAddress = clean(
    project.finalContractAddress ||
      project.canonicalAddress ||
      project.tokenAddress ||
      project.contractAddress ||
      project.baseToken?.address ||
      project.marketData?.tokenAddress
  );
  return Boolean(chain && tokenAddress);
}

function normalizeUtilityProject(project = {}) {
  if (project.utilityAliasNormalized) return project;
  const resolution = project.canonicalAliases
    ? {
        resolved: project.canonicalAliases,
        provenance: project.canonicalAliasProvenance || {},
        audits: project.aliasResolutionAudit || [],
      }
    : resolveCanonicalAliases(project, {
        fields: UTILITY_ALIAS_FIELDS,
        disableSemanticScan: false,
      });
  const normalized = { ...project };

  for (const field of UTILITY_ALIAS_FIELDS) {
    const value = resolution.resolved?.[field];
    if (hasRawValue(value) && !hasRawValue(normalized[field])) normalized[field] = value;
  }

  return {
    ...normalized,
    utilityAliasNormalized: true,
    canonicalAliases: {
      ...(project.canonicalAliases || {}),
      ...(resolution.resolved || {}),
    },
    canonicalAliasProvenance: {
      ...(project.canonicalAliasProvenance || {}),
      ...(resolution.provenance || {}),
    },
    aliasResolutionAudit: [
      ...(Array.isArray(project.aliasResolutionAudit) ? project.aliasResolutionAudit : []),
      ...(Array.isArray(resolution.audits) ? resolution.audits : []),
    ],
  };
}

function text(project = {}) {
  return [
    project.name,
    project.symbol,
    project.category,
    project.narrative,
    project.primaryNarrative,
    project.description,
    project.websiteText,
    project.roadmap,
    ...(Array.isArray(project.narratives) ? project.narratives : []),
    ...(Array.isArray(project.tags) ? project.tags : []),
    ...(Array.isArray(project.alphaTags) ? project.alphaTags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hits(value = "", terms = []) {
  const lower = value.toLowerCase();
  return terms.filter((term) => lower.includes(term));
}

function max(values = []) {
  return Math.max(0, ...values.map(num).filter(Number.isFinite));
}

function weighted(items = []) {
  const available = items.filter((item) => item.score !== undefined && item.score !== null && item.score !== "");
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(
    available.reduce((sum, item) => sum + clamp(item.score) * item.weight, 0) / totalWeight
  );
}

function sourceCount(project = {}) {
  return new Set(
    [
      project.source,
      ...(Array.isArray(project.sources) ? project.sources : []),
      ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
      ...(Array.isArray(project.evidenceSources) ? project.evidenceSources : []),
    ]
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean)
  ).size;
}

function deterministicSafetyBlocked(project = {}) {
  const blockers = [
    ...(Array.isArray(project.finalBlockingReasons) ? project.finalBlockingReasons : []),
    ...(Array.isArray(project.opportunityHardBlockers) ? project.opportunityHardBlockers : []),
  ]
    .join(" ")
    .toLowerCase();

  return Boolean(
    project.honeypotDetected === true ||
      project.verifiedScam === true ||
      project.sellRestricted === true ||
      project.identityConflict === true ||
      num(project.contractRiskScore) >= 85 ||
      num(project.washTradingRiskScore) >= 85 ||
      /honeypot|verified scam|contract mismatch|chain mismatch|critical safety/.test(blockers)
  );
}

function categorySignals(project = {}) {
  const body = text(project);
  return Object.fromEntries(
    Object.entries(UTILITY_TERMS).map(([key, terms]) => [key, hits(body, terms)])
  );
}

export function analyzeUtilityQuality(project = {}) {
  project = normalizeUtilityProject(project);
  const utilityIdentityEligible =
    hasCleanDisplayIdentity(project) &&
    !isLikelyAggregateCandidate(project) &&
    (!isGenericMarketIdentity(project) || hasExactTokenIdentity(project));

  if (!utilityIdentityEligible) {
    return {
      ...project,
      utilityQualityScore: null,
      realUtilityScore: null,
      utilityClassification: "INVALID_OR_AGGREGATE_IDENTITY",
      realUtilityQualified: false,
      memeOnlySpeculative: false,
      memeSpeculationScore: null,
      utilityIdentityEligible: false,
      utilityEvidenceFamilies: [],
      utilityQualityComponents: {},
      utilitySignals: {
        product: [],
        infrastructure: [],
        finance: [],
        adoption: [],
        token: [],
        meme: [],
      },
      utilityResearchWarnings: [
        "Project identity is malformed, generic, or aggregate; utility scoring is withheld until exact project identity is recovered.",
      ],
    };
  }
  const body = text(project);
  const signals = categorySignals(project);
  const memeHits = hits(body, MEME_TERMS);
  const productEvidenceScore = Math.round(
    clamp(signals.product.length * 14 + (project.website ? 12 : 0) + (project.docsUrl || project.githubRepo ? 14 : 0))
  );
  const developerEvidenceScore = max([
    project.developerActivityScore,
    project.githubProScore,
    project.githubQualityScore,
    project.developerAccelerationScore,
    project.commits30d ? Math.min(90, 35 + num(project.commits30d) * 2) : 0,
    project.contributors30d ? Math.min(90, 40 + num(project.contributors30d) * 8) : 0,
  ]);
  const adoptionEvidenceScore = max([
    project.ecosystemAdoptionScore,
    project.ecosystemIntegrationScore,
    project.organicDemandIntegrityScore,
    project.organicBuyerScore,
    project.buyerRetentionScore,
    project.holderGrowthScore,
    project.userGrowthScore,
    project.protocolRevenueScore,
    signals.adoption.length * 16,
  ]);
  const tokenUtilityScore = max([
    project.tokenUtilityScore,
    project.tokenomicsScore,
    project.valueCaptureScore,
    project.stakingHealthScore,
    project.tvlGrowthScore,
    signals.token.length * 18,
  ]);
  const catalystUtilityScore = max([
    project.catalystScore,
    project.liveCatalystRadarScore,
    project.roadmapCatalystProfitScore,
    project.roadmapProfitabilityScore,
    signals.infrastructure.length * 12,
    signals.finance.length * 12,
  ]);
  const sourceEvidenceScore = max([
    project.sourceTruthScore,
    project.sourceReliabilityScore,
    project.institutionalDataProvenanceScore,
    sourceCount(project) >= 3 ? 82 : sourceCount(project) === 2 ? 66 : sourceCount(project) === 1 ? 42 : 0,
  ]);
  const utilityQualityScore = weighted([
    { score: productEvidenceScore, weight: 20 },
    { score: developerEvidenceScore, weight: 18 },
    { score: adoptionEvidenceScore, weight: 20 },
    { score: tokenUtilityScore, weight: 16 },
    { score: catalystUtilityScore, weight: 14 },
    { score: sourceEvidenceScore, weight: 12 },
  ]);
  const memeSpeculationScore = Math.round(
    clamp(memeHits.length * 18 + num(project.narrativeHeatScore) * 0.35 + num(project.socialAccelerationScore) * 0.25 - utilityQualityScore * 0.35)
  );
  const utilityEvidenceFamilies = [
    productEvidenceScore >= 45 ? "PRODUCT" : null,
    developerEvidenceScore >= 45 ? "DEVELOPMENT" : null,
    adoptionEvidenceScore >= 45 ? "ADOPTION" : null,
    tokenUtilityScore >= 45 ? "TOKEN_UTILITY" : null,
    catalystUtilityScore >= 45 ? "CATALYST" : null,
    sourceEvidenceScore >= 45 ? "SOURCE_QUALITY" : null,
  ].filter(Boolean);
  const memeOnlySpeculative = memeSpeculationScore >= 55 && utilityQualityScore < 48;
  const realUtilityQualified =
    !deterministicSafetyBlocked(project) &&
    utilityQualityScore >= 65 &&
    utilityEvidenceFamilies.length >= 3 &&
    !memeOnlySpeculative;
  const utilityClassification = deterministicSafetyBlocked(project)
    ? "UTILITY_BLOCKED_BY_SAFETY"
    : realUtilityQualified
      ? "REAL_UTILITY"
      : utilityQualityScore >= 55
        ? memeHits.length
          ? "MIXED_MEME_UTILITY"
          : "UTILITY_RESEARCH"
        : memeOnlySpeculative
          ? "MEME_SPECULATION"
          : "UNKNOWN_UTILITY";

  return {
    ...project,
    utilityQualityScore,
    realUtilityScore: utilityQualityScore,
    utilityClassification,
    realUtilityQualified,
    utilityIdentityEligible: true,
    memeOnlySpeculative,
    memeSpeculationScore,
    utilityEvidenceFamilies,
    utilityQualityComponents: {
      productEvidenceScore,
      developerEvidenceScore,
      adoptionEvidenceScore,
      tokenUtilityScore,
      catalystUtilityScore,
      sourceEvidenceScore,
      memeSpeculationScore,
    },
    utilitySignals: {
      product: signals.product.slice(0, 8),
      infrastructure: signals.infrastructure.slice(0, 8),
      finance: signals.finance.slice(0, 8),
      adoption: signals.adoption.slice(0, 8),
      token: signals.token.slice(0, 8),
      meme: memeHits.slice(0, 8),
    },
    utilityResearchWarnings: [
      memeOnlySpeculative ? "Meme/social signal dominates verified utility evidence; keep this speculative-only." : null,
      utilityQualityScore < 45 ? "Utility evidence is still weak or missing." : null,
      sourceEvidenceScore < 45 ? "Independent source support is weak." : null,
      developerEvidenceScore < 35 && /ai|gaming|infra|protocol|depin|rwa|defi/.test(body)
        ? "Project claims utility but developer/product evidence is thin."
        : null,
    ].filter(Boolean),
  };
}

export function analyzeUtilityQualityBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeUtilityQuality);
}

export function summarizeUtilityQuality(projects = []) {
  const analyzed = (Array.isArray(projects) ? projects : []).every((project) => project.utilityQualityScore !== undefined)
    ? projects
    : analyzeUtilityQualityBatch(projects);
  const ranked = [...analyzed].sort(
    (a, b) =>
      num(b.utilityQualityScore) - num(a.utilityQualityScore) ||
      num(b.progressiveOpportunityScore) - num(a.progressiveOpportunityScore)
  );

  return {
    generatedAt: new Date().toISOString(),
    status: ranked.length ? "PASS" : "NO_PROJECTS",
    projectsAnalyzed: ranked.length,
    realUtilityQualifiedCount: ranked.filter(
      (project) =>
        project.realUtilityQualified && project.utilityIdentityEligible !== false
    ).length,
    memeSpeculationCount: ranked.filter((project) => project.memeOnlySpeculative).length,
    mixedMemeUtilityCount: ranked.filter((project) => project.utilityClassification === "MIXED_MEME_UTILITY").length,
    invalidOrAggregateIdentityCount: ranked.filter(
      (project) => project.utilityIdentityEligible === false
    ).length,
    topRealUtilityResearch: ranked
      .filter(
        (project) =>
          project.realUtilityQualified === true &&
          project.utilityIdentityEligible !== false
      )
      .slice(0, 50)
      .map(compactUtilityProject),
    memeSpeculationOnly: ranked
      .filter((project) => project.memeOnlySpeculative)
      .slice(0, 50)
      .map(compactUtilityProject),
    limitations: [
      "Utility quality is a research ranking, not financial advice.",
      "Meme-only projects stay visible as speculative-only research instead of being promoted as utility projects.",
      "Missing product or developer evidence remains unknown and should trigger deeper research.",
    ],
  };
}

function compactUtilityProject(project = {}) {
  return {
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.chainId || null,
    utilityQualityScore: project.utilityQualityScore || 0,
    utilityClassification: project.utilityClassification || "UNKNOWN_UTILITY",
    realUtilityQualified: Boolean(project.realUtilityQualified),
    utilityIdentityEligible: project.utilityIdentityEligible !== false,
    memeOnlySpeculative: Boolean(project.memeOnlySpeculative),
    memeSpeculationScore: project.memeSpeculationScore || 0,
    utilityEvidenceFamilies: project.utilityEvidenceFamilies || [],
    components: project.utilityQualityComponents || {},
    warnings: project.utilityResearchWarnings || [],
  };
}
