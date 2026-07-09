function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.narrative,
    project.opportunityThesis,
    project.whyThisMatters,
    project.aiThesis?.memo,
    ...(project.newsItems || []).map((item) => item.title || item.summary),
    ...(project.internetResearch?.findings || []).map((item) => item.title || item.summary || item.text),
    ...(project.catalysts || []).map((item) => item.label || item.type || item.summary),
    ...(project.catalystSignals || []).map((item) => item.label || item.reason),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text = "", words = []) {
  return words.some((word) => text.includes(word));
}

function event(type = "", score = 0, window = "7d", urgency = "Medium", reasons = []) {
  return {
    type,
    score: Math.round(clamp(score)),
    window,
    urgency,
    reasons: reasons.filter(Boolean),
  };
}

function detectTextEvents(project = {}, text = "") {
  const events = [];

  if (includesAny(text, ["mainnet", "main net", "launching network", "network launch"])) {
    events.push(event("Mainnet Launch", 76, "7d-30d", "High", ["mainnet language detected"]));
  }
  if (includesAny(text, ["testnet", "incentivized testnet", "devnet"])) {
    events.push(event("Testnet Campaign", 60, "7d-30d", "Medium", ["testnet language detected"]));
  }
  if (includesAny(text, ["airdrop", "points", "claim", "eligibility", "snapshot"])) {
    events.push(event("Airdrop / Points Catalyst", 68, "72h-30d", "High", ["airdrop, points, claim, or snapshot language detected"]));
  }
  if (includesAny(text, ["listing", "binance", "coinbase", "kraken", "okx", "bybit", "upbit", "bithumb"])) {
    events.push(event("Exchange Listing Watch", 72, "24h-14d", "High", ["exchange/listing language detected"]));
  }
  if (includesAny(text, ["governance", "proposal", "vote", "dao vote", "temperature check"])) {
    events.push(event("Governance Vote", 58, "72h-14d", "Medium", ["governance or vote language detected"]));
  }
  if (includesAny(text, ["staking", "restaking", "validator", "delegation", "rewards", "apy"])) {
    events.push(event("Staking Change", 55, "7d-30d", "Medium", ["staking or restaking language detected"]));
  }
  if (includesAny(text, ["migration", "token migration", "rebrand", "upgrade", "v2", "release"])) {
    events.push(event("Migration / Release", 54, "7d-30d", "Medium", ["migration, release, or upgrade language detected"]));
  }
  if (includesAny(text, ["partnership", "integration", "grant", "ecosystem fund"])) {
    events.push(event("Partnership / Ecosystem Catalyst", 52, "7d-30d", "Medium", ["partnership, integration, or grant language detected"]));
  }

  if (num(project.tokenUnlockRiskScore) >= 60 || num(project.vestingPressureScore) >= 60) {
    events.push(
      event("Unlock / Vesting Risk Window", Math.max(project.tokenUnlockRiskScore || 0, project.vestingPressureScore || 0), "24h-30d", "High", [
        "unlock or vesting pressure elevated",
      ])
    );
  }

  return events;
}

