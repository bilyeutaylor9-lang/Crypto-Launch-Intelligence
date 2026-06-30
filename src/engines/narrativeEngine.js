// src/engines/narrativeEngine.js

/**
 * Narrative Engine
 *
 * Purpose:
 * Detects which crypto narratives a project belongs to
 * and scores narrative strength.
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

export function detectNarratives(project = {}) {
  const text = [
    project.name,
    project.symbol,
    project.description,
    project.website,
    project.docs,
    project.tags,
    project.ecosystem
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return Object.entries(NARRATIVES)
    .filter(([, keywords]) => keywords.some(keyword => text.includes(keyword)))
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
  if (project.narrativeMentions24h > 50) score += 10;
  if (project.narrativeMentions24h > 250) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function analyzeNarrative(project = {}) {
  const narratives = detectNarratives(project);
  const narrativeScore = scoreNarrative(project);

  return {
    ...project,
    narratives,
    narrativeScore,
    narrativeStrength:
      narrativeScore >= 80 ? "strong" :
      narrativeScore >= 60 ? "promising" :
      narrativeScore >= 40 ? "emerging" :
      "weak",
    intelligenceReason:
      narratives.length
        ? `Project maps to active narratives: ${narratives.join(", ")}.`
        : "No strong narrative match detected."
  };
}

export function analyzeNarratives(projects = []) {
  return projects
    .map(analyzeNarrative)
    .sort((a, b) => b.narrativeScore - a.narrativeScore);
}
