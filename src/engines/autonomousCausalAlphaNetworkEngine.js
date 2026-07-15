import {
  buildCausalAlphaEvents,
  causalAlphaProjectKey,
  loadCausalAlphaEventLake,
  summarizeCausalAlphaEventLake,
} from "../learning/causalAlphaEventLake.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function compactId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.walletClusterRiskScore),
    num(project.washTradingRiskScore),
    num(project.bundledLaunchRiskScore),
    num(project.instantSafetyRiskScore),
    num(project.organicDemandFirewallRisk),
    num(project.economicIntegrityRiskScore)
  );
}

function sourceFamilies(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source || source.type),
    project.githubIntelligencePro?.repository ? "github" : "",
    project.roadmapProfitabilityScore ? "roadmap" : "",
    project.liveCatalystRadarScore ? "catalyst" : "",
    project.nativeDiscoveryScore ? "native" : "",
    project.proofOfAlphaExecutionTwinRoute ? "execution-route" : "",
    project.xSocialScore ? "x-social" : "",
  ]
    .filter(Boolean)
    .map(compactId);
}

function confidenceLabel(score = 0) {
  if (score >= 76) return "High";
  if (score >= 58) return "Medium";
  if (score >= 38) return "Developing";
  return "Low";
}

function primaryNarratives(project = {}) {
  return [
    ...(project.narratives || []),
    project.narrative,
    project.primaryNarrative,
    project.category,
    ...(project.alphaTags || []),
  ]
    .filter(Boolean)
    .map((value) => compactId(value))
    .filter(Boolean)
    .slice(0, 8);
}

function addNode(nodes = [], node = {}) {
  if (!node.id) return;
  if (!nodes.some((existing) => existing.id === node.id)) nodes.push(node);
}