function detectMarketEvents(project = {}) {
  const events = [];

  if (num(project.liquidityExpansionScore) >= 65) {
    events.push(event("Liquidity Expansion", project.liquidityExpansionScore, "24h-7d", "High", ["liquidity expansion score elevated"]));
  }
  if (num(project.volumeAccelerationScore || project.accelerationScore) >= 65) {
    events.push(event("Volume / Acceleration Spike", project.volumeAccelerationScore || project.accelerationScore, "24h-72h", "High", ["acceleration score elevated"]));
  }
  if (num(project.xSocialScore) >= 65 || num(project.socialAccelerationScore) >= 65) {
    events.push(event("X / Social Acceleration", Math.max(num(project.xSocialScore), num(project.socialAccelerationScore)), "24h-7d", "High", ["social acceleration elevated"]));
  }
  if (num(project.smartMoneyAccumulationScore) >= 65 || num(project.whaleScore ?? project.whaleActivityScore) >= 65) {
    events.push(event("Smart-Money Movement", Math.max(num(project.smartMoneyAccumulationScore), num(project.whaleScore ?? project.whaleActivityScore)), "24h-7d", "High", ["smart-money or whale activity elevated"]));
  }
  if (num(project.developerActivityScore ?? project.developerScore) >= 65 || num(project.githubScore ?? project.githubQualityScore) >= 65) {
    events.push(event("Developer Release Watch", Math.max(num(project.developerActivityScore ?? project.developerScore), num(project.githubScore ?? project.githubQualityScore)), "7d-30d", "Medium", ["developer or GitHub score elevated"]));
  }
  if (num(project.catalystCalendarScore || project.catalystScore) >= 65) {
    events.push(event("Catalyst Calendar Alert", project.catalystCalendarScore || project.catalystScore, "24h-30d", "High", ["catalyst calendar score elevated"]));
  }

  return events;
}

function urgencyFor(events = [], project = {}) {
  const highCount = events.filter((item) => item.urgency === "High").length;
  const maxScore = events.reduce((max, item) => Math.max(max, num(item.score)), 0);
  const risk = Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.tokenUnlockRiskScore));

  if (risk >= 75) return "Risk-Critical";
  if (highCount >= 3 || maxScore >= 82) return "Critical";
  if (highCount >= 1 || maxScore >= 68) return "High";
  if (events.length >= 2 || maxScore >= 50) return "Medium";
  return "Low";
}

function radarAction(urgency = "Low", events = [], project = {}) {
  if (urgency === "Risk-Critical") return "Risk review before promotion";
  if (["Critical", "High"].includes(urgency) && num(project.dossierSwarmScore) >= 45) {
    return "Promote to Dossier Swarm review";
  }
  if (["Critical", "High"].includes(urgency)) return "Run deep research verification";
  if (urgency === "Medium") return "Watch for confirmation";
  return "No immediate action";
}

export function analyzeLiveCatalystRadar(project = {}) {
  const text = textFor(project);
  const events = [...detectTextEvents(project, text), ...detectMarketEvents(project)]
    .sort((a, b) => num(b.score) - num(a.score));
  const eventScore = events.length
    ? Math.round(clamp(events.reduce((sum, item) => sum + num(item.score), 0) / events.length + Math.min(18, events.length * 3)))
    : 0;
  const urgency = urgencyFor(events, project);
  const score = Math.round(
    clamp(
      eventScore * 0.55 +
        num(project.catalystCalendarScore || project.catalystScore) * 0.18 +
        num(project.narrativeHeatScore) * 0.12 +
        num(project.liquidityExpansionScore) * 0.1 +
        (urgency === "Critical" ? 10 : urgency === "High" ? 6 : urgency === "Risk-Critical" ? -8 : 0)
    )
  );
  const action = radarAction(urgency, events, project);

  return {
    ...project,
    liveCatalystRadarScore: score,
    liveCatalystUrgency: urgency,
    liveCatalystAction: action,
    liveCatalystEvents: events,
    liveCatalystRadar: {
      score,
      urgency,
      action,
      eventCount: events.length,
      topEvent: events[0] || null,
      events,
      summary:
        events.length > 0
          ? `${urgency}: ${events[0].type} is the leading catalyst. ${action}.`
          : "No immediate catalyst detected.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Live Catalyst Radar",
        signal: "time-sensitive catalyst and event detection",
        score,
        confidence: events.length >= 3 ? 0.68 : events.length >= 1 ? 0.54 : 0.32,
        impact: ["Critical", "High"].includes(urgency) ? "Positive" : urgency === "Risk-Critical" ? "Negative" : "Neutral",
        reasons: events.slice(0, 3).map((item) => `${item.type}: ${item.reasons.join(", ")}`),
      },
    ],
  };
}

export function analyzeLiveCatalystRadarBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeLiveCatalystRadar);
}
