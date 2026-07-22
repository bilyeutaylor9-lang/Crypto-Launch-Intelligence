import {
  isValidEvmAddress,
  isValidSolanaAddress,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { classifySeedSource, fingerprintText } from "./crawlPolicy.js";

const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;
const SOLANA_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const DATE_RE =
  /\b(?:20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}|q[1-4]\s+20\d{2})\b/gi;

const CLAIM_PATTERNS = [
  { type: "ROADMAP", terms: ["roadmap", "milestone", "timeline", "release plan", "future plan"] },
  { type: "CATALYST", terms: ["launch", "mainnet", "testnet", "tge", "airdrop", "upgrade", "integration"] },
  { type: "EXCHANGE_LISTING", terms: ["listing", "trading pair", "deposits open", "trading begins"] },
  { type: "TOKENOMICS", terms: ["tokenomics", "supply", "vesting", "unlock", "emission", "burn"] },
  { type: "SECURITY", terms: ["audit", "verified contract", "sourcify", "bug bounty", "renounced"] },
  { type: "PARTNERSHIP", terms: ["partnership", "partnered", "collaboration", "integration announced"] },
  { type: "RISK", terms: ["hack", "exploit", "rug", "scam", "halted", "suspended", "delisted"] },
];

const UNCERTAIN_TERMS = ["rumor", "may", "could", "expected", "speculation", "unconfirmed", "likely"];
const NEGATION_TERMS = ["cancelled", "canceled", "delayed", "postponed", "denied", "not official", "fake"];

function clean(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function sentences(text = "") {
  return clean(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => clean(sentence))
    .filter((sentence) => sentence.length >= 24)
    .slice(0, 160);
}

function containsTerm(text = "", terms = []) {
  const lowered = lower(text);
  return terms.some((term) => lowered.includes(term));
}

function projectIdentityTerms(project = {}) {
  return [project.name, project.symbol, project.projectName]
    .filter(Boolean)
    .map((value) => lower(value))
    .filter((value) => value.length >= 2);
}

function sourceConfidence(sourceType = "", project = {}) {
  if (sourceType === "OFFICIAL_WEBSITE" || sourceType === "DOCS_WEBSITE") return 0.74;
  if (sourceType === "GITHUB") return 0.7;
  if (sourceType === "RSS" || sourceType === "NEWS_OR_ANNOUNCEMENT") return 0.58;
  if (project.sourceTruthScore) return Math.min(0.85, Number(project.sourceTruthScore) / 100);
  return 0.5;
}

export function classifyPage(url = "", extracted = {}, project = {}) {
  const sourceType = classifySeedSource(url);
  const text = lower(`${extracted.title || ""} ${extracted.description || ""} ${extracted.text || ""}`);
  let pageClass = sourceType;
  if (text.includes("roadmap") || text.includes("milestone")) pageClass = "ROADMAP_PAGE";
  else if (text.includes("tokenomics") || text.includes("vesting")) pageClass = "TOKENOMICS_PAGE";
  else if (text.includes("audit") || text.includes("security")) pageClass = "SECURITY_PAGE";
  else if (extracted.contentKind === "FEED") pageClass = "FEED";
  else if (extracted.contentKind === "SITEMAP") pageClass = "SITEMAP";

  const terms = projectIdentityTerms(project);
  const projectMentioned = terms.length ? terms.some((term) => text.includes(term)) : null;

  return {
    sourceType,
    pageClass,
    projectMentioned,
    sourceConfidence: sourceConfidence(sourceType, project),
  };
}

function contextForAddress(text = "", address = "") {
  const index = text.indexOf(address);
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 90), Math.min(text.length, index + address.length + 90));
}

function addressRoleFromContext(context = "", raw = "") {
  const lowered = lower(context);
  const before = lowered.slice(0, Math.max(0, lowered.indexOf(lower(raw))));
  const tokenIndex = Math.max(
    before.lastIndexOf("contract"),
    before.lastIndexOf("token"),
    before.lastIndexOf("ca:"),
    before.lastIndexOf("mint")
  );
  const poolIndex = Math.max(
    before.lastIndexOf("pair"),
    before.lastIndexOf("pool"),
    before.lastIndexOf(" lp "),
    before.lastIndexOf("amm"),
    before.lastIndexOf("market")
  );
  if (poolIndex > tokenIndex) return "pool";
  if (tokenIndex >= 0) return "token";
  if (/\b(pair|pool|lp|amm|market)\b/.test(lowered)) return "pool";
  if (/\b(contract|token|address|ca:|mint)\b/.test(lowered)) return "token";
  return "unknown";
}

