function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function hasGithub(project = {}) {
  return Boolean(project.github || project.githubUrl || project.repository);
}

function missingEvidence(project = {}) {
  const missing = [];

  if (!project.fullRoadmap?.milestoneCount && !(project.roadmapMilestones || []).length) {
    missing.push({
      id: "roadmap",
      label: "Missing verified roadmap",
      severity: num(project.catalystScore || project.catalystCalendarScore) >= 55 ? "High" : "Medium",
      agent: "Roadmap Agent",
      action: "Crawl official roadmap, docs, blog, whitepaper/litepaper, changelog, and announcements.",
    });
  }
  if (!hasGithub(project)) {
    missing.push({
      id: "github",
      label: "Missing GitHub activity proof",
      severity: "Medium",
      agent: "GitHub Agent",
      action: "Find official repository and verify recent commits, contributors, releases, and issue resolution.",
    });
  }
  if (!project.tokenomics && num(project.tokenomicsScore) < 45) {
    missing.push({
      id: "tokenomics",
      label: "Missing tokenomics and allocation proof",
      severity: "High",
      agent: "Tokenomics Agent",
      action: "Verify supply, unlocks, emissions, team allocation, and liquidity controls.",
    });
  }
  if (!project.unlockDate && num(project.tokenUnlockRiskScore || project.vestingPressureScore) > 0) {
    missing.push({
      id: "unlocks",
      label: "Missing unlock schedule confirmation",
      severity: num(project.tokenUnlockRiskScore || project.vestingPressureScore) >= 55 ? "High" : "Medium",
      agent: "Risk Agent",
      action: "Confirm unlock calendar and vesting pressure from official docs or token terminal sources.",
    });
  }
  if (num(project.internetResearchScore) < 35 && num(project.webResearchPriority) >= 45) {
    missing.push({
      id: "web_research",
      label: "Missing external source confirmation",
      severity: "Medium",
      agent: "Research Agent",
      action: "Search project pages, Google News RSS, crypto RSS feeds, and negative-risk queries.",
    });
  }
  if (num(project.liquidityScore || project.liquidityExpansionScore) < 45) {
    missing.push({
      id: "liquidity",
      label: "Missing liquidity depth confirmation",
      severity: "Medium",
      agent: "Liquidity Agent",
      action: "Verify liquidity depth, pool concentration, volume quality, and migration risk.",
    });
  }
  if (num(project.trapRiskScore) >= 45 || num(project.externalRiskScore) >= 45) {
    missing.push({
      id: "risk_review",
      label: "Elevated risk requires challenge review",
      severity: num(project.trapRiskScore) >= 65 ? "Critical" : "High",
      agent: "Risk Agent",
      action: "Run negative-news, exploit, rug, unlock, deployer, and liquidity-control checks.",
    });
  }

  return missing;
}

function assignment(agent = "", priority = "Medium", task = "", reason = "") {
  return { agent, priority, task, reason };
}

function buildAssignments(project = {}, missing = []) {
  const assignments = [];

  assignments.push(
    assignment(
      "Commander",
      num(project.aiEcosystemScore || project.confidenceAdjustedScore) >= 65 ? "High" : "Medium",
      "Decide whether the project deserves promotion, more proof, or rejection.",
      "Commander owns final research routing."
    )
  );

  for (const item of missing) {
    assignments.push(assignment(item.agent, item.severity, item.action, item.label));
  }

  if (num(project.roadmapProfitabilityScore) >= 50) {
    assignments.push(
      assignment(
        "Roadmap Profit Agent",
        num(project.roadmapProfitabilityScore) >= 70 ? "High" : "Medium",
        "Verify if the roadmap catalyst is real, timed correctly, and not already priced in.",
        project.roadmapProfitabilityVerdict || "Roadmap catalyst detected."
      )
    );
  }
  if (num(project.liveCatalystRadarScore) >= 60) {
    assignments.push(
      assignment(
        "Catalyst Agent",
        "High",
        "Confirm top catalyst timing and prepare promotion/invalidation triggers.",
        project.liveCatalystRadar?.summary || "Catalyst radar elevated."
      )
    );
  }
  if (num(project.simulationBrainScore) >= 60 || num(project.breakoutProbability30d) >= 55) {
    assignments.push(
      assignment(
        "Simulation Agent",
        "Medium",
        "Compare simulated upside against bear-case drawdown and false-positive similarity.",
        `Breakout probability ${num(project.breakoutProbability30d)}%.`
      )
    );
  }

  return assignments.slice(0, 12);
}

