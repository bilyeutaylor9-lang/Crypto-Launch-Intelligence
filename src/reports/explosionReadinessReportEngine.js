import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.network || "unknown",
    tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    score: num(project.explosionReadinessScore),
    state: project.explosionReadinessState || "INSUFFICIENT_EVIDENCE",
    coverage: num(project.explosionReadinessCoverage),
    rankEligible: project.explosionReadinessRankEligible === true,
    components: project.explosionReadinessComponents || {},
    observedDeltas: project.explosionReadinessObservedDeltas || {},
    reasons: project.explosionReadinessReasons || [],
    missingEvidence: project.explosionReadinessMissingEvidence || [],
    riskPenalty: num(project.explosionReadinessRiskPenalty),
    fakeVolumeConcern: project.explosionReadinessFakeVolumeConcern === true,
    historyCount: num(project.explosionReadinessHistoryCount),
    evidenceFamilies: project.explosionReadinessEvidenceFamilies || [],
  };
}

export function summarizeExplosionReadiness(projects = [], meta = {}) {
  const ranked = (Array.isArray(projects) ? projects : [])
    .map(compact)
    .sort((left, right) =>
      Number(right.rankEligible) - Number(left.rankEligible) ||
      right.score - left.score ||
      right.coverage - left.coverage ||
      `${left.chain}:${left.symbol}`.localeCompare(`${right.chain}:${right.symbol}`)
    );
  const byState = (state, limit = 25) => ranked.filter((project) => project.state === state).slice(0, limit);
  const leaders = ranked.filter(
    (project) => project.rankEligible && ["COILED_ACCELERATION", "EARLY_ACCELERATION"].includes(project.state)
  );

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || null,
    reportType: "PRE_BREAKOUT_EXPLOSION_READINESS",
    automaticTradingEnabled: false,
    policy:
      "Research prioritization from measured temporal evidence. A score is not a probability or guarantee; no project is published as a leader without identity, market, source-diversity, acceleration, and anti-manipulation gates.",
    summary: {
      analyzed: ranked.length,
      evidenceBackedLeaders: leaders.length,
      coiledAcceleration: byState("COILED_ACCELERATION", ranked.length).length,
      earlyAcceleration: byState("EARLY_ACCELERATION", ranked.length).length,
      watch: byState("WATCH", ranked.length).length,
      insufficientEvidence: byState("INSUFFICIENT_EVIDENCE", ranked.length).length,
      lateOrDistorted: byState("LATE_OR_DISTORTED", ranked.length).length,
      riskBlocked: byState("RISK_BLOCKED", ranked.length).length,
      bestEvidenceBackedCandidate: leaders[0]?.symbol || null,
    },
    bestEvidenceBackedCandidate: leaders[0] || null,
    leaders: leaders.slice(0, 25),
    coiledAcceleration: byState("COILED_ACCELERATION"),
    earlyAcceleration: byState("EARLY_ACCELERATION"),
    watch: byState("WATCH"),
    dataRecovery: byState("INSUFFICIENT_EVIDENCE", 50),
    lateOrDistorted: byState("LATE_OR_DISTORTED", 50),
    riskBlocked: byState("RISK_BLOCKED", 50),
  };
}

export function writeExplosionReadinessReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, "explosion-readiness.json");
  const report = summarizeExplosionReadiness(projects, meta);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
