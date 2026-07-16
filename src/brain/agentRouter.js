import { LOCAL_BRAIN_AGENTS } from "./agentRegistry.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function hasItems(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const AGENTS_BY_ID = new Map(LOCAL_BRAIN_AGENTS.map((agent) => [agent.id, agent]));
const AGENT_ORDER = LOCAL_BRAIN_AGENTS.map((agent) => agent.id);

export function selectAgents(project = {}, options = {}) {
  const depth = String(options.depth || "LIGHT").toUpperCase();
  const selected = new Set(["identity-verifier", "bear-researcher"]);
  const hasMarket = num(project.liquidityUsd) > 0 || Boolean(project.pairAddress || project.poolAddress);
  const hasTokenomics =
    num(project.tokenomicsScore) > 0 ||
    hasItems(project.unlocks) ||
    hasItems(project.riskFlags) ||
    num(project.riskScore) > 0;
  const hasNarrative =
    num(project.catalystScore) > 0 ||
    num(project.narrativeHeatScore) > 0 ||
    hasItems(project.catalysts) ||
    hasItems(project.narratives);

  if (hasMarket) selected.add("market-structure-analyst");
  if (hasTokenomics) selected.add("tokenomics-risk-analyst");
  if (hasNarrative) selected.add("narrative-catalyst-analyst");
  if (depth === "DEEP" || num(project.smartMoneyAccumulationScore) >= 65 || num(project.accelerationScore) >= 65) {
    selected.add("bull-researcher");
  }
  if (depth === "DEEP") {
    for (const agentId of AGENT_ORDER) selected.add(agentId);
  }

  return AGENT_ORDER.filter((agentId) => selected.has(agentId))
    .map((agentId) => AGENTS_BY_ID.get(agentId))
    .filter(Boolean);
}
