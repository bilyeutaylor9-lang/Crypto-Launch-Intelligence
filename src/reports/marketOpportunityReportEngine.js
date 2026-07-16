import fs from "fs";
import path from "path";
import { analyzeMarketOpportunityRankBatch } from "../engines/marketOpportunityRankEngine.js";
import { assembleOpportunityEvidence } from "../opportunity/opportunityEvidenceAssembler.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function rankedProjects(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const analyzed = safe.every((project) => Number.isFinite(Number(project.marketOpportunityRank)))
    ? safe
    : analyzeMarketOpportunityRankBatch(safe);
  return [...analyzed].sort(
    (a, b) =>
      num(b.marketOpportunityRank) - num(a.marketOpportunityRank) ||
      num(b.progressiveOpportunityScore) - num(a.progressiveOpportunityScore) ||
      num(b.trustScore) - num(a.trustScore)
  );
}

function recordFor(project = {}) {
  return project.opportunityEvidenceRecord || assembleOpportunityEvidence(project);
}

function independentFamilyCount(record = {}) {
  const familyCount = (record.evidenceFamilies || []).filter((family) => num(family.score) >= 55).length;
  return Math.max(familyCount, num(record.sourceCoverage?.sourceCount));
}

function compact(project = {}, rank = 0) {
  const record = recordFor(project);
  return {
    rank,
    projectKey: record.projectKey,
    identity: record.identity,
    marketOpportunityRank: Math.round(clamp(project.marketOpportunityRank)),
    scores: record.scores,
    opportunityLane: record.opportunityLane,
    recommendedHorizon: record.timeHorizons?.recommended || project.recommendedHorizon || "RESEARCH_ONLY",
    timeHorizons: record.timeHorizons,
    evidenceCoverage: record.scores?.evidenceCoverage || 0,
    independentEvidenceFamilies: independentFamilyCount(record),
    signals: (record.signals || []).slice(0, 8),
    risks: (record.risks || []).slice(0, 8),
    hardBlocks: record.hardBlocks || [],
    missingEvidence: (record.missingEvidence || []).slice(0, 8),
    materialChanges: (record.materialChanges || []).slice(0, 8),
    localAI: record.localAI,
    rankDrivers: project.marketOpportunityRankDrivers || [],
    disclaimer: record.disclaimer,
  };
}

function clearLeaderCheck(top = null, runnerUp = null) {
  if (!top) {
    return {
      clear: false,
      reasons: ["No projects were ranked."],
      gap: 0,
    };
  }
  const record = recordFor(top);
  const gap = num(top.marketOpportunityRank) - num(runnerUp?.marketOpportunityRank);
  const checks = [
    {
      pass: num(top.marketOpportunityRank) >= 80,
      reason: "Market Opportunity Rank must be at least 80.",
    },
    {
      pass: num(top.trustScore) >= 60,
      reason: "Trust Score must be at least 60.",
    },
    {
      pass: num(top.opportunityEvidenceCoverage) >= 60,
      reason: "Evidence coverage must be at least 60.",
    },
    {
      pass: independentFamilyCount(record) >= 3,
      reason: "At least 3 independent evidence families are required.",
    },
    {
      pass: !(record.hardBlocks || []).length,
      reason: "No hard block can be active.",
    },
    {
      pass: !runnerUp || gap >= 5,
      reason: "Leader must be at least 5 rank points above candidate #2.",
    },
  ];

  return {
    clear: checks.every((check) => check.pass),
    reasons: checks.filter((check) => !check.pass).map((check) => check.reason),
    gap: Math.round(gap),
  };
}

function winningReasons(project = {}) {
  const record = recordFor(project);
  return [
    ...(project.marketOpportunityRankDrivers || []),
    ...(record.signals || []).map((signal) => `${signal.label}: ${signal.score}`),
  ].slice(0, 8);
}

function runnerUpAdvantages(winner = {}, runnerUp = {}) {
  if (!runnerUp) return [];
  const advantages = [];
  const fields = [
    ["opportunity", "Opportunity"],
    ["timing", "Timing"],
    ["trust", "Trust"],
    ["attentionGap", "Attention Gap"],
    ["execution", "Execution"],
    ["evidenceCoverage", "Evidence Coverage"],
  ];
  const winnerRecord = recordFor(winner);
  const runnerRecord = recordFor(runnerUp);
  for (const [key, label] of fields) {
    if (num(runnerRecord.scores?.[key]) > num(winnerRecord.scores?.[key])) {
      advantages.push(`${label}: runner-up ${runnerRecord.scores[key]} vs leader ${winnerRecord.scores[key]}`);
    }
  }
  return advantages.slice(0, 6);
}

