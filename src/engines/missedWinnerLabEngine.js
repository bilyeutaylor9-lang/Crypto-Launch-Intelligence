function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function identity(project = {}) {
  return String(project.projectId || project.address || project.tokenAddress || `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`).toLowerCase();
}

function achievedBreakout(project = {}) {
  return (
    num(project.outcomeReturnPct) >= 100 ||
    num(project.maxReturnPct) >= 100 ||
    num(project.volume24h) >= 1_000_000 ||
    num(project.liquidityUsd) >= 500_000 ||
    num(project.independentBuyers24h || project.uniqueBuyers24h) >= 1000 ||
    Boolean(project.majorExchangeListing) ||
    num(project.tvlGrowthPct) >= 100 ||
    num(project.revenueGrowthPct) >= 100
  );
}

export function analyzeMissedWinnerLab(projects = [], options = {}) {
  const scannerIds = new Set(projects.map(identity));
  const outsideWinners = Array.isArray(options.outsideWinners) ? options.outsideWinners : [];
  const evaluated = outsideWinners.filter(achievedBreakout).map((winner) => {
    const id = identity(winner);
    const discovered = scannerIds.has(id);
    const matched = projects.find((project) => identity(project) === id);

    return {
      id,
      symbol: winner.symbol || matched?.symbol || "UNKNOWN",
      discovered,
      source: matched?.source || winner.source || "outside-lab",
      scoreWhenSeen: matched?.discoveryDecisionScore || matched?.pipelineScore || 0,
      rejectedByFilter: matched?.discoveryDecisionTier === "CRITICAL" || matched?.discoveryDecisionTier === "RESTRICTED",
      missedReason: discovered
        ? matched?.discoveryDecisionScore < 50
          ? "score stayed too low"
          : "discovered but needs lead-time review"
        : "not discovered by current source set",
      missingSignal:
        winner.missingSignal ||
        (!discovered ? "source coverage or native listener gap" : matched?.discoveryDecisionTier === "UNVERIFIED" ? "verification gap" : "lead-time metric gap"),
    };
  });
  const detected = evaluated.filter((item) => item.discovered).length;

  return {
    generatedAt: new Date().toISOString(),
    evaluatedBreakouts: evaluated.length,
    detectedBreakouts: detected,
    missedBreakouts: evaluated.length - detected,
    legitimateBreakoutRecallPct: evaluated.length ? Math.round((detected / evaluated.length) * 100) : 0,
    targetMetric: "Percentage of legitimate breakouts detected before their first 100% move.",
    evaluated,
  };
}

export function analyzeMissedWinnerLabBatch(projects = [], options = {}) {
  const report = analyzeMissedWinnerLab(projects, options);
  return projects.map((project) => ({
    ...project,
    missedWinnerLabRecallPct: report.legitimateBreakoutRecallPct,
    missedWinnerLab: report,
  }));
}
