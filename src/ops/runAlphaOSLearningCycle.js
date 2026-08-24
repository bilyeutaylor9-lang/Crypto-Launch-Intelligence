import fs from "node:fs";
import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { linkShadowPredictionsToOutcomes } from "../production/shadowOutcomeLinker.js";
import { learnMetaWeights } from "../production/metaLearningController.js";
import { evaluateModelChallenger } from "../production/modelFactory.js";
import { attributeAlpha } from "../production/alphaAttributionEngine.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function readJsonl(file){if(!fs.existsSync(file))return[];return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})}

export function runAlphaOSLearningCycle(options={}){
  const now=options.now||new Date().toISOString(); const predictions=readJsonl("data/alpha-os-predictions.jsonl"); const exactObservations=options.marketObservations || (options.snapshots?[]:loadExactMarketObservations()); const snapshots=options.snapshots || (exactObservations.length?exactObservations:loadOutcomeSnapshots()); const resolved=linkShadowPredictionsToOutcomes(predictions,snapshots,{asOf:now,horizonHours:24,maxLatenessHours:8,targetReturnPct:25,failureReturnPct:-20});
  writeAtomicJson("reports/alpha-os-resolved-outcomes.json",{schemaVersion:1,generatedAt:now,predictions:predictions.length,resolved:resolved.length,rows:resolved.slice(-10000)});
  const expertFields={REGIME:"regimeCompatibilityScore",WALLET_ENTITY:"walletEntityScore",CAPITAL_MIGRATION:"capitalMigrationForecastScore",IGNITION_GENOME:"multiscaleGenomeScore",NARRATIVE:"narrativePropagationScore",SIGNAL:"adaptiveResearchScore"}; const perf=[];
  for(const row of resolved){const actual=Number(row.realizedReturnPct)>=25;for(const[expert,field]of Object.entries(expertFields)){const value=Number(row[field]);if(Number.isFinite(value))perf.push({regime:row.globalMarketRegimeState||"UNKNOWN",expert,probability:Math.max(0,Math.min(1,value/100)),actual});}}
  const regimes=[...new Set(perf.map(row=>row.regime))]; const meta={}; for(const regime of regimes)meta[regime]=learnMetaWeights(perf,regime,{fullCredibilitySamples:100}); writeAtomicJson("reports/meta-learning-controller.json",{schemaVersion:1,generatedAt:now,regimes:meta,performanceRows:perf.length});
  let challengers=readJson("data/model-factory-challengers.json",[])||[]; challengers=challengers.map(challenger=>evaluateModelChallenger(challenger,resolved,{topK:10,minimumForwardSamples:100,targetReturnPct:25})); writeAtomicJson("data/model-factory-challengers.json",challengers); writeAtomicJson("reports/model-factory-evaluation.json",{schemaVersion:1,generatedAt:now,challengers});
  const attribution=resolved.slice(-5000).map(row=>({identityKey:row.identityKey,symbol:row.symbol||null,outcomeObservedAt:row.outcomeObservedAt,...attributeAlpha(row,{realizedReturnPct:row.realizedReturnPct})})); writeAtomicJson("reports/alpha-attribution-forward.json",{schemaVersion:1,generatedAt:now,rows:attribution});
  return{resolved,meta,challengers,attribution};
}
if(import.meta.url===`file://${process.argv[1]}`){try{const r=runAlphaOSLearningCycle();console.log(JSON.stringify({resolved:r.resolved.length,regimes:Object.keys(r.meta).length,challengers:r.challengers.length,evaluatedModels:r.challengers.filter(c=>c.state==="FORWARD_MODEL_EVALUATED").length},null,2));}catch(error){console.error(error);process.exitCode=1;}}
