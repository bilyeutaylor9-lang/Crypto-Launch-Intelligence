function countBy(items = [], getter = () => "unknown") {
  return items.reduce((acc, item) => {
    const key = getter(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function entries(map = {}) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeCrawlerHealth(crawlResult = {}, options = {}) {
  const seeds = crawlResult.seeds || [];
  const fetchedPages = crawlResult.pages || [];
  const evidence = crawlResult.evidence || [];
  const rejectedSeeds = crawlResult.rejectedSeeds || [];
  const duplicates = crawlResult.duplicates || [];
  const errors = [
    ...(crawlResult.errors || []),
    ...fetchedPages.flatMap((page) => page.errors || []).map((error) => ({ error })),
  ];
  const mode = crawlResult.mode || "QUEUE_ONLY";
  const status = errors.length
    ? fetchedPages.length || seeds.length
      ? "DEGRADED"
      : "FAILED"
    : "PASS";

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: options.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: options.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: options.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: crawlResult.projectsAnalyzed || 0,
    status,
    crawlMode: mode,
    warnings: crawlResult.warnings || [],
    limitations: [
      "Normal scans build a trusted crawl queue and health report; live fetches only run through explicit crawler commands or a supplied fetcher.",
      "Crawler evidence is research context, not a trade recommendation.",
      "Robots, SSRF protection, content-type limits, and payload-size limits can intentionally block otherwise reachable pages.",
    ],
    sampleSize: crawlResult.projectsAnalyzed || 0,
    seedUrlsDiscovered: seeds.length,
    seedUrlsRejected: rejectedSeeds.length,
    pagesFetched: fetchedPages.length,
    evidenceRecords: evidence.length,
    duplicatePages: duplicates.length,
    fetchErrors: errors.length,
    sourceTypeCoverage: entries(countBy(seeds, (seed) => seed.sourceType)),
    rejectionReasons: entries(countBy(rejectedSeeds, (seed) => seed.reason || seed.status)),
    fetchStatuses: entries(countBy(fetchedPages, (page) => page.fetchStatus)),
    extractionStatuses: entries(countBy(fetchedPages, (page) => page.extractionStatus)),
    claimTypes: entries(countBy(evidence.flatMap((item) => item.claims || []), (claim) => claim.claimType)),
    entityEvidence: {
      tokenAddresses: evidence.reduce((sum, item) => sum + (item.entities || []).filter((entity) => entity.type === "tokenAddress").length, 0),
      poolAddresses: evidence.reduce((sum, item) => sum + (item.entities || []).filter((entity) => entity.type === "poolAddress").length, 0),
    },
    topSeedProjects: seeds.slice(0, 25).map((seed) => ({
      projectKey: seed.projectKey,
      symbol: seed.symbol,
      sourceType: seed.sourceType,
      sourceField: seed.sourceField,
      url: seed.url,
    })),
    topEvidence: evidence.slice(0, 25).map((item) => ({
      projectKey: item.projectKey,
      evidenceStatus: item.evidenceStatus,
      evidenceCount: item.evidenceCount,
      catalystEvidenceCount: item.catalystEvidenceCount,
      riskEvidenceCount: item.riskEvidenceCount,
      independentSourceUrls: item.independentSourceUrls,
    })),
    errors: errors.slice(0, 50),
  };
}
