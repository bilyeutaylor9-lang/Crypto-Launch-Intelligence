// src/engines/partnershipEngine.js

const PARTNERSHIP_KEYWORDS = [
  "partnership",
  "partnered",
  "collaboration",
  "collaborating",
  "integration",
  "integrated with",
  "ecosystem partner",
  "strategic partner",
  "alliance",
  "joint campaign",
  "co-marketing",
  "grant",
  "incubator",
  "accelerator",
  "enterprise",
  "institutional",
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function collectText(project = {}) {
  return [
    project.partners,
    project.partnerships,
    project.integrations,
    project.announcement,
    project.news,
    project.description,
    project.website,
    project.blog,
    project.docs,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function detectPartnershipSignals(project = {}) {
  const text = collectText(project);
  return PARTNERSHIP_KEYWORDS.filter((keyword) => text.includes(keyword));
}

function countList(value) {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

function buildReasons(project = {}, signals = []) {
  const reasons = [];

  if (signals.length) {
    reasons.push(`Partnership language detected: ${signals.slice(0, 6).join(", ")}.`);
  }

  if (countList(project.partners) > 0) reasons.push("Named partners are present.");
  if (countList(project.partnerships) > 0) reasons.push("Partnership records are present.");
  if (countList(project.integrations) > 0) reasons.push("Integration signals are present.");
  if (project.ecosystemPartner) reasons.push("Ecosystem partner signal detected.");
  if (project.enterprisePartner) reasons.push("Enterprise partner signal detected.");
  if (project.exchangePartner) reasons.push("Exchange partner signal detected.");

  if (!reasons.length) reasons.push("Partnership signals are limited or still early.");

  return reasons;
}

export function scorePartnerships(project = {}) {
  const signals = detectPartnershipSignals(project);

  let score = 0;

  score += Math.min(signals.length * 7, 28);
  score += Math.min(countList(project.partners) * 10, 30);
  score += Math.min(countList(project.partnerships) * 10, 30);
  score += Math.min(countList(project.integrations) * 8, 24);

  if (project.ecosystemPartner) score += 12;
  if (project.enterprisePartner) score += 18;
  if (project.exchangePartner) score += 12;
  if (project.institutionalPartner) score += 18;

  return clamp(Math.round(score));
}

export function analyzePartnerships(project = {}) {
  const partnershipSignals = detectPartnershipSignals(project);
  const partnershipScore = scorePartnerships(project);
  const partnershipReasons = buildReasons(project, partnershipSignals);

  const partnershipLevel =
    partnershipScore >= 85
      ? "institutional"
      : partnershipScore >= 70
      ? "major"
      : partnershipScore >= 55
      ? "strong"
      : partnershipScore >= 35
      ? "developing"
      : "limited";

  return {
    ...project,

    partnershipSignals,
    partnershipScore,
    partnershipLevel,
    partnershipReasons,
    partnershipReason:
      partnershipScore >= 55
        ? "Project shows meaningful partnership or integration signals."
        : "Partnership signals are limited or still early.",

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      partnerships: {
        score: partnershipScore,
        level: partnershipLevel,
        signals: partnershipSignals,
        reasons: partnershipReasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Partnership Engine",
        signal: "Partnership, collaboration, or integration activity",
        score: partnershipScore,
        confidence: clamp(partnershipScore / 100, 0, 1),
        impact:
          partnershipScore >= 70
            ? "Strong Positive"
            : partnershipScore >= 55
            ? "Positive"
            : "Neutral",
        reasons: partnershipReasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(partnershipScore >= 85
        ? ["Institutional partnership signal detected."]
        : partnershipScore >= 70
        ? ["Major partnership signal detected."]
        : []),
    ],
  };
}

export function analyzePartnershipsBatch(projects = []) {
  return projects
    .map(analyzePartnerships)
    .sort(
      (a, b) => Number(b.partnershipScore || 0) - Number(a.partnershipScore || 0)
    );
}
