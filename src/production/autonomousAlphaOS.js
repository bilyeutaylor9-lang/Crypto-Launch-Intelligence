import { buildMarketRegimeBrain } from "./marketRegimeBrain.js";
import { buildWalletEntityGraph, scoreWalletEntityReputation } from "./walletEntityIntelligence.js";
import { buildCapitalMigrationForecast } from "./capitalMigrationForecastEngine.js";
import { estimateOpportunityHalfLife } from "./opportunityHalfLifeEngine.js";
import { computeExecutionAwareEV } from "./executionAwareExpectedValue.js";
import { buildNarrativeEvidenceGraph, scoreNarrativePropagation } from "./narrativeCausalGraph.js";
import { attributeAlpha } from "./alphaAttributionEngine.js";
import { nextBestResearchAction } from "./activeResearchController.js";
import { buildResearchAgentPacket } from "./researchAgentNetwork.js";
import { governAlphaOpportunity } from "./alphaOSGovernor.js";
import { strictIdentityKey } from "./productionMath.js";

function walletEvents(projects=[]){ return (Array.isArray(projects)?projects:[]).flatMap(project=>{ const events=project.walletTemporalEvents || project.rawWalletTemporalEvents || project.walletEvents || []; return (Array.isArray(events)?events:[]).map(event=>({...event,projectIdentityKey:strictIdentityKey(project)})); }); }

export function buildAutonomousAlphaOS(input = {}, options = {}) {
  const projects=Array.isArray(input.projects)?input.projects:[]; const now=options.now || new Date().toISOString();
  const regime=buildMarketRegimeBrain(input.globalMarketSnapshot || input.globalRegime || {}, projects, {now});
  const eventRows=walletEvents(projects); const entityGraph=buildWalletEntityGraph(eventRows, options.wallet || {}); const entityReputation=Object.fromEntries(entityGraph.entities.map(entity=>[entity.entityId,scoreWalletEntityReputation(entity,input.walletEntityForwardRows || [], options.wallet || {})]));
  const migration=buildCapitalMigrationForecast(projects,input.capitalHistory || [],{now,...options.capital}); const migrationMap=new Map(migration.candidates.map(row=>[row.identityKey,row]));
  const narrativeGraph=buildNarrativeEvidenceGraph(projects,{now});
  const history=input.opportunityHistory || [];
  const candidates=projects.map(project=>{
    const key=strictIdentityKey(project); const migrationRow=migrationMap.get(key)||{}; const walletEntityIds=[...new Set(eventRows.filter(e=>e.projectIdentityKey===key).map(e=>entityGraph.walletToEntity?.[String(e.wallet||e.from||"").trim()]).filter(Boolean))]; const walletScores=walletEntityIds.map(id=>entityReputation[id]?.reputationScore).filter(v=>Number.isFinite(v)); const walletEntityScore=walletScores.length?walletScores.reduce((a,b)=>a+b,0)/walletScores.length:Number(project.walletPreparationScore||0); const narrative=scoreNarrativePropagation({...project,...migrationRow},narrativeGraph,options.narrative); const enriched={...project,...migrationRow, walletEntityIds,walletEntityScore, narrativePropagationScore:narrative.narrativePropagationScore, regimeState:regime.state, regimeCompatibilityScore:regimeCompatibility(project,regime),}; const halfLife=estimateOpportunityHalfLife(enriched,history,{now,...options.halfLife}); const executionAwareEV=computeExecutionAwareEV({...enriched,opportunityHalfLife:halfLife},options.execution); const candidate={...enriched,opportunityHalfLife:halfLife,executionAwareEV}; const agentPacket=buildResearchAgentPacket(candidate); const governor=governAlphaOpportunity({...candidate,agentPacket},input.context || {},options.governor); const research=nextBestResearchAction({...candidate,...governor}); const attribution=attributeAlpha({...candidate,...governor}); return {...candidate, narrative, agentPacket, governor, nextBestResearch:research.nextAction, alphaAttribution:attribution};
  }).sort((a,b)=>b.governor.alphaOSScore-a.governor.alphaOSScore);
  return { schemaVersion:1,generatedAt:now,system:"CLI_5_AUTONOMOUS_ALPHA_OS",regime,walletEntities:{...entityGraph,reputation:entityReputation},capitalMigration:migration,narrativeGraph,candidates,policy:{researchOperatingSystem:true,forwardEdgeRequiredForCanary:true,automaticTrading:false,automaticPromotion:false,guardedLiveRankingBypassAllowed:false} };
}

export function regimeCompatibility(project={},regime={}) {
  const state=String(regime.state||""); const risk=Number(project.riskScore??project.riskScorePct??50); const liquidity=Number(project.liquidityUsd??project.activeLiquidityUsd??0); const migration=Number(project.capitalMigrationScore??50); let score=50;
  if(state==="LIQUIDITY_EXPANSION_RISK_ON") score=55+Math.min(25,migration*.25)+Math.min(15,Math.log10(1+Math.max(0,liquidity))*2);
  else if(state==="TRENDING_RISK_ON") score=60+Math.min(20,migration*.2);
  else if(state==="SELECTIVE_ROTATION") score=50+Math.min(25,migration*.25);
  else if(state==="VOLATILITY_SHOCK") score=75-Math.min(60,risk*.6);
  else if(state==="LIQUIDITY_CONTRACTION") score=70-Math.min(55,risk*.5)-Math.min(20,migration*.15);
  return Math.max(0,Math.min(100,score));
}
