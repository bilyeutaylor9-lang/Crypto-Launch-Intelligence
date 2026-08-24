import { clamp, finite, seededRandom } from "./productionMath.js";

function baseProbability(candidate = {}) { return clamp((finite(candidate.probability50Pct ?? candidate.forwardScenario?.probability50Pct ?? candidate.expertEnsembleProbability50Pct) ?? 0) / 100); }
function failureProbability(candidate = {}) { return clamp((finite(candidate.probabilityLoss20Pct ?? candidate.forwardScenario?.probabilityLoss20Pct ?? candidate.failureProbabilityPct) ?? 20) / 100); }

export function simulateCounterfactualMarket(candidate = {}, scenarios = [], options = {}) {
  const random = seededRandom(Number(options.seed || 62001)); const baselineP50 = baseProbability(candidate); const baselineFailure = failureProbability(candidate);
  const results = (Array.isArray(scenarios) ? scenarios : []).map((scenario, index) => {
    const effects = scenario.effects || {};
    const btcShock = finite(effects.btcReturnShockPct) ?? 0;
    const capital = finite(effects.capitalMigrationDeltaPct) ?? 0;
    const wallet = finite(effects.walletEntityScoreDeltaPct) ?? 0;
    const liquidity = finite(effects.liquidityDeltaPct) ?? 0;
    const seller = finite(effects.sellerExhaustionDeltaPct) ?? 0;
    const narrative = finite(effects.narrativeDeltaPct) ?? 0;
    const stochastic = options.includeNoise ? (random() - 0.5) * 0.02 : 0;
    const delta = btcShock * 0.012 + capital * 0.004 + wallet * 0.0035 + liquidity * 0.0025 + seller * 0.003 + narrative * 0.002 + stochastic;
    const p50 = clamp(baselineP50 + delta); const failure = clamp(baselineFailure - delta * 0.7 + Math.max(0,-btcShock)*0.01);
    return { scenarioId: scenario.id || `scenario_${index+1}`, label: scenario.label || scenario.id || `Scenario ${index+1}`, probability50Pct: Number((p50*100).toFixed(2)), failureProbabilityPct: Number((failure*100).toFixed(2)), probability50DeltaPts: Number(((p50-baselineP50)*100).toFixed(2)), failureProbabilityDeltaPts: Number(((failure-baselineFailure)*100).toFixed(2)), effects };
  });
  return { identityKey: candidate.identityKey || null, baseline: { probability50Pct: Number((baselineP50*100).toFixed(2)), failureProbabilityPct: Number((baselineFailure*100).toFixed(2)) }, scenarios: results, mostFragileScenario: [...results].sort((a,b)=>a.probability50Pct-b.probability50Pct)[0] || null, policy: { scenarioAnalysisOnly: true, causalForecastClaimAllowed: false, automaticTrading: false } };
}

export function defaultCounterfactualScenarios() {
  return [
    { id:"btc_down_4", label:"BTC -4% shock", effects:{btcReturnShockPct:-4} },
    { id:"capital_plus_40", label:"Capital migration +40%", effects:{capitalMigrationDeltaPct:40} },
    { id:"wallet_exit", label:"Top wallet entities exit", effects:{walletEntityScoreDeltaPct:-55} },
    { id:"liquidity_plus_30", label:"Liquidity +30%", effects:{liquidityDeltaPct:30} },
    { id:"seller_refill", label:"Seller inventory refills", effects:{sellerExhaustionDeltaPct:-45} },
    { id:"narrative_acceleration", label:"Narrative accelerates", effects:{narrativeDeltaPct:35} },
  ];
}
