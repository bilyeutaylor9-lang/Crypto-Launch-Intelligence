import fs from "node:fs";
import path from "node:path";

const REPORTS_DIR = path.resolve("reports");

const AUDITED_COMPONENTS = [
  { area: "discovery", path: "src/discoveryManager.js", purpose: "public-source candidate discovery and source telemetry" },
  { area: "research", path: "src/data/internetResearchConnector.js", purpose: "legacy RSS/news/project page research connector" },
  { area: "identity", path: "src/identity/strictIdentityValidators.js", purpose: "chain-aware address and chain validation" },
  { area: "aliasing", path: "src/data/canonicalAliasResolver.js", purpose: "semantic field normalization and provenance" },
  { area: "reports", path: "src/reports/reportOrchestrator.js", purpose: "report generation pipeline" },
  { area: "reports", path: "src/reports/reportContractValidator.js", purpose: "required report contract validation" },
  { area: "crawler", path: "src/crawler/crawlPolicy.js", purpose: "crawler URL, SSRF, robots, and fingerprint policy" },
  { area: "crawler", path: "src/crawler/httpFetcher.js", purpose: "safe HTTP fetcher with redirects and size limits" },
  { area: "crawler", path: "src/crawler/contentExtractor.js", purpose: "HTML/feed/sitemap/text extraction" },
  { area: "crawler", path: "src/crawler/pageAnalyzer.js", purpose: "crypto entity, claim, and evidence extraction" },
  { area: "crawler", path: "src/crawler/crawlerOrchestrator.js", purpose: "trusted-seed queue and bounded live crawl execution" },
  { area: "crawler", path: "src/reports/webCrawlerReportEngine.js", purpose: "crawler health and markdown reporting" },
];

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function exists(filePath = "") {
  return fs.existsSync(path.resolve(filePath));
}

function writeJson(fileName = "", payload = {}) {
  ensureReportsDir();
  const filePath = path.join(REPORTS_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function writeMarkdown(fileName = "", report = {}) {
  ensureReportsDir();
  const lines = [
    "# Web Crawler Preimplementation Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Scope",
    "",
    "This crawler is intentionally bounded to trusted project URLs already discovered by the scanner. It does not perform unrestricted internet-wide crawling, bypass robots, bypass paywalls, or crawl wallet/login/private pages.",
    "",
    "## Components",
    "",
    ...report.components.map(
      (component) => `- ${component.status}: ${component.path} (${component.purpose})`
    ),
    "",
    "## Findings",
    "",
    ...report.findings.map((finding) => `- ${finding}`),
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
  ];
  const filePath = path.join(REPORTS_DIR, fileName);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  return filePath;
}

export function createWebCrawlerPreimplementationAudit() {
  const components = AUDITED_COMPONENTS.map((component) => ({
    ...component,
    status: exists(component.path) ? "PRESENT" : "MISSING",
  }));
  const missing = components.filter((component) => component.status === "MISSING");

  return {
    generatedAt: new Date().toISOString(),
    status: missing.length ? "IMPLEMENTATION_GAPS_FOUND" : "READY_FOR_VALIDATION",
    auditName: "web-crawler-preimplementation-audit",
    components,
    findings: [
      "The existing project already has strict identity validation and semantic alias provenance; the crawler should feed those systems rather than bypass them.",
      "The legacy internet research connector crawls project pages, but it does not provide a standalone crawler health contract or full URL/robots/SSRF audit trail.",
      "Normal scans should queue trusted crawl targets and reserve live fetching for explicit crawler commands or controlled test fetchers.",
      "Crawler evidence must remain separate from recommendations and must never force a qualified pick.",
    ],
    limitations: [
      "This audit does not perform live internet crawling.",
      "GitHub API enrichment depends on public availability and optional credentials; missing API access must remain explicit.",
      "Robots, private-network, content-type, size, and auth-route blocks intentionally reduce coverage to protect the scanner.",
    ],
  };
}

export function writeWebCrawlerPreimplementationAuditReports() {
  const report = createWebCrawlerPreimplementationAudit();
  const jsonPath = writeJson("web-crawler-preimplementation-audit.json", report);
  const markdownPath = writeMarkdown("web-crawler-preimplementation-audit.md", report);
  return { jsonPath, markdownPath, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = writeWebCrawlerPreimplementationAuditReports();
  console.log(JSON.stringify(result.report, null, 2));
}
