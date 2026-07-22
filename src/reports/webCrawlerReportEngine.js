import fs from "node:fs";
import path from "node:path";

import { summarizeCrawlerHealth } from "../crawler/crawlerHealth.js";
import { buildCrawlSeeds, runWebEvidenceCrawler } from "../crawler/crawlerOrchestrator.js";

function ensureReportsDir() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function writeJson(fileName = "", payload = {}) {
  const filePath = path.join(ensureReportsDir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function writeMarkdown(fileName = "", health = {}) {
  const lines = [
    "# Web Evidence Crawler Health",
    "",
    `Generated: ${health.generatedAt}`,
    `Status: ${health.status}`,
    `Mode: ${health.crawlMode}`,
    "",
    "## Coverage",
    "",
    `- Projects analyzed: ${health.projectsAnalyzed}`,
    `- Seed URLs discovered: ${health.seedUrlsDiscovered}`,
    `- Seed URLs rejected: ${health.seedUrlsRejected}`,
    `- Pages fetched: ${health.pagesFetched}`,
    `- Evidence records: ${health.evidenceRecords}`,
    `- Duplicate pages: ${health.duplicatePages}`,
    `- Fetch errors: ${health.fetchErrors}`,
    "",
    "## Source Types",
    "",
    ...(health.sourceTypeCoverage || []).map((item) => `- ${item.key}: ${item.count}`),
    "",
    "## Limitations",
    "",
    ...(health.limitations || []).map((limitation) => `- ${limitation}`),
  ];
  const filePath = path.join(ensureReportsDir(), fileName);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  return filePath;
}

export async function buildCrawlerHealthReport(projects = [], meta = {}, options = {}) {
  const crawlResult = await runWebEvidenceCrawler(projects, {
    ...options,
    liveFetch: options.liveFetch ?? false,
    maxProjects: options.maxProjects || process.env.CRAWLER_REPORT_PROJECT_LIMIT || projects.length,
  });
  return summarizeCrawlerHealth(crawlResult, meta);
}

export function writeCrawlerReports(projects = [], meta = {}, options = {}) {
  const crawlResult = options.crawlResult || {
    mode: "QUEUE_ONLY",
    projectsAnalyzed: projects.length,
    ...runWebEvidenceCrawlerSync(projects, options),
  };
  const health = summarizeCrawlerHealth(crawlResult, meta);
  const healthPath = writeJson("crawler-health.json", health);
  const markdownPath = writeMarkdown("crawler-health.md", health);
  return { filePath: healthPath, healthPath, markdownPath, report: health };
}

function runWebEvidenceCrawlerSync(projects = [], options = {}) {
  // Report generation is synchronous today, so normal scans perform trusted URL
  // discovery only. Live crawling remains available through crawler CLI commands.
  return {
    ...buildCrawlSeeds(projects, options),
    pages: [],
    evidence: [],
    duplicates: [],
    errors: [],
    warnings: ["Report writer performed queue-only crawler discovery. Use npm run crawler:url or crawler:discover for controlled live fetches."],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = writeCrawlerReports([], {}, {});
  console.log(JSON.stringify(result.report, null, 2));
}
