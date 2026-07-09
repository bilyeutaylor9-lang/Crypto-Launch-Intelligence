function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function counterfactual(project = {}, label = "", removedScore = 0) {
  const base = num(project.confidenceAdjustedScore || project.pipelineScore);
  const adjusted = Math.round(clamp(base - removedScore));

  return {
    label,
    scoreWithoutSignal: adjusted,
    impact: Math.round(base - adjusted),
  };
}

function causalHypotheses(project = {}) {
  const hypotheses = [];

  if (num(project.narrativeHeatScore) >= 70 && num(project.liquidityScore) >= 55) {
    hypotheses.push("Narrative heat and liquidity confirmation may jointly explain upside.");
  } else if (num(project.narrativeHeatScore) >= 70) {
    hypotheses.push("Narrative heat may be correlation until liquidity confirms.");
  }
  if (num(project.alphaLabScore) >= 60) {
    hypotheses.push("Alpha Lab strategy match may explain why this setup deserves monitoring.");
  }
  if (num(project.trapRiskScore) >= 45) {
    hypotheses.push("Trap risk may be the hidden driver behind weak confidence.");
  }

  return hypotheses.length ? hypotheses : ["No dominant causal driver isolated yet."];
}

function autopsy(project = {}) {
  const risks = [];

  if (num(project.proofScore) < 45) risks.push("Thin proof could create false positives.");
  if (num(project.sourceReliabilityScore) < 45) risks.push("Weak source reliability could inflate opportunity.");
  if (project.redTeamReview?.status === "Block") risks.push("Red-team blocked the thesis.");
  if (project.convictionEntropy === "High") risks.push("High entropy means the thesis is not collapsed yet.");
  if (num(project.trapRiskScore) >= 55) risks.push("Trap risk is near or above invalidation range.");

  return {
    falsePositiveRisk: Math.round(clamp(risks.length * 18 + num(project.trapRiskScore) * 0.25)),
    likelyFailureModes: risks,
    lesson:
      risks.length > 0
        ? "Do not promote until the failure modes are resolved."
        : "No dominant false-positive pattern detected.",
  };
}

function alphaDecay(project = {}) {
  const strategy = project.alphaLabBestStrategy;
  if (!strategy) {
    return {
      status: "No Strategy",
      risk: 0,
      summary: "No alpha-lab strategy matched.",
    };
  }

  const risk = Math.round(
    clamp(
      (strategy.status === "Cold Start" ? 35 : 0) +
        (strategy.trapRate || 0) * 0.7 +
        (strategy.sampleSize < 8 ? 18 : 0)
    )
  );

  return {
    status: risk >= 55 ? "Decaying Or Unproven" : "Stable",
    risk,
    summary:
      risk >= 55
        ? "Strategy is cold-start, noisy, or showing too much trap risk."
        : "Strategy has acceptable stability for monitoring.",
  };
}

function preferenceFit(project = {}) {
  const fit = Math.round(
    clamp(
      num(project.confidenceAdjustedScore) * 0.28 +
        (100 - num(project.trapRiskScore)) * 0.26 +
        num(project.proofScore) * 0.16 +
        num(project.narrativeHeatScore) * 0.12 +
        num(project.sourceReliabilityScore) * 0.1 +
        (project.strongBuyLifecycleStage === "Pre-Strong Buy" ? 8 : 0)
    )
  );

  return {
    score: fit,
    profile: "Early but risk-disciplined AI/Base/RWA-style research preference.",
    summary: fit >= 65 ? "Matches the preferred research style." : "Only partially matches the preferred research style.",
  };
}

export function analyzeAutonomousMarketScientist(project = {}) {
  const counterfactuals = [
    counterfactual(project, "Remove narrative heat", num(project.narrativeHeatScore) * 0.12),
    counterfactual(project, "Remove liquidity/flow", num(project.liquidityScore || project.signalProfile?.flows) * 0.12),
    counterfactual(project, "Remove proof/data confidence", num(project.proofScore || project.dataConfidenceScore) * 0.14),
    counterfactual(project, "Apply full trap-risk penalty", num(project.trapRiskScore) * 0.25),
  ].sort((a, b) => b.impact - a.impact);
  const autopsyOutput = autopsy(project);
  const decay = alphaDecay(project);
  const preference = preferenceFit(project);
  const marketScientistScore = Math.round(
    clamp(
      num(project.quantumBrainScore) * 0.24 +
        num(project.worldModelScore) * 0.2 +
        num(project.alphaLabScore) * 0.18 +
        preference.score * 0.18 +
        (100 - autopsyOutput.falsePositiveRisk) * 0.12 +
        (100 - decay.risk) * 0.08
    )
  );

  return {
    ...project,
    marketScientistScore,
    causalHypotheses: causalHypotheses(project),
    counterfactualAnalysis: counterfactuals,
    falsePositiveAutopsy: autopsyOutput,
    alphaDecayDetector: decay,
    humanPreferenceFit: preference,
    autonomousMarketScientist: {
      score: marketScientistScore,
      recommendation:
        marketScientistScore >= 70
          ? "Promote for deep research."
          : marketScientistScore >= 50
          ? "Keep in active research queue."
          : "Do not promote without new evidence.",
      summary: `Scientist score ${marketScientistScore}. ${autopsyOutput.lesson}`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Market Scientist",
        signal: "causal, counterfactual, decay, and autopsy reasoning",
        score: marketScientistScore,
        confidence: 0.57,
        impact: marketScientistScore >= 65 ? "Positive" : "Neutral",
        reasons: [
          causalHypotheses(project)[0],
          `Top counterfactual impact: ${counterfactuals[0]?.label || "none"}.`,
        ],
      },
    ],
  };
}

export function analyzeAutonomousMarketScientistBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeAutonomousMarketScientist);
}
