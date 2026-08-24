import { stableHash, wilsonLowerBound } from "./productionMath.js";

export function generateFrozenHypotheses(signalRows = [], options = {}) {
  const minimumSamples = Number(options.minimumSamples || 30);
  const candidates = (Array.isArray(signalRows) ? signalRows : [])
    .filter((row) => Number(row.decided || row.samples || 0) >= minimumSamples)
    .sort((a, b) => Number(b.wilsonLowerBound || 0) - Number(a.wilsonLowerBound || 0))
    .slice(0, Number(options.maxSignals || 12));

  const hypotheses = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const signals = [candidates[i].signal, candidates[j].signal].sort();
      const definition = {
        signals,
        outcomeHorizonHours: Number(options.outcomeHorizonHours || 24),
        targetReturnPct: Number(options.targetReturnPct || 25),
        lossReturnPct: Number(options.lossReturnPct || -15),
        minimumFutureSamples: Number(options.minimumFutureSamples || 60),
      };
      hypotheses.push({
        hypothesisId: stableHash(definition).slice(0, 24),
        createdAt: options.now || new Date().toISOString(),
        state: "FROZEN_AWAITING_FORWARD_EVIDENCE",
        definition,
        rankingInfluence: false,
        automaticPromotion: false,
      });
    }
  }
  return hypotheses.slice(0, Number(options.maxHypotheses || 30));
}

export function evaluateFrozenHypothesis(hypothesis = {}, forwardRows = [], options = {}) {
  const signals = new Set(hypothesis.definition?.signals || []);
  const relevant = (Array.isArray(forwardRows) ? forwardRows : []).filter((row) =>
    [...signals].every((signal) => (row.signals || row.verifiedSignals || []).includes(signal))
  );
  const resolved = relevant.filter((row) => typeof row.hit === "boolean");
  const wins = resolved.filter((row) => row.hit === true).length;
  const lower = wilsonLowerBound(wins, resolved.length);
  const required = Number(hypothesis.definition?.minimumFutureSamples || 60);

  return {
    ...hypothesis,
    evaluation: {
      samples: resolved.length,
      wins,
      hitRate: resolved.length ? wins / resolved.length : null,
      wilsonLowerBound: lower,
    },
    state:
      resolved.length < required
        ? "FROZEN_AWAITING_FORWARD_EVIDENCE"
        : lower >= Number(options.minimumWilsonLowerBound || 0.50)
          ? "FORWARD_EVIDENCE_SUPPORTED"
          : "FORWARD_EVIDENCE_REJECTED",
    rankingInfluence: false,
    automaticPromotion: false,
  };
}
