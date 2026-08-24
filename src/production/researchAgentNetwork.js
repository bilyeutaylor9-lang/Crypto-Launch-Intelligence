import { finite, mean } from "./productionMath.js";

const SPECIALISTS = Object.freeze([
  ["REGIME", "regimeCompatibilityScore"],
  ["WALLET_ENTITY", "walletEntityScore"],
  ["CAPITAL_MIGRATION", "capitalMigrationForecastScore"],
  ["IGNITION_GENOME", "multiscaleGenomeScore"],
  ["NARRATIVE", "narrativePropagationScore"],
  ["EXECUTION", "captureableExpectedValueScore"],
  ["SIGNAL", "adaptiveResearchScore"],
]);

function specialistValue(candidate = {}, field) {
  if (field === "multiscaleGenomeScore") return finite(candidate.multiscaleGenomeScore ?? candidate.multiscaleGenome?.multiscaleGenomeScore);
  if (field === "captureableExpectedValueScore") {
    const ev=finite(candidate.executionAwareEV?.captureableExpectedValuePct); return ev===null?null:Math.max(0,Math.min(100,(ev+20)/80*100));
  }
  return finite(candidate[field]);
}

export function buildResearchAgentPacket(candidate = {}, options = {}) {
  const agents=SPECIALISTS.map(([name,field])=>{ const score=specialistValue(candidate,field); return { agent:name, score, observed:score!==null, stance:score===null?"UNKNOWN":score>=70?"SUPPORT":score<=35?"CONTRADICT":"NEUTRAL" }; });
  const observed=agents.filter(a=>a.observed); const supports=observed.filter(a=>a.stance==="SUPPORT"); const contradicts=observed.filter(a=>a.stance==="CONTRADICT"); const agreement=observed.length?Math.abs(supports.length-contradicts.length)/observed.length:0;
  return { identityKey:candidate.identityKey || null, symbol:candidate.symbol || null, agents, observedAgents:observed.length, supportCount:supports.length, contradictionCount:contradicts.length, agreementScore:Number((agreement*100).toFixed(2)), meanSpecialistScore:mean(observed.map(a=>a.score)), strongestSupport:supports.sort((a,b)=>b.score-a.score)[0]||null, strongestContradiction:contradicts.sort((a,b)=>a.score-b.score)[0]||null, policy:{ structuredEvidenceOnly:true, noAgentCanTrade:true } };
}
