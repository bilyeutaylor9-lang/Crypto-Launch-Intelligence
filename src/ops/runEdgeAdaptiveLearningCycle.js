import fs from "node:fs";
import path from "node:path";

import { loadEdgeProductionEpisodes } from "../learning/edgeProductionEpisodeStore.js";
import { loadEdgeEvidenceOutcomes } from "../learning/edgeEvidenceOutcomeStore.js";
import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import {
  buildEdgeSignalDarwinism,
  extractEdgeSignalKeys,
  writeEdgeSignalDarwinismReport,
} from "../learning/edgeSignalDarwinism.js";
import { rankResearchCandidates } from "../learning/edgeResearchBudgetRouter.js";

function writeJson(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return absolute;
}

export function runEdgeAdaptiveLearningCycle(options = {}) {
  const episodes =
    options.episodes ||
    loadEdgeProductionEpisodes(options.episodeStore || {});
  const outcomes =
    options.outcomes ||
    loadEdgeEvidenceOutcomes(options.outcomeStore || {});
  const universe =
    options.universe ||
    loadEdgeCandidateUniverse(options.universeStore || {});

  const registry = buildEdgeSignalDarwinism(episodes, outcomes, {
    now: options.now,
    policy: options.policy,
  });

  const ranked = rankResearchCandidates(
    universe.candidates || [],
    registry,
    extractEdgeSignalKeys,
    {
      limit: options.limit || process.env.EDGE_RESEARCH_PRIORITY_LIMIT || 100,
      minimumLiquidityUsd:
        options.minimumLiquidityUsd ||
        process.env.EDGE_RESEARCH_MIN_LIQUIDITY_USD ||
        25_000,
    }
  );

  const researchReport = {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    sourceCandidates: Array.isArray(universe.candidates)
      ? universe.candidates.length
      : 0,
    matureTreatmentEpisodes: registry.matureTreatmentEpisodes,
    verifiedSignals: registry.signals.filter((row) => row.rankingEligible).length,
    candidates: ranked,
    policy: {
      purpose: "research-priority-allocation",
      rankingInfluence: false,
      productionSelectionInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      realMoneyOrderCreation: false,
      syntheticPassAllowed: false,
    },
  };

  if (options.writeReports !== false) {
    writeEdgeSignalDarwinismReport(registry, {
      file: options.registryReportFile,
    });
    writeJson(
      options.researchReportFile || "reports/edge-research-priority.json",
      researchReport
    );
  }

  return { registry, researchReport };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runEdgeAdaptiveLearningCycle();
    console.log(JSON.stringify({
      matureTreatmentEpisodes: result.registry.matureTreatmentEpisodes,
      verifiedSignals: result.registry.signals.filter((row) => row.rankingEligible).length,
      rankedResearchCandidates: result.researchReport.candidates.length,
      topCandidate: result.researchReport.candidates[0]
        ? {
            symbol: result.researchReport.candidates[0].symbol || null,
            chain: result.researchReport.candidates[0].chain || null,
            score: result.researchReport.candidates[0].research.researchPriorityScore,
          }
        : null,
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
