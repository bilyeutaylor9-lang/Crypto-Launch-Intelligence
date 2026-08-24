import fs from "node:fs";
import { buildMarketDiscoveryEngine } from "../production/marketDiscoveryEngine.js";
import { writeAtomicJson, appendJsonlDurable } from "../production/atomicArtifactStore.js";
import { strictIdentity } from "../production/productionMath.js";
import { evaluateProspectiveSourceFreshness } from "../production/prospectiveEdgeCohortLedger.js";

function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function readJsonl(file){if(!fs.existsSync(file))return[];return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})}

export function runMarketDiscoveryCycle(options={}){
  const now=options.now||new Date().toISOString();
  const alphaOS=options.alphaOS||readJson("reports/autonomous-alpha-os.json",{});
  const inputFreshness=evaluateProspectiveSourceFreshness(alphaOS.inputFreshness?.sourceObservedAt,now,{maximumSourceAgeMinutes:Number(options.maximumSourceAgeMinutes||90)});
  const marketHistory=options.marketHistory||readJson("data/market-regime-history.json",[])||[];
  const resolved=options.resolved||readJson("reports/alpha-os-resolved-outcomes.json",{}).rows||[];
  const historicalWinners=resolved.filter(row=>Number(row.realizedReturnPct)>=25).map(row=>({...row,forwardEdgeWeight:Math.max(.1,Math.min(4,Number(row.realizedReturnPct||0)/25)),leadTimeHours:Number(row.leadTimeHours||1)}));
  const previousDependencies=readJson("data/market-discovery-dependencies.json",{})||{};
  const researchAccounting=readJsonl("data/research-value-accounting.jsonl");
  const report=buildMarketDiscoveryEngine({alphaOS,candidates:alphaOS.candidates||[],regime:alphaOS.regime||{},marketHistory,historicalWinners,previousDependencies,researchAccounting},{now,seed:Number(options.seed||62001)});
  report.inputFreshness={...inputFreshness,upstreamAlphaOSFreshnessState:alphaOS.inputFreshness?.state||null,prospectivePredictionEligible:inputFreshness.eligible&&alphaOS.inputFreshness?.prospectivePredictionEligible===true};
  writeAtomicJson("reports/market-discovery-engine.json",report);
  const dependencies=Object.fromEntries(report.candidates.map(row=>[row.identityKey,row.opportunityDependencies])); writeAtomicJson("data/market-discovery-dependencies.json",dependencies);
  appendJsonlDurable("data/market-discovery-predictions.jsonl",(report.inputFreshness.prospectivePredictionEligible?report.candidates:[]).filter(row=>strictIdentity(row)&&Number(row.priceUsd??row.marketData?.priceUsd)>0).slice(0,100).map((row,index)=>({schemaVersion:1,generatedAt:now,decisionAt:now,sourceObservedAt:inputFreshness.sourceObservedAt,sourceAgeMinutesAtDecision:inputFreshness.sourceAgeMinutes,rank:index+1,identityKey:row.identityKey,symbol:row.symbol||null,chain:row.chain||null,tokenAddress:row.tokenAddress||row.contractAddress||null,poolAddress:row.poolAddress||row.pairAddress||null,priceUsd:row.priceUsd??row.marketData?.priceUsd??null,alphaOSScore:row.governor?.alphaOSScore??null,captureableExpectedValuePct:row.executionAwareEV?.captureableExpectedValuePct??null,dependencyHealthPct:row.opportunityDependencies?.dependencyHealthPct??null,adversarialRiskScore:row.adversarialMarketIntelligence?.riskScore??null,forecastFitPct:report.predictiveDiscovery.matches.find(m=>m.identityKey===row.identityKey)?.fitScorePct??null,marketShockState:report.shockEarlyWarning.state,worldGraphId:report.worldModel.graphId,shadowOnly:true,productionInfluence:false,automaticTrading:false,automaticPromotion:false})));
  return report;
}
if(import.meta.url===`file://${process.argv[1]}`){try{const r=runMarketDiscoveryCycle();console.log(JSON.stringify({system:r.system,worldNodes:r.worldModel.summary.nodes,worldEdges:r.worldModel.summary.edges,shock:r.shockEarlyWarning.state,forecast:r.predictiveDiscovery.forecast,frontier:r.edgeFrontier.frontier.slice(0,10).map(x=>({symbol:x.symbol,metrics:x.metrics}))},null,2));}catch(error){console.error(error);process.exitCode=1;}}
