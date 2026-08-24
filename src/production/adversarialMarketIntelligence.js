import { clamp, finite } from "./productionMath.js";
function arr(v){return Array.isArray(v)?v:[];}
export function analyzeAdversarialMarketIntelligence(candidate = {}, context = {}, options = {}) {
  const entityIds=arr(candidate.walletEntityIds); const entityGraph=context.walletEntities || context.walletEntityGraph || {}; const entities=arr(entityGraph.entities).filter(e=>entityIds.includes(e.entityId));
  const visibleWallets = entities.reduce((s,e)=>s+Number(e.walletCount||0),0) || Number(candidate.walletTemporalFingerprint?.walletCount||0);
  const independentEntities = entities.length || (visibleWallets ? visibleWallets : 0);
  const compression = visibleWallets ? clamp(1-independentEntities/Math.max(1,visibleWallets)) : 0;
  const circularity = clamp((finite(candidate.walletTemporalRiskScore ?? candidate.walletTemporalFingerprint?.riskScore) ?? 0)/100);
  const concentration = clamp((finite(candidate.walletConcentrationPct ?? candidate.largestWalletFlowSharePct) ?? 0)/100);
  const wash = clamp((finite(candidate.washTradingRiskScore ?? candidate.washTradingScore) ?? 0)/100);
  const socialBot = clamp((finite(candidate.xBotRiskScore ?? candidate.socialBotRiskScore) ?? 0)/100);
  const liquidityRemoval = clamp((finite(candidate.liquidityRemovalPct) ?? 0)/100);
  const volumeLiquidity = (()=>{const v=finite(candidate.volume24hUsd??candidate.volume24h)||0,l=finite(candidate.liquidityUsd)||0;return l>0?clamp(Math.max(0,(v/l)-12)/20):0;})();
  const developerSynthetic = clamp((finite(candidate.developerSyntheticRiskScore ?? candidate.githubSyntheticActivityRiskScore) ?? 0)/100);
  const risk = clamp(compression*.18 + circularity*.18 + concentration*.14 + wash*.16 + socialBot*.12 + liquidityRemoval*.12 + volumeLiquidity*.06 + developerSynthetic*.04);
  const findings=[]; if(compression>.55) findings.push("WALLET_ENTITY_COMPRESSION_HIGH"); if(circularity>.6) findings.push("CIRCULAR_WALLET_BEHAVIOR"); if(wash>.55) findings.push("WASH_TRADING_RISK"); if(concentration>.65) findings.push("FLOW_CONCENTRATION_HIGH"); if(socialBot>.55) findings.push("SOCIAL_BOT_AMPLIFICATION"); if(liquidityRemoval>.25) findings.push("LIQUIDITY_REMOVAL_PRESSURE"); if(volumeLiquidity>.5) findings.push("ABNORMAL_VOLUME_TO_LIQUIDITY"); if(developerSynthetic>.5) findings.push("SYNTHETIC_DEVELOPER_ACTIVITY_RISK");
  return { state:risk>=.72?"ADVERSARIAL_RISK_CRITICAL":risk>=.5?"ADVERSARIAL_RISK_HIGH":risk>=.3?"ADVERSARIAL_RISK_ELEVATED":"ADVERSARIAL_RISK_CONTROLLED", riskScore:Number((risk*100).toFixed(2)), visibleWallets, independentEconomicEntities:independentEntities, sybilCompressionPct:Number((compression*100).toFixed(2)), findings, reliabilityMultiplier:Number((1-risk*.8).toFixed(4)), policy:{riskDetectionOnly:true, accusationOfFraud:false, automaticTrading:false} };
}
