import fs from "node:fs";
import path from "node:path";

import { loadIgnitionTwinObservations } from "../learning/ignitionTwinObservationStore.js";
import { runIgnitionOutcomeLab } from "../learning/ignitionOutcomeLab.js";
import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { buildIgnitionGenomeReport } from "../learning/ignitionGenomeEngine.js";

const REPORT_FILE = path.resolve("reports", "ignition-genome.json");

export function runIgnitionGenomeCycle(options = {}) {
  const observations =
    options.observations ||
    loadIgnitionTwinObservations({
      limit:
        options.observationLimit ||
        process.env.IGNITION_GENOME_OBSERVATION_LIMIT ||
        20_000,
    });

  const outcomeLab =
    options.outcomeLab ||
    runIgnitionOutcomeLab({
      observations,
      writeReport: options.writeOutcomeLabReport !== false,
    });

  const universe =
    options.universe ||
    loadEdgeCandidateUniverse(options.universeStore || {});

  const report = buildIgnitionGenomeReport(
    observations,
    outcomeLab,
    universe.candidates || [],
    {
      asOf: options.asOf || new Date().toISOString(),
      windowMinutes:
        options.windowMinutes ||
        process.env.IGNITION_GENOME_WINDOW_MINUTES ||
        360,
      horizonHours:
        options.horizonHours ||
        process.env.IGNITION_GENOME_HORIZON_HOURS ||
        24,
      topK:
        options.topK ||
        process.env.IGNITION_GENOME_TOP_K ||
        25,
      minimumPoints:
        options.minimumPoints ||
        process.env.IGNITION_GENOME_MIN_POINTS ||
        3,
      minimumDimensions:
        options.minimumDimensions ||
        process.env.IGNITION_GENOME_MIN_DIMENSIONS ||
        10,
      minimumNeighbors:
        options.minimumNeighbors ||
        process.env.IGNITION_GENOME_MIN_NEIGHBORS ||
        6,
    }
  );

  if (options.writeReport !== false) {
    const file = path.resolve(options.reportFile || REPORT_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runIgnitionGenomeCycle();
    console.log(JSON.stringify({
      historicalGenomeCount: report.historicalGenomeCount,
      liveCandidatesScored: report.liveCandidatesScored,
      topCandidates: report.candidates.slice(0, 10).map((row) => ({
        symbol: row.symbol,
        state: row.genome.state,
        genomeResearchScore: row.genome.genomeResearchScore,
        probability50Pct: row.genome.probability50Pct,
        probability100Pct: row.genome.probability100Pct,
        failureProbabilityPct: row.genome.failureProbabilityPct,
        confidencePct: row.genome.confidencePct,
      })),
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