function buildEntityGraph(project = {}, events = [], projects = []) {
  const projectKey = causalAlphaProjectKey(project);
  const nodes = [];
  const edges = [];
  const chain = compactId(project.chain || "unknown");
  const symbol = compactId(project.symbol || "unknown");
  const contract = compactId(project.address || project.tokenAddress || "");
  const pool = compactId(project.pairAddress || "");
  const repository = compactId(
    project.githubIntelligencePro?.repository || project.githubRepository || project.repository || ""
  );
  const narratives = primaryNarratives(project);
  const sources = sourceFamilies(project);

  addNode(nodes, {
    nodeType: "PROJECT",
    id: `project:${projectKey}`,
    nodeId: projectKey,
    label: project.name || project.symbol || "Unknown",
    identityConfidence: project.identityVerified ? 0.95 : num(project.identityResolutionScore) / 100 || 0.45,
    attributes: {
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: num(project.pipelineScore || project.opportunityScore),
    },
    firstSeenAt: project.discoveredAt || project.createdAt || null,
    lastSeenAt: new Date().toISOString(),
  });

  addNode(nodes, {
    nodeType: "TOKEN",
    id: `token:${symbol}`,
    nodeId: symbol,
    label: project.symbol || "UNKNOWN",
    identityConfidence: 0.75,
    attributes: { marketCap: num(project.marketCap || project.circulatingMarketCap), fdv: num(project.fdv) },
  });
  edges.push({
    sourceNode: `project:${projectKey}`,
    targetNode: `token:${symbol}`,
    relationship: "ISSUES_TOKEN",
    confidence: 0.78,
    evidence: ["Project symbol linked to token identity."],
    firstObservedAt: project.discoveredAt || null,
  });

  addNode(nodes, {
    nodeType: "CHAIN",
    id: `chain:${chain}`,
    nodeId: chain,
    label: project.chain || "unknown",
    identityConfidence: 0.9,
    attributes: {},
  });
  edges.push({
    sourceNode: `project:${projectKey}`,
    targetNode: `chain:${chain}`,
    relationship: "DEPLOYED_ON",
    confidence: 0.8,
    evidence: ["Project chain metadata."],
    firstObservedAt: project.discoveredAt || null,
  });

  if (contract) {
    addNode(nodes, {
      nodeType: "CONTRACT",
      id: `contract:${contract}`,
      nodeId: contract,
      label: contract,
      identityConfidence: project.contractVerified ? 0.95 : 0.65,
      attributes: {
        safetyStatus: project.instantSafetyStatus || "unknown",
        riskScore: num(project.instantSafetyRiskScore),
      },
    });
    edges.push({
      sourceNode: `project:${projectKey}`,
      targetNode: `contract:${contract}`,
      relationship: "USES_CONTRACT",
      confidence: project.contractVerified ? 0.92 : 0.66,
      evidence: ["Contract address observed by scanner."],
      firstObservedAt: project.createdAt || project.discoveredAt || null,
    });
  }

  if (pool) {
    addNode(nodes, {
      nodeType: "TOKEN_POOL",
      id: `pool:${pool}`,
      nodeId: pool,
      label: pool,
      identityConfidence: 0.7,
      attributes: {
        liquidityUsd: num(project.liquidityUsd ?? project.liquidity),
        liquidityScore: num(project.liquidityScore || project.liquidityExpansionScore),
      },
    });
    edges.push({
      sourceNode: `project:${projectKey}`,
      targetNode: `pool:${pool}`,
      relationship: "HAS_LIQUIDITY_POOL",
      confidence: 0.74,
      evidence: ["Pool or pair address observed by discovery sources."],
      firstObservedAt: project.pairCreatedAt || project.discoveredAt || null,
    });
  }

  if (repository) {
    addNode(nodes, {
      nodeType: "REPOSITORY",
      id: `repo:${repository}`,
      nodeId: repository,
      label: repository,
      identityConfidence: 0.76,
      attributes: {
        githubProScore: num(project.githubProScore || project.githubScore),
        developerActivityScore: num(project.developerActivityScore),
      },
    });
    edges.push({
      sourceNode: `repo:${repository}`,
      targetNode: `project:${projectKey}`,
      relationship: "BUILT_BY",
      confidence: 0.74,
      evidence: ["Repository linked by project metadata or GitHub intelligence."],
      firstObservedAt: project.discoveredAt || null,
    });
  }

  for (const narrative of narratives) {
    addNode(nodes, {
      nodeType: "NARRATIVE",
      id: `narrative:${narrative}`,
      nodeId: narrative,
      label: narrative,
      identityConfidence: 0.65,
      attributes: { heat: num(project.narrativeHeatScore || project.narrativeForecastScore) },
    });
    edges.push({
      sourceNode: `project:${projectKey}`,
      targetNode: `narrative:${narrative}`,
      relationship: "PART_OF_NARRATIVE",
      confidence: 0.62,
      evidence: ["Narrative detected from project metadata and engine tags."],
      firstObservedAt: project.discoveredAt || null,
    });
  }

  if (num(project.smartMoneyAccumulationScore || project.smartWalletScore) > 0) {
    const walletNode = `wallet-cluster:${projectKey}:quality`;
    addNode(nodes, {
      nodeType: "WALLET_CLUSTER",
      id: walletNode,
      nodeId: `${projectKey}:quality`,
      label: "Quality Wallet Cluster",
      identityConfidence: clamp(100 - num(project.walletClusterRiskScore)) / 100,
      attributes: {
        smartMoneyScore: num(project.smartMoneyAccumulationScore || project.smartWalletScore),
        walletClusterRiskScore: num(project.walletClusterRiskScore),
      },
    });
    edges.push({
      sourceNode: walletNode,
      targetNode: `project:${projectKey}`,
      relationship: "ACCUMULATED_BY",
      confidence: clamp(num(project.smartMoneyAccumulationScore || project.smartWalletScore)) / 100,
      evidence: ["Wallet intelligence detected accumulation or arrival."],
      firstObservedAt: project.discoveredAt || null,
    });
  }

  if (num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore) > 0) {
    const catalystId = compactId(project.liveCatalystEvents?.[0]?.title || project.nextCatalyst?.label || `${projectKey}:catalyst`);
    addNode(nodes, {
      nodeType: "CATALYST",
      id: `catalyst:${catalystId}`,
      nodeId: catalystId,
      label: project.liveCatalystEvents?.[0]?.title || project.nextCatalyst?.label || "Tracked Catalyst",
      identityConfidence: clamp(project.sourceTruthScore || project.sourceReliabilityScore || 55) / 100,
      attributes: {
        catalystScore: num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore),
      },
    });
    edges.push({
      sourceNode: `project:${projectKey}`,
      targetNode: `catalyst:${catalystId}`,
      relationship: "HAS_CATALYST",
      confidence: clamp(project.liveCatalystRadarScore || project.catalystCalendarScore || 55) / 100,
      evidence: ["Catalyst engine or roadmap engine identified a trackable event."],
      firstObservedAt: project.discoveredAt || null,
    });
  }

  for (const source of sources.slice(0, 12)) {
    addNode(nodes, {
      nodeType: "SOURCE",
      id: `source:${source}`,
      nodeId: source,
      label: source,
      identityConfidence: /github|roadmap|defillama|coingecko|dexscreener|birdeye|native/.test(source) ? 0.78 : 0.52,
      attributes: {},
    });
    edges.push({
      sourceNode: `source:${source}`,
      targetNode: `project:${projectKey}`,
      relationship: "OBSERVED_BY",
      confidence: /github|roadmap|defillama|coingecko|dexscreener|birdeye|native/.test(source) ? 0.76 : 0.5,
      evidence: [`Observed in ${source}.`],
      firstObservedAt: project.discoveredAt || null,
    });
  }

  const sameNarrativeNeighbors = (Array.isArray(projects) ? projects : [])
    .filter((other) => causalAlphaProjectKey(other) !== projectKey)
    .filter((other) => {
      const otherNarratives = new Set(primaryNarratives(other));
      return narratives.some((narrative) => otherNarratives.has(narrative));
    })
    .slice(0, 8);

  for (const neighbor of sameNarrativeNeighbors) {
    const neighborKey = causalAlphaProjectKey(neighbor);
    addNode(nodes, {
      nodeType: "PROJECT",
      id: `project:${neighborKey}`,
      nodeId: neighborKey,
      label: neighbor.name || neighbor.symbol || "Peer Project",
      identityConfidence: 0.45,
      attributes: {
        symbol: neighbor.symbol || "UNKNOWN",
        chain: neighbor.chain || "unknown",
        score: num(neighbor.pipelineScore || neighbor.opportunityScore),
      },
    });
    edges.push({
      sourceNode: `project:${projectKey}`,
      targetNode: `project:${neighborKey}`,
      relationship: "SHARES_NARRATIVE_WITH",
      confidence: 0.44,
      evidence: ["Same-scan narrative neighbor."],
      firstObservedAt: new Date().toISOString(),
    });
  }

  return {
    projectKey,
    nodes,
    edges,
    eventLinks: events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      projectId: event.projectId,
      relatedEntities: event.relatedEntities,
    })),
    coverage: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      eventCount: events.length,
      sourceCount: sources.length,
      narrativeCount: narratives.length,
      relationshipTypes: [...new Set(edges.map((edge) => edge.relationship))],
    },
  };
}

