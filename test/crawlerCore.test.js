import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canonicalizeUrl,
  fingerprintText,
  isPrivateIp,
  robotsDecisionFor,
  validateUrlSecurity,
} from "../src/crawler/crawlPolicy.js";
import { fetchUrl } from "../src/crawler/httpFetcher.js";
import {
  extractContent,
  extractHtmlContent,
  parseFeedXml,
  parseSitemapXml,
} from "../src/crawler/contentExtractor.js";
import {
  adaptCrawlerEvidence,
  analyzeExtractedPage,
  deduplicateEvidencePages,
  extractClaims,
  extractEntities,
} from "../src/crawler/pageAnalyzer.js";
import { buildCrawlSeeds, runWebEvidenceCrawler } from "../src/crawler/crawlerOrchestrator.js";
import { writeCrawlerReports } from "../src/reports/webCrawlerReportEngine.js";
import { writeWebCrawlerPreimplementationAuditReports } from "../src/crawler/crawlerAudit.js";

const EVM = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

function fakeResponse({ status = 200, headers = {}, body = "" } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    status,
    headers: {
      get(key) {
        return normalizedHeaders[String(key).toLowerCase()] || null;
      },
    },
    async text() {
      return body;
    },
  };
}

test("crawler canonicalizes URLs without tracking noise", () => {
  const result = canonicalizeUrl("HTTPS://Example.com/docs/?utm_source=x&b=2&a=1#section");
  assert.equal(result.status, "VALID_URL");
  assert.equal(result.url, "https://example.com/docs?a=1&b=2");
});

test("crawler security rejects unsafe hosts, private IPs, credentials, and auth traps", () => {
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(validateUrlSecurity("http://localhost/roadmap").allowed, false);
  assert.equal(validateUrlSecurity("https://user:pass@example.com").status, "REJECTED_CREDENTIAL_URL");
  assert.equal(validateUrlSecurity("https://example.com/login").status, "REJECTED_PATH");
  assert.equal(
    validateUrlSecurity("https://example.com/roadmap", { resolvedAddresses: ["192.168.1.10"] }).status,
    "REJECTED_PRIVATE_IP"
  );
});

test("robots policy blocks disallowed paths and is conservative when unavailable", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/press";
  assert.equal(robotsDecisionFor("https://example.com/private/wallet", robots).allowed, false);
  assert.equal(robotsDecisionFor("https://example.com/private/press", robots).allowed, true);
  assert.equal(robotsDecisionFor("https://example.com/docs", "").status, "ROBOTS_UNAVAILABLE");
});

test("fetcher validates redirects and content limits with a mocked network", async () => {
  const redirectingFetch = async (url) => {
    if (url === "https://safe.example/start") {
      return fakeResponse({ status: 302, headers: { location: "http://127.0.0.1/admin" } });
    }
    return fakeResponse({ status: 200, headers: { "content-type": "text/html" }, body: "<html>ok</html>" });
  };
  const redirected = await fetchUrl("https://safe.example/start", {
    fetch: redirectingFetch,
    lookup: async (host) => [{ address: host === "safe.example" ? "93.184.216.34" : "127.0.0.1" }],
    respectRobots: false,
  });
  assert.equal(redirected.status || redirected.fetchStatus, "REJECTED_UNSAFE_HOST");

  const tooLarge = await fetchUrl("https://safe.example/large", {
    fetch: async () =>
      fakeResponse({
        status: 200,
        headers: { "content-type": "text/html", "content-length": "9999" },
        body: "large",
      }),
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsText: "User-agent: *\nAllow: /",
    maxBytes: 100,
  });
  assert.equal(tooLarge.fetchStatus, "FETCH_TOO_LARGE");
});

test("content extractor handles HTML, feeds, sitemaps, and unsafe XML", () => {
  const html = extractHtmlContent(
    `<html><head><title>AKE Roadmap</title><meta name="description" content="Mainnet launch Q3 2026"></head><body><h1>Roadmap</h1><a href="/docs">Docs</a><script>bad()</script>Token contract ${EVM}</body></html>`,
    "https://ake.example"
  );
  assert.equal(html.title, "AKE Roadmap");
  assert.equal(html.links[0].url, "https://ake.example/docs");
  assert.ok(html.text.includes(EVM));

  const feed = parseFeedXml("<rss><channel><item><title>Mainnet</title><link>https://ake.example/news</link></item></channel></rss>");
  assert.equal(feed.items[0].title, "Mainnet");

  const sitemap = parseSitemapXml("<urlset><url><loc>https://ake.example/roadmap</loc></url></urlset>");
  assert.deepEqual(sitemap.urls, ["https://ake.example/roadmap"]);
  assert.equal(parseSitemapXml("<!DOCTYPE foo><urlset></urlset>").extractionStatus, "XML_REJECTED_EXTERNAL_ENTITY");

  const fetched = extractContent({
    fetchStatus: "FETCHED",
    finalUrl: "https://ake.example/feed",
    contentType: "application/rss+xml",
    body: "<feed><entry><title>Launch</title><link href=\"https://ake.example/launch\" /></entry></feed>",
  });
  assert.equal(fetched.contentKind, "FEED");
});

