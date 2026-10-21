import fs from "node:fs";
import path from "node:path";
import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { resolveCanonicalHistoryIdentity } from "../identity/canonicalHistoryIdentity.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function exactResearchIdentity(item = {}) {
  const declared = String(item.identityKey || item.canonicalProjectId || "");
  const separator = declared.indexOf(":");
  const chain = normalizeChainId(item.chain || item.canonicalChain || item.chainId || declared.slice(0, separator));
  const tokenAddress = normalizeTokenAddress(item.tokenAddress || item.contractAddress || item.canonicalAddress ||
    (separator > 0 ? declared.slice(separator + 1) : ""), chain);
  if (!chain || !tokenAddress) return null;
  const resolved = resolveCanonicalHistoryIdentity({ ...item, chain, tokenAddress,
    identityKey: item.identityKey || `${chain}:${tokenAddress}` });
  if (!resolved.canonicalId) return null;
  const rawPool = item.poolAddress || item.pairAddress || null;
  const poolAddress = rawPool ? normalizePoolAddress(rawPool, chain) : null;
  if (rawPool && !poolAddress) return null;
  const identityKey = `${chain}:${tokenAddress}`;
  return { identityKey, chain, tokenAddress, poolAddress,
    routeKey: `${identityKey}:${poolAddress || "TOKEN_SCOPED"}` };
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
  const genomeRows = new Map();
  let rejectedIdentityRows = 0, duplicateAdaptiveRows = 0;
  for (const row of (Array.isArray(genomeReport?.candidates) ? genomeReport.candidates : [])) {
    const identity = exactResearchIdentity(row);
    if (!identity) { rejectedIdentityRows++; continue; }
    genomeRows.set(identity.routeKey, row);
  }
  const adaptiveByRoute = new Map();
  for (const candidate of adaptiveRows) {
    const identity = exactResearchIdentity(candidate);
    if (!identity) { rejectedIdentityRows++; continue; }
    const previous = adaptiveByRoute.get(identity.routeKey);
    if (previous) duplicateAdaptiveRows++;
    if (!previous || (finite(candidate.research?.researchPriorityScore) ?? 0) >
      (finite(previous.candidate.research?.researchPriorityScore) ?? 0)) {
      adaptiveByRoute.set(identity.routeKey, { candidate, identity });
    }
  }

  const rows = [...adaptiveByRoute.values()].map(({ candidate, identity }) => {
    const genomeRow = genomeRows.get(identity.routeKey) || null;
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
      identityKey: identity.identityKey,
      symbol: candidate.symbol || genomeRow?.symbol || null,
      name: candidate.name || genomeRow?.name || null,
      chain: identity.chain,
      tokenAddress: identity.tokenAddress,
      poolAddress: identity.poolAddress,
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
    rejectedIdentityRows,
    duplicateAdaptiveRows,
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
