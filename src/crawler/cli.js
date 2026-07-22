import fs from "node:fs";
import path from "node:path";

import { writeWebCrawlerPreimplementationAuditReports } from "./crawlerAudit.js";
import { runWebEvidenceCrawler } from "./crawlerOrchestrator.js";
import { fetchUrl } from "./httpFetcher.js";
import { extractContent } from "./contentExtractor.js";
import { analyzeExtractedPage } from "./pageAnalyzer.js";
import { writeCrawlerReports } from "../reports/webCrawlerReportEngine.js";

function arg(name = "", fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? true;
}

function mode() {
  return arg("mode", process.argv[2]?.startsWith("--") ? "health" : process.argv[2] || "health");
}

function readProjectsFromReport() {
  const filePath = path.resolve("reports", "report.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function selectedProjects() {
  const projects = readProjectsFromReport();
  const symbol = arg("symbol", null);
  if (!symbol) return projects;
  const lowered = String(symbol).toLowerCase();
  return projects.filter((project) => String(project.symbol || project.name || "").toLowerCase() === lowered);
}

async function runUrlMode() {
  const url = arg("url", null);
  if (!url) {
    throw new Error("crawler:url requires --url https://example.com");
  }
  const fetchResult = await fetchUrl(url, {
    respectRobots: arg("respect-robots", "true") !== "false",
    robotsText: arg("robots-text", ""),
  });
  const extracted = extractContent(fetchResult, url);
  const evidencePage = analyzeExtractedPage({}, { url, rawUrl: url, sourceField: "cli:url" }, fetchResult, extracted);
  return { fetchResult, extracted, evidencePage };
}

async function main() {
  const selectedMode = mode();
  if (selectedMode === "audit") {
    const result = writeWebCrawlerPreimplementationAuditReports();
    console.log(JSON.stringify(result.report, null, 2));
    return;
  }

  if (selectedMode === "url") {
    const result = await runUrlMode();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (selectedMode === "discover" || selectedMode === "project" || selectedMode === "validate") {
    const projects = selectedMode === "validate" ? [] : selectedProjects();
    const liveFetch = arg("live", "false") === "true";
    const result = await runWebEvidenceCrawler(projects, {
      liveFetch,
      persist: arg("persist", "false") === "true",
      maxProjects: Number(arg("max-projects", process.env.CRAWLER_DISCOVERY_PROJECT_LIMIT || projects.length || 0)),
      maxPages: Number(arg("max-pages", process.env.CRAWLER_MAX_PAGES || 25)),
    });
    const report = writeCrawlerReports(projects, {}, { crawlResult: result });
    console.log(JSON.stringify(report.report, null, 2));
    return;
  }

  const report = writeCrawlerReports(readProjectsFromReport());
  console.log(JSON.stringify(report.report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