const POSITIVE_SEQUENCE = [
  "DEVELOPER_ACCELERATION",
  "CONTRACT_OR_SAFETY_VERIFIED",
  "LIQUIDITY_FORMATION",
  "QUALITY_WALLET_ACCUMULATION",
  "ADOPTION_RETENTION_GROWTH",
  "CATALYST_CONFIRMED",
  "PRICE_RECOGNITION",
];

const MANIPULATED_SEQUENCE_HINTS = [
  "NARRATIVE_OR_ATTENTION_ACCELERATION",
  "PRICE_RECOGNITION",
  "MANIPULATION_OR_RISK_WARNING",
];

function orderScore(events = [], sequence = []) {
  let cursor = -1;
  let matched = 0;

  for (const type of sequence) {
    const index = events.findIndex((event, eventIndex) => eventIndex > cursor && event.eventType === type);
    if (index >= 0) {
      cursor = index;
      matched += 1;
    }
  }

  return Math.round((matched / sequence.length) * 100);
}

function sequenceLibraryStats(events = [], eventLake = {}) {
  const sequence = events.map((event) => event.eventType).join(">");
  const indexed = eventLake.indexes?.sequences || {};
  const exact = indexed[sequence]?.count || 0;
  const similar = Object.entries(indexed)
    .filter(([key]) => {
      const parts = key.split(">");
      return parts.some((part) => sequence.includes(part));
    })
    .reduce((sum, [, value]) => sum + num(value.count), 0);
  const sampleSize = exact + similar;
  const positiveOrder = orderScore(events, POSITIVE_SEQUENCE);

  return {
    sequenceId: compactId(sequence || "no-sequence"),
    orderedEvents: events.map((event) => event.eventType),
    comparableObservations: sampleSize,
    exactMatches: exact,
    similarMatches: similar,
    averageOutcome: sampleSize >= 8 ? (positiveOrder >= 70 ? "historically constructive" : "mixed") : "cold start",
    successRate: sampleSize >= 8 ? Math.round(clamp(positiveOrder * 0.65 + Math.min(25, sampleSize))) : 0,
    medianUpside: sampleSize >= 8 ? Math.round(clamp(positiveOrder * 0.9 + 20, 0, 180)) : 0,
    medianDrawdown: sampleSize >= 8 ? Math.round(clamp(42 - positiveOrder * 0.22, 8, 42)) : 0,
    medianTimeToBreakoutDays: sampleSize >= 8 ? Math.round(clamp(38 - positiveOrder * 0.22, 7, 45)) : 0,
    sampleSize,
    confidence: sampleSize >= 30 ? "High" : sampleSize >= 12 ? "Medium" : sampleSize >= 4 ? "Developing" : "Cold Start",
  };
}

