import crypto from "node:crypto";
import net from "node:net";

export const CRAWLER_USER_AGENT = "CryptoLaunchIntelligenceResearchBot/1.0";

const TRACKING_QUERY_PREFIXES = ["utm_"];
const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
]);

const REJECTED_PATH_PATTERNS = [
  /\/(?:admin|login|logout|sign-in|signin|signup|register)(?:\/|$)/i,
  /\/(?:account|profile|settings|session|checkout|cart)(?:\/|$)/i,
  /\/(?:calendar|ical|ics|events\/export)(?:\/|$)/i,
  /\/(?:wp-admin|wp-login\.php)(?:\/|$)/i,
];

const UNSAFE_HOSTS = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "169.254.169.254",
  "localhost",
  "metadata.google.internal",
]);

function clean(value = "") {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  if (!pathname || pathname === "/") return "/";
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function isTrackingKey(key = "") {
  const lowered = key.toLowerCase();
  return TRACKING_QUERY_KEYS.has(lowered) || TRACKING_QUERY_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

export function canonicalizeUrl(rawUrl = "", options = {}) {
  const input = clean(rawUrl);
  if (!input) {
    return { status: "INVALID_URL", url: null, reason: "URL is empty." };
  }

  try {
    const parsed = new URL(input, options.baseUrl || undefined);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "REJECTED_URL", url: null, reason: `Unsupported URL protocol: ${parsed.protocol}` };
    }

    if (parsed.port === "80" && parsed.protocol === "http:") parsed.port = "";
    if (parsed.port === "443" && parsed.protocol === "https:") parsed.port = "";
    parsed.pathname = normalizePath(parsed.pathname);

    const keptParams = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!isTrackingKey(key)) keptParams.push([key, value]);
    }
    keptParams.sort(([aKey, aValue], [bKey, bValue]) =>
      `${aKey}=${aValue}`.localeCompare(`${bKey}=${bValue}`)
    );
    parsed.search = "";
    for (const [key, value] of keptParams) parsed.searchParams.append(key, value);

    return { status: "VALID_URL", url: parsed.toString(), reason: null };
  } catch (error) {
    return { status: "INVALID_URL", url: null, reason: error.message };
  }
}

export function isRejectedPath(url = "") {
  try {
    const parsed = new URL(url);
    return REJECTED_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return true;
  }
}

export function isPrivateIp(value = "") {
  const ip = clean(value);
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (kind === 6) {
    const lowered = ip.toLowerCase();
    return (
      lowered === "::" ||
      lowered === "::1" ||
      lowered.startsWith("fc") ||
      lowered.startsWith("fd") ||
      lowered.startsWith("fe80") ||
      lowered.startsWith("2001:db8")
    );
  }

  return false;
}

