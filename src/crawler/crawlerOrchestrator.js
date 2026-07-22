import { extractContent } from "./contentExtractor.js";
import {
  canonicalizeUrl,
  classifySeedSource,
  sameRegistrableHost,
  validateUrlSecurity,
} from "./crawlPolicy.js";
import { fetchUrl } from "./httpFetcher.js";
import {
  adaptCrawlerEvidence,
  analyzeExtractedPage,
  deduplicateEvidencePages,
} from "./pageAnalyzer.js";
import { persistCrawlerEvidence, persistCrawlerRun } from "./crawlerStorage.js";

const URL_FIELD_CANDIDATES = [
  "website",
  "websiteUrl",
  "homepage",
  "homepageUrl",
  "officialWebsite",
  "siteUrl",
  "url",
  "docs",
  "docsUrl",
  "documentation",
  "documentationUrl",
  "whitepaper",
  "whitepaperUrl",
  "github",
  "githubRepo",
  "githubUrl",
  "repoUrl",
  "repositoryUrl",
  "sourceCodeUrl",
  "roadmapUrl",
  "announcementsUrl",
  "blogUrl",
];

const URL_OBJECT_PATHS = [
  "links",
  "socials",
  "projectLinks",
  "officialLinks",
  "web",
  "sourceLinks",
  "newsUrls",
  "announcementUrls",
  "crawlerSeeds",
];

function clean(value = "") {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function getPath(object = {}, path = "") {
  return clean(path)
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value && Object.hasOwn(value, part) ? value[part] : undefined), object);
}