function analyzeSequence(project = {}, events = [], eventLake = {}) {
  const positiveOrder = orderScore(events, POSITIVE_SEQUENCE);
  const manipulatedOrder = orderScore(events, MANIPULATED_SEQUENCE_HINTS);
  const hasPrice = events.some((event) => event.eventType === "PRICE_RECOGNITION");
  const hasManipulation = events.some((event) => event.eventType === "MANIPULATION_OR_RISK_WARNING");
  const underrecognized =
    !hasPrice &&
    average([
      project.githubProScore || project.developerActivityScore,
      project.liquidityExpansionScore || project.liquidityScore,
      project.organicBuyerScore || project.buyerRetentionScore,
      project.catalystCalendarScore || project.liveCatalystRadarScore,
    ]) >= 55;
  const sequenceScore = Math.round(
    clamp(
      positiveOrder * 0.68 +
        (underrecognized ? 18 : 0) +
        (hasPrice ? -6 : 6) -
        (hasManipulation ? 18 : 0) -
        (manipulatedOrder >= 67 ? 14 : 0)
    )
  );

  return {
    sequenceScore,
    positiveOrderScore: positiveOrder,
    manipulatedOrderScore: manipulatedOrder,
    primarySequence: events.map((event) => event.eventType),
    underrecognized,
    priceRecognized: hasPrice,
    manipulationWarning: hasManipulation,
    historicalPattern: sequenceLibraryStats(events, eventLake),
    interpretation:
      sequenceScore >= 72
        ? "Constructive causal order: fundamentals and liquidity are forming before broad price recognition."
        : hasManipulation || manipulatedOrder >= 67
        ? "Fragile or manipulated order: attention, price, or risk warnings arrived before enough proof."
        : "Developing order: useful events exist but the full breakout chain is not complete yet.",
  };
}

function evidenceScore(project = {}, graph = {}, sequence = {}) {
  return Math.round(
    clamp(
      average([
        project.proofScore,
        project.sourceTruthScore,
        project.sourceReliabilityScore,
        project.dataConfidenceScore,
      ]) * 0.32 +
        average([
          project.githubProScore || project.developerActivityScore,
          project.liquidityExpansionScore || project.liquidityScore,
          project.smartMoneyAccumulationScore || project.smartWalletScore,
          project.organicBuyerScore || project.buyerRetentionScore,
          project.liveCatalystRadarScore || project.catalystCalendarScore,
        ]) * 0.34 +
        sequence.sequenceScore * 0.24 +
        Math.min(10, graph.coverage.sourceCount * 1.2)
    )
  );
}

function buildCounterfactuals(project = {}, fullEvidenceScore = 0) {
  const components = [
    {
      key: "price",
      label: "scoreWithoutPrice",
      removal: "price recognition",
      impact: Math.max(4, Math.round(num(project.momentumShiftScore || project.priceChange24h) * 0.11)),
    },
    {
      key: "social",
      label: "scoreWithoutSocial",
      removal: "social and X activity",
      impact: Math.max(4, Math.round(num(project.xSocialScore || project.socialAccelerationScore) * 0.12)),
    },
    {
      key: "catalyst",
      label: "scoreWithoutCatalyst",
      removal: "catalyst or roadmap signal",
      impact: Math.max(4, Math.round(num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore) * 0.14)),
    },
    {
      key: "smartWallets",
      label: "scoreWithoutSmartWallets",
      removal: "smart-wallet evidence",
      impact: Math.max(4, Math.round(num(project.smartMoneyAccumulationScore || project.smartWalletScore) * 0.13)),
    },
    {
      key: "narrative",
      label: "scoreWithoutNarrative",
      removal: "narrative heat",
      impact: Math.max(4, Math.round(num(project.narrativeHeatScore || project.narrativeForecastScore) * 0.11)),
    },
  ];
  const outputs = {};
  const impacts = [];

  for (const component of components) {
    const adjusted = Math.round(clamp(fullEvidenceScore - component.impact));
    outputs[component.label] = adjusted;
    impacts.push({
      removed: component.removal,
      score: adjusted,
      impact: component.impact,
      survives: adjusted >= 58,
    });
  }

  const weakest = impacts.sort((a, b) => a.score - b.score)[0] || null;
  const survivals = impacts.filter((impact) => impact.survives).length;
  const evidenceFragilityScore = Math.round(
    clamp((5 - survivals) * 16 + (weakest ? Math.max(0, 58 - weakest.score) : 0))
  );

  return {
    fullEvidenceScore,
    ...outputs,
    weakestDependency: weakest?.removed || "unknown",
    evidenceFragilityScore,
    fragility: evidenceFragilityScore <= 25 ? "Low" : evidenceFragilityScore <= 52 ? "Medium" : "High",
    tests: impacts,
  };
}

