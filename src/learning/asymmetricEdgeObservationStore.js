import fs from "fs";
import path from "path";
import { canonicalIdentityKey, num, timestampOf } from "../edge/edgeMath.js";

const DEFAULT_FILE = path.resolve("data", "asymmetric-edge-observations.jsonl");
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_READ_LIMIT = 40_000;

function ensureDir(filePath = DEFAULT_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function trimFile(filePath = DEFAULT_FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.size <= maxBytes) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const keep = lines.slice(-Math.max(5000, Math.floor(lines.length * 0.6)));
  fs.writeFileSync(filePath, keep.join("\n") + "\n");
}

export function loadAsymmetricEdgeObservations(options = {}) {
  const filePath = options.filePath || DEFAULT_FILE;
  const limit = Math.max(1, Number(options.limit || DEFAULT_READ_LIMIT));
  ensureDir(filePath);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).slice(-limit).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function historyForEdgeProject(project = {}, observations = [], options = {}) {
  const key = canonicalIdentityKey(project);
  const limit = Math.max(1, Number(options.limit || 250));
  return (Array.isArray(observations) ? observations : [])
    .filter((row) => row.identityKey === key)
    .sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || "")))
    .slice(-limit);
}

export function buildAsymmetricEdgeObservation(project = {}, meta = {}) {
  const suite = project.asymmetricEdgeSuite || {};
  const clock = suite.threeClock || project.threeClockEdge || {};
  const changePoint = suite.changePoint || project.marketChangePointRadar || {};
  const diffusion = suite.diffusion || project.informationDiffusionClock || {};
  const fakeMomentum = suite.fakeMomentum || project.fakeMomentumFirewall || {};
  const sequence = suite.sequenceDNA || project.eventSequenceDNA || {};
  const hazard = suite.breakoutHazard || project.breakoutHazard || {};
  const residual = suite.residualAlpha || project.residualAlpha || {};
  const halfLife = suite.edgeHalfLife || project.edgeHalfLife || {};
  const uncertainty = suite.uncertainty || project.edgeUncertainty || {};

  return {
    schemaVersion: 1,
    identityKey: canonicalIdentityKey(project),
    observedAt: meta.observedAt || new Date().toISOString(),
    scanRunId: meta.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: meta.codeCommitSha || process.env.GITHUB_SHA || null,
    name: project.name || null,
    symbol: project.symbol || null,
    chain: project.chain || project.canonicalChain || null,
    tokenAddress: project.tokenAddress || project.contractAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,

    priceUsd: num(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
    liquidityUsd: num(
      project.stableExitLiquidityUsd ?? project.dexLiquidityUsd ?? project.liquidityUsd ?? project.liquidity
    ),
    volume24hUsd: num(project.volume24hUsd ?? project.volume24h ?? project.volume),
    buyerCount: num(project.uniqueBuyers24h ?? project.buyers24h),
    holderCount: num(project.holderCount ?? project.holders),
    productionScore: num(project.pipelineScore ?? project.opportunityScore ?? project.score),

    projectClockScore: num(project.projectClockScore ?? clock.projectClock?.score),
    capitalClockScore: num(project.capitalClockScore ?? clock.capitalClock?.score),
    attentionClockScore: num(project.attentionClockScore ?? clock.attentionClock?.score),
    divergenceScore: num(project.threeClockDivergenceScore ?? clock.divergence?.score),
    divergenceState: project.threeClockDivergenceState || clock.divergence?.state || null,
    leadStage: num(project.threeClockLeadStage ?? clock.leadSequence?.stage),
    leadStageLabel: clock.leadSequence?.label || null,

    structuralBreakScore: num(changePoint.score),
    structuralBreakState: changePoint.state || null,
    diffusionState: diffusion.state || null,
    estimatedAttentionLeadHours: num(diffusion.estimatedAttentionLeadHours),
    fakeMomentumRiskScore: num(fakeMomentum.riskScore),
    fakeMomentumState: fakeMomentum.state || null,
    sequenceSimilarity: num(sequence.bestSimilarity),
    sequenceState: sequence.state || null,
    breakoutHazard24h: num(hazard.horizons?.["24h"]?.probability),
    breakoutHazard72h: num(hazard.horizons?.["72h"]?.probability),
    residualBlindspotSimilarity: num(residual.blindspotSimilarity),
    residualState: residual.state || null,
    edgeHalfLifeHours: num(halfLife.halfLifeHours),
    uncertaintyState: uncertainty.state || null,
    abstain: uncertainty.abstain === true,
    shadowOnly: true,
  };
}

export function appendAsymmetricEdgeObservations(projects = [], meta = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_FILE;
  ensureDir(filePath);
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((project) => project?.asymmetricEdgeSuite)
    .map((project) => buildAsymmetricEdgeObservation(project, meta));
  if (!rows.length) return { filePath, saved: 0, observations: [] };
  fs.appendFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  trimFile(filePath, Number(options.maxBytes || DEFAULT_MAX_BYTES));
  return { filePath, saved: rows.length, observations: rows };
}

export function summarizeAsymmetricEdgeStore(options = {}) {
  const rows = loadAsymmetricEdgeObservations(options);
  return {
    filePath: options.filePath || DEFAULT_FILE,
    observations: rows.length,
    uniqueProjects: new Set(rows.map((row) => row.identityKey)).size,
    latestObservedAt: rows.map(timestampOf).filter(Boolean).sort().at(-1) || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAsymmetricEdgeStore(), null, 2));
}
