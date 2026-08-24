import { clamp, finite } from "./productionMath.js";

function tags(row = {}) {
  const values = [
    `chain:${String(row.chain || "unknown").toLowerCase()}`,
    ...(row.narratives || row.tags || []).map((v) => `theme:${String(v).toLowerCase()}`),
    ...(row.walletClusters || []).map((v) => `wallet:${String(v).toLowerCase()}`),
  ];
  return new Set(values);
}

function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  const intersection = [...a].filter((v) => b.has(v)).length;
  return union.size ? intersection / union.size : 0;
}

export function diversifyResearchQueue(candidates = [], options = {}) {
  const selected = [];
  const maxItems = Math.max(1, Number(options.maxItems || 10));
  const redundancyPenalty = Number(options.redundancyPenalty || 25);

  for (const candidate of [...candidates].sort(
    (a, b) => Number(b.combinedResearchScore || 0) - Number(a.combinedResearchScore || 0)
  )) {
    const candidateTags = tags(candidate);
    const maxSimilarity = selected.length
      ? Math.max(...selected.map((row) => jaccard(candidateTags, tags(row))))
      : 0;
    const raw = finite(candidate.combinedResearchScore) ?? 0;
    const adjusted = clamp((raw - maxSimilarity * redundancyPenalty) / 100) * 100;
    selected.push({
      ...candidate,
      portfolioResearchScore: Number(adjusted.toFixed(2)),
      redundancySimilarityPct: Number((maxSimilarity * 100).toFixed(2)),
    });
    selected.sort((a, b) => b.portfolioResearchScore - a.portfolioResearchScore);
    if (selected.length > maxItems) selected.pop();
  }
  return selected;
}
