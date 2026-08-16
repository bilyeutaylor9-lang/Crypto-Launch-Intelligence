import { clamp, mean, num } from "../edge/edgeMath.js";
import {
  normalizeCapitalIntentEvidence,
  normalizeWalletTemporalEvents,
} from "../data/edgeSignalNormalizers.js";

export function analyzeCapitalIntentGraph(project = {}) {
  const direct = normalizeCapitalIntentEvidence(project);
  const events = normalizeWalletTemporalEvents(project);
  const walletCount = new Set(events.map((event) => event.wallet)).size;
  const fundingEvents = events.filter((event) => /CEX|BRIDGE|STABLE|TRANSFER/.test(event.type));
  const executionPrepEvents = events.filter((event) => /APPROV|ROUTER|AGGREGATOR/.test(event.type));
  const buyEvents = events.filter((event) => /BUY|SWAP_IN/.test(event.type));

  const directFields = [
    direct.stablecoinInflowUsd,
    direct.bridgeInflowUsd,
    direct.priorityFeePercentile,
    direct.approvalActivityScore,
  ].filter((value) => value !== null).length;
  const evidenceCount = directFields + (events.length ? 1 : 0);
  if (!evidenceCount) {
    return {
      ...project,
      capitalIntentGraph: {
        state: "UNOBSERVED",
        evidenceMode: "NO_DIRECT_CAPITAL_PREPARATION_EVIDENCE",
        score: null,
        shadowOnly: true,
      },
      capitalIntentGraphState: "UNOBSERVED",
      capitalIntentGraphScore: 0,
    };
  }

  const preparation = mean([
    direct.priorityFeePercentile,
    direct.approvalActivityScore,
    fundingEvents.length ? Math.min(100, 35 + fundingEvents.length * 12) : null,
    executionPrepEvents.length ? Math.min(100, 45 + executionPrepEvents.length * 15) : null,
    walletCount ? Math.min(100, 25 + walletCount * 7) : null,
  ]);
  const score = Math.round(clamp(preparation || 0));
  const state = score >= 65 && buyEvents.length === 0
    ? "PRE_POSITIONING_BEFORE_BUY"
    : score >= 70
      ? "CAPITAL_INTENT_CONFIRMED_WITH_BUYING"
      : score >= 55
        ? "CAPITAL_PREPARATION_DEVELOPING"
        : "EARLY_CAPITAL_PREPARATION";

  return {
    ...project,
    stablecoinInflowUsd: project.stablecoinInflowUsd ?? direct.stablecoinInflowUsd,
    bridgeInflowUsd: project.bridgeInflowUsd ?? direct.bridgeInflowUsd,
    priorityFeePercentile: project.priorityFeePercentile ?? direct.priorityFeePercentile,
    approvalActivityScore: project.approvalActivityScore ?? direct.approvalActivityScore,
    capitalIntentGraph: {
      state,
      evidenceMode: events.length ? "DIRECT_GRAPH_EVENTS" : "DIRECT_SUMMARY_FIELDS",
      score,
      walletCount,
      eventCount: events.length,
      fundingEventCount: fundingEvents.length,
      executionPreparationEventCount: executionPrepEvents.length,
      buyEventCount: buyEvents.length,
      direct,
      graph: {
        nodes: [...new Set(events.flatMap((event) => [event.wallet, event.counterparty]).filter(Boolean))].slice(0, 100),
        edges: events.slice(-100).map((event) => ({
          from: event.wallet,
          to: event.counterparty,
          type: event.type,
          timestamp: event.timestamp,
          amountUsd: num(event.amountUsd),
        })),
      },
      shadowOnly: true,
      rankingInfluence: false,
    },
    capitalIntentGraphState: state,
    capitalIntentGraphScore: score,
  };
}

export function analyzeCapitalIntentGraphBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeCapitalIntentGraph);
}
