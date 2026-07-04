// src/engines/narrativeEngine.js

/**
 * Narrative Engine v2
 *
 * Detects crypto narratives and scores narrative strength.
 */

const NARRATIVES = {
  ai: ["ai", "artificial intelligence", "agent", "agents", "machine learning"],
  depin: ["depin", "physical infrastructure", "wireless", "compute", "storage"],
  rwa: ["rwa", "real world assets", "tokenized assets", "treasury", "credit"],
  bitcoin: ["bitcoin", "btc", "bitcoin l2", "ordinals", "runes"],
  base: ["base", "coinbase", "onchain summer"],
  gaming: ["gaming", "gamefi", "metaverse", "play to earn"],
  stablecoin: ["stablecoin", "payments", "settlement", "remittance"],
  privacy: ["privacy", "zk", "zero knowledge", "confidential"],
  interoperability: ["cross-chain", "interoperability", "bridge", "omnichain"],
  restaking: ["restaking", "eigenlayer", "avs", "shared security"]
};

const HOT_NARRATIVE_BONUS = {
  ai: 20,
  rwa: 18,
  depin: 16,
  bitcoin: 16,
  base: 14,
  stablecoin: 12,
  interoperability: 10,
  restaking: 10,
  gaming: 8,
  privacy: 8
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return Array.isArray(value)
    ? value.join(" ")
    : String(value || "");
}

function buildSearchText(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.website,
    project.docs,
    project.tags,
    project.ecosystem,
    project.twitterBio
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function detectNarratives(project = {}) {
  const text = buildSearchText(project);

  return Object.entries(NARRATIVES)
    .filter(([, keywords]) =>
      keywords.some(keyword => text.includes(keyword))
    )
    .map(([narrative]) => narrative);
}

export function scoreNarrative(project = {}) {
  const narratives = detectNarratives(project);

  let score = 0;

  for (const narrative of narratives) {
    score += 20;
    score += HOT_NARRATIVE_BONUS[narrative] || 0;
  }

  if (narratives.length >= 2) score += 10;
  if (narratives.length >= 3) score += 10;

  if (Number(project.narrativeMentions24h || 0) > 50) score += 10;
  if (Number(project.narrativeMentions24h || 0) > 250) score += 10;

  return Math.round(clamp(score));
}

export function analyzeNarrative(project = {}) {
  const narratives = detectNarratives(project);
  const narrativeScore = scoreNarrative(project);

  const narrativeStrength =
    narrativeScore >= 80 ? "strong" :
    narrativeScore >= 60 ? "promising" :
    narrativeScore >= 40 ? "emerging" :
    "weak";

  return {
    ...project,
    narratives,
    narrativeScore,
    narrativeStrength,
    intelligenceReason:
      narratives.length
        ? `Project maps to active narratives: ${narratives.join(", ")}.`
        : "No strong narrative match detected.",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Narrative Engine v2",
        signal: "Narrative alignment",
        score: narrativeScore,
        confidence: Math.min(narrativeScore / 100, 1),
        impact:
          narrativeScore >= 80 ? "Strong Positive" :
          narrativeScore >= 60 ? "Positive" :
          narrativeScore >= 40 ? "Early" :
          "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(narrativeScore >= 80
        ? [`Strong narrative alignment detected: ${narratives.join(", ")}.`]
        : [])
    ]
  };
}

export function analyzeNarratives(projects = []) {
  if (!Array.isArray(projects)) return [];

  return projects
    .map(analyzeNarrative)
    .sort((a, b) => b.narrativeScore - a.narrativeScore);
}

export default analyzeNarratives;