function projectKey(project = {}) {
  return (
    project.canonicalProjectId ||
    project.projectId ||
    (project.chain && project.tokenAddress ? `${project.chain}:${project.tokenAddress}` : null) ||
    (project.chain && project.poolAddress ? `${project.chain}:pool:${project.poolAddress}` : null) ||
    `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  );
}

function collectObjectUrls(object = {}, prefix = "") {
  if (!object || typeof object !== "object") return [];
  if (Array.isArray(object)) {
    return object.flatMap((value, index) =>
      typeof value === "string"
        ? [{ value, field: `${prefix}[${index}]` }]
        : collectObjectUrls(value, `${prefix}[${index}]`)
    );
  }
  return Object.entries(object).flatMap(([key, value]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [{ value, field }];
    if (Array.isArray(value) || (value && typeof value === "object")) return collectObjectUrls(value, field);
    return [];
  });
}

function seedTrustAllowed(seed = {}) {
  if (seed.sourceType === "GITHUB") return true;
  if (seed.sourceField?.toLowerCase().includes("twitter") || seed.sourceField?.toLowerCase().includes("discord")) return false;
  if (seed.sourceField?.toLowerCase().includes("telegram")) return false;
  return true;
}

export function buildCrawlSeeds(projects = [], options = {}) {
  const maxProjects = Number(options.maxProjects || process.env.CRAWLER_DISCOVERY_PROJECT_LIMIT || projects.length || 0);
  const maxSeedsPerProject = Number(options.maxSeedsPerProject || process.env.CRAWLER_SEEDS_PER_PROJECT || 6);
  const seeds = [];
  const rejectedSeeds = [];
  const seen = new Set();

  for (const project of (Array.isArray(projects) ? projects : []).slice(0, maxProjects)) {
    const candidates = [];
    for (const field of URL_FIELD_CANDIDATES) {
      const value = getPath(project, field);
      for (const raw of array(value)) candidates.push({ value: raw, field });
    }
    for (const path of URL_OBJECT_PATHS) {
      candidates.push(...collectObjectUrls(getPath(project, path), path));
    }

    const projectSeeds = [];
    for (const candidate of candidates) {
      const canonical = canonicalizeUrl(candidate.value);
      if (!canonical.url) {
        if (candidate.value) {
          rejectedSeeds.push({
            projectKey: projectKey(project),
            symbol: project.symbol || project.name || "UNKNOWN",
            rawUrl: candidate.value,
            sourceField: candidate.field,
            status: canonical.status,
            reason: canonical.reason,
          });
        }
        continue;
      }

      const security = validateUrlSecurity(canonical.url);
      if (!security.allowed) {
        rejectedSeeds.push({
          projectKey: projectKey(project),
          symbol: project.symbol || project.name || "UNKNOWN",
          rawUrl: candidate.value,
          url: canonical.url,
          sourceField: candidate.field,
          status: security.status,
          reason: security.reason,
        });
        continue;
      }

      const seed = {
        projectKey: projectKey(project),
        symbol: project.symbol || project.name || "UNKNOWN",
        projectName: project.name || project.projectName || null,
        chain: project.chain || project.chainId || null,
        rawUrl: candidate.value,
        url: security.url,
        sourceField: candidate.field,
        sourceType: classifySeedSource(security.url, { sourceField: candidate.field }),
        trustStatus: "PIPELINE_PROVIDED_SEED",
      };

      if (!seedTrustAllowed(seed)) {
        rejectedSeeds.push({ ...seed, status: "REJECTED_UNSUPPORTED_SOCIAL_URL", reason: "Social and chat URLs are not crawled." });
        continue;
      }
      if (seen.has(`${seed.projectKey}:${seed.url}`)) continue;
      seen.add(`${seed.projectKey}:${seed.url}`);
      projectSeeds.push(seed);
      if (projectSeeds.length >= maxSeedsPerProject) break;
    }

    seeds.push(...projectSeeds);
  }

  return { seeds, rejectedSeeds };
}

function crawlOptions(options = {}) {
  return {
    maxPages: Number(options.maxPages || process.env.CRAWLER_MAX_PAGES || 50),
    liveFetch: options.liveFetch ?? process.env.CRAWLER_LIVE_FETCH === "true",
    persist: options.persist ?? process.env.CRAWLER_PERSIST === "true",
    fetcher: options.fetcher,
  };
}

async function fetchSeed(seed = {}, options = {}) {
  const fetcher = options.fetcher || fetchUrl;
  return fetcher(seed.url, {
    ...options,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs,
    robotsTextByHost: options.robotsTextByHost,
    loadRobotsTxt: options.loadRobotsTxt,
    lookup: options.lookup,
    fetch: options.fetch,
  });
}

export async function runWebEvidenceCrawler(projects = [], options = {}) {
  const startedAt = Date.now();
  const config = crawlOptions(options);
  const { seeds, rejectedSeeds } = buildCrawlSeeds(projects, options);
  const pages = [];
  const errors = [];

  if (!config.liveFetch && !config.fetcher) {
    const result = {
      generatedAt: new Date().toISOString(),
      mode: "QUEUE_ONLY",
      projectsAnalyzed: Array.isArray(projects) ? projects.length : 0,
      seeds,
      rejectedSeeds,
      pages: [],
      evidence: [],
      duplicates: [],
      errors: [],
      elapsedMs: Date.now() - startedAt,
      warnings: ["Live crawling was not enabled. Trusted URLs were queued and validated only."],
    };
    if (config.persist) persistCrawlerRun(result);
    return result;
  }

  const projectByKey = new Map((Array.isArray(projects) ? projects : []).map((project) => [projectKey(project), project]));
  for (const seed of seeds.slice(0, config.maxPages)) {
    try {
      const fetchResult = await fetchSeed(seed, options);
      const extracted = extractContent(fetchResult, seed.url);
      const project = projectByKey.get(seed.projectKey) || {};
      pages.push(analyzeExtractedPage(project, seed, fetchResult, extracted));

      if (extracted.contentKind === "SITEMAP") {
        const childUrls = (extracted.urls || [])
          .filter((url) => sameRegistrableHost(url, seed.url))
          .slice(0, Number(options.maxSitemapChildUrls || 8));
        for (const childUrl of childUrls) {
          if (pages.length >= config.maxPages) break;
          const childSeed = { ...seed, rawUrl: childUrl, url: childUrl, sourceField: `${seed.sourceField}:sitemap`, sourceType: classifySeedSource(childUrl) };
          const childFetch = await fetchSeed(childSeed, options);
          const childExtracted = extractContent(childFetch, childSeed.url);
          pages.push(analyzeExtractedPage(project, childSeed, childFetch, childExtracted));
        }
      }
    } catch (error) {
      errors.push({ url: seed.url, projectKey: seed.projectKey, error: error.message });
    }
  }

  const deduped = deduplicateEvidencePages(pages);
  const evidenceByProject = new Map();
  for (const page of deduped.unique) {
    const projectPages = evidenceByProject.get(page.projectKey) || [];
    projectPages.push(page);
    evidenceByProject.set(page.projectKey, projectPages);
  }
  const evidence = [...evidenceByProject.entries()].map(([key, projectPages]) =>
    adaptCrawlerEvidence(projectByKey.get(key) || { projectId: key }, projectPages)
  );

  const result = {
    generatedAt: new Date().toISOString(),
    mode: "LIVE_FETCH",
    projectsAnalyzed: Array.isArray(projects) ? projects.length : 0,
    seeds,
    rejectedSeeds,
    pages: deduped.unique,
    evidence,
    duplicates: deduped.duplicates,
    errors,
    elapsedMs: Date.now() - startedAt,
    warnings: [],
  };

  if (config.persist) {
    persistCrawlerRun(result);
    persistCrawlerEvidence(evidence);
  }

  return result;
}