function strongestBearCase(project = {}) {
  const record = recordFor(project);
  return [
    ...(record.hardBlocks || []).map((item) => `Hard block: ${item}`),
    ...(record.risks || []).map((risk) => `${risk.label}: ${risk.score}`),
    ...(record.missingEvidence || []).map((item) => `Missing proof: ${item}`),
  ].slice(0, 8);
}

function finalistComparison(ranked = []) {
  const [winner, runnerUp] = ranked;
  const check = clearLeaderCheck(winner, runnerUp);
  const winnerRecord = winner ? recordFor(winner) : {};
  const runnerRecord = runnerUp ? recordFor(runnerUp) : {};

  return {
    generatedAt: new Date().toISOString(),
    verdict: check.clear ? "CLEAR_MARKET_LEADER" : "NO_CLEAR_MARKET_LEADER",
    winnerProjectKey: winnerRecord.projectKey || null,
    runnerUpProjectKey: runnerRecord.projectKey || null,
    confidence: winner
      ? Math.round(
          clamp(
            num(winner.marketOpportunityRank) * 0.45 +
              num(winner.trustScore) * 0.25 +
              num(winner.opportunityEvidenceCoverage) * 0.2 +
              Math.min(10, check.gap)
          )
        )
      : 0,
    evidenceCoverage: Math.round(clamp(winner?.opportunityEvidenceCoverage)),
    clearLeaderGap: check.gap,
    clearLeaderFailures: check.reasons,
    winningReasons: winner ? winningReasons(winner) : [],
    runnerUpAdvantages: runnerUpAdvantages(winner, runnerUp),
    strongestBearCase: winner ? strongestBearCase(winner) : [],
    invalidationConditions: winner?.invalidationConditions || [
      "Leader loses its score gap over candidate #2.",
      "Trust or evidence coverage falls below clear-leader requirements.",
      "New identity, contract, liquidity, or manipulation evidence creates a hard block.",
    ],
    recommendedHorizon: winnerRecord.timeHorizons?.recommended || "RESEARCH_ONLY",
    questions: [
      "Why does candidate #1 rank above #2?",
      "What advantage does #2 have over #1?",
      "Which candidate is earliest?",
      "Which has the strongest independent evidence?",
      "Which has the highest false-positive risk?",
      "Which catalyst is least priced in?",
      "Is there actually a clear winner?",
    ],
  };
}

function horizonLeaders(ranked = []) {
  const horizon = (key) =>
    [...ranked]
      .sort((a, b) => num(b.timeHorizonScores?.[key]) - num(a.timeHorizonScores?.[key]))
      .slice(0, 5)
      .map((project, index) => compact(project, index + 1));

  return {
    generatedAt: new Date().toISOString(),
    "24_72_HOURS": horizon("24_72_HOURS"),
    "7_14_DAYS": horizon("7_14_DAYS"),
    "30_90_DAYS": horizon("30_90_DAYS"),
  };
}

function laneLeaders(ranked = []) {
  const lanes = {};
  for (const project of ranked) {
    const lane = project.opportunityLane || recordFor(project).opportunityLane || "MONITOR";
    lanes[lane] ||= [];
    if (lanes[lane].length < 5) lanes[lane].push(compact(project, lanes[lane].length + 1));
  }
  return {
    generatedAt: new Date().toISOString(),
    lanes,
  };
}

function crawlerChanges(ranked = []) {
  const changes = ranked
    .map((project) => ({
      projectKey: recordFor(project).projectKey,
      identity: recordFor(project).identity,
      changes: recordFor(project).materialChanges || [],
      contradictions: project.internetResearch?.contradictions || project.sourceTruth?.contradictions || [],
      missingEvidence: (recordFor(project).missingEvidence || []).slice(0, 6),
    }))
    .filter((entry) => entry.changes.length || entry.contradictions.length || entry.missingEvidence.length)
    .slice(0, 50);

  return {
    generatedAt: new Date().toISOString(),
    changes,
    note: "This report is built from compact project evidence packets. It is ready for the queued crawler/change-detector layer.",
  };
}

