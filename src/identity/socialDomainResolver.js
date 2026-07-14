function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

export function domainFromUrl(value = "") {
  const raw = clean(value);
  if (!raw) return "";

  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const match = raw.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : "";
  }
}

function socialHandle(value = "") {
  const raw = lower(value);
  if (!raw) return "";
  const match = raw.match(/(?:x\.com|twitter\.com|t\.me|discord\.gg|discord\.com\/invite)\/([a-z0-9_.-]+)/i);
  if (match) return match[1].replace(/^@/, "");
  return raw.replace(/^@/, "");
}

export function resolveSocialDomainIdentity(project = {}) {
  const websiteCandidates = [
    project.website,
    project.url,
    project.projectUrl,
    project.links?.website,
    ...(Array.isArray(project.websites) ? project.websites : []),
  ].filter(Boolean);
  const socialCandidates = [
    project.x,
    project.twitter,
    project.telegram,
    project.discord,
    project.links?.twitter,
    project.links?.telegram,
    project.links?.discord,
    ...(Array.isArray(project.socialAccounts) ? project.socialAccounts : []),
  ].filter(Boolean);
  const domains = [...new Set(websiteCandidates.map(domainFromUrl).filter(Boolean))];
  const socialAccounts = [...new Set(socialCandidates.map(socialHandle).filter(Boolean))];
  const domainAgeDays = Number.isFinite(Number(project.domainAgeDays)) ? Number(project.domainAgeDays) : null;
  const sameDomainEvidence = socialAccounts.filter((handle) =>
    domains.some((domain) => domain.includes(handle.replace(/[^a-z0-9]/g, "")))
  );
  const domainRiskScore =
    domainAgeDays === null ? 18 : domainAgeDays < 7 ? 42 : domainAgeDays < 30 ? 24 : domainAgeDays < 90 ? 10 : 0;
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        domains.length * 24 + socialAccounts.length * 12 + sameDomainEvidence.length * 14 - domainRiskScore
      )
    )
  );

  return {
    domains,
    socialAccounts,
    domainAgeDays,
    sameDomainEvidence,
    socialDomainScore: score,
    socialDomainRiskScore: domainRiskScore,
    warnings: [
      ...(domainAgeDays !== null && domainAgeDays < 14 ? ["very new website domain"] : []),
      ...(!domains.length ? ["missing official domain"] : []),
      ...(!socialAccounts.length ? ["missing social account proof"] : []),
    ],
  };
}
