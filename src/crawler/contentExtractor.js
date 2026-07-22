import { canonicalizeUrl, fingerprintText } from "./crawlPolicy.js";

const MAX_TEXT_CHARS = 24_000;
const MAX_LINKS = 80;
const MAX_ITEMS = 120;

function clean(value = "") {
  return String(value ?? "").trim();
}

function decodeEntities(value = "") {
  return clean(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([a-f0-9]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function stripHtml(html = "") {
  return decodeEntities(
    clean(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).slice(0, MAX_TEXT_CHARS);
}

function attr(block = "", name = "") {
  const pattern = new RegExp(`${name}=["']([^"']+)["']`, "i");
  return decodeEntities(block.match(pattern)?.[1] || "");
}

function tagValue(xml = "", tag = "") {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function rejectUnsafeXml(xml = "") {
  return /<!DOCTYPE|<!ENTITY/i.test(xml);
}

export function extractHtmlContent(body = "", url = "") {
  const title = decodeEntities(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description =
    attr(body.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0] || "", "content") ||
    attr(body.match(/<meta[^>]+property=["']og:description["'][^>]*>/i)?.[0] || "", "content");
  const canonicalUrl =
    canonicalizeUrl(attr(body.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || "", "href"), {
      baseUrl: url,
    }).url || null;
  const headings = [...body.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .slice(0, 24)
    .map((match) => ({ level: Number(match[1]), text: stripHtml(match[2]).slice(0, 240) }))
    .filter((heading) => heading.text);
  const links = [...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .slice(0, MAX_LINKS * 2)
    .map((match) => ({
      url: canonicalizeUrl(match[1], { baseUrl: url }).url,
      text: stripHtml(match[2]).slice(0, 180),
    }))
    .filter((link, index, all) => link.url && all.findIndex((candidate) => candidate.url === link.url) === index)
    .slice(0, MAX_LINKS);
  const jsonLd = [...body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .slice(0, 8)
    .flatMap((match) => {
      try {
        return [JSON.parse(decodeEntities(match[1]))];
      } catch {
        return [];
      }
    });
  const text = stripHtml(body);

  return {
    extractionStatus: text ? "EXTRACTED" : "EMPTY_PAGE",
    contentKind: "HTML",
    url,
    title,
    description,
    canonicalUrl,
    headings,
    links,
    jsonLd,
    text,
    contentHash: fingerprintText(`${title} ${description} ${text}`),
  };
}

export function parseFeedXml(xml = "", url = "") {
  if (rejectUnsafeXml(xml)) {
    return { extractionStatus: "XML_REJECTED_EXTERNAL_ENTITY", contentKind: "FEED", url, items: [] };
  }

  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;
  const items = blocks.slice(0, MAX_ITEMS).map((block) => {
    const atomLink = attr(block.match(/<link[^>]+href=["'][^"']+["'][^>]*>/i)?.[0] || "", "href");
    return {
      title: tagValue(block, "title"),
      description: tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content"),
      url: canonicalizeUrl(tagValue(block, "link") || atomLink, { baseUrl: url }).url,
      publishedAt: tagValue(block, "pubDate") || tagValue(block, "updated") || tagValue(block, "published") || null,
    };
  });

  return {
    extractionStatus: items.length ? "EXTRACTED" : "NO_FEED_ITEMS",
    contentKind: "FEED",
    url,
    items,
    title: tagValue(xml, "title"),
    text: items.map((item) => `${item.title} ${item.description}`).join(" ").slice(0, MAX_TEXT_CHARS),
    contentHash: fingerprintText(xml.slice(0, MAX_TEXT_CHARS)),
  };
}

export function parseSitemapXml(xml = "", url = "") {
  if (rejectUnsafeXml(xml)) {
    return { extractionStatus: "XML_REJECTED_EXTERNAL_ENTITY", contentKind: "SITEMAP", url, urls: [] };
  }

  const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .slice(0, MAX_ITEMS)
    .map((match) => canonicalizeUrl(decodeEntities(match[1]), { baseUrl: url }).url)
    .filter(Boolean);

  return {
    extractionStatus: urls.length ? "EXTRACTED" : "NO_SITEMAP_URLS",
    contentKind: "SITEMAP",
    url,
    urls: [...new Set(urls)],
    text: urls.join(" "),
    contentHash: fingerprintText(urls.join(" ")),
  };
}

export function extractTextContent(body = "", url = "") {
  const text = decodeEntities(body).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
  return {
    extractionStatus: text ? "EXTRACTED" : "EMPTY_PAGE",
    contentKind: "TEXT",
    url,
    title: "",
    description: "",
    text,
    links: [],
    contentHash: fingerprintText(text),
  };
}

export function extractContent(fetchResult = {}, rawUrl = "") {
  const url = fetchResult.finalUrl || rawUrl;
  const contentType = String(fetchResult.contentType || "").toLowerCase();
  const body = String(fetchResult.body || "");

  if (fetchResult.fetchStatus !== "FETCHED") {
    return {
      extractionStatus: "FETCH_NOT_AVAILABLE",
      contentKind: "NONE",
      url,
      text: "",
      errors: fetchResult.errors || [],
    };
  }

  if (contentType.includes("rss") || contentType.includes("atom") || /<(rss|feed)[\s>]/i.test(body)) {
    return parseFeedXml(body, url);
  }
  if (contentType.includes("xml") || /<urlset[\s>]/i.test(body)) {
    return parseSitemapXml(body, url);
  }
  if (contentType.includes("html") || /<html[\s>]/i.test(body)) {
    return extractHtmlContent(body, url);
  }
  return extractTextContent(body, url);
}
