import fs from "fs";
import path from "path";

import { canonicalIdentityKey, num } from "../edge/edgeMath.js";
import { analyzeCapitalIntentGraphBatch } from "./capitalIntentGraphEngine.js";
import { analyzeRealTimeTradeFlowBatch } from "./realTimeTradeFlowEngine.js";
import { analyzeLocalMarketStateBatch } from "./localMarketStateEngine.js";
import { analyzeSupplyShockBatch } from "./supplyShockEngine.js";
import { attachGlobalMarketRegimeBatch } from "./globalMarketRegimeEngine.js";
import { analyzeThreeClockEdgeBatch } from "./threeClockEdgeEngine.js";
import { analyzeWalletTemporalFingerprintBatch } from "./walletTemporalFingerprintEngine.js";
import { analyzeDownstreamAdoptionGraphBatch } from "./downstreamAdoptionGraphEngine.js";
import { analyzeFakeMomentumFirewallBatch } from "./fakeMomentumFirewallEngine.js";
import { analyzeMarketChangePointRadar } from "./marketChangePointRadarEngine.js";
import {
  analyzeInformationDiffusionClock,
  buildDiffusionExamples,
} from "./informationDiffusionClockEngine.js";
import {
  analyzeEventSequenceDNA,
  buildHistoricalSequences,
} from "./eventSequenceDNAEngine.js";
import { analyzeBreakoutHazardBatch } from "./breakoutHazardEngine.js";
import { analyzeEdgeHalfLife } from "./edgeHalfLifeEngine.js";
import { analyzeEdgeUncertaintyBatch } from "./edgeUncertaintyEngine.js";
import { analyzeResidualAlphaBatch } from "../learning/residualAlphaMiner.js";
import { loadLeadTimeOutcomeLab } from "../learning/leadTimeOutcomeLab.js";
import {
  appendAsymmetricEdgeObservations,
  buildAsymmetricEdgeObservation,
  historyForEdgeProject,
  loadAsymmetricEdgeObservations,
} from "../learning/asymmetricEdgeObservationStore.js";

const REPORT_FILE = path.resolve("reports", "asymmetric-edge-suite.json");

function currentObservation(project = {}, observedAt = new Date().toISOString()) {
  return {
    identityKey: canonicalIdentityKey(project),
    observedAt,
    symbol: project.symbol || null,
    chain: project.chain || project.canonicalChain || null,
    priceUsd: num(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
    liquidityUsd: num(project.liquidityUsd ?? project.dexLiquidityUsd ?? project.stableExitLiquidityUsd),
    volume24hUsd: num(project.volume24hUsd ?? project.volume24h ?? project.volume),
    buyerCount: num(project.uniqueBuyers24h ?? project.buyers24h),
    projectClockScore: num(project.projectClockScore ?? project.threeClockEdge?.projectClock?.score),
    capitalClockScore: num(project.capitalClockScore ?? project.threeClockEdge?.capitalClock?.score),
    attentionClockScore: num(project.attentionClockScore ?? project.threeClockEdge?.attentionClock?.score),
    divergenceScore: num(project.threeClockDivergenceScore ?? project.threeClockEdge?.divergence?.score),
    divergenceState: project.threeClockDivergenceState ?? project.threeClockEdge?.divergence?.state ?? null,
    leadStage: num(project.threeClockLeadStage ?? project.threeClockEdge?.leadSequence?.stage),
    leadStageLabel: project.threeClockEdge?.leadSequence?.label || null,
    structuralBreakScore: num(project.marketChangePointRadar?.score),
    structuralBreakState: project.marketChangePointRadar?.state || null,
    fakeMomentumRiskScore: num(project.fakeMomentumFirewall?.riskScore),
  };
}

function historiesByKey(observations = []) {
  const map = new Map();
  for (const row of observations) {
    if (!row.identityKey) continue;
    map.set(row.identityKey, [...(map.get(row.identityKey) || []), row]);
  }
  for (const rows of map.values()) rows.sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || "")));
  return map;
}

