import { clamp, finite, strictIdentityKey } from "./productionMath.js";

export function forecastCapitalDestinations(routes = [], candidates = [], options = {}) {
  const routeRows = (Array.isArray(routes) ? routes : []).map((route) => {
    const confidence = finite(route.confidencePct ?? route.score) ?? 50;
    const flow = finite(route.netFlowUsd ?? route.expectedFlowUsd) ?? 0;
    const persistence = finite(route.persistenceScore) ?? 50;
    return {
      source: route.source || "UNKNOWN",
      chain: route.chain || route.destinationChain || null,
      narrative: route.narrative || route.destinationNarrative || null,
      expectedFlowUsd: flow,
      confidencePct: clamp(confidence * 0.7 + persistence * 0.3, 0, 100),
    };
  }).sort((a, b) => b.confidencePct - a.confidencePct);

  const candidateRows = Array.isArray(candidates) ? candidates : [];
  const exactCandidates = candidateRows.filter((candidate) => strictIdentityKey(candidate));
  const matches = exactCandidates.map((candidate) => {
    const chain = String(candidate.chain || "").toLowerCase();
    const narratives = new Set([candidate.narrative, ...(candidate.narratives || [])].filter(Boolean).map((v) => String(v).toLowerCase()));
    let score = 0;
    const matchedRoutes = [];
    for (const route of routeRows) {
      let local = 0;
      if (route.chain && String(route.chain).toLowerCase() === chain) local += 55;
      if (route.narrative && narratives.has(String(route.narrative).toLowerCase())) local += 45;
      if (local > 0) {
        local *= route.confidencePct / 100;
        score = Math.max(score, local);
        matchedRoutes.push({ ...route, matchScore: local });
      }
    }
    return {
      identityKey: strictIdentityKey(candidate),
      score: clamp(score, 0, 100),
      matchedRoutes: matchedRoutes.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5),
    };
  }).sort((a, b) => b.score - a.score);

  return {
    schemaVersion: 2,
    generatedAt: options.now || new Date().toISOString(),
    routes: routeRows,
    candidateMatches: matches,
    rejectedCandidates: candidateRows.length - exactCandidates.length,
    exactIdentityRequired: true,
    automaticTrading: false,
  };
}
