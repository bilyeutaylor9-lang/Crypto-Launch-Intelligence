import { lookup as dnsLookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";

import {
  CRAWLER_USER_AGENT,
  canonicalizeUrl,
  robotsDecisionFor,
  validateUrlSecurity,
} from "./crawlPolicy.js";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 750_000;
const DEFAULT_MAX_REDIRECTS = 5;

const ACCEPTED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/json",
];

function contentTypeAllowed(contentType = "") {
  const lowered = String(contentType || "").toLowerCase();
  if (!lowered) return true;
  return ACCEPTED_CONTENT_TYPES.some((type) => lowered.includes(type));
}

function responseHeader(response = {}, key = "") {
  if (!response.headers?.get) return null;
  return response.headers.get(key);
}

async function resolveHost(hostname = "", options = {}) {
  const lookup = options.lookup || dnsLookup;
  const results = await lookup(hostname, { all: true });
  return (Array.isArray(results) ? results : [results])
    .map((item) => item?.address || item)
    .filter(Boolean);
}

async function loadRobotsText(url = "", options = {}) {
  if (typeof options.robotsText === "string") return options.robotsText;
  if (typeof options.loadRobotsTxt === "function") return options.loadRobotsTxt(url);
  if (options.robotsTextByHost) {
    const host = new URL(url).hostname.toLowerCase();
    if (Object.hasOwn(options.robotsTextByHost, host)) return options.robotsTextByHost[host];
  }
  return null;
}

function buildFailure(status, url, reason, startedAt, extra = {}) {
  return {
    fetchStatus: status,
    url,
    finalUrl: url,
    fetchedAt: new Date().toISOString(),
    httpStatus: null,
    contentType: null,
    body: "",
    byteLength: 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    errors: reason ? [reason] : [],
    ...extra,
  };
}

export async function fetchUrl(rawUrl = "", options = {}) {
  const startedAt = performance.now();
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return buildFailure("FETCH_UNAVAILABLE", rawUrl, "No fetch implementation is available.", startedAt);
  }

  const maxRedirects = Number(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS);
  const timeoutMs = Number(options.timeoutMs ?? process.env.CRAWLER_FETCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Number(options.maxBytes ?? process.env.CRAWLER_MAX_BYTES ?? DEFAULT_MAX_BYTES);
  const respectRobots = options.respectRobots !== false;
  let current = canonicalizeUrl(rawUrl, options).url;
  const redirectChain = [];

  if (!current) {
    return buildFailure("INVALID_URL", rawUrl, "URL could not be canonicalized.", startedAt);
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const parsed = new URL(current);
    let resolvedAddresses = [];
    try {
      resolvedAddresses = await resolveHost(parsed.hostname, options);
    } catch (error) {
      return buildFailure("DNS_LOOKUP_FAILED", current, error.message, startedAt, { redirectChain });
    }

    const security = validateUrlSecurity(current, { resolvedAddresses });
    if (!security.allowed) {
      return buildFailure(security.status, current, security.reason, startedAt, { redirectChain });
    }
    current = security.url;

    if (respectRobots) {
      const robotsText = await loadRobotsText(current, options);
      const decision = robotsDecisionFor(current, robotsText || "", options.userAgent || CRAWLER_USER_AGENT);
      if (!decision.allowed) {
        return buildFailure(decision.status, current, decision.reason, startedAt, {
          robots: decision,
          redirectChain,
        });
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: ACCEPTED_CONTENT_TYPES.join(","),
          "user-agent": options.userAgent || CRAWLER_USER_AGENT,
        },
      });
    } catch (error) {
      clearTimeout(timer);
      const status = error?.name === "AbortError" ? "FETCH_TIMEOUT" : "FETCH_FAILED";
      return buildFailure(status, current, error.message, startedAt, { redirectChain });
    } finally {
      clearTimeout(timer);
    }

    const httpStatus = Number(response.status || 0);
    const location = responseHeader(response, "location");
    if (httpStatus >= 300 && httpStatus < 400 && location) {
      const next = canonicalizeUrl(location, { baseUrl: current }).url;
      redirectChain.push({ from: current, to: next, status: httpStatus });
      if (!next) return buildFailure("INVALID_REDIRECT", current, "Redirect target is invalid.", startedAt, { redirectChain });
      current = next;
      continue;
    }

    const contentType = responseHeader(response, "content-type") || "";
    const contentLength = Number(responseHeader(response, "content-length") || 0);
    if (!contentTypeAllowed(contentType)) {
      return buildFailure("UNSUPPORTED_CONTENT_TYPE", current, `Unsupported content type: ${contentType}`, startedAt, {
        httpStatus,
        contentType,
        redirectChain,
      });
    }
    if (contentLength > maxBytes) {
      return buildFailure("FETCH_TOO_LARGE", current, `Content-Length exceeds ${maxBytes} bytes.`, startedAt, {
        httpStatus,
        contentType,
        byteLength: contentLength,
        redirectChain,
      });
    }

    const body = await response.text();
    const byteLength = Buffer.byteLength(body, "utf8");
    if (byteLength > maxBytes) {
      return buildFailure("FETCH_TOO_LARGE", current, `Fetched body exceeds ${maxBytes} bytes.`, startedAt, {
        httpStatus,
        contentType,
        byteLength,
        redirectChain,
      });
    }

    return {
      fetchStatus: httpStatus >= 200 && httpStatus < 300 ? "FETCHED" : "HTTP_ERROR",
      url: rawUrl,
      finalUrl: current,
      fetchedAt: new Date().toISOString(),
      httpStatus,
      contentType,
      body,
      byteLength,
      elapsedMs: Math.round(performance.now() - startedAt),
      errors: httpStatus >= 200 && httpStatus < 300 ? [] : [`HTTP status ${httpStatus}`],
      redirectChain,
      resolvedAddresses,
    };
  }

  return buildFailure("REDIRECT_LIMIT_EXCEEDED", current, `More than ${maxRedirects} redirects.`, startedAt, {
    redirectChain,
  });
}