function agentVerdict(score = 0, risk = false) {
  if (risk && score >= 65) return "Block";
  if (score >= 72) return "Pass";
  if (score >= 52) return "Needs Proof";
  return "Weak";
}

function buildResearchAgents(project = {}, graph = {}, sequence = {}, counterfactual = {}) {
  const agents = [
    {
      agent: "Identity Investigator",
      score: average([project.identityResolutionScore, project.sourceTruthScore, project.proofScore]),
      mission: "Resolve project, token, contract, chain, source, and duplicate identity.",
      finding: project.identityVerified ? "Identity is verified by final selection layer." : "Identity requires stronger source confirmation.",
    },
    {
      agent: "Contract Investigator",
      score: average([project.instantSafetyScore, project.deployerReputationScore, project.activeLiquidityTruthScore]),
      mission: "Check contract, deployer, permissions, pool, and hard-exit liquidity.",
      finding: project.instantSafetyStatus === "PASS" ? "Instant safety gate is passing." : "Safety status needs more proof.",
    },
    {
      agent: "Wallet Investigator",
      score: clamp(num(project.smartMoneyAccumulationScore || project.smartWalletScore) - num(project.walletClusterRiskScore) * 0.3),
      mission: "Separate real smart-money accumulation from related-wallet activity.",
      finding:
        num(project.walletClusterRiskScore) >= 60
          ? "Wallet clustering may be related or manipulated."
          : "No dominant related-wallet warning from current data.",
    },
    {
      agent: "Liquidity Investigator",
      score: average([project.liquidityExpansionScore, project.liquidityScore, project.activeLiquidityTruthScore]),
      mission: "Validate liquidity depth, growth, removability, and paper-exit quality.",
      finding:
        num(project.activeLiquidityTruthScore) >= 60
          ? "Usable liquidity evidence is constructive."
          : "Liquidity needs deeper verification.",
    },
    {
      agent: "Developer Investigator",
      score: average([project.githubProScore, project.githubScore, project.developerActivityScore]),
      mission: "Review repository activity, developer acceleration, and build authenticity.",
      finding:
        num(project.githubProScore || project.developerActivityScore) >= 60
          ? "Builder signal is meaningful."
          : "Builder signal is not yet strong.",
    },
    {
      agent: "Adoption Investigator",
      score: average([project.organicBuyerScore, project.buyerRetentionScore, project.communityGrowthScore, project.holderGrowthScore]),
      mission: "Check retained buyers, holders, users, product usage, and incentive quality.",
      finding:
        num(project.organicBuyerScore || project.buyerRetentionScore) >= 60
          ? "Adoption or buyer retention is constructive."
          : "Adoption proof remains thin.",
    },
    {
      agent: "Catalyst Investigator",
      score: average([project.liveCatalystRadarScore, project.roadmapProfitabilityScore, project.catalystCalendarScore, project.exchangeProbabilityScore]),
      mission: "Verify why-now catalysts, roadmap dates, launches, listings, and delays.",
      finding:
        num(project.liveCatalystRadarScore || project.roadmapProfitabilityScore || project.catalystCalendarScore) >= 60
          ? "Catalyst evidence is trackable."
          : "No strong catalyst confirmation yet.",
    },
    {
      agent: "Tokenomics Investigator",
      score: average([project.tokenomicsScore, 100 - num(project.tokenUnlockRiskScore), 100 - num(project.vestingPressureScore)]),
      mission: "Inspect unlocks, vesting pressure, value capture, and dilution.",
      finding:
        Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)) >= 65
          ? "Unlock or vesting pressure is elevated."
          : "No major unlock pressure detected from current scores.",
    },
    {
      agent: "Narrative Investigator",
      score: average([project.narrativeHeatScore, project.narrativeForecastScore, project.infrastructureNarrativeScore]),
      mission: "Determine whether the narrative is early, underrecognized, and relevant.",
      finding:
        sequence.underrecognized
          ? "Narrative and fundamentals appear underrecognized by price."
          : "Narrative may already be recognized or still forming.",
    },
    {
      agent: "Bear-Case Investigator",
      score: maxRisk(project),
      mission: "Disprove the setup using risk, manipulation, unlock, liquidity, and counterfactual fragility.",
      finding:
        counterfactual.fragility === "High" || maxRisk(project) >= 70
          ? "Bear case is active and should block promotion."
          : "Bear case did not break the thesis under current evidence.",
      adversarial: true,
    },
  ];

  return agents.map((agent) => ({
    ...agent,
    score: Math.round(clamp(agent.score)),
    verdict: agent.adversarial ? agentVerdict(agent.score, true) : agentVerdict(agent.score),
    graphCoverage: graph.coverage,
  }));
}

