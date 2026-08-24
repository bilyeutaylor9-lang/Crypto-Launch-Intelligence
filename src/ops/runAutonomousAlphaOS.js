import fs from "node:fs";

import { loadProductionCandidates } from "../production/productionCandidateLoader.js";
import { attachGlobalMarketRegimeBatch } from "../engines/globalMarketRegimeEngine.js";
import { analyzeWalletTemporalFingerprintBatch } from "../engines/walletTemporalFingerprintEngine.js";
import { analyzeCapitalIntentGraphBatch } from "../engines/capitalIntentGraphEngine.js";
import { analyzeCapitalMigrationCoreBatch } from "../engines/capitalMigrationCoreEngine.js";
import { buildAutonomousAlphaOS } from "../production/autonomousAlphaOS.js";
import { updateDigitalTwin, summarizeTwinChange } from "../production/digitalTwinEngine.js";
import { buildActiveResearchQueue } from "../production/activeResearchController.js";
import { generateModelChallengers } from "../production/modelFactory.js";
import { appendJsonlDurable, writeAtomicJson } from "../production/atomicArtifactStore.js";
import { appendExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { strictIdentity } from "../production/productionMath.js";

function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return fallback; } }
function readJsonl(file) { if(!fs.existsSync(file)) return []; return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}}); }

