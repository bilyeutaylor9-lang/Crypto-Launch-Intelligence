import { finite, stableHash, strictIdentityKey, timestamp, wilsonLowerBound } from "./productionMath.js";
import { benjaminiHochberg, permutationDifferencePValue } from "./alphaLabStatistics.js";

const returnOf = (row = {}) => finite(row.realizedReturnPct ?? row.netReturnPct ?? row.returnPct);
const signalSet = (row = {}) => new Set(row.verifiedSignals || row.signals || []);

function uniqueIdentityRows(rows = []) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = timestamp(a.outcomeObservedAt || a.generatedAt || a.observedAt) ?? 0;
    const right = timestamp(b.outcomeObservedAt || b.generatedAt || b.observedAt) ?? 0;
    return left - right;
  });
  const seen = new Set();
  const output = [];
  for (const row of sorted) {
    const key = strictIdentityKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function combinations(values = [], size = 2) {
  const unique = [...new Set(values)].sort();
  const output = [];
  function walk(start, current) {
    if (current.length === size) { output.push([...current]); return; }
    for (let index = start; index < unique.length; index += 1) { current.push(unique[index]); walk(index + 1, current); current.pop(); }
  }
  walk(0, []);
  return output;
}

const supportsAll = (row, signals) => signals.every((signal) => signalSet(row).has(signal));
const controlCandidate = (row, signals) => signals.some((signal) => !signalSet(row).has(signal));
function hitRate(rows = [], target = 25) { const active = rows.filter((row) => returnOf(row) !== null); return active.length ? active.filter((row) => returnOf(row) >= target).length / active.length : null; }
function averageReturn(rows = []) { const values = rows.map(returnOf).filter((v) => v !== null); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }

export function discoverAlphaHypotheses(rows = [], options = {}) {
  const resolved = uniqueIdentityRows((Array.isArray(rows) ? rows : []).filter((row) => returnOf(row) !== null));
  const target = Number(options.targetReturnPct ?? 25);
  const counts = new Map();
  for (const row of resolved) for (const signal of signalSet(row)) counts.set(signal, (counts.get(signal) || 0) + 1);
  const candidateSignals = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0, Number(options.maxSignals || 18)).map(([signal])=>signal);
  const candidates = [];
  let seedOffset = 0;
  for (const size of (options.combinationSizes || [2,3])) {
    for (const signals of combinations(candidateSignals, size)) {
      const treatment = resolved.filter((row) => supportsAll(row, signals));
      const controls = resolved.filter((row) => controlCandidate(row, signals));
      if (treatment.length < Number(options.minimumTreatmentSamples || 20) || controls.length < Number(options.minimumControlSamples || 30)) continue;
      const permutation = permutationDifferencePValue(treatment.map(returnOf), controls.map(returnOf), { iterations: Number(options.permutationIterations || 700), seed: Number(options.seed || 99173) + seedOffset++ });
      const treatmentHitRate = hitRate(treatment, target);
      const controlHitRate = hitRate(controls, target);
      candidates.push({
        hypothesisKey: signals.join(" + "), signals,
        treatmentSamples: treatment.length, controlSamples: controls.length,
        treatmentAverageReturnPct: averageReturn(treatment), controlAverageReturnPct: averageReturn(controls),
        averageReturnDeltaPct: (averageReturn(treatment) ?? 0) - (averageReturn(controls) ?? 0),
        treatmentHitRate, controlHitRate, hitRateDelta: (treatmentHitRate ?? 0) - (controlHitRate ?? 0),
        pValue: permutation.pValue, discoveryStatistic: permutation.observedDifference,
      });
    }
  }
  return benjaminiHochberg(candidates, { alpha: Number(options.fdrAlpha ?? 0.05) })
    .filter((row) => row.fdrAccepted || (row.pValue !== null && row.pValue <= Number(options.exploratoryPValue || 0.10) && row.averageReturnDeltaPct > 0 && row.hitRateDelta > 0))
    .sort((a,b)=>Number(b.fdrAccepted)-Number(a.fdrAccepted)||(a.qValue??1)-(b.qValue??1)||b.averageReturnDeltaPct-a.averageReturnDeltaPct)
    .slice(0, Number(options.maxHypotheses || 80));
}

