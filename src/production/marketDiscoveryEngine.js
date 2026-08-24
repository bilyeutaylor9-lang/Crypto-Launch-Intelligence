import { buildCausalMarketWorldModel, strongestPaths } from "./causalMarketWorldModel.js";
import { simulateCounterfactualMarket, defaultCounterfactualScenarios } from "./counterfactualMarketSimulator.js";
import { analyzeAdversarialMarketIntelligence } from "./adversarialMarketIntelligence.js";
import { detectMarketShockEarlyWarning } from "./marketShockEarlyWarning.js";
import { buildOpportunityDependencyGraph } from "./opportunityDependencyGraph.js";
import { buildEdgeFrontier } from "./edgeFrontier.js";
import { accountEvidenceValue } from "./evidenceValueAccounting.js";
import { buildPredictiveMarketDiscoveryNetwork } from "./predictiveMarketDiscoveryNetwork.js";
import { identityKey } from "./productionMath.js";

export function buildMarketDiscoveryEngine(input = {}, options = {}) {
  const now=options.now||new Date().toISOString(); const alphaOS=input.alphaOS||{}; const candidates=Array.isArray(input.candidates)?input.candidates:(alphaOS.candidates||[]);
  const world=buildCausalMarketWorldModel({projects:candidates,regime:input.regime||alphaOS.regime,events:input.worldEvents||[]},{asOf:now}); const shock=detectMarketShockEarlyWarning(input.marketHistory||[],{asOf:now}); const previousDeps=input.previousDependencies||{};
  const enriched=candidates.map(candidate=>{const key=identityKey(candidate); const projectNode=`PROJECT:${key}`; const paths=strongestPaths(world,projectNode,{topK:8}); const counterfactual=simulateCounterfactualMarket(candidate,options.scenarios||defaultCounterfactualScenarios(),{seed:Number(options.seed||62001)}); const adversarial=analyzeAdversarialMarketIntelligence(candidate,alphaOS); const dependencies=buildOpportunityDependencyGraph({...candidate,adversarialMarketIntelligence:adversarial},previousDeps[key]||null); return {...candidate,causalWorldPaths:paths,counterfactualMarket:counterfactual,adversarialMarketIntelligence:adversarial,opportunityDependencies:dependencies,marketShockState:shock.state};});
  const frontier=buildEdgeFrontier(enriched); const predictive=buildPredictiveMarketDiscoveryNetwork({historicalWinners:input.historicalWinners||[],candidates:enriched},{now}); const evidenceEconomics=accountEvidenceValue(input.researchAccounting||[],{now});
  return {schemaVersion:1,generatedAt:now,system:"CLI_8_MARKET_DISCOVERY_ENGINE",worldModel:world,shockEarlyWarning:shock,predictiveDiscovery:predictive,edgeFrontier:frontier,evidenceEconomics,candidates:enriched,policy:{marketDiscoveryResearchOnly:true,worldModelCausalClaimAllowed:false,counterfactualsAreScenarios:true,forwardVerificationRequired:true,automaticPromotion:false,automaticTrading:false}};
}