export function runAutonomousAlphaOSCycle(options = {}) {
  const now=options.now || new Date().toISOString(); const candidateLoad=loadProductionCandidates({ universe: options.universe, report: options.report, reportFile: options.reportFile }); let projects=candidateLoad.candidates || [];
  const marketObservationAudit=appendExactMarketObservations(projects,{observedAt:candidateLoad.sourceObservedAt,source:candidateLoad.reportAvailable?"production-candidate-report":"edge-candidate-universe"});
  projects=attachGlobalMarketRegimeBatch(projects,{ globalSnapshot: options.globalMarketSnapshot || projects[0]?.globalMarketSnapshot || {} });
  projects=analyzeWalletTemporalFingerprintBatch(projects);
  projects=analyzeCapitalIntentGraphBatch(projects);
  projects=analyzeCapitalMigrationCoreBatch(projects);

  const productionReadiness=readJson("reports/production-readiness.json",{}); const edgeVerification=readJson("reports/edge-verification-program.json",{});
  const opportunityHistory=readJson("data/alpha-os-candidate-history.json",[]) || []; const capitalHistory=readJson("data/capital-migration-history.json",[]) || []; const walletEntityForwardRows=readJsonl("data/wallet-entity-forward-outcomes.jsonl");

  const report=buildAutonomousAlphaOS({ projects, globalMarketSnapshot:options.globalMarketSnapshot || projects[0]?.globalMarketSnapshot || {}, capitalHistory, opportunityHistory, walletEntityForwardRows, context:{ productionReadiness, edgeVerification } },{ now });
  writeAtomicJson("reports/autonomous-alpha-os.json",report);

  const priorTwins=readJson("data/project-digital-twins.json",{}) || {}; const twins={...priorTwins}; const twinChanges=[];
  for(const candidate of report.candidates.slice(0,250)) { const previous=twins[candidate.identityKey] || null; const twin=updateDigitalTwin(previous,{...candidate, observedAt:now, captureableExpectedValuePct:candidate.executionAwareEV?.captureableExpectedValuePct, lateChaseProbabilityPct:candidate.opportunityHalfLife?.lateChaseProbabilityPct},{observedAt:now}); twins[candidate.identityKey]=twin; twinChanges.push(summarizeTwinChange(twin)); }
  writeAtomicJson("data/project-digital-twins.json",twins); writeAtomicJson("reports/digital-twin-changes.json",{schemaVersion:1,generatedAt:now,changes:twinChanges.sort((a,b)=>b.significantChangeCount-a.significantChangeCount)});

  const researchQueue=buildActiveResearchQueue(report.candidates,{budgetUnits:Number(options.researchBudgetUnits || 75)}); writeAtomicJson("reports/active-research-queue.json",{schemaVersion:1,generatedAt:now,...researchQueue});

  const challengerFile="data/model-factory-challengers.json"; let challengers=readJson(challengerFile,[]) || []; if(!challengers.length){ challengers=generateModelChallengers({now}); writeAtomicJson(challengerFile,challengers); }

  appendJsonlDurable("data/alpha-os-predictions.jsonl",report.candidates.filter(candidate=>strictIdentity(candidate)&&Number(candidate.priceUsd??candidate.marketData?.priceUsd)>0).slice(0,100).map(candidate=>({ schemaVersion:1,generatedAt:now,decisionAt:now,identityKey:candidate.identityKey,symbol:candidate.symbol||null,chain:candidate.chain||null,tokenAddress:candidate.tokenAddress||candidate.contractAddress||null,poolAddress:candidate.poolAddress||candidate.pairAddress||null,priceUsd:candidate.priceUsd??candidate.marketData?.priceUsd??null,liquidityUsd:candidate.liquidityUsd??candidate.activeLiquidityUsd??null,marketCapUsd:candidate.marketCapUsd??candidate.marketCap??null,volume24hUsd:candidate.volume24hUsd??candidate.volume24h??null,globalMarketRegimeState:report.regime.state,regimeCompatibilityScore:candidate.regimeCompatibilityScore,walletEntityScore:candidate.walletEntityScore,capitalMigrationForecastScore:candidate.capitalMigrationForecastScore,multiscaleGenomeScore:candidate.multiscaleGenomeScore??candidate.multiscaleGenome?.multiscaleGenomeScore??null,narrativePropagationScore:candidate.narrativePropagationScore,captureableExpectedValuePct:candidate.executionAwareEV?.captureableExpectedValuePct??null,lateChaseProbabilityPct:candidate.opportunityHalfLife?.lateChaseProbabilityPct??null,adaptiveResearchScore:candidate.adaptiveResearchScore??candidate.combinedResearchScore??null,alphaOSScore:candidate.governor?.alphaOSScore??null,verifiedSignals:candidate.verifiedSignals||[],shadowOnly:true,productionInfluence:false })));

  const nextHistory=[...opportunityHistory,...report.candidates.slice(0,250).map(candidate=>({identityKey:candidate.identityKey,symbol:candidate.symbol||null,observedAt:now,combinedResearchScore:candidate.combinedResearchScore??candidate.governor?.alphaOSScore??null,portfolioResearchScore:candidate.portfolioResearchScore??null,multiscaleGenomeScore:candidate.multiscaleGenomeScore??candidate.multiscaleGenome?.multiscaleGenomeScore??null,priceChange24hPct:candidate.priceChange24hPct??null}))].slice(-20000); writeAtomicJson("data/alpha-os-candidate-history.json",nextHistory);
  const nextCapital=[...capitalHistory,...projects.slice(0,1000).map(project=>({...project,observedAt:now}))].slice(-20000); writeAtomicJson("data/capital-migration-history.json",nextCapital);

  return {report,twins,twinChanges,researchQueue,challengers,candidateLoad,marketObservationAudit};
}

if(import.meta.url===`file://${process.argv[1]}`){ try{const result=runAutonomousAlphaOSCycle(); console.log(JSON.stringify({system:result.report.system,regime:result.report.regime.state,candidates:result.report.candidates.length,top:result.report.candidates.slice(0,10).map(row=>({symbol:row.symbol,score:row.governor.alphaOSScore,state:row.governor.researchState,halfLife:row.opportunityHalfLife?.halfLifeHours,ev:row.executionAwareEV?.captureableExpectedValuePct,nextResearch:row.nextBestResearch?.action||null}))},null,2));}catch(error){console.error(error);process.exitCode=1;} }
