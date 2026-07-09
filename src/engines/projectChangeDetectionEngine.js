// src/engines/projectChangeDetectionEngine.js

import { getProjectHistory } from "../learning/scanMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pctChange(oldValue = 0, newValue = 0) {
  const oldNum = num(oldValue);
  const newNum = num(newValue);

  if (oldNum <= 0 || newNum <= 0) return 0;
  return ((newNum - oldNum) / oldNum) * 100;
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function latestPrior(project = {}) {
  const history = getProjectHistory(projectId(project), 20);
  return history.at(-1) || null;
}

function changeState(delta = 0) {
  if (delta >= 12) return "accelerating";
  if (delta >= 4) return "improving";
  if (delta <= -12) return "deteriorating";
  if (delta <= -4) return "fading";
  return "stable";
}

export function analyzeProjectChangeBatch(projects = []) {
  return projects.map((project) => {
    const prior = latestPrior(project);

    if (!prior) {
      return {
        ...project,
        projectChangeScore: 50,
        projectChangeState: "new",
        projectChange: {
          state: "new",
          summary: "No prior scan record found.",
          scoreDelta: 0,
          liquidityChangePct: 0,
          volumeChangePct: 0,
        },
      };
    }

    const scoreDelta = num(project.pipelineScore ?? project.opportunityScore) - num(prior.scores?.pipeline);
    const liquidityChangePct = pctChange(prior.market?.liquidityUsd, project.liquidityUsd ?? project.liquidity);
    const volumeChangePct = pctChange(prior.market?.volume24h, project.volume24h ?? project.volume);
    const riskDelta = num(project.riskScore) - num(prior.scores?.risk);
    const state = changeState(scoreDelta + liquidityChangePct * 0.04 + volumeChangePct * 0.03 - riskDelta * 0.3);
    const changeScore = Math.round(
      Math.max(
        0,
        Math.min(100, 50 + scoreDelta * 2 + liquidityChangePct * 0.12 + volumeChangePct * 0.08 - riskDelta)
      )
    );

    return {
      ...project,
      projectChangeScore: changeScore,
      projectChangeState: state,
      projectChange: {
        state,
        priorScannedAt: prior.scannedAt,
        scoreDelta: Number(scoreDelta.toFixed(2)),
        liquidityChangePct: Number(liquidityChangePct.toFixed(2)),
        volumeChangePct: Number(volumeChangePct.toFixed(2)),
        riskDelta: Number(riskDelta.toFixed(2)),
        summary: `${state}: score ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(1)}, liquidity ${liquidityChangePct.toFixed(1)}%, volume ${volumeChangePct.toFixed(1)}%.`,
      },
      evidence: [
        ...(project.evidence || []),
        {
          engine: "Project Change Detector",
          signal: "scan-over-scan change",
          score: changeScore,
          confidence: 0.64,
          impact: ["accelerating", "improving"].includes(state)
            ? "Positive"
            : ["deteriorating", "fading"].includes(state)
            ? "Negative"
            : "Neutral",
          reasons: [
            `State: ${state}. Score delta: ${scoreDelta.toFixed(1)}.`,
            `Liquidity change: ${liquidityChangePct.toFixed(1)}%. Volume change: ${volumeChangePct.toFixed(1)}%.`,
          ],
        },
      ],
    };
  });
}