function buildHypothesis(project = {}, sequence = {}, counterfactual = {}, agents = []) {
  const name = project.name || project.symbol || "This project";
  const confirmations = [
    "Liquidity must remain stable or improve across the next two observations.",
    "Developer, roadmap, user, or buyer-retention evidence must keep improving.",
    "No new related-wallet, wash-trading, hard-exit, or contract-control warning should appear.",
  ];
  const invalidations = [
    "Liquidity declines 20% or hard-exit liquidity falls below paper-exit needs.",
    "Developer activity stops or roadmap/catalyst timing is delayed.",
    "Related wallets dominate accumulation or smart-wallet signal becomes cluster risk.",
    "Contract, deployer, unlock, vesting, or organic-demand firewall moves to restricted or critical.",
  ];

  if (num(project.liquidityUsd ?? project.liquidity) > 0) {
    confirmations.unshift(`Liquidity must remain above $${Math.round(num(project.liquidityUsd ?? project.liquidity) * 0.8).toLocaleString()}.`);
  }
  if (num(project.buyerRetentionScore || project.organicBuyerScore) > 0) {
    confirmations.push("Retained buyers or organic buyer score must not deteriorate on the next scan.");
  }
  if (num(project.liveCatalystRadarScore || project.roadmapProfitabilityScore) > 0) {
    confirmations.push("Tracked catalyst must stay valid and not become stale or rumor-only.");
  }

  const weakestAgent = [...agents]
    .filter((agent) => !agent.adversarial)
    .sort((a, b) => a.score - b.score)[0];

  return {
    hypothesis:
      sequence.underrecognized
        ? `${name} may enter market recognition because builder, liquidity, adoption, catalyst, or wallet evidence is improving while price recognition remains incomplete.`
        : `${name} has a developing causal case, but the scanner still needs stronger proof that events are connected before promotion.`,
    confirmations: confirmations.slice(0, 7),
    invalidations: invalidations.slice(0, 7),
    nextRequiredConfirmation:
      weakestAgent?.score < 55
        ? `${weakestAgent.agent} must raise proof above developing quality.`
        : counterfactual.fragility === "High"
        ? `Reduce thesis dependency on ${counterfactual.weakestDependency}.`
        : "Retest event order, liquidity, buyer retention, and source truth on the next observation.",
    reviewCadence:
      sequence.sequenceScore >= 72 && counterfactual.fragility !== "High"
        ? "next scan plus 24h follow-up"
        : "next scan",
  };
}

function networkVerdict(score = 0, confidence = 0, fragility = 0, risk = 0) {
  if (risk >= 75 || fragility >= 72) return "Causal Network Block";
  if (score >= 78 && confidence >= 62 && fragility <= 42) return "Causal Network Armed";
  if (score >= 66 && confidence >= 52) return "Causal Network Priority Research";
  if (score >= 50) return "Causal Network Watch";
  return "Causal Network Thin";
}

function projectState(verdict = "", sequence = {}, counterfactual = {}, risk = 0) {
  if (verdict === "Causal Network Armed") return "ARMED";
  if (verdict.includes("Priority")) return "RESEARCH_READY";
  if (risk >= 75 || counterfactual.fragility === "High") return "BLOCKED";
  if (sequence.underrecognized) return "UNDERRECOGNIZED_WATCH";
  return "WATCH";
}

function transitionAlerts(project = {}, state = "", previous = null) {
  const alerts = [];
  const previousState = previous?.latestState || "NEW";

  if (previousState !== "ARMED" && state === "ARMED") {
    alerts.push({
      severity: "High",
      type: "STATE_TRANSITION_ARMED",
      message: `${project.name || project.symbol || "Project"} advanced to ARMED causal-network state.`,
    });
  }
  if (previousState !== "BLOCKED" && state === "BLOCKED") {
    alerts.push({
      severity: "Medium",
      type: "STATE_TRANSITION_BLOCKED",
      message: `${project.name || project.symbol || "Project"} moved to blocked causal-network state.`,
    });
  }
  if (previous?.latestScore && num(project.autonomousCausalNetworkScore) - num(previous.latestScore) >= 12) {
    alerts.push({
      severity: "Medium",
      type: "CAUSAL_SCORE_ACCELERATION",
      message: "Causal-network score improved materially versus stored event-lake memory.",
    });
  }

  return alerts;
}

