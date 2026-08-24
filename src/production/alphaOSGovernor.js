import { clamp, finite, mean } from "./productionMath.js";

export function governAlphaOpportunity(candidate = {}, context = {}, options = {}) {
  const edgeVerified=context.edgeVerification?.edgeState === "VERIFIED_FORWARD_EDGE";
  const readiness=context.productionReadiness?.state === "PRODUCTION_READY_INTELLIGENCE";
  const agentPacket=candidate.agentPacket || {}; const ev=finite(candidate.executionAwareEV?.captureableExpectedValuePct) ?? -999; const late=clamp((finite(candidate.opportunityHalfLife?.lateChaseProbabilityPct) ?? 100)/100); const regime=finite(candidate.regimeCompatibilityScore) ?? 50; const confidence=clamp((finite(candidate.metaProbabilityConfidencePct ?? candidate.expertEnsemble?.confidence*100) ?? 0)/100); const contradictions=Number(agentPacket.contradictionCount||0);
  let score=(clamp((ev+20)/70)*.35 + (regime/100)*.15 + confidence*.20 + (1-late)*.15 + clamp((finite(candidate.combinedResearchScore)??50)/100)*.15)*100;
  score -= Math.min(30, contradictions*6); score=Math.max(0,Math.min(100,score));
  let state="OBSERVE"; if(score>=80 && late<.45) state="DEEP_RESEARCH_NOW"; else if(score>=65) state="PRIORITY_RESEARCH"; else if(score>=50) state="WATCH";
  return { alphaOSScore:Number(score.toFixed(2)), researchState:state, edgeVerified, productionReadiness:readiness, productionRankingInfluenceAllowed:false, canaryEligibility:edgeVerified && readiness && score>=80 && late<.35, automaticTrading:false, automaticPromotion:false, blockers:[...(!edgeVerified?["FORWARD_EDGE_NOT_VERIFIED"]:[]),...(!readiness?["PRODUCTION_READINESS_NOT_PASSED"]:[]),...(late>=.65?["OPPORTUNITY_TOO_MATURE"]:[]),...(ev<0?["NEGATIVE_EXECUTION_AWARE_EV"]:[])] };
}
