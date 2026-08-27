import {
  preloadedQuoteProvider,
  quoteProviderFromEnvironment,
} from "../canary/executableQuoteTruthEngine.js";
import { captureForwardExecutionCosts } from "./forwardExecutionCostCapture.js";
import { strictIdentity } from "./productionMath.js";

export const FORWARD_QUOTE_BROKER_STATE = Object.freeze({
  PAIRED_EXECUTABLE_QUOTES_OBSERVED: "PAIRED_EXECUTABLE_QUOTES_OBSERVED",
  EXECUTION_EVIDENCE_UNAVAILABLE: "EXECUTION_EVIDENCE_UNAVAILABLE",
});

function routeKey(row = {}) {
  return strictIdentity(row)?.routeKey || null;
}

function uniqueQuoteTargets(treatments = [], controls = []) {
  const seen = new Set();
  const rows = [];
  for (const [selectionRole, candidates] of [["TREATMENT", treatments], ["CONTROL_MATCHED", controls]]) {
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const key = routeKey(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...candidate, prospectiveProofSelectionRole: selectionRole });
    }
  }
  return rows;
}

/**
 * Read-only execution evidence broker for already-reserved prospective pairs.
 * Its ordered input is intentionally treatments first, then their controls;
 * quote availability cannot affect upstream treatment or control selection.
 */
export async function captureForwardProofQuotes({
  treatments = [],
  controls = [],
  now = new Date().toISOString(),
  ...options
} = {}) {
  const quoteTargets = uniqueQuoteTargets(treatments, controls);
  const defaultProvider = options.quoteProvider || quoteProviderFromEnvironment(options);
  const quoteProviderForProject = (project) => preloadedQuoteProvider(project) || defaultProvider || null;
  const capture = await captureForwardExecutionCosts(quoteTargets, {
    ...options,
    now,
    maxCandidates: Math.max(1, quoteTargets.length),
    quoteProvider: defaultProvider || undefined,
    quoteProviderForProject,
  });
  const quoteAttempts = capture.audit.quoteAttempts || [];
  const buyQuoteAccepted = quoteAttempts.filter((attempt) => attempt.side === "BUY" && attempt.success).length;
  const sellQuoteAccepted = quoteAttempts.filter((attempt) => attempt.side === "SELL" && attempt.success).length;
  const pairedQuotesAccepted = capture.audit.accepted || 0;
  const netProofEligible = capture.projects.filter(
    (candidate) => candidate.executionProofEligibility?.state === "NET_PROOF_ELIGIBLE",
  ).length;
  const quoteRejectionReasons = capture.audit.rejectionReasons || {};
  return {
    schemaVersion: 1,
    generatedAt: now,
    state: pairedQuotesAccepted
      ? FORWARD_QUOTE_BROKER_STATE.PAIRED_EXECUTABLE_QUOTES_OBSERVED
      : FORWARD_QUOTE_BROKER_STATE.EXECUTION_EVIDENCE_UNAVAILABLE,
    projects: capture.projects,
    quoteTargets,
    audit: {
      quoteAttempts,
      quoteRejectionReasons,
      buyQuoteAccepted,
      sellQuoteAccepted,
      pairedQuotesAccepted,
      explicitCostCoveragePct: quoteTargets.length
        ? Number(((pairedQuotesAccepted / quoteTargets.length) * 100).toFixed(2))
        : 0,
      netProofEligible,
      researchOnlyMissingCost: capture.projects.length - netProofEligible,
      quoteOnly: true,
      rankingInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
      captureAudit: { ...capture.audit, quoteAttempts: undefined },
    },
  };
}

export const __forwardQuoteBrokerHooks = { routeKey, uniqueQuoteTargets };