export function analyzeAutonomousCausalAlphaNetwork(project = {}, context = {}) {
  const projects = Array.isArray(context.projects) ? context.projects : [project];
  const eventLake = context.eventLake || loadCausalAlphaEventLake();
  const projectKey = causalAlphaProjectKey(project);
  const currentEvents = buildCausalAlphaEvents(project);
  const previousProfile = eventLake.projects?.[projectKey] || null;
  const previousEvents = previousProfile?.events || [];
  const events = [...previousEvents, ...currentEvents]
    .filter((event, index, all) => all.findIndex((item) => item.eventId === event.eventId) === index)
    .sort((a, b) => Date.parse(a.eventTimestamp) - Date.parse(b.eventTimestamp))
    .slice(-24);
  const graph = buildEntityGraph(project, events, projects);
  const sequence = analyzeSequence(project, events, eventLake);
  const fullEvidenceScore = evidenceScore(project, graph, sequence);
  const counterfactual = buildCounterfactuals(project, fullEvidenceScore);
  const agents = buildResearchAgents(project, graph, sequence, counterfactual);
  const bearCase = agents.find((agent) => agent.agent === "Bear-Case Investigator");
  const agentPassRate = Math.round(
    (agents.filter((agent) => !agent.adversarial && agent.verdict === "Pass").length /
      Math.max(1, agents.filter((agent) => !agent.adversarial).length)) *
      100
  );
  const risk = maxRisk(project);
  const networkScore = Math.round(
    clamp(
      fullEvidenceScore * 0.34 +
        sequence.sequenceScore * 0.24 +
        agentPassRate * 0.18 +
        clamp(100 - counterfactual.evidenceFragilityScore) * 0.14 +
        clamp(100 - risk) * 0.1
    )
  );
  const confidenceScore = Math.round(
    clamp(
      average([project.dataConfidenceScore, project.sourceTruthScore, project.sourceReliabilityScore, project.proofScore]) * 0.46 +
        Math.min(20, graph.coverage.eventCount * 2.4) +
        Math.min(16, graph.coverage.sourceCount * 1.4) +
        Math.min(12, sequence.historicalPattern.sampleSize) -
        (bearCase?.verdict === "Block" ? 12 : 0)
    )
  );
  const verdict = networkVerdict(networkScore, confidenceScore, counterfactual.evidenceFragilityScore, risk);
  const state = projectState(verdict, sequence, counterfactual, risk);
  const hypothesis = buildHypothesis(project, sequence, counterfactual, agents);
  const alerts = transitionAlerts(
    { ...project, autonomousCausalNetworkScore: networkScore },
    state,
    previousProfile
  );
  const independentEvidenceFamilies = [
    num(project.githubProScore || project.developerActivityScore) >= 55 ? "developer" : "",
    num(project.liquidityExpansionScore || project.liquidityScore) >= 55 ? "liquidity" : "",
    num(project.smartMoneyAccumulationScore || project.smartWalletScore) >= 55 ? "wallet" : "",
    num(project.organicBuyerScore || project.buyerRetentionScore) >= 55 ? "adoption" : "",
    num(project.liveCatalystRadarScore || project.catalystCalendarScore || project.roadmapProfitabilityScore) >= 55 ? "catalyst" : "",
    num(project.sourceTruthScore || project.proofScore) >= 55 ? "source" : "",
  ].filter(Boolean);

  return {
    ...project,
    autonomousCausalNetworkScore: networkScore,
    autonomousCausalNetworkConfidenceScore: confidenceScore,
    autonomousCausalNetworkConfidence: confidenceLabel(confidenceScore),
    autonomousCausalNetworkVerdict: verdict,
    autonomousCausalProjectState: state,
    autonomousCausalNetworkRank: project.autonomousCausalNetworkRank || null,
    causalPatternSuccessRate: sequence.historicalPattern.successRate,
    causalPatternSampleSize: sequence.historicalPattern.sampleSize,
    causalEvidenceFragilityScore: counterfactual.evidenceFragilityScore,
    causalEvidenceFragility: counterfactual.fragility,
    causalIndependentEvidenceFamilies: independentEvidenceFamilies,
    causalSniperIntegrityGate: {
      status:
        state === "ARMED" && counterfactual.fragility !== "High" && risk < 65
          ? "PASS"
          : state === "BLOCKED"
          ? "BLOCK"
          : "RESEARCH",
      reasons: [
        verdict,
        sequence.interpretation,
        `Evidence fragility ${counterfactual.fragility}.`,
        bearCase?.finding || "Bear case reviewed.",
      ],
    },
    autonomousCausalAlphaNetwork: {
      name: "Autonomous Causal Alpha Intelligence Network",
      projectKey,
      score: networkScore,
      confidenceScore,
      confidence: confidenceLabel(confidenceScore),
      verdict,
      state,
      graph,
      pointInTimeEvents: events,
      causalSequence: sequence,
      counterfactual,
      researchAgents: agents,
      hypothesis,
      transitionAlerts: alerts,
      independentEvidenceFamilies,
      underrecognizedSummary: sequence.underrecognized
        ? "Fundamental or liquidity evidence is stronger than current price/social recognition."
        : "The underrecognition case needs more proof.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Causal Alpha Intelligence Network",
        signal: verdict,
        score: networkScore,
        confidence: confidenceScore / 100,
        impact: verdict.includes("Block") ? "Negative" : networkScore >= 66 ? "Positive" : "Neutral",
        reasons: [
          `Event sequence score ${sequence.sequenceScore}, graph ${graph.coverage.nodeCount} nodes/${graph.coverage.edgeCount} edges.`,
          `Counterfactual fragility ${counterfactual.fragility}; weakest dependency ${counterfactual.weakestDependency}.`,
          hypothesis.nextRequiredConfirmation,
        ],
      },
    ],
  };
}

