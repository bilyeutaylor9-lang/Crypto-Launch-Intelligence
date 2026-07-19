function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function normalizeProbabilities(raw = {}) {
  const entries = Object.entries(raw);
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, num(value)), 0) || 1;
  const scaled = entries.map(([key, value]) => {
    const exact = (Math.max(0, num(value)) / total) * 100;
    return {
      key,
      exact,
      rounded: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = 100 - scaled.reduce((sum, item) => sum + item.rounded, 0);

  for (const item of [...scaled].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining <= 0) break;
    item.rounded += 1;
    remaining -= 1;
  }

  while (remaining < 0) {
    const target = [...scaled].sort((a, b) => b.rounded - a.rounded)[0];
    if (!target || target.rounded <= 0) break;
    target.rounded -= 1;
    remaining += 1;
  }

  return Object.fromEntries(scaled.map((item) => [item.key, item.rounded]));
}

function entropy(probabilities = {}) {
  const values = Object.values(probabilities).map((value) => num(value) / 100).filter((value) => value > 0);
  const raw = values.reduce((sum, value) => sum - value * Math.log2(value), 0);
  const max = Math.log2(Math.max(2, values.length));
  return Math.round(clamp((raw / max) * 100));
}

function entropyLabel(score = 0) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  if (score >= 25) return "Low";
  return "Collapsed";
}

function entanglements(project = {}) {
  const pairs = [];

  if (num(project.narrativeHeatScore) >= 70 && num(project.liquidityScore) < 45) {
    pairs.push({
      pair: "Narrative heat x weak liquidity",
      effect: "Interference",
      summary: "Narrative upside is unstable until liquidity confirms.",
    });
  }
  if (num(project.catalystCalendarScore || project.catalystScore) >= 60 && num(project.sourceReliabilityScore) >= 55) {
    pairs.push({
      pair: "Catalyst x source reliability",
      effect: "Constructive",
      summary: "Catalyst evidence is more credible because source reliability is acceptable.",
    });
  }
  if (num(project.xSocialScore) >= 60 && num(project.xBotRiskScore) >= 45) {
    pairs.push({
      pair: "Social acceleration x bot risk",
      effect: "Interference",
      summary: "Social signal may be inflated by low-quality attention.",
    });
  }
  if (num(project.proofScore) >= 55 && num(project.trapRiskScore) < 30) {
    pairs.push({
      pair: "Proof x low trap risk",
      effect: "Constructive",
      summary: "Evidence quality and low trap risk reinforce each other.",
    });
  }

  return pairs;
}

function collapseTriggers(project = {}) {
  const triggers = [];

  if (num(project.proofScore) < 55) triggers.push("Proof score rises above 55.");
  if (num(project.confidenceAdjustedScore) < 65) triggers.push("Confidence-adjusted score rises above 65.");
  if (num(project.trapRiskScore) >= 20) triggers.push("Trap risk falls below 20.");
  if (num(project.liquidityScore) < 55) triggers.push("Liquidity score rises above 55.");
  if (num(project.sourceReliabilityScore) < 55) triggers.push("Source reliability rises above 55.");

  return triggers.length ? triggers : ["Current evidence is already relatively collapsed; monitor for invalidation."];
}

export function analyzeQuantumReasoningBrain(project = {}) {
  const upside = clamp(
    num(project.confidenceAdjustedScore) * 0.25 +
      num(project.narrativeHeatScore) * 0.18 +
      num(project.catalystCalendarScore || project.catalystScore) * 0.14 +
      num(project.alphaLabScore) * 0.12 +
      num(project.aiEcosystemScore) * 0.16 +
      num(project.multiTimeframeIntelligence?.["7d"]) * 0.15
  );
  const risk = clamp(
    num(project.trapRiskScore) * 0.35 +
      num(project.sellPressureScore) * 0.18 +
      num(project.tokenUnlockRiskScore) * 0.16 +
      num(project.redTeamReview?.score) * 0.18 +
      num(project.externalRiskScore) * 0.13
  );
  const uncertainty = clamp(
    100 -
      num(project.dataConfidenceScore) * 0.35 -
      num(project.proofScore) * 0.25 -
      num(project.sourceReliabilityScore) * 0.2 +
      num(project.aiDisagreement?.score) * 0.25
  );
  const probabilities = normalizeProbabilities({
    bull: 20 + upside * 0.45 - risk * 0.18,
    base: 42 + num(project.dataConfidenceScore) * 0.15 - uncertainty * 0.08,
    bear: 18 + risk * 0.42 + uncertainty * 0.14 - upside * 0.12,
    blackSwan: 6 + risk * 0.18 + num(project.trapRiskScore) * 0.12,
  });
  const entropyScore = entropy(probabilities);
  const quantumBrainScore = Math.round(
    clamp(probabilities.bull * 0.95 + probabilities.base * 0.35 - probabilities.bear * 0.42 - probabilities.blackSwan * 0.75 + 35)
  );
  const decisionState =
    entropyScore >= 70
      ? "Uncollapsed Alpha"
      : probabilities.bull > probabilities.bear + 15
      ? "Constructive Collapse"
      : probabilities.bear > probabilities.bull
      ? "Risk Collapse"
      : "Mixed Superposition";

  return {
    ...project,
    quantumBrainScore,
    quantumBullProbability: probabilities.bull,
    quantumBaseProbability: probabilities.base,
    quantumBearProbability: probabilities.bear,
    quantumBlackSwanProbability: probabilities.blackSwan,
    convictionEntropy: entropyLabel(entropyScore),
    convictionEntropyScore: entropyScore,
    quantumDecisionState: decisionState,
    entangledSignals: entanglements(project),
    collapseTriggers: collapseTriggers(project),
    quantumReasoningBrain: {
      score: quantumBrainScore,
      probabilities,
      entropyScore,
      entropy: entropyLabel(entropyScore),
      decisionState,
      summary: `${decisionState}: bull ${probabilities.bull}%, bear ${probabilities.bear}%, entropy ${entropyLabel(entropyScore)}.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Quantum Reasoning Brain",
        signal: "probabilistic scenario superposition",
        score: quantumBrainScore,
        confidence: entropyScore >= 70 ? 0.44 : 0.68,
        impact: probabilities.bull > probabilities.bear ? "Positive" : "Neutral",
        reasons: [
          `Bull ${probabilities.bull}%, base ${probabilities.base}%, bear ${probabilities.bear}%, black swan ${probabilities.blackSwan}%.`,
          `Collapse triggers: ${collapseTriggers(project).slice(0, 2).join(" ")}`,
        ],
      },
    ],
  };
}

export function analyzeQuantumReasoningBrainBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeQuantumReasoningBrain);
}
