import { clamp, finite, mean } from "./productionMath.js";

export function learnMetaWeights(performanceRows = [], regime = "UNKNOWN", options = {}) {
  const targetRegime=String(regime || "UNKNOWN").toUpperCase(); const grouped=new Map();
  for (const row of Array.isArray(performanceRows)?performanceRows:[]) {
    const rowRegime=String(row.regime || row.globalMarketRegimeState || "UNKNOWN").toUpperCase(); if (rowRegime!==targetRegime && rowRegime!=="ALL") continue;
    const expert=String(row.expert || row.modelName || "UNKNOWN"); const p=finite(row.probability); const actual=row.actual===true||Number(row.actual)===1?1:row.actual===false||Number(row.actual)===0?0:null; if(p===null||actual===null) continue;
    if(!grouped.has(expert)) grouped.set(expert,[]); grouped.get(expert).push({p:clamp(p),actual});
  }
  const reliability=[]; for(const [expert,rows] of grouped){ const brier=mean(rows.map(r=>(r.p-r.actual)**2)); const sample=clamp(rows.length/Number(options.fullCredibilitySamples||100)); const score=clamp((1-(brier??1)/.35)*sample); reliability.push({expert,samples:rows.length,brierScore:brier,reliability:score}); }
  const total=reliability.reduce((sum,r)=>sum+r.reliability,0)||1; const weights=Object.fromEntries(reliability.map(r=>[r.expert,r.reliability/total]));
  return { regime:targetRegime, expertCount:reliability.length, weights, experts:reliability.map(r=>({...r,weight:Number((r.reliability/total).toFixed(4))})), state:reliability.length?"META_WEIGHTS_LEARNED":"INSUFFICIENT_META_HISTORY" };
}

export function applyMetaWeights(expertPredictions = [], meta = {}, options = {}) {
  const rows=(Array.isArray(expertPredictions)?expertPredictions:[]).map(row=>({ ...row, probability:clamp(finite(row.probability)??0), weight:finite(meta.weights?.[row.name] ?? meta.weights?.[row.expert]) ?? finite(row.weight) ?? 0 }));
  const total=rows.reduce((sum,r)=>sum+Math.max(0,r.weight),0); const probability=total?rows.reduce((sum,r)=>sum+r.probability*Math.max(0,r.weight),0)/total:mean(rows.map(r=>r.probability))??0;
  return { probability:Number(probability.toFixed(4)), probabilityPct:Number((probability*100).toFixed(2)), totalWeight:total, experts:rows, regime:meta.regime || options.regime || "UNKNOWN" };
}
