const PROFILE_ALIASES = {
  full: "full",
  default: "full",
  complete: "full",
  tenx: "tenx",
  "10x": "tenx",
  asymmetric: "tenx",
  sniper: "tenx",
  utility: "tenx",
  "utility-asymmetry": "tenx",
};

const TENX_SKIPPED_ENGINES = new Set([
  "AI Ecosystem Council",
  "Research Operating System",
  "Autonomous Alpha Lab",
  "Quantum Outcome Field",
  "Quantum Reasoning Brain",
  "Quantum Suite Health",
  "World Model Brain",
  "Autonomous Market Scientist",
  "Self-Training Market Simulation Brain",
  "Autonomous Outcome Judge",
  "AI Portfolio War Room",
  "Autonomous Strategy Lab",
  "Causal Alpha Brain",
  "Autonomous Alpha OS",
  "Paper Trading Outcome Lab",
  "Auto-Learning Weight Optimizer",
  "Breakout Brain",
  "Autonomous Research Orchestrator",
  "High-Tech Alpha Stack",
  "Self-Evolving Alpha OS",
  "Proof-Carrying Alpha Contract",
  "Autonomous Alpha Knowledge Graph",
  "Causal Market Twin",
  "Autonomous Causal Alpha Network",
  "Alpha Evolution Governor",
]);

const TENX_REQUIRED_ENGINES = new Set([
  "Rich Token Intelligence",
  "Project Identity Graph",
  "Source Reliability",
  "Source Truth",
  "Active Liquidity Truth",
  "Liquidity Control Risk",
  "Organic Buyer Classifier",
  "Deployer Reputation",
  "Wallet Cluster",
  "Bundled Launch",
  "Wash Trading",
  "Organic Buyer Firewall",
  "Instant Safety Gate",
  "Contract Authority Risk",
  "Organic Demand Integrity",
  "Canonical Execution Route",
  "Execution Proof",
  "Route Accessibility",
  "Capital Migration Core",
  "Quiet Accumulation",
  "Pre-Breakout Momentum",
  "Information Advantage",
  "Attention Gap",
  "Buyer Breadth Acceleration",
  "Liquidity Formation",
  "Smart Wallet Novelty",
  "Developer Acceleration v2",
  "Attention Gap v2",
  "Pre-Breakout Sequence",
  "Early Asymmetry Triage",
  "Distressed Microcap Trap",
  "Pre-Consensus Breakout Hunter",
  "Evidence Lineage Governor",
  "Sniper Integrity Gate",
  "Final Selection Integrity",
  "Pre-Breakout Radar",
  "Data Starvation Root Cause",
  "Value Of Information",
  "Starvation Rescue",
  "Research Readiness",
  "First Seen Opportunity",
  "Utility Quality",
  "Progressive Opportunity Ranking",
  "Market Opportunity Rank",
  "Market Opportunity Learning",
  "7-Day Asymmetric Research",
  "Scalp Microstructure",
  "High-Upside Scalp Classification",
]);

const PROFILES = {
  full: {
    id: "full",
    label: "Full Intelligence Stack",
    objective: "Run every configured intelligence, research, AI, simulation, reporting, and learning layer.",
    skipEngines: new Set(),
    requiredEngines: new Set(),
    skipLocalAIResearch: false,
    skipAutonomousMemoryStores: false,
  },
  tenx: {
    id: "tenx",
    label: "Asymmetric Utility Research",
    objective:
      "Prioritize real-utility small-cap asymmetric research candidates while skipping decorative or slow advisory engines.",
    skipEngines: TENX_SKIPPED_ENGINES,
    requiredEngines: TENX_REQUIRED_ENGINES,
    skipLocalAIResearch: true,
    skipAutonomousMemoryStores: true,
  },
};

function normalizeProfileId(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  return PROFILE_ALIASES[normalized] || "full";
}

function csvSet(value = "") {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function resolveEngineProfile(input = null, env = process.env) {
  const id = normalizeProfileId(
    input || env.PIPELINE_ENGINE_PROFILE || env.ENGINE_PROFILE || env.INTELLIGENCE_ENGINE_PROFILE
  );
  const profile = PROFILES[id] || PROFILES.full;
  const forceRun = csvSet(env.ENGINE_PROFILE_FORCE_RUN || env.PIPELINE_ENGINE_FORCE_RUN);
  const forceSkip = csvSet(env.ENGINE_PROFILE_FORCE_SKIP || env.PIPELINE_ENGINE_FORCE_SKIP);
  const brainCloudEnabled =
    String(env.BRAIN_CLOUD_ENABLED || env.CLOUD_AI_ENABLED || "").toLowerCase() === "true";

  return {
    ...profile,
    skipEngines: new Set([...profile.skipEngines, ...forceSkip]),
    requiredEngines: new Set([...profile.requiredEngines, ...forceRun]),
    forceRun,
    forceSkip,
    skipLocalAIResearch: brainCloudEnabled ? false : profile.skipLocalAIResearch,
  };
}

export function shouldRunEngineForProfile(name = "", profileInput = null, env = process.env) {
  const profile =
    profileInput && typeof profileInput === "object" && profileInput.skipEngines instanceof Set
      ? profileInput
      : resolveEngineProfile(profileInput, env);
  const engineName = String(name || "").trim();

  if (profile.requiredEngines.has(engineName) || profile.forceRun?.has(engineName)) {
    return { run: true, profile, reason: "required by active engine profile" };
  }

  if (profile.skipEngines.has(engineName) || profile.forceSkip?.has(engineName)) {
    return {
      run: false,
      profile,
      reason: `${profile.label} skips non-critical advisory/simulation engine`,
    };
  }

  return { run: true, profile, reason: "allowed by active engine profile" };
}

export function engineProfileReport(profileInput = null, env = process.env) {
  const profile = resolveEngineProfile(profileInput, env);
  return {
    id: profile.id,
    label: profile.label,
    objective: profile.objective,
    skippedEngineCount: profile.skipEngines.size,
    requiredEngineCount: profile.requiredEngines.size,
    skipLocalAIResearch: profile.skipLocalAIResearch,
    skipAutonomousMemoryStores: profile.skipAutonomousMemoryStores,
    skippedEngines: [...profile.skipEngines].sort(),
    requiredEngines: [...profile.requiredEngines].sort(),
  };
}