export function extractEntities(extracted = {}, project = {}) {
  const chain = normalizeChainId(project.chain || project.chainId || project.network);
  const text = `${extracted.title || ""} ${extracted.description || ""} ${extracted.text || ""}`;
  const lowered = lower(text);
  const chains = ["ethereum", "base", "bsc", "arbitrum", "polygon", "optimism", "avalanche", "solana", "sui", "ton"]
    .filter((candidate) => lowered.includes(candidate))
    .map((candidate) => normalizeChainId(candidate))
    .filter(Boolean);
  const tokenAddresses = [];
  const poolAddresses = [];

  for (const match of text.matchAll(EVM_ADDRESS_RE)) {
    const raw = match[0];
    const context = contextForAddress(text, raw);
    const role = addressRoleFromContext(context, raw);
    if (!isValidEvmAddress(raw)) continue;
    if (role === "pool") {
      const normalized = normalizePoolAddress(raw, chain || "ethereum");
      if (normalized) poolAddresses.push({ address: normalized, raw, context: lower(context).slice(0, 180) });
    } else if (role === "token") {
      const normalized = normalizeTokenAddress(raw, chain || "ethereum");
      if (normalized) tokenAddresses.push({ address: normalized, raw, context: lower(context).slice(0, 180) });
    }
  }

  for (const match of text.matchAll(SOLANA_ADDRESS_RE)) {
    const raw = match[0];
    const context = contextForAddress(text, raw);
    const role = addressRoleFromContext(context, raw);
    if (!isValidSolanaAddress(raw)) continue;
    if (role === "unknown") continue;
    const target = role === "pool" ? poolAddresses : tokenAddresses;
    const normalized =
      target === poolAddresses ? normalizePoolAddress(raw, "solana") : normalizeTokenAddress(raw, "solana");
    if (normalized) target.push({ address: normalized, raw, context: lower(context).slice(0, 180) });
  }

  return {
    chains: [...new Set([chain, ...chains].filter(Boolean))],
    tokenAddresses: dedupeByAddress(tokenAddresses),
    poolAddresses: dedupeByAddress(poolAddresses),
    identityLinkedBy: tokenAddresses.length || poolAddresses.length ? "CHAIN_ADDRESS_CONTEXT" : "TEXT_ONLY",
  };
}

function dedupeByAddress(values = []) {
  const seen = new Set();
  return values.filter((item) => {
    if (seen.has(item.address)) return false;
    seen.add(item.address);
    return true;
  });
}

export function extractClaims(extracted = {}, pageClassification = {}) {
  const claimSentences = sentences(`${extracted.title || ""}. ${extracted.description || ""}. ${extracted.text || ""}`);
  const claims = [];

  for (const sentence of claimSentences) {
    for (const pattern of CLAIM_PATTERNS) {
      if (!containsTerm(sentence, pattern.terms)) continue;
      const lowered = lower(sentence);
      const claimStatus = NEGATION_TERMS.some((term) => lowered.includes(term))
        ? "NEGATED_OR_CANCELLED"
        : UNCERTAIN_TERMS.some((term) => lowered.includes(term))
        ? "UNVERIFIED_LANGUAGE"
        : pageClassification.sourceType === "OFFICIAL_WEBSITE" || pageClassification.sourceType === "DOCS_WEBSITE"
        ? "OFFICIAL_CLAIM"
        : "OBSERVED_CLAIM";
      claims.push({
        claimType: pattern.type,
        claimStatus,
        text: sentence.slice(0, 420),
        datesMentioned: [...sentence.matchAll(DATE_RE)].map((match) => match[0]).slice(0, 4),
        sourceClass: pageClassification.sourceType || "UNKNOWN_URL",
      });
      break;
    }
  }

  return claims.slice(0, 30);
}