function chiefJudgment(comparison = {}, topFive = []) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "DETERMINISTIC_CHIEF_MARKET_OPPORTUNITY_JUDGE",
    verdict: comparison.verdict,
    winnerProjectKey: comparison.winnerProjectKey,
    runnerUpProjectKey: comparison.runnerUpProjectKey,
    confidence: comparison.confidence,
    evidenceCoverage: comparison.evidenceCoverage,
    summary:
      comparison.verdict === "CLEAR_MARKET_LEADER"
        ? "A clear evidence-backed market leader exists under deterministic requirements."
        : "No clear market leader should be claimed yet; show the top five with missing proof.",
    topFive,
    winningReasons: comparison.winningReasons,
    runnerUpAdvantages: comparison.runnerUpAdvantages,
    strongestBearCase: comparison.strongestBearCase,
    invalidationConditions: comparison.invalidationConditions,
    disclaimer: "Research signal only. This is not financial advice or a profit promise.",
  };
}

export function summarizeMarketOpportunity(projects = []) {
  const ranked = rankedProjects(projects);
  const topFive = ranked.slice(0, 5).map((project, index) => compact(project, index + 1));
  const comparison = finalistComparison(ranked.slice(0, 5));
  const leader = ranked[0] || null;
  const leaderRecord = leader ? recordFor(leader) : null;

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: ranked.length,
    verdict: comparison.verdict,
    bestOpportunityNow:
      comparison.verdict === "CLEAR_MARKET_LEADER" && leader
        ? compact(leader, 1)
        : null,
    headline:
      comparison.verdict === "CLEAR_MARKET_LEADER"
        ? "BEST OPPORTUNITY RIGHT NOW"
        : "NO CLEAR MARKET LEADER",
    noClearLeaderReason:
      comparison.verdict === "NO_CLEAR_MARKET_LEADER"
        ? "The top candidates are too closely ranked or lack enough independent evidence."
        : "",
    topFiveOpportunities: topFive,
    finalistComparison: comparison,
    timeHorizonLeaders: horizonLeaders(ranked),
    opportunityLaneLeaders: laneLeaders(ranked),
    crawlerChanges: crawlerChanges(ranked),
    localAIChiefJudgment: chiefJudgment(comparison, topFive),
    leaderEvidenceRecord: leaderRecord,
    clearLeaderRequirements: [
      "Market Opportunity Rank >= 80",
      "Trust Score >= 60",
      "Evidence coverage >= 60",
      "At least 3 independent evidence families",
      "No hard block",
      "At least 5 points above candidate #2",
    ],
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function writeMarketOpportunityReports(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = summarizeMarketOpportunity(projects);

  const bestOpportunityNowPath = path.join(reportsDir, "best-opportunity-now.json");
  const topFiveOpportunitiesPath = path.join(reportsDir, "top-five-opportunities.json");
  const timeHorizonLeadersPath = path.join(reportsDir, "time-horizon-leaders.json");
  const opportunityLaneLeadersPath = path.join(reportsDir, "opportunity-lane-leaders.json");
  const finalistComparisonPath = path.join(reportsDir, "finalist-comparison.json");
  const crawlerChangesPath = path.join(reportsDir, "crawler-changes.json");
  const localAIChiefJudgmentPath = path.join(reportsDir, "local-ai-chief-judgment.json");

  writeJson(bestOpportunityNowPath, {
    generatedAt: report.generatedAt,
    headline: report.headline,
    verdict: report.verdict,
    bestOpportunityNow: report.bestOpportunityNow,
    noClearLeaderReason: report.noClearLeaderReason,
    topFiveOpportunities: report.topFiveOpportunities,
    clearLeaderRequirements: report.clearLeaderRequirements,
  });
  writeJson(topFiveOpportunitiesPath, {
    generatedAt: report.generatedAt,
    topFiveOpportunities: report.topFiveOpportunities,
  });
  writeJson(timeHorizonLeadersPath, report.timeHorizonLeaders);
  writeJson(opportunityLaneLeadersPath, report.opportunityLaneLeaders);
  writeJson(finalistComparisonPath, report.finalistComparison);
  writeJson(crawlerChangesPath, report.crawlerChanges);
  writeJson(localAIChiefJudgmentPath, report.localAIChiefJudgment);

  return {
    bestOpportunityNowPath,
    topFiveOpportunitiesPath,
    timeHorizonLeadersPath,
    opportunityLaneLeadersPath,
    finalistComparisonPath,
    crawlerChangesPath,
    localAIChiefJudgmentPath,
    report,
  };
}