test("analyzer extracts contextual addresses and claims without symbol-only evidence", () => {
  const extracted = extractHtmlContent(
    `<title>AKE Docs</title><p>Token contract ${EVM}. Pool address ${POOL}. Mainnet launch on 2026-08-01. Coinbase listing rumor may be fake.</p>`,
    "https://ake.example/docs"
  );
  const entities = extractEntities(extracted, { symbol: "AKE", chain: "base" });
  const claims = extractClaims(extracted, { sourceType: "DOCS_WEBSITE" });

  assert.equal(entities.tokenAddresses[0].address, EVM.toLowerCase());
  assert.equal(entities.poolAddresses[0].address, POOL.toLowerCase());
  assert.ok(claims.some((claim) => claim.claimType === "CATALYST"));
  assert.ok(claims.some((claim) => ["UNVERIFIED_LANGUAGE", "NEGATED_OR_CANCELLED"].includes(claim.claimStatus)));
});

test("crawler builds trusted seed queues and rejects unsafe/social seeds", () => {
  const { seeds, rejectedSeeds } = buildCrawlSeeds([
    {
      name: "Akedo",
      symbol: "AKE",
      chain: "base",
      website: "https://ake.example/?utm_campaign=noise",
      docsUrl: "https://docs.ake.example",
      twitterHandle: "https://x.com/ake",
      links: { login: "https://ake.example/login", github: "https://github.com/ake/protocol" },
    },
  ]);

  assert.equal(seeds.some((seed) => seed.sourceType === "OFFICIAL_WEBSITE"), true);
  assert.equal(seeds.some((seed) => seed.sourceType === "DOCS_WEBSITE"), true);
  assert.equal(seeds.some((seed) => seed.sourceType === "GITHUB"), true);
  assert.equal(rejectedSeeds.some((seed) => seed.status === "REJECTED_PATH"), true);
});

test("crawler live mode uses supplied fetcher, deduplicates pages, and adapts evidence", async () => {
  const body = `<html><head><title>AKE Roadmap</title></head><body>AKE roadmap. Token contract ${EVM}. Mainnet launch 2026-09-01.</body></html>`;
  const result = await runWebEvidenceCrawler(
    [{ name: "Akedo", symbol: "AKE", chain: "base", website: "https://ake.example" }],
    {
      liveFetch: true,
      maxPages: 5,
      fetcher: async (url) => ({
        fetchStatus: "FETCHED",
        url,
        finalUrl: url,
        fetchedAt: "2026-07-22T00:00:00.000Z",
        httpStatus: 200,
        contentType: "text/html",
        body,
        errors: [],
        redirectChain: [],
      }),
    }
  );

  assert.equal(result.pages.length, 1);
  assert.equal(result.evidence[0].evidenceStatus, "EVIDENCE_OBSERVED");
  assert.equal(result.evidence[0].catalystEvidenceCount > 0, true);

  const dupes = deduplicateEvidencePages([
    analyzeExtractedPage({}, { url: "https://a.example" }, result.pages[0], extractHtmlContent(body, "https://a.example")),
    analyzeExtractedPage({}, { url: "https://b.example" }, result.pages[0], extractHtmlContent(body, "https://b.example")),
  ]);
  assert.equal(dupes.duplicates.length, 1);
  assert.equal(fingerprintText("Same text"), fingerprintText(" same   text "));

  const adapted = adaptCrawlerEvidence({ symbol: "AKE" }, result.pages);
  assert.equal(adapted.independentSourceUrls.length, 1);
});

test("crawler reports and audit reports write non-empty contracts", () => {
  const report = writeCrawlerReports([
    { symbol: "AKE", chain: "base", website: "https://ake.example", docsUrl: "https://docs.ake.example" },
  ]);
  const audit = writeWebCrawlerPreimplementationAuditReports();

  assert.equal(fs.existsSync(report.healthPath), true);
  assert.equal(fs.existsSync(report.markdownPath), true);
  assert.equal(report.report.seedUrlsDiscovered >= 2, true);
  assert.equal(fs.existsSync(audit.jsonPath), true);
  assert.equal(fs.existsSync(audit.markdownPath), true);

  const health = JSON.parse(fs.readFileSync(path.resolve("reports", "crawler-health.json"), "utf8"));
  assert.equal(health.status, "QUEUE_ONLY");
  assert.equal(health.evidenceCollectionStatus, "NO_EVIDENCE_COLLECTED");
  assert.equal(Array.isArray(health.limitations), true);
});
