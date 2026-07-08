import { loadProjectWatchStore, projectWatchId } from "../learning/projectWatchlistStore.js";
import { saveWatchtowerAlerts, saveWatchtowerBrief } from "../learning/watchtowerStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function severityFor(delta = 0, high = 20, critical = 35) {
  const abs = Math.abs(num(delta));
  if (abs >= critical) return "Critical";
  if (abs >= high) return "High";
  if (abs >= high * 0.5) return "Medium";
  return "Low";
}

function alert(project = {}, previous = {}, fields = {}) {
  return {
    id: [
      Date.now(),
      fields.type,
      projectWatchId(project),
      Math.random().toString(16).slice(2, 8),
    ].join("-"),
    generatedAt: new Date().toISOString(),
    projectId: projectWatchId(project),
    project: project.name || project.symbol || "Unknown",
    symbol: project.symbol || "Unknown",
    chain: project.chain || "unknown",
    previousScore: num(previous.score),
    currentScore: num(project.pipelineScore ?? project.opportunityScore ?? project.score),
    status: "open",
    ...fields,
  };
}

function latestHistory(project = {}, watchStore = {}) {
  const watched = watchStore.projects?.[projectWatchId(project)];
  const history = watched?.history || [];
  return history.at(-1) || null;
}

function detectProjectAlerts(project = {}, previous = null) {
  const alerts = [];
  const currentScore = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const previousScore = num(previous?.score);
  const scoreDelta = currentScore - previousScore;

  if (!previous) {
    if (currentScore >= 80 || project.aiDecision === "Priority Watch") {
      alerts.push(
        alert(project, {}, {
          severity: currentScore >= 90 ? "High" : "Medium",
          type: "New Priority Candidate",
          message: `${project.name || project.symbol || "Project"} entered the watchtower as a high-priority candidate.`,
          action: project.executionPlan?.action || "Review",
          metrics: { currentScore },
        })
      );
    }
    return alerts;
  }

  if (scoreDelta >= 10) {
    alerts.push(
      alert(project, previous, {
        severity: severityFor(scoreDelta, 12, 25),
        type: "Score Spike",
        message: `Opportunity score increased ${Math.round(scoreDelta)} points.`,
        action: scoreDelta >= 20 ? "Move to Priority Research" : "Review score drivers",
        metrics: { previousScore, currentScore, scoreDelta: Math.round(scoreDelta) },
      })
    );
  }

  if (scoreDelta <= -12) {
    alerts.push(
      alert(project, previous, {
        severity: severityFor(scoreDelta, 14, 28),
        type: "Score Deterioration",
        message: `Opportunity score fell ${Math.abs(Math.round(scoreDelta))} points.`,
        action: "Review invalidation signals",
        metrics: { previousScore, currentScore, scoreDelta: Math.round(scoreDelta) },
      })
    );
  }

  const priorityDelta = num(project.watchlistPriority) - num(previous.watchlistPriority);
  if (priorityDelta >= 15) {
    alerts.push(
      alert(project, previous, {
        severity: severityFor(priorityDelta, 18, 32),
        type: "Priority Escalation",
        message: `Watchlist priority increased ${Math.round(priorityDelta)} points.`,
        action: "Escalate research queue",
        metrics: { priorityDelta: Math.round(priorityDelta) },
      })
    );
  }

  const socialDelta = num(project.xSocialScore) - num(previous.xSocialScore);
  if (socialDelta >= 18 || num(project.externalSignalScore) >= 70) {
    alerts.push(
      alert(project, previous, {
        severity: socialDelta >= 30 || num(project.externalSignalScore) >= 80 ? "High" : "Medium",
        type: "Social/X Surge",
        message: `Social/external attention accelerated${socialDelta ? ` by ${Math.round(socialDelta)} points` : ""}.`,
        action: "Validate X/news source quality",
        metrics: {
          socialDelta: Math.round(socialDelta),
          externalSignalScore: num(project.externalSignalScore),
        },
      })
    );
  }

  const liquidityChange = pctChange(previous.liquidityUsd, project.liquidityUsd ?? project.liquidity);
  if (liquidityChange >= 30 || num(project.liquidityMigrationScore) >= 70) {
    alerts.push(
      alert(project, previous, {
        severity: liquidityChange >= 75 || num(project.liquidityMigrationScore) >= 85 ? "High" : "Medium",
        type: "Liquidity Migration",
        message: `Liquidity profile improved${liquidityChange ? ` ${Math.round(liquidityChange)}%` : ""}.`,
        action: "Inspect pool depth and migration source",
        metrics: {
          liquidityChangePct: Math.round(liquidityChange),
          liquidityMigrationScore: num(project.liquidityMigrationScore),
        },
      })
    );
  }

  if (num(project.prePumpPatternEdge) >= 15 || num(project.prePumpPatternMatchPct) >= 72) {
    alerts.push(
      alert(project, previous, {
        severity: num(project.prePumpPatternMatchPct) >= 80 ? "Critical" : "High",
        type: "Pre-Breakout Pattern",
        message: `Project matches ${project.prePumpPatternMatchPct || 0}% of previous pre-breakout profiles.`,
        action: "Move to Priority Research",
        metrics: {
          breakoutMatchPct: num(project.prePumpPatternMatchPct),
          trapMatchPct: num(project.trapPatternMatchPct),
          patternEdge: num(project.prePumpPatternEdge),
        },
      })
    );
  }

  if (num(project.smartMoneyConvictionScore) >= 70 || num(project.smartMoneyAccumulationScore) >= 75) {
    alerts.push(
      alert(project, previous, {
        severity: num(project.smartMoneyConvictionScore) >= 85 ? "High" : "Medium",
        type: "Smart Money Conviction",
        message: "Smart money conviction is elevated.",
        action: "Review wallet clusters and holding quality",
        metrics: {
          smartMoneyConvictionScore: num(project.smartMoneyConvictionScore),
          smartMoneyAccumulationScore: num(project.smartMoneyAccumulationScore),
        },
      })
    );
  }

  if (
    num(project.vestingPressureScore) >= 70 ||
    num(project.tokenUnlockRiskScore) >= 70 ||
    num(project.externalRiskScore) >= 60 ||
    project.aiDecision === "Reject"
  ) {
    alerts.push(
      alert(project, previous, {
        severity: project.aiDecision === "Reject" || num(project.vestingPressureScore) >= 85 ? "High" : "Medium",
        type: "Risk Escalation",
        message: "Risk layer escalated due to vesting, unlock, external, or AI analyst warning.",
        action: "Review before adding or holding watch priority",
        metrics: {
          vestingPressureScore: num(project.vestingPressureScore),
          tokenUnlockRiskScore: num(project.tokenUnlockRiskScore),
          externalRiskScore: num(project.externalRiskScore),
          aiDecision: project.aiDecision || null,
        },
      })
    );
  }

  if (previous.thesis && project.aiThesis?.memo && previous.thesis !== project.aiThesis.memo) {
    alerts.push(
      alert(project, previous, {
        severity: project.aiDecision === "Priority Watch" || project.aiDecision === "Reject" ? "Medium" : "Low",
        type: "AI Thesis Change",
        message: "AI analyst thesis changed since the last watch record.",
        action: "Compare thesis drift",
        metrics: {
          previousThesis: previous.thesis,
          currentThesis: project.aiThesis.memo,
          aiDecision: project.aiDecision || null,
        },
      })
    );
  }

  return alerts;
}

