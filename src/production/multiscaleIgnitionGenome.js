import { buildIgnitionGenomeReport } from "../learning/ignitionGenomeEngine.js";
import { clamp, identityKey, mean } from "./productionMath.js";

export const DEFAULT_GENOME_WINDOWS_MINUTES = Object.freeze([15, 60, 360, 1440, 4320]);

function scoreFor(row) {
  return Number(row?.genome?.genomeResearchScore || 0);
}

export function buildMultiscaleIgnitionGenome(
  observations = [],
  outcomeLab = {},
  candidates = [],
  options = {}
) {
  const windows = options.windowsMinutes || DEFAULT_GENOME_WINDOWS_MINUTES;
  const byWindow = {};

  for (const windowMinutes of windows) {
    byWindow[String(windowMinutes)] = buildIgnitionGenomeReport(
      observations,
      outcomeLab,
      candidates,
      {
        ...options,
        windowMinutes,
        minimumPoints: windowMinutes <= 60 ? 2 : options.minimumPoints || 3,
      }
    );
  }

  const keys = new Set();
  for (const report of Object.values(byWindow)) {
    for (const row of report.candidates || []) keys.add(identityKey(row));
  }

  const combined = [];
  for (const key of keys) {
    const scaleRows = windows.map((windowMinutes) => {
      const report = byWindow[String(windowMinutes)];
      const row = (report.candidates || []).find((item) => identityKey(item) === key);
      return { windowMinutes, row };
    }).filter((item) => item.row);

    const scores = scaleRows.map((item) => scoreFor(item.row));
    const confidences = scaleRows.map((item) => Number(item.row.genome?.confidence || 0));
    const p50s = scaleRows.map((item) => Number(item.row.genome?.probability50Pct || 0) / 100);
    const p100s = scaleRows.map((item) => Number(item.row.genome?.probability100Pct || 0) / 100);
    const failures = scaleRows.map((item) => Number(item.row.genome?.failureProbabilityPct || 0) / 100);

    const agreement = scores.length > 1
      ? clamp(1 - (Math.max(...scores) - Math.min(...scores)) / 100)
      : 0.35;
    const availableScalePct = scaleRows.length / windows.length;
    const combinedScore = clamp(
      (
        (mean(scores) || 0) * 0.55 +
        (mean(confidences) || 0) * 100 * 0.20 +
        agreement * 100 * 0.15 +
        availableScalePct * 100 * 0.10
      ) / 100
    ) * 100;

    const representative = scaleRows.at(-1)?.row || scaleRows[0].row;
    combined.push({
      identityKey: key,
      symbol: representative.symbol || null,
      name: representative.name || null,
      chain: representative.chain || null,
      tokenAddress: representative.tokenAddress || null,
      poolAddress: representative.poolAddress || null,
      multiscaleGenomeScore: Number(combinedScore.toFixed(2)),
      scaleAgreementPct: Number((agreement * 100).toFixed(2)),
      availableScales: scaleRows.length,
      totalScales: windows.length,
      probability50Pct: Number(((mean(p50s) || 0) * 100).toFixed(2)),
      probability100Pct: Number(((mean(p100s) || 0) * 100).toFixed(2)),
      failureProbabilityPct: Number(((mean(failures) || 0) * 100).toFixed(2)),
      averageConfidencePct: Number(((mean(confidences) || 0) * 100).toFixed(2)),
      scales: scaleRows.map(({ windowMinutes, row }) => ({
        windowMinutes,
        state: row.genome?.state || null,
        score: scoreFor(row),
        confidencePct: row.genome?.confidencePct ?? null,
        p50: row.genome?.probability50Pct ?? null,
        p100: row.genome?.probability100Pct ?? null,
        failure: row.genome?.failureProbabilityPct ?? null,
      })),
    });
  }

  combined.sort((a, b) => b.multiscaleGenomeScore - a.multiscaleGenomeScore);

  return {
    schemaVersion: 1,
    generatedAt: options.asOf || new Date().toISOString(),
    windowsMinutes: windows,
    candidates: combined,
    byWindow,
    policy: {
      researchOnly: true,
      productionRankingInfluence: false,
      automaticTrading: false,
      futureFeatureBackfillAllowed: false,
    },
  };
}