function suiteState(project = {}) {
  const uncertainty = project.edgeUncertainty || {};
  const divergence = project.threeClockDivergenceState;
  const structural = project.structuralBreakState;
  const hazard24 = num(project.breakoutHazard24hPct) || 0;
  const residual = num(project.residualBlindspotSimilarity) || 0;
  const dna = num(project.eventSequenceSimilarity) || 0;
  const fakeRisk = num(project.fakeMomentumRiskScore) || 0;
  const supplyRisk = num(project.supplyShockRiskScore) || 0;
  const downstream = num(project.downstreamAdoptionScore) || 0;
  const safetyBlocked = project.threeClockEdge?.safetyState === "BLOCKED" || divergence === "SAFETY_BLOCKED";

  if (safetyBlocked) return { state: "SAFETY_BLOCKED_SHADOW", reason: "Existing deterministic safety evidence blocks the edge thesis." };
  if (fakeRisk >= 70) return { state: "ACTIVITY_QUALITY_BLOCK_SHADOW", reason: "Observed activity quality is too synthetic/circular for a clean edge interpretation." };
  if (supplyRisk >= 75) return { state: "SUPPLY_PRESSURE_BLOCK_SHADOW", reason: "Observed or scheduled supply pressure is severe enough to invalidate the asymmetric-pressure thesis." };
  if (uncertainty.abstain) return { state: "ABSTAIN_SHADOW", reason: uncertainty.reasons?.join(", ") || "Evidence uncertainty requires abstention." };
  if (
    divergence === "PRE_CONSENSUS_DIVERGENCE" &&
    structural === "MULTIVARIATE_STRUCTURAL_BREAK" &&
    hazard24 >= 50 &&
    (residual >= 78 || dna >= 75 || downstream >= 60)
  ) {
    return { state: "HIGH_PRIORITY_SHADOW", reason: "Multiple orthogonal shadow families agree before attention is crowded." };
  }
  if (divergence === "PRE_CONSENSUS_DIVERGENCE" && (structural === "MULTIVARIATE_STRUCTURAL_BREAK" || residual >= 78 || dna >= 70)) {
    return { state: "PRE_CONSENSUS_WATCH_SHADOW", reason: "Early-change evidence is forming, but outcome calibration is not strong enough for promotion." };
  }
  return { state: "OBSERVE_SHADOW", reason: "No sufficiently broad orthogonal edge stack is present yet." };
}

function nextExpectedEvent(project = {}) {
  const stage = num(project.threeClockLeadStage) || 0;
  if (stage <= 0) return "PROJECT_CHANGE";
  if (stage === 1) return "CAPITAL_FORMING";
  if (stage === 2) return "PRE_CONSENSUS_DIVERGENCE";
  if (stage === 3) return "BUYER_ACCELERATION";
  if (stage === 4) return "ATTENTION_EXPANSION";
  if (stage === 5) return "PRICE_BREAKOUT_OR_INVALIDATION";
  return "POST_BREAKOUT_VALIDATION";
}

function attachSuite(project = {}) {
  const verdict = suiteState(project);
  const suite = {
    version: "asymmetric-edge-suite-v1",
    state: verdict.state,
    reason: verdict.reason,
    shadowOnly: true,
    rankingInfluence: false,
    nextExpectedEvent: nextExpectedEvent(project),
    globalRegime: project.globalMarketRegime || null,
    tradeFlow: project.realTimeTradeFlow || null,
    localMarketState: project.localMarketState || null,
    supplyShock: project.supplyShock || null,
    capitalIntent: project.capitalIntentGraph || null,
    threeClock: project.threeClockEdge || null,
    walletFingerprint: project.walletTemporalFingerprint || null,
    downstreamAdoption: project.downstreamAdoptionGraph || null,
    fakeMomentum: project.fakeMomentumFirewall || null,
    changePoint: project.marketChangePointRadar || null,
    diffusion: project.informationDiffusionClock || null,
    sequenceDNA: project.eventSequenceDNA || null,
    breakoutHazard: project.breakoutHazard || null,
    residualAlpha: project.residualAlpha || null,
    edgeHalfLife: project.edgeHalfLife || null,
    uncertainty: project.edgeUncertainty || null,
    promotionRule:
      "No component affects production ranking until point-in-time walk-forward testing demonstrates independent incremental lift after costs, with acceptable uncertainty and evidence-lineage correlation.",
  };
  return {
    ...project,
    asymmetricEdgeSuite: suite,
    asymmetricEdgeSuiteState: verdict.state,
    asymmetricEdgeSuiteRankingInfluence: false,
  };
}

function compact(project = {}, rank = null) {
  return {
    rank,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalChain || "unknown",
    state: project.asymmetricEdgeSuiteState || "OBSERVE_SHADOW",
    threeClockDivergenceState: project.threeClockDivergenceState || null,
    projectClockScore: project.projectClockScore || 0,
    capitalClockScore: project.capitalClockScore || 0,
    attentionClockScore: project.attentionClockScore || 0,
    structuralBreakState: project.structuralBreakState || null,
    breakoutHazard24hPct: project.breakoutHazard24hPct || 0,
    residualBlindspotSimilarity: project.residualBlindspotSimilarity || 0,
    eventSequenceSimilarity: project.eventSequenceSimilarity || 0,
    informationLeadHours: project.informationLeadHours ?? null,
    edgeHalfLifeHours: project.edgeHalfLifeHours ?? null,
    fakeMomentumRiskScore: project.fakeMomentumRiskScore || 0,
    supplyShockRiskScore: project.supplyShockRiskScore || 0,
    uncertaintyState: project.edgeUncertaintyState || null,
    nextExpectedEvent: project.asymmetricEdgeSuite?.nextExpectedEvent || null,
    reason: project.asymmetricEdgeSuite?.reason || null,
  };
}

