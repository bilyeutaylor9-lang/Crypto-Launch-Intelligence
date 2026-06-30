// src/engines/infrastructureNarrativeEngine.js

/**
 * Crypto Launch Intelligence
 * Infrastructure Narrative Engine
 *
 * Purpose:
 * Detects serious infrastructure narratives that deserve higher
 * ranking than pure meme momentum.
 */

const INFRASTRUCTURE_NARRATIVES = {
  ai: ["ai", "agent", "llm", "machine learning", "automation"],
  tonTelegram: ["ton", "telegram", "tac", "tvm", "mini app"],
  evmCompatibility: ["evm", "ethereum compatible", "solidity", "virtual machine"],
  crossChain: ["cross-chain", "interoperability", "bridge", "omnichain", "messaging"],
  rwa: ["rwa", "real world asset", "tokenized", "treasury", "credit"],
  depin: ["depin", "physical infrastructure", "wireless", "compute", "storage"],
  restaking: ["restaking", "eigenlayer", "avs", "shared security"],
  modular: ["modular", "data availability", "rollup", "settlement", "execution"],
  bitcoinInfra: ["bitcoin l2", "btcfi", "ordinals", "runes", "bitcoin staking"],
  security: ["security", "audit", "risk", "monitoring", "threat", "sentinel"],
  stablecoin: ["stablecoin", "payments", "settlement", "remittance"],
  defiInfra: ["liquidity", "dex", "amm", "lending", "perps", "derivatives"]
};

function text(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.category,
    project.chain,
    project.dex,
    ...(project.narratives || []),
    ...(project.tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function titleCase(value = "") {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, char => char.toUpperCase())
    .trim();
}

export function detectInfrastructureNarratives(project = {}) {
  const combined = text(project);
  const detected = [];

  for (const [key, keywords] of Object.entries(INFRASTRUCTURE_NARRATIVES)) {
    const matches = keywords.filter(word => combined.includes(word));

    if (matches.length > 0) {
      detected.push({
        key,
        label: titleCase(key),
        matches,
        strength: Math.min(100, 50 + matches.length * 15)
      });
    }
  }

  return detected.sort((a, b) => b.strength - a.strength);
}

export function calculateInfrastructureNarrativeScore(project = {}) {
  const detected = detectInfrastructureNarratives(project);

  let score = 0;

  if (detected.length >= 1) score += 35;
  if (detected.length >= 2) score += 20;
  if (detected.length >= 3) score += 15;

  const majorNarratives = detected.filter(n =>
    ["ai", "tonTelegram", "evmCompatibility", "crossChain", "rwa", "depin", "restaking"].includes(n.key)
  );

  score += majorNarratives.length * 10;

  if (project.github) score += 10;
  if (project.website) score += 5;
  if (Number(project.fundingRaisedUsd || 0) >= 1_000_000) score += 10;
  if ((project.backers || []).length > 0) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeInfrastructureNarrative(project = {}) {
  const infrastructureNarratives = detectInfrastructureNarratives(project);
  const infrastructureNarrativeScore =
    calculateInfrastructureNarrativeScore(project);

  return {
    ...project,
    infrastructureNarratives,
    infrastructureNarrativeScore,
    infrastructureNarrativeLevel:
      infrastructureNarrativeScore >= 85 ? "major infrastructure narrative" :
      infrastructureNarrativeScore >= 70 ? "strong infrastructure narrative" :
      infrastructureNarrativeScore >= 50 ? "developing infrastructure narrative" :
      infrastructureNarrativeScore >= 30 ? "early infrastructure watch" :
      "no clear infrastructure narrative",

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Infrastructure Narrative Engine",
        signal: "Infrastructure narrative detection",
        confidence: Math.min(infrastructureNarrativeScore / 100, 1),
        impact: infrastructureNarrativeScore >= 50 ? "Positive" : "Neutral"
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(infrastructureNarrativeScore >= 70
        ? ["Strong infrastructure narrative detected."]
        : [])
    ]
  };
}

export function analyzeInfrastructureNarrativeBatch(projects = []) {
  return projects
    .map(analyzeInfrastructureNarrative)
    .sort(
      (a, b) =>
        b.infrastructureNarrativeScore - a.infrastructureNarrativeScore
    );
}