function verdict(score = 0, missing = [], project = {}) {
  const criticalMissing = missing.filter((item) => item.severity === "Critical").length;
  const highMissing = missing.filter((item) => item.severity === "High").length;

  if (criticalMissing || num(project.trapRiskScore) >= 75) return "Avoid Until Risk Clears";
  if (score >= 78 && highMissing === 0) return "Promote To Alpha Investigation";
  if (score >= 62 && highMissing <= 2) return "Investigate Now";
  if (score >= 45) return "Needs More Proof";
  return "Low Priority Research";
}

export function analyzeAIResearchCommander(project = {}) {
  const missing = missingEvidence(project);
  const proof = avg([
    project.proofScore,
    project.dataConfidenceScore,
    project.sourceReliabilityScore,
    project.internetResearchScore,
    project.dossierSwarmScore,
  ]);
  const upside = avg([
    project.aiEcosystemScore,
    project.confidenceAdjustedScore,
    project.roadmapProfitabilityScore,
    project.liveCatalystRadarScore,
    project.simulationBrainScore,
    project.breakoutProbability30d,
  ]);
  const risk = Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.externalRiskScore),
    num(project.sellPressureScore),
    num(project.tokenUnlockRiskScore)
  );
  const evidencePenalty = missing.reduce(
    (sum, item) => sum + (item.severity === "Critical" ? 18 : item.severity === "High" ? 10 : 5),
    0
  );
  const commanderScore = Math.round(clamp(upside * 0.52 + proof * 0.38 - risk * 0.24 - evidencePenalty * 0.35 + 12));
  const assignments = buildAssignments(project, missing);
  const commanderVerdict = verdict(commanderScore, missing, project);

  return {
    ...project,
    researchCommanderScore: commanderScore,
    researchCommanderVerdict: commanderVerdict,
    missingEvidence: missing,
    researchAssignments: assignments,
    aiResearchCommander: {
      score: commanderScore,
      verdict: commanderVerdict,
      proofScore: proof,
      upsideScore: upside,
      riskScore: risk,
      missingEvidence: missing,
      assignments,
      nextAction:
        commanderVerdict === "Promote To Alpha Investigation"
          ? "Send to Alpha Investigator for a full case file."
          : commanderVerdict === "Investigate Now"
          ? "Prioritize missing proof and rerun scoring."
          : commanderVerdict === "Avoid Until Risk Clears"
          ? "Do not promote until critical risk evidence clears."
          : "Keep in queue until stronger evidence appears.",
      summary:
        missing.length > 0
          ? `${missing.length} evidence gaps found. Top gap: ${missing[0].label}.`
          : "No major evidence gaps detected by the commander.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "AI Research Commander",
        signal: "autonomous evidence routing and research task assignment",
        score: commanderScore,
        confidence: clamp((100 - missing.length * 8) / 100, 0.2, 0.9),
        impact: commanderScore >= 62 ? "Positive" : risk >= 60 ? "Negative" : "Neutral",
        reasons: [
          commanderVerdict,
          missing.length ? `${missing.length} missing evidence item(s).` : "Evidence stack is relatively complete.",
        ],
      },
    ],
  };
}

export function analyzeAIResearchCommanderBatch(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .map(analyzeAIResearchCommander)
    .sort((a, b) => num(b.researchCommanderScore) - num(a.researchCommanderScore));
}
