// src/engines/projectChangeDetectionEngine.js

import {
  getProjectHistories,
  resolveScanHistoryAsOf,
  scanHistoryProjectCutoff,
} from "../learning/scanMemoryStore.js";
import { exactScanHistoryIdentity } from "../identity/exactScanHistoryIdentity.js";

function measured(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function difference(before, after) {
  const oldValue = measured(before);
  const newValue = measured(after);
  const delta = oldValue === null || newValue === null ? null : newValue - oldValue;
  return Number.isFinite(delta) ? delta : null;
}

function pctChange(before, after) {
  const oldValue = measured(before);
  const newValue = measured(after);
  if (oldValue === null || newValue === null) return null;
  if (oldValue <= 0 || newValue <= 0) return 0; // Preserve the complete-input legacy formula.
  const delta = ((newValue - oldValue) / oldValue) * 100;
  return Number.isFinite(delta) ? delta : null;
}

function priorMeasurement(prior, key, legacy) {
  return prior.historyMeasurements && typeof prior.historyMeasurements === "object"
    ? prior.historyMeasurements[key]
    : legacy;
}

function changeState(delta = 0) {
  if (delta >= 12) return "accelerating";
  if (delta >= 4) return "improving";
  if (delta <= -12) return "deteriorating";
  if (delta <= -4) return "fading";
  return "stable";
}

const rounded = (value) => value === null ? null : Number(value.toFixed(2));
const display = (value, suffix = "") => value === null ? "unavailable" : `${value.toFixed(1)}${suffix}`;

export function analyzeProjectChangeBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const asOf = resolveScanHistoryAsOf(options);
  const requests = safeProjects.map((project) => ({
    project,
    identity: exactScanHistoryIdentity(project),
    cutoff: scanHistoryProjectCutoff(project, asOf),
    runId: options.scanRunId || project.scanRunId || project.runId || project.pipelineScanRunId || null,
  }));
  // Usually one group per batch. Grouping keeps different explicit current
  // cutoffs correct without doing a full history read for every project.
  const groups = new Map();
  for (const request of requests) {
    if (!request.identity || request.cutoff === null) continue;
    const key = JSON.stringify([request.cutoff, request.runId]);
    const group = groups.get(key) || [];
    group.push(request);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const histories = getProjectHistories(group.map((item) => item.project), 20, {
      asOf: group[0].cutoff,
      clock: () => asOf,
      excludeScanRunId: group[0].runId,
    });
    for (const request of group) request.prior = histories.get(request.identity.key)?.at(-1) || null;
  }

  return requests.map(({ project, identity, cutoff, prior }) => {
    if (!prior) {
      return {
        ...project,
        projectChangeScore: 50,
        projectChangeState: "new",
        projectChange: {
          state: "new",
          summary: "No eligible exact-identity prior scan record found.",
          historyEligibility: !identity ? "IDENTITY_UNRESOLVED_OR_CONFLICTING" : cutoff === null ? "INVALID_CURRENT_CLOCK" : "NO_ELIGIBLE_PRIOR",
          scoreDelta: null,
          liquidityChangePct: null,
          volumeChangePct: null,
          riskDelta: null,
        },
      };
    }

    const priorIdentity = exactScanHistoryIdentity(prior);
    // DEX-derived liquidity and volume describe a primary pool. A known pool
    // must match; missing pool identity cannot prove another known pool. With
    // both pools unspecified the legacy token-scoped comparison stays available.
    const sameMarketScope = identity.poolAddress === priorIdentity.poolAddress;
    const scoreDelta = difference(priorMeasurement(prior, "pipelineScore", prior.scores?.pipeline ?? prior.scores?.opportunity), project.pipelineScore ?? project.opportunityScore);
    const liquidityChangePct = sameMarketScope ? pctChange(priorMeasurement(prior, "liquidityUsd", prior.market?.liquidityUsd), project.liquidityUsd ?? project.liquidity) : null;
    const volumeChangePct = sameMarketScope ? pctChange(priorMeasurement(prior, "volume24hUsd", prior.market?.volume24h), project.volume24h ?? project.volume) : null;
    const riskDelta = difference(priorMeasurement(prior, "riskScore", prior.scores?.risk), project.riskScore);
    const state = changeState((scoreDelta ?? 0) + (liquidityChangePct ?? 0) * 0.04 + (volumeChangePct ?? 0) * 0.03 - (riskDelta ?? 0) * 0.3);
    const changeScore = Math.round(Math.max(0, Math.min(100,
      50 + (scoreDelta ?? 0) * 2 + (liquidityChangePct ?? 0) * 0.12 + (volumeChangePct ?? 0) * 0.08 - (riskDelta ?? 0)
    )));
    const summary = `${state}: score ${display(scoreDelta)}, liquidity ${display(liquidityChangePct, "%")}, volume ${display(volumeChangePct, "%")}.`;

    return {
      ...project,
      projectChangeScore: changeScore,
      projectChangeState: state,
      projectChange: {
        state,
        priorScannedAt: prior.scannedAt,
        historyIdentityKey: identity.key,
        marketScopeComparable: sameMarketScope,
        scoreDelta: rounded(scoreDelta),
        liquidityChangePct: rounded(liquidityChangePct),
        volumeChangePct: rounded(volumeChangePct),
        riskDelta: rounded(riskDelta),
        summary,
      },
      evidence: [
        ...(Array.isArray(project.evidence) ? project.evidence : []),
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
            `State: ${state}. Score delta: ${display(scoreDelta)}.`,
            `Liquidity change: ${display(liquidityChangePct, "%")}. Volume change: ${display(volumeChangePct, "%")}.`,
          ],
        },
      ],
    };
  });
}