export function analyzeAutonomousCausalAlphaNetworkBatch(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const eventLake = loadCausalAlphaEventLake();
  const analyzed = safeProjects.map((project) =>
    analyzeAutonomousCausalAlphaNetwork(project, {
      projects: safeProjects,
      eventLake,
    })
  );

  return analyzed
    .sort((a, b) => num(b.autonomousCausalNetworkScore) - num(a.autonomousCausalNetworkScore))
    .map((project, index) => ({
      ...project,
      autonomousCausalNetworkRank: index + 1,
      autonomousCausalAlphaNetwork: {
        ...project.autonomousCausalAlphaNetwork,
        rank: index + 1,
      },
    }))
    .sort((a, b) => num(a.pipelineRank || 999999) - num(b.pipelineRank || 999999));
}

export function summarizeAutonomousCausalAlphaNetwork(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.filter((project) => project.autonomousCausalAlphaNetwork);

  return {
    generatedAt: new Date().toISOString(),
    name: "Autonomous Causal Alpha Intelligence Network",
    totalProjects: safeProjects.length,
    analyzedProjects: analyzed.length,
    armedCandidates: analyzed.filter((project) => project.autonomousCausalProjectState === "ARMED").length,
    priorityResearch: analyzed.filter((project) => project.autonomousCausalNetworkVerdict === "Causal Network Priority Research").length,
    blocked: analyzed.filter((project) => project.autonomousCausalProjectState === "BLOCKED").length,
    lowFragility: analyzed.filter((project) => project.causalEvidenceFragility === "Low").length,
    eventLake: summarizeCausalAlphaEventLake(),
    topProjects: [...analyzed]
      .sort((a, b) => num(b.autonomousCausalNetworkScore) - num(a.autonomousCausalNetworkScore))
      .slice(0, 50)
      .map((project) => ({
        rank: project.autonomousCausalNetworkRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        state: project.autonomousCausalProjectState || "Unknown",
        score: project.autonomousCausalNetworkScore || 0,
        confidence: project.autonomousCausalNetworkConfidence || "Unknown",
        verdict: project.autonomousCausalNetworkVerdict || "Unknown",
        sequenceScore: project.autonomousCausalAlphaNetwork?.causalSequence?.sequenceScore || 0,
        historicalSuccessRate: project.causalPatternSuccessRate || 0,
        evidenceFragility: project.causalEvidenceFragility || "Unknown",
        weakestDependency: project.autonomousCausalAlphaNetwork?.counterfactual?.weakestDependency || "unknown",
        nextRequiredConfirmation: project.autonomousCausalAlphaNetwork?.hypothesis?.nextRequiredConfirmation || "",
        invalidations: project.autonomousCausalAlphaNetwork?.hypothesis?.invalidations || [],
      })),
  };
}
