function clean(value = "") {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeUrl(value = "") {
  const raw = clean(value);
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function compactHost(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function labelText(row = {}) {
  return [row.type, row.label, row.name, row.title, row.platform, row.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function linkRowsFrom(value = {}) {
  if (!value || typeof value !== "object") return [];
  return [
    ...array(value.websites),
    ...array(value.socials),
    ...array(value.links),
    ...array(value.info?.websites),
    ...array(value.info?.socials),
    ...array(value.info?.links),
  ];
}

function classifyLink(row = {}) {
  const url = normalizeUrl(row.url || row.href || row.link || row.value);
  if (!url) return null;

  const host = compactHost(url);
  const text = labelText(row);
  const combined = `${text} ${host}`;

  if (/github\.com|gitlab\.com|source code|repo|repository|github/.test(combined)) return "github";
  if (/docs|documentation|developer|gitbook|readme/.test(combined)) return "docs";
  if (/whitepaper|litepaper|paper/.test(combined)) return "whitepaper";
  if (/roadmap|milestone/.test(combined)) return "roadmap";
  if (/blog|medium\.com|mirror\.xyz|announcement|news|changelog/.test(combined)) return "blog";
  if (/(^|\W)(twitter|x\.com|twitter\.com)(\W|$)/.test(combined)) return "twitter";
  if (/telegram|t\.me/.test(combined)) return "telegram";
  if (/discord|discord\.gg|discord\.com/.test(combined)) return "discord";
  if (/website|homepage|official|site|home/.test(combined)) return "website";

  return "other";
}

function setFirst(target = {}, field = "", value = null) {
  if (value && !target[field]) target[field] = value;
}

export function normalizeProviderLinks(payload = {}, options = {}) {
  const source = options.source || payload.source || "provider";
  const rows = linkRowsFrom(payload);
  const normalizedLinks = [];
  const links = {};

  for (const row of rows) {
    const url = normalizeUrl(row.url || row.href || row.link || row.value);
    if (!url) continue;
    const type = classifyLink(row);
    if (!type) continue;

    normalizedLinks.push({
      type,
      label: clean(row.label || row.type || row.name || row.title || type),
      url,
      source,
    });

    if (type !== "other") setFirst(links, type, url);
  }

  const output = {
    officialLinkSources: normalizedLinks,
    providerLinkCoverage: normalizedLinks.length,
  };

  setFirst(output, "website", links.website);
  setFirst(output, "websiteUrl", links.website);
  setFirst(output, "homepage", links.website);
  setFirst(output, "officialWebsite", links.website);
  setFirst(output, "docsUrl", links.docs);
  setFirst(output, "documentationUrl", links.docs);
  setFirst(output, "githubRepo", links.github);
  setFirst(output, "githubUrl", links.github);
  setFirst(output, "repositoryUrl", links.github);
  setFirst(output, "twitterUrl", links.twitter);
  setFirst(output, "twitterHandle", links.twitter);
  setFirst(output, "telegramUrl", links.telegram);
  setFirst(output, "discordUrl", links.discord);
  setFirst(output, "blogUrl", links.blog);
  setFirst(output, "whitepaperUrl", links.whitepaper);
  setFirst(output, "roadmapUrl", links.roadmap);

  const structuredLinks = {
    ...(links.website ? { website: links.website, homepage: links.website } : {}),
    ...(links.docs ? { docs: links.docs, documentation: links.docs } : {}),
    ...(links.github ? { github: links.github, repository: links.github } : {}),
    ...(links.twitter ? { twitter: links.twitter, x: links.twitter } : {}),
    ...(links.telegram ? { telegram: links.telegram } : {}),
    ...(links.discord ? { discord: links.discord } : {}),
    ...(links.blog ? { blog: links.blog } : {}),
    ...(links.whitepaper ? { whitepaper: links.whitepaper } : {}),
    ...(links.roadmap ? { roadmap: links.roadmap } : {}),
  };

  if (Object.keys(structuredLinks).length) {
    output.links = structuredLinks;
    output.projectLinks = structuredLinks;
    output.officialLinks = structuredLinks;
  }

  if (options.sourceUrl || payload.url) {
    output.sourceUrl = normalizeUrl(options.sourceUrl || payload.url);
  }

  return output;
}

export const __providerLinkNormalizerTestHooks = {
  classifyLink,
  normalizeUrl,
};