function buildDailyBrief(projects = [], alerts = []) {
  const openAlerts = alerts.filter((item) => item.status !== "archived");
  const ranked = [...projects].sort(
    (a, b) => num(b.pipelineScore ?? b.opportunityScore ?? b.score) - num(a.pipelineScore ?? a.opportunityScore ?? a.score)
  );
  const critical = openAlerts.filter((item) => item.severity === "Critical");
  const high = openAlerts.filter((item) => item.severity === "High");
  const risk = openAlerts.filter((item) => /risk|deterioration|vesting|unlock/i.test(item.type));
  const opportunity = openAlerts.filter((item) =>
    /pre-breakout|score spike|priority|smart money|liquidity|social/i.test(item.type)
  );

  return {
    generatedAt: new Date().toISOString(),
    scannedProjects: projects.length,
    alertCount: openAlerts.length,
    criticalCount: critical.length,
    highCount: high.length,
    topOpportunities: ranked.slice(0, 10).map((project) => ({
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      score: num(project.pipelineScore ?? project.opportunityScore ?? project.score),
      confidence: project.confidence || "Unknown",
      dataConfidence: project.dataConfidence || "Unknown",
      action: project.executionPlan?.action || "Review",
      aiDecision: project.aiDecision || "Unknown",
    })),
    priorityAlerts: [...critical, ...high].slice(0, 15),
    opportunityAlerts: opportunity.slice(0, 15),
    riskAlerts: risk.slice(0, 15),
    brief:
      openAlerts.length === 0
        ? "No major watchtower changes detected."
        : `${critical.length} critical, ${high.length} high, and ${openAlerts.length} total watchtower alerts detected.`,
  };
}

export function analyzeWatchtower(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const watchStore = options.watchStore || loadProjectWatchStore();
  const alerts = safeProjects.flatMap((project) =>
    detectProjectAlerts(project, latestHistory(project, watchStore))
  );
  const brief = buildDailyBrief(safeProjects, alerts);

  if (options.persist !== false) {
    saveWatchtowerAlerts(alerts);
    saveWatchtowerBrief(brief);
  }

  return {
    alerts,
    brief,
  };
}
