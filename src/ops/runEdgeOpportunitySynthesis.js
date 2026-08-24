import fs from "node:fs";
import path from "node:path";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function identityKey(item = {}) {
  if (item.identityKey) return String(item.identityKey).toLowerCase();
  const chain = String(item.chain || item.canonicalChain || "unknown").toLowerCase();
  const token = String(
    item.tokenAddress || item.contractAddress || item.canonicalAddress || ""
  ).trim().toLowerCase();
  return token ? `${chain}:${token}` : `${chain}:${String(item.symbol || item.name || "unknown").toLowerCase()}`;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function synthesizeEdgeResearchQueue(
  adaptiveReport = {},
  genomeReport = {},
  options = {}
) {
  const adaptiveRows = Array.isArray(adaptiveReport?.candidates)
    ? adaptiveReport.candidates
    : [];
  const genomeRows = new Map(
    (Array.isArray(genomeReport?.candidates) ? genomeReport.candidates : [])
      .map((row) => [identityKey(row), row])
  );

  const rows = adaptiveRows.map((candidate) => {
    const key = identityKey(candidate);
    const genomeRow = genomeRows.get(key) || null;
    const adaptiveScore =
      finite(candidate?.research?.researchPriorityScore) ?? 0;
    const genomeScore =
      finite(genomeRow?.genome?.genomeResearchScore) ?? 0;
    const genomeConfidence =
      finite(genomeRow?.genome?.confidence) ?? 0;
    const failureProbability =
      (finite(genomeRow?.genome?.failureProbabilityPct) ?? 0) / 100;

    const genomeUsable =
      genomeRow &&
      ![
        "INSUFFICIENT_CURRENT_TRAJECTORY",
        "INSUFFICIENT_HISTORICAL_NEIGHBORS",
      ].includes(genomeRow.genome?.state);

    let combined = adaptiveScore * 0.88;
    if (genomeUsable) {
      combined =
        adaptiveScore * 0.52 +
        genomeScore * 0.38 +
        genomeConfidence * 100 * 0.10;
    }

    combined -= Math.max(0, failureProbability - 0.30) * 35;
    combined = clamp(combined);

    let tier = "OBSERVE";
    if (combined >= 78 && genomeConfidence >= 0.45) {
      tier = "DEEP_RESEARCH_NOW";
    } else if (combined >= 64) {
      tier = "PRIORITY_RESEARCH";
    } else if (combined >= 48) {
      tier = "WATCH";
    }

    return {
      identityKey: key,
      symbol: candidate.symbol || genomeRow?.symbol || null,
      name: candidate.name || genomeRow?.name || null,
      chain: candidate.chain || genomeRow?.chain || null,
      tokenAddress: candidate.tokenAddress || genomeRow?.tokenAddress || null,
      poolAddress: candidate.poolAddress || genomeRow?.poolAddress || null,
      tier,
      combinedResearchScore: Number(combined.toFixed(2)),
      adaptiveResearchScore: Number(adaptiveScore.toFixed(2)),
      verifiedSignals:
        candidate?.research?.verifiedSignals || [],
      ignitionGenome: genomeRow?.genome
        ? {
            state: genomeRow.genome.state,
            score: genomeScore,
            confidencePct: genomeRow.genome.confidencePct,
            probability25Pct: genomeRow.genome.probability25Pct,
            probability50Pct: genomeRow.genome.probability50Pct,
            probability100Pct: genomeRow.genome.probability100Pct,
            failureProbabilityPct: genomeRow.genome.failureProbabilityPct,
            twoXSimilarityPct: genomeRow.genome.twoXSimilarityPct,
            breakout50SimilarityPct: genomeRow.genome.breakout50SimilarityPct,
            failureSimilarityPct: genomeRow.genome.failureSimilarityPct,
          }
        : null,
      policy: {
        researchPriorityOnly: true,
        productionSelectionInfluence: false,
        automaticTrading: false,
      },
    };
  });

  rows.sort(
    (a, b) =>
      b.combinedResearchScore - a.combinedResearchScore ||
      String(a.identityKey).localeCompare(String(b.identityKey))
  );

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    adaptiveCandidates: adaptiveRows.length,
    genomeCandidates: genomeRows.size,
    synthesizedCandidates: rows.length,
    candidates: rows.slice(0, Math.max(1, Number(options.limit || 100))),
    policy: {
      purpose: "single research-priority queue",
      verifiedSignalsMayInfluenceResearchPriority: true,
      ignitionGenomeMayInfluenceResearchPriority: true,
      productionRankingInfluence: false,
      productionScoringInfluence: false,
      automaticTrading: false,
      automaticOrderCreation: false,
    },
  };
}

export function runEdgeOpportunitySynthesis(options = {}) {
  const adaptive =
    options.adaptiveReport ||
    readJson(options.adaptiveReportFile || "reports/edge-research-priority.json") ||
    {};
  const genome =
    options.genomeReport ||
    readJson(options.genomeReportFile || "reports/ignition-genome.json") ||
    {};
  const report = synthesizeEdgeResearchQueue(adaptive, genome, options);

  if (options.writeReport !== false) {
    const file = path.resolve(
      options.reportFile || "reports/edge-opportunity-synthesis.json"
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runEdgeOpportunitySynthesis();
    console.log(JSON.stringify({
      candidates: report.synthesizedCandidates,
      top: report.candidates.slice(0, 10).map((row) => ({
        symbol: row.symbol,
        tier: row.tier,
        score: row.combinedResearchScore,
        p50: row.ignitionGenome?.probability50Pct ?? null,
        p100: row.ignitionGenome?.probability100Pct ?? null,
      })),
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
