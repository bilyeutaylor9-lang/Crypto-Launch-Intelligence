import { getFallbackResearchSeedCandidates } from "./fallbackResearchSeedConnector.js";

const DISCOVERY_AGENTS = [
  {
    name: "Narrative Scout",
    focus: ["ai", "agent", "rwa", "depin", "zk", "modular", "stablecoin", "prediction"],
    reason: "searches hot narratives before they are broadly ranked",
  },
  {
    name: "Launch Hunter",
    focus: ["launch", "tge", "mainnet", "testnet", "airdrop", "points", "launchpad"],
    reason: "hunts upcoming launch and token-conversion setups",
  },
  {
    name: "Ecosystem Scout",
    focus: ["base", "solana", "ethereum", "arbitrum", "optimism", "sui", "sei", "cosmos"],
    reason: "looks for chain/ecosystem rotation candidates",
  },
  {
    name: "Liquidity Scout",
    focus: ["dex", "perp", "liquidity", "staking", "restaking", "yield", "bridge"],
    reason: "finds projects with liquidity expansion potential",
  },
  {
    name: "Institutional Scout",
    focus: ["institutional", "treasury", "asset", "compliance", "custody", "rwa", "enterprise"],
    reason: "searches for institutional attention vectors",
  },
  {
    name: "Risk Scout",
    focus: ["audit", "security", "locked", "vesting", "unlock", "governance"],
    reason: "keeps risk-heavy but important candidates visible for review",
  },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function keyFor(project = {}) {
  return String(
    project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.narrative,
    project.primaryNarrative,
    ...(project.narratives || []),
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreForAgent(project = {}, agent = {}) {
  const text = textFor(project);
  const hits = agent.focus.filter((term) => text.includes(term));
  const sourceCount = Array.isArray(project.discoverySources) ? project.discoverySources.length : 0;
  const liquidity = Math.log10(Math.max(1, num(project.liquidityUsd)));
  const volume = Math.log10(Math.max(1, num(project.volume24h)));
  const seedPenalty = project.researchSeed ? 6 : 0;
  const score = Math.round(hits.length * 18 + sourceCount * 5 + liquidity * 4 + volume * 3 - seedPenalty);

  return {
    agent: agent.name,
    score,
    hits,
    reason: agent.reason,
  };
}

function enrichCandidate(project = {}, signals = []) {
  const topSignals = [...signals].sort((a, b) => b.score - a.score).slice(0, 4);

  return {
    ...project,
    source: project.source || "ai-discovery-swarm",
    discoverySources: [...new Set([...(project.discoverySources || []), "ai-discovery-swarm"])],
    aiDiscoverySwarmScore: Math.round(
      Math.min(100, topSignals.reduce((sum, signal) => sum + Math.max(0, signal.score), 0) / Math.max(1, topSignals.length))
    ),
    aiDiscoveryAgents: topSignals,
    aiDiscoveryReason:
      topSignals[0]?.hits?.length
        ? `${topSignals[0].agent} matched ${topSignals[0].hits.join(", ")}.`
        : "AI discovery swarm selected this as a broad research candidate.",
  };
}

export function runAIDiscoverySwarm(existingProjects = [], options = {}) {
  const enabled = options.enabled ?? process.env.DISABLE_AI_DISCOVERY_SWARM !== "true";
  const limit = Number(options.limit || process.env.AI_DISCOVERY_SWARM_LIMIT || 300);
  const seedLimit = Number(options.seedLimit || process.env.AI_DISCOVERY_SWARM_SEED_LIMIT || 750);

  if (!enabled) {
    return {
      candidates: [],
      report: {
        status: "DISABLED",
        agents: DISCOVERY_AGENTS.map((agent) => agent.name),
        addedCount: 0,
      },
    };
  }

  const existingKeys = new Set((Array.isArray(existingProjects) ? existingProjects : []).map(keyFor));
  const seedUniverse = getFallbackResearchSeedCandidates({ limit: seedLimit });
  const scored = seedUniverse
    .filter((project) => !existingKeys.has(keyFor(project)))
    .map((project) => {
      const agentSignals = DISCOVERY_AGENTS.map((agent) => scoreForAgent(project, agent));
      return enrichCandidate(project, agentSignals);
    })
    .filter((project) => num(project.aiDiscoverySwarmScore) >= Number(options.minScore || process.env.AI_DISCOVERY_SWARM_MIN_SCORE || 20))
    .sort((a, b) => num(b.aiDiscoverySwarmScore) - num(a.aiDiscoverySwarmScore))
    .slice(0, limit);

  return {
    candidates: scored,
    report: {
      status: scored.length ? "USED" : "NO_MATCHES",
      agents: DISCOVERY_AGENTS,
      searchedSeeds: seedUniverse.length,
      addedCount: scored.length,
      topCandidates: scored.slice(0, 10).map((project) => ({
        name: project.name,
        symbol: project.symbol,
        score: project.aiDiscoverySwarmScore,
        reason: project.aiDiscoveryReason,
      })),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runAIDiscoverySwarm([], { limit: 25 }), null, 2));
}