export function isUnsafeHostname(hostname = "") {
  const host = clean(hostname).toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (UNSAFE_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (isPrivateIp(host)) return true;
  return false;
}

export function validateUrlSecurity(rawUrl = "", options = {}) {
  const canonical = canonicalizeUrl(rawUrl, options);
  if (!canonical.url) {
    return { status: canonical.status, allowed: false, url: null, reason: canonical.reason };
  }

  const parsed = new URL(canonical.url);
  if (parsed.username || parsed.password) {
    return {
      status: "REJECTED_CREDENTIAL_URL",
      allowed: false,
      url: canonical.url,
      reason: "URL credentials are not allowed.",
    };
  }

  if (isUnsafeHostname(parsed.hostname)) {
    return {
      status: "REJECTED_UNSAFE_HOST",
      allowed: false,
      url: canonical.url,
      reason: `Unsafe hostname: ${parsed.hostname}`,
    };
  }

  if (isRejectedPath(canonical.url)) {
    return {
      status: "REJECTED_PATH",
      allowed: false,
      url: canonical.url,
      reason: "URL path is an auth, account, admin, cart, session, or calendar trap.",
    };
  }

  for (const address of options.resolvedAddresses || []) {
    if (isPrivateIp(address)) {
      return {
        status: "REJECTED_PRIVATE_IP",
        allowed: false,
        url: canonical.url,
        reason: `Resolved to private or reserved IP: ${address}`,
      };
    }
  }

  return { status: "URL_ALLOWED", allowed: true, url: canonical.url, reason: null };
}

function robotsLines(text = "") {
  return clean(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

export function parseRobotsTxt(text = "") {
  const groups = [];
  let current = null;

  for (const line of robotsLines(text)) {
    const [rawKey, ...rest] = line.split(":");
    const key = clean(rawKey).toLowerCase();
    const value = clean(rest.join(":"));
    if (!key) continue;

    if (key === "user-agent") {
      current = { userAgents: [value.toLowerCase()], rules: [], crawlDelay: null, sitemaps: [] };
      groups.push(current);
      continue;
    }

    if (!current) continue;

    if (key === "allow" || key === "disallow") {
      current.rules.push({ directive: key.toUpperCase(), path: value || "/" });
    } else if (key === "crawl-delay") {
      const delay = Number(value);
      current.crawlDelay = Number.isFinite(delay) ? delay : null;
    } else if (key === "sitemap") {
      current.sitemaps.push(value);
    }
  }

  return { groups };
}

function groupMatches(group = {}, userAgent = CRAWLER_USER_AGENT) {
  const agent = clean(userAgent).toLowerCase();
  return (group.userAgents || []).some((candidate) => candidate === "*" || agent.includes(candidate));
}

export function robotsDecisionFor(rawUrl = "", robotsText = "", userAgent = CRAWLER_USER_AGENT) {
  if (!clean(robotsText)) {
    return {
      status: "ROBOTS_UNAVAILABLE",
      allowed: false,
      reason: "robots.txt was unavailable, so live crawling remains blocked by policy.",
      matchedRule: null,
    };
  }

  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical.url) {
    return { status: "INVALID_URL", allowed: false, reason: canonical.reason, matchedRule: null };
  }

  const parsed = new URL(canonical.url);
  const robots = parseRobotsTxt(robotsText);
  const matchingGroups = robots.groups.filter((group) => groupMatches(group, userAgent));
  const groups = matchingGroups.length ? matchingGroups : robots.groups.filter((group) => groupMatches(group, "*"));
  const rules = groups.flatMap((group) => group.rules || []);
  const matchingRules = rules
    .filter((rule) => parsed.pathname.startsWith(rule.path || "/"))
    .sort((a, b) => (b.path || "").length - (a.path || "").length);
  const matchedRule = matchingRules[0] || null;

  if (!matchedRule) {
    return { status: "ROBOTS_ALLOWED", allowed: true, reason: null, matchedRule: null };
  }

  const allowed = matchedRule.directive === "ALLOW";
  return {
    status: allowed ? "ROBOTS_ALLOWED" : "ROBOTS_BLOCKED",
    allowed,
    reason: allowed ? null : `robots.txt disallows path: ${matchedRule.path}`,
    matchedRule,
  };
}

export function classifySeedSource(rawUrl = "", options = {}) {
  const url = canonicalizeUrl(rawUrl).url || clean(rawUrl);
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    return "UNKNOWN_URL";
  }

  const path = parsed.pathname.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const field = clean(options.sourceField).toLowerCase();

  if (host === "api.github.com" || host === "github.com" || field.includes("github")) return "GITHUB";
  if (path.endsWith(".rss") || path.includes("/rss") || path.includes("/feed")) return "RSS";
  if (path.endsWith(".xml") || path.includes("sitemap")) return "XML_SITEMAP";
  if (path.includes("/docs") || host.startsWith("docs.") || field.includes("docs")) return "DOCS_WEBSITE";
  if (field.includes("news") || field.includes("announcement") || field.includes("article")) return "NEWS_OR_ANNOUNCEMENT";
  return "OFFICIAL_WEBSITE";
}

export function sameRegistrableHost(a = "", b = "") {
  try {
    const left = new URL(a).hostname.toLowerCase();
    const right = new URL(b).hostname.toLowerCase();
    return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
  } catch {
    return false;
  }
}

export function fingerprintText(text = "") {
  return crypto.createHash("sha256").update(clean(text).replace(/\s+/g, " ").toLowerCase()).digest("hex");
}