export function freezeProspectiveExperiments(discovered = [], options = {}) {
  const frozenAt = options.frozenAt || new Date().toISOString();
  return (Array.isArray(discovered) ? discovered : []).map((row) => {
    const definition = {
      signals: row.signals,
      targetReturnPct: Number(options.targetReturnPct ?? 25),
      lossReturnPct: Number(options.lossReturnPct ?? -20),
      horizonHours: Number(options.horizonHours ?? 24),
      minimumForwardTreatmentSamples: Number(options.minimumForwardTreatmentSamples ?? 60),
      minimumForwardControlSamples: Number(options.minimumForwardControlSamples ?? 100),
      minimumWilsonLowerBound: Number(options.minimumWilsonLowerBound ?? 0.50),
      minimumForwardReturnDeltaPct: Number(options.minimumForwardReturnDeltaPct ?? 3),
      fdrAlpha: Number(options.fdrAlpha ?? 0.05),
      forwardPermutationIterations: Math.max(1000, Number(options.forwardPermutationIterations ?? 2000)),
      forwardValidationFdrAlpha: Math.min(0.05, Math.max(0.001, Number(options.forwardValidationFdrAlpha ?? 0.05))),
    };
    return {
      experimentId: stableHash({ definition, frozenAt }).slice(0,24), frozenAt, state: "FROZEN_PROSPECTIVE", definition, definitionFingerprint: stableHash(definition),
      discoveryEvidence: { treatmentSamples: row.treatmentSamples, controlSamples: row.controlSamples, averageReturnDeltaPct: row.averageReturnDeltaPct, hitRateDelta: row.hitRateDelta, pValue: row.pValue, qValue: row.qValue, fdrAccepted: row.fdrAccepted },
      rankingInfluence: false, productionInfluence: false, automaticPromotion: false,
    };
  });
}

export function evaluateProspectiveExperiment(experiment = {}, rows = [], options = {}) {
  const frozenMs = timestamp(experiment.frozenAt);
  const asOfMs = timestamp(options.asOf || options.now || new Date().toISOString());
  const target = Number(experiment.definition?.targetReturnPct || 25);
  const signals = experiment.definition?.signals || [];
  const definitionIntegrity = Boolean(experiment.definitionFingerprint) && experiment.definitionFingerprint === stableHash(experiment.definition || {});
  let rejectedPreFreezeDecisions = 0;
  let rejectedInvalidIdentity = 0;
  let rejectedPointInTimeIntegrity = 0;
  let rejectedFutureOutcomes = 0;
  const forwardCandidates = (Array.isArray(rows) ? rows : []).filter((row) => {
    const identity = strictIdentityKey(row);
    const decisionMs = timestamp(row.decisionAt || row.generatedAt);
    const outcomeMs = timestamp(row.outcomeObservedAt);
    const sourceMs = timestamp(row.sourceObservedAt);
    const sourceAgeMinutes = finite(row.sourceAgeMinutesAtDecision);
    if (!identity) { rejectedInvalidIdentity += 1; return false; }
    if (decisionMs === null || frozenMs === null || decisionMs <= frozenMs) { rejectedPreFreezeDecisions += 1; return false; }
    if (outcomeMs === null || asOfMs === null || outcomeMs > asOfMs || outcomeMs <= decisionMs) { rejectedFutureOutcomes += 1; return false; }
    if (
      sourceMs === null ||
      sourceMs > decisionMs ||
      sourceAgeMinutes === null ||
      sourceAgeMinutes < 0 ||
      sourceAgeMinutes > 90 ||
      row.controlsFrozenBeforeOutcomes !== true
    ) { rejectedPointInTimeIntegrity += 1; return false; }
    return returnOf(row) !== null;
  });
  const forward = uniqueIdentityRows(forwardCandidates);
  const treatment = forward.filter((row) => supportsAll(row, signals));
  const controls = forward.filter((row) => controlCandidate(row, signals));
  const tHit = hitRate(treatment, target); const cHit = hitRate(controls, target);
  const wilson = wilsonLowerBound(treatment.filter((row) => returnOf(row) >= target).length, treatment.length);
  const returnDelta = (averageReturn(treatment) ?? 0) - (averageReturn(controls) ?? 0);
  const hitDelta = (tHit ?? 0) - (cHit ?? 0);
  const enough = treatment.length >= Number(experiment.definition?.minimumForwardTreatmentSamples ?? 60) && controls.length >= Number(experiment.definition?.minimumForwardControlSamples ?? 100);
  const permutation = enough
    ? permutationDifferencePValue(
        treatment.map(returnOf),
        controls.map(returnOf),
        {
          iterations: Number(experiment.definition?.forwardPermutationIterations || 2000),
          seed: Number.parseInt(stableHash(experiment.experimentId || "alpha-forward").slice(0, 8), 16),
        },
      )
    : { pValue: null, observedDifference: returnDelta };
  const supported = enough && wilson >= Number(experiment.definition?.minimumWilsonLowerBound ?? 0.50) && returnDelta >= Number(experiment.definition?.minimumForwardReturnDeltaPct ?? 3) && hitDelta > 0;
  return { ...experiment,
    state: !definitionIntegrity ? "FROZEN_EXPERIMENT_INTEGRITY_BLOCKED" : !enough ? "FROZEN_AWAITING_FORWARD_EVIDENCE" : supported ? "FORWARD_ALPHA_AWAITING_VALIDATION_FDR" : "FORWARD_ALPHA_REJECTED",
    forwardEvidence: { treatmentSamples: treatment.length, controlSamples: controls.length, treatmentAverageReturnPct: averageReturn(treatment), controlAverageReturnPct: averageReturn(controls), averageReturnDeltaPct: returnDelta, treatmentHitRate: tHit, controlHitRate: cHit, hitRateDelta: hitDelta, treatmentWilsonLowerBound: wilson, permutationPValue:permutation.pValue, permutationObservedDifference:permutation.observedDifference, preCorrectionSupported:supported, integrityPass:definitionIntegrity, rejectedPreFreezeDecisions, rejectedInvalidIdentity, rejectedPointInTimeIntegrity, rejectedFutureOutcomes },
    rankingInfluence: false, productionInfluence: false, automaticPromotion: false,
  };
}