function priorityValue(project = {}) {
  const states = {
    HIGH_PRIORITY_SHADOW: 5,
    PRE_CONSENSUS_WATCH_SHADOW: 4,
    OBSERVE_SHADOW: 3,
    ABSTAIN_SHADOW: 2,
    SUPPLY_PRESSURE_BLOCK_SHADOW: 1,
    ACTIVITY_QUALITY_BLOCK_SHADOW: 1,
    SAFETY_BLOCKED_SHADOW: 0,
  };
  return (states[project.asymmetricEdgeSuiteState] ?? 0) * 1000 +
    (num(project.threeClockDivergenceScore) || 0) * 4 +
    (num(project.structuralBreakScore) || 0) * 2 +
    (num(project.breakoutHazard24hPct) || 0) +
    (num(project.residualBlindspotSimilarity) || 0);
}

function writeReport(projects = [], meta = {}) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const ranked = [...projects].sort((a, b) => priorityValue(b) - priorityValue(a));
  const states = ranked.reduce((acc, project) => {
    const state = project.asymmetricEdgeSuiteState || "UNKNOWN";
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  const report = {
    status: "SHADOW_MODE",
    version: "asymmetric-edge-suite-v1",
    generatedAt: meta.observedAt || new Date().toISOString(),
    analyzed: ranked.length,
    states,
    topCandidates: ranked.slice(0, 30).map((project, index) => compact(project, index + 1)),
    integrity: {
      productionRankingInfluence: false,
      counterfactualQuotesAreExecutable: false,
      missingEvidenceTreatedAsSafe: false,
      uncertaintyCanForceAbstention: true,
    },
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return report;
}

export async function analyzeAsymmetricEdgeSuiteBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const observedAt = options.observedAt || new Date().toISOString();
  const priorObservations = Array.isArray(options.edgeObservations)
    ? options.edgeObservations
    : loadAsymmetricEdgeObservations(options.store || {});
  const historyMap = historiesByKey(priorObservations);
  const lab = options.outcomeLab || loadLeadTimeOutcomeLab(options.outcomeLabOptions || {});
  const diffusionExamples = buildDiffusionExamples(priorObservations);
  const historicalSequences = buildHistoricalSequences(priorObservations, lab);

  let results = attachGlobalMarketRegimeBatch(safeProjects, options.globalRegime || {});
  results = analyzeRealTimeTradeFlowBatch(results);
  results = analyzeLocalMarketStateBatch(results);
  results = analyzeSupplyShockBatch(results);
  results = analyzeCapitalIntentGraphBatch(results);
  results = analyzeThreeClockEdgeBatch(results, {
    ...(options.threeClock || {}),
    observedAt,
    persist: options.threeClock?.persist ?? options.persist !== false,
  });
  results = analyzeWalletTemporalFingerprintBatch(results);
  results = analyzeDownstreamAdoptionGraphBatch(results);
  results = analyzeFakeMomentumFirewallBatch(results);

  results = results.map((project) => {
    const history = historyMap.get(canonicalIdentityKey(project)) || [];
    return analyzeMarketChangePointRadar(project, { history });
  });

  results = await analyzeResidualAlphaBatch(results, {
    ...(options.residualAlpha || {}),
    memory: options.memory,
    snapshots: options.snapshots,
    writeReport: options.residualAlpha?.writeReport ?? true,
  });

  results = results.map((project) => {
    const history = historyMap.get(canonicalIdentityKey(project)) || [];
    return analyzeInformationDiffusionClock(project, { history, examples: diffusionExamples });
  });

  results = results.map((project) => {
    const history = historyMap.get(canonicalIdentityKey(project)) || [];
    return analyzeEventSequenceDNA(project, {
      history,
      currentObservation: currentObservation(project, observedAt),
      historicalSequences,
    });
  });

  results = analyzeBreakoutHazardBatch(results, lab, options.breakoutHazard || {});

  results = results.map((project) => {
    const history = historyMap.get(canonicalIdentityKey(project)) || [];
    return analyzeEdgeHalfLife(project, lab, { ...options.edgeHalfLife, history });
  });

  results = analyzeEdgeUncertaintyBatch(results, options.uncertainty || {});
  results = results.map(attachSuite);

  const meta = {
    observedAt,
    scanRunId: options.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: options.codeCommitSha || process.env.GITHUB_SHA || null,
  };
  if (options.persist !== false) {
    appendAsymmetricEdgeObservations(results, meta, options.store || {});
  }
  if (options.writeReport !== false) writeReport(results, meta);

  return results;
}

export function summarizeAsymmetricEdgeSuite(projects = []) {
  return writeReport(Array.isArray(projects) ? projects : [], { observedAt: new Date().toISOString() });
}
