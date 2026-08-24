import { clamp, finite, mean, stableHash, timestamp } from "./productionMath.js";

const EXPERTS = Object.freeze(["regime","wallet","capital","genome","narrative","execution","signal"]);

function normalizeWeights(weights={}) {
  const positive=Object.fromEntries(EXPERTS.map((key)=>[key,Math.max(0,finite(weights[key])??0)])); const total=Object.values(positive).reduce((a,b)=>a+b,0) || 1;
  return Object.fromEntries(Object.entries(positive).map(([key,value])=>[key,value/total]));
}

export function generateModelChallengers(options = {}) {
  const base=normalizeWeights(options.baseWeights || { regime:.12,wallet:.18,capital:.18,genome:.20,narrative:.10,execution:.12,signal:.10 });
  const perturbation=Number(options.perturbation || .08); const generated=[];
  for (const expert of EXPERTS) {
    const up={...base,[expert]:(base[expert]||0)+perturbation};
    const down={...base,[expert]:Math.max(0,(base[expert]||0)-perturbation)};
    for (const [direction,weights] of [["UP",up],["DOWN",down]]) {
      const normalized=normalizeWeights(weights); const definition={ family:"WEIGHT_PERTURBATION", expert, direction, weights:normalized, probabilityHorizon:"P50_24H" };
      generated.push({ challengerId:`model:${stableHash(definition).slice(0,20)}`, createdAt:options.now || new Date().toISOString(), state:"FROZEN_SHADOW_MODEL", definition, automaticPromotion:false, productionInfluence:false });
    }
  }
  return generated;
}

export function scoreModelChallenger(challenger = {}, row = {}) {
  const w=challenger.definition?.weights || {}; const inputs={
    regime: finite(row.regimeCompatibilityScore), wallet: finite(row.walletEntityScore), capital: finite(row.capitalMigrationForecastScore), genome: finite(row.multiscaleGenomeScore ?? row.multiscaleGenome?.multiscaleGenomeScore), narrative: finite(row.narrativePropagationScore), execution: finite(row.executionAwareEV?.captureableExpectedValuePct) === null ? null : clamp((finite(row.executionAwareEV.captureableExpectedValuePct)+20)/80)*100, signal: finite(row.adaptiveResearchScore ?? row.combinedResearchScore)
  };
  let weighted=0,total=0; for (const [key,weight] of Object.entries(w)) { const value=inputs[key]; if (value===null) continue; weighted += value*weight; total += weight; }
  return total ? weighted/total : null;
}

export function evaluateModelChallenger(challenger = {}, rows = [], options = {}) {
  const frozenAt=timestamp(challenger.createdAt); const forward=(Array.isArray(rows)?rows:[]).filter((row)=>{const at=timestamp(row.outcomeObservedAt || row.generatedAt || row.observedAt); return at!==null && frozenAt!==null && at>frozenAt && finite(row.realizedReturnPct)!==null;});
  const scored=forward.map((row)=>({row,score:scoreModelChallenger(challenger,row)})).filter((x)=>x.score!==null).sort((a,b)=>b.score-a.score);
  const selected=scored.slice(0,Math.max(1,Number(options.topK || 10))); const returns=selected.map((x)=>finite(x.row.realizedReturnPct)).filter((v)=>v!==null);
  const average=mean(returns); const hits=returns.filter((v)=>v>=Number(options.targetReturnPct || 25)).length;
  return { ...challenger, state: returns.length >= Number(options.minimumForwardSamples || 100) ? "FORWARD_MODEL_EVALUATED" : "AWAITING_FORWARD_MODEL_EVIDENCE", forwardMetrics:{ samples:returns.length, averageReturnPct:average, hitRate:returns.length?hits/returns.length:null }, automaticPromotion:false, productionInfluence:false };
}