export function applyProspectiveValidationFdr(experiments = [], options = {}) {
  const candidates = (Array.isArray(experiments) ? experiments : [])
    .filter((row) => row.forwardEvidence?.integrityPass === true && Number.isFinite(Number(row.forwardEvidence?.permutationPValue)))
    .map((row) => ({ experimentId: row.experimentId, pValue: Number(row.forwardEvidence.permutationPValue) }));
  const alpha = Math.min(0.05, Math.max(0.001, Number(options.alpha || 0.05)));
  const corrected = new Map(
    benjaminiHochberg(candidates, { alpha }).map((row) => [row.experimentId, row]),
  );
  return (Array.isArray(experiments) ? experiments : []).map((row) => {
    const correction = corrected.get(row.experimentId) || null;
    if (!correction) return row;
    const verified = row.forwardEvidence?.integrityPass === true &&
      row.forwardEvidence?.preCorrectionSupported === true &&
      correction.fdrAccepted === true;
    return {
      ...row,
      state: verified ? "FORWARD_ALPHA_VERIFIED" : "FORWARD_ALPHA_REJECTED",
      forwardEvidence: {
        ...row.forwardEvidence,
        validationQValue: correction.qValue,
        validationFdrAccepted: correction.fdrAccepted,
        validationFdrAlpha: alpha,
      },
    };
  });
}

export function buildAlphaChallengerRegistry(experiments = [], options = {}) {
  const verified = (Array.isArray(experiments) ? experiments : []).filter((row) => row.state === "FORWARD_ALPHA_VERIFIED" && row.forwardEvidence?.integrityPass === true && row.definitionFingerprint === stableHash(row.definition || {})).sort((a,b)=>(b.forwardEvidence?.averageReturnDeltaPct||0)-(a.forwardEvidence?.averageReturnDeltaPct||0));
  return { schemaVersion:1, generatedAt:options.now||new Date().toISOString(), verifiedExperiments:verified.length,
    challengers: verified.map((row)=>({ challengerId:`alpha:${row.experimentId}`, experimentId:row.experimentId, signals:row.definition.signals, state:"SHADOW_CHALLENGER", forwardEvidence:row.forwardEvidence, automaticPromotion:false, rankingInfluence:false })),
    policy:{ discoveryEvidenceCannotPromote:true, forwardEvidenceRequired:true, fdrControlledDiscovery:true, automaticPromotion:false, automaticTrading:false } };
}