export function analyzeExtractedPage(project = {}, seed = {}, fetchResult = {}, extracted = {}) {
  const classification = classifyPage(fetchResult.finalUrl || seed.url, extracted, project);
  const entities = extractEntities(extracted, project);
  const claims = extractClaims(extracted, classification);
  const text = `${extracted.title || ""} ${extracted.description || ""} ${extracted.text || ""}`;
  const contentHash = extracted.contentHash || fingerprintText(text);

  return {
    projectKey: seed.projectKey || null,
    symbol: project.symbol || project.name || "UNKNOWN",
    url: fetchResult.finalUrl || seed.url,
    requestedUrl: seed.url || fetchResult.url || null,
    sourceField: seed.sourceField || null,
    sourceType: classification.sourceType,
    pageClass: classification.pageClass,
    fetchedAt: fetchResult.fetchedAt || null,
    sourceTimestamp: fetchResult.fetchedAt || null,
    fetchStatus: fetchResult.fetchStatus || "NOT_FETCHED",
    extractionStatus: extracted.extractionStatus || "NOT_EXTRACTED",
    evidenceStatus:
      fetchResult.fetchStatus === "FETCHED" && extracted.extractionStatus === "EXTRACTED"
        ? "EVIDENCE_OBSERVED"
        : "NO_EVIDENCE",
    sourceConfidence: classification.sourceConfidence,
    projectMentioned: classification.projectMentioned,
    title: extracted.title || "",
    description: extracted.description || "",
    contentHash,
    entities,
    claims,
    errors: [...(fetchResult.errors || []), ...(extracted.errors || [])],
    lineage: {
      originalUrl: seed.rawUrl || fetchResult.url || null,
      canonicalUrl: seed.url || fetchResult.finalUrl || null,
      redirectChain: fetchResult.redirectChain || [],
      sourceField: seed.sourceField || null,
      robotsStatus: fetchResult.robots?.status || null,
    },
  };
}

export function deduplicateEvidencePages(pages = []) {
  const seen = new Set();
  const duplicates = [];
  const unique = [];

  for (const page of pages) {
    const key = page.contentHash || fingerprintText(`${page.title || ""} ${page.description || ""}`);
    if (seen.has(key)) {
      duplicates.push({ url: page.url, duplicateOfHash: key });
      continue;
    }
    seen.add(key);
    unique.push(page);
  }

  return { unique, duplicates };
}

export function adaptCrawlerEvidence(project = {}, pages = []) {
  const claims = pages.flatMap((page) => page.claims || []);
  const entities = pages.flatMap((page) => [
    ...(page.entities?.tokenAddresses || []).map((entity) => ({ ...entity, type: "tokenAddress", sourceUrl: page.url })),
    ...(page.entities?.poolAddresses || []).map((entity) => ({ ...entity, type: "poolAddress", sourceUrl: page.url })),
  ]);
  const independentSourceUrls = [...new Set(pages.map((page) => page.url).filter(Boolean))];
  const catalystClaims = claims.filter((claim) => ["CATALYST", "ROADMAP", "EXCHANGE_LISTING"].includes(claim.claimType));
  const riskClaims = claims.filter((claim) => claim.claimType === "RISK" || claim.claimStatus === "NEGATED_OR_CANCELLED");

  return {
    source: "web-evidence-crawler",
    evidenceStatus: pages.length ? "EVIDENCE_OBSERVED" : "NO_EVIDENCE",
    evidenceCount: pages.length,
    independentSourceUrls,
    claims,
    entities,
    catalystEvidenceCount: catalystClaims.length,
    riskEvidenceCount: riskClaims.length,
    qualityWarnings: riskClaims.map((claim) => claim.text).slice(0, 8),
    provenance: pages.map((page) => ({
      url: page.url,
      sourceType: page.sourceType,
      sourceTimestamp: page.sourceTimestamp,
      evidenceStatus: page.evidenceStatus,
      sourceConfidence: page.sourceConfidence,
    })),
    projectKey: project.canonicalProjectId || project.projectId || `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`,
  };
}
