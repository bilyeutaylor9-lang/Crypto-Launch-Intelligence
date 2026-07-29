import fs from "fs";
import path from "path";
import { REQUIRED_REPORT_FILES, assertReportContracts } from "./reportContractValidator.js";
import { sanitizeReportJsonFiles } from "./reportValueSanitizer.js";

const REPORTS_DIR = path.resolve("reports");
const DOCS_DIR = path.resolve("docs");

const PUBLIC_REPORTS = [
  "report.html",
  "report.json",
  "opportunities.csv",
  "alerts.json",
  "daily-brief.json",
  "watchtower-performance.json",
  "watchlist.json",
  "summary.txt",
  "quantum-field.json",
  "quantum-reasoning-brain.json",
  "quantum-suite-health.json",
  "capital-migration-core.json",
  "chain-capital-rotation.json",
  "narrative-capital-rotation.json",
  "market-cap-rotation.json",
  "capital-outflow-watch.json",
  "pipeline-stage-health.json",
  "exact-outcome-horizon-lab.json",
  "mathematical-validation.json",
  "outcome-calibration.json",
  "pre-pump-patterns.json",
  "institutional-vnext.json",
  "state-of-art-signals.json",
  "ai-council.json",
  "agent-performance.json",
  "research-os.json",
  "alpha-lab.json",
  "simulation-brain.json",
  "outcome-judge.json",
  "catalyst-radar.json",
  "dossier-swarm.json",
  "ai-command-center.json",
  "ai-research-commander.json",
  "alpha-investigator.json",
  "portfolio-war-room.json",
  "strategy-lab.json",
  "causal-alpha-brain.json",
  "autonomous-alpha-os.json",
  "alpha-dashboard-v2.json",
  "paper-trading-lab.json",
  "weight-optimizer.json",
  "breakout-brain.json",
  "high-tech-alpha-stack.json",
  "self-evolving-alpha-os.json",
  "alpha-theses.json",
  "alpha-contracts.json",
  "alpha-contract-leaderboard.json",
  "alpha-contract-receipts.json",
  "alpha-knowledge-graph.json",
  "causal-market-twin.json",
  "alpha-evolution-governor.json",
  "alpha-evolution-queue.json",
  "small-cap-hunter.json",
  "proof-of-alpha-execution-twin.json",
  "organic-demand-integrity.json",
  "discovery-truth.json",
  "native-discovery-mesh.json",
  "discovery-decision-engine.json",
  "pre-consensus-breakout-hunter.json",
  "pre-breakout-radar.json",
  "sniper-report.json",
  "universe-ledger.json",
  "integrity-stack.json",
  "institutional-data-provenance.json",
  "progressive-opportunities.json",
  "debug-progressive-ladder.json",
  "debug-identity-conflicts.json",
  "debug-execution-proof.json",
  "debug-block-reasons.json",
  "debug-stage-health.json",
  "best-opportunity-now.json",
  "top-five-opportunities.json",
  "time-horizon-leaders.json",
  "opportunity-lane-leaders.json",
  "finalist-comparison.json",
  "crawler-changes.json",
  "local-ai-chief-judgment.json",
  "market-opportunity-learning.json",
  "standard-4000-selection.json",
  "standard-4000-exclusions.json",
  "selection-lane-audit.json",
  "candidate-rescue-report.json",
  "missed-opportunity-audit.json",
  "institutional-ranking.json",
  "best-available.json",
  "emerging-radar.json",
  "execution-ready.json",
  "blocked-projects.json",
  "op-mode-readiness.json",
  "evidence-kernel.json",
  "source-truth.json",
  "github-intelligence-pro.json",
  "autonomous-research.json",
  "roadmap.json",
  "source-router.json",
  "engine-audit.json",
  "engine-health-report.json",
  "engine-data-readiness.json",
  "engine-data-contract-health.json",
  "whole-engine-audit.json",
  "whole-engine-audit.md",
  "engine-value-ledger.json",
  "route-universe.json",
  "execution-proof-recovery.json",
  "alternative-execution-routes.json",
  "user-accessibility-ranking.json",
  "venue-coverage-health.json",
  "data-starvation-root-cause.json",
  "data-starvation-by-chain.json",
  "data-starvation-by-provider.json",
  "data-starvation-by-engine.json",
  "data-starvation-by-field.json",
  "starvation-rescue-queue.json",
  "starvation-recovery-results.json",
  "recovered-opportunity-watchlist.json",
  "early-asymmetry-ranking.json",
  "first-seen-opportunities.json",
  "missed-winner-replay.json",
  "pre-breakout-sequence-analysis.json",
  "early-opportunity-outcomes.json",
  "alias-resolution-summary.json",
  "alias-resolution-conflicts.json",
  "provider-vocabulary-coverage.json",
  "advertised-category-coverage.json",
  "unresolved-field-verbiage.json",
  "rejected-alias-candidates.json",
  "alias-starvation-recoveries.json",
  "crawler-health.json",
  "crawler-health.md",
  "real-utility-opportunities.json",
  "high-upside-scalp-research.json",
  "scalp-microstructure.json",
  "hottest-ten-now.json",
  "daily-capital-move.json",
  "daily-recovery-queue.json",
  "daily-source-gaps.json",
  "system-readiness.json",
  "decision-report-compaction-audit.json",
  "decision-report-compaction-audit.md",
  "web-crawler-preimplementation-audit.json",
  "web-crawler-preimplementation-audit.md",
];

function copyIfExists(fileName = "", reportsDir = REPORTS_DIR, docsDir = DOCS_DIR) {
  const source = path.join(reportsDir, fileName);
  const target = path.join(docsDir, fileName);

  if (!fs.existsSync(source)) return false;

  fs.copyFileSync(source, target);
  return true;
}

function readJsonReport(fileName = "", reportsDir = REPORTS_DIR) {
  const filePath = path.join(reportsDir, fileName);

  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDashboardNumber(value = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return value || "0";
  if (Math.abs(number) >= 1000000) return `$${Math.round(number / 100000) / 10}M`;
  if (Math.abs(number) >= 1000) return `$${Math.round(number / 100) / 10}K`;
  return String(Math.round(number * 1000000) / 1000000);
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function scoreForResearchWorthy(candidate = {}) {
  return Math.max(
    num(candidate.hottestTenNowScore),
    num(candidate.highUpsideScalpScore),
    num(candidate.scalpMicrostructureScore),
    num(candidate.realUtilityScore),
    num(candidate.utilityQualityScore),
    num(candidate.progressiveOpportunityScore),
    num(candidate.moneyRankScore),
    num(candidate.earlyAsymmetryResearchPriorityScore),
    num(candidate.opportunityScore),
    num(candidate.score)
  );
}

function researchKey(candidate = {}) {
  return [
    candidate.canonicalId,
    candidate.tokenAddress,
    candidate.contractAddress,
    candidate.verifiedContractAddress,
    candidate.poolAddress,
    candidate.primaryTradablePool,
    candidate.symbol,
    candidate.chain,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function shortAddress(value = "") {
  const raw = String(value || "");
  if (!raw) return "missing";
  return raw.length > 14 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

function contractFor(candidate = {}) {
  return first([candidate.contractAddress, candidate.tokenAddress, candidate.canonicalAddress]);
}

function pairFor(candidate = {}) {
  return first([candidate.pairAddress, candidate.poolAddress, candidate.primaryTradablePool]);
}

function rankDisplayEligible(candidate = {}) {
  if (candidate.strictRankEligible === true) return true;
  if (Object.hasOwn(candidate, "strictRankEligible")) return false;
  return Boolean(
    (candidate.liveExecutionReady || candidate.executionReady || candidate.buySellRouteVerified) &&
      contractFor(candidate) &&
      pairFor(candidate)
  );
}

function compactResearchWorthyCandidate(candidate = {}, source = "research") {
  const contractAddress = contractFor(candidate);
  const pairAddress = pairFor(candidate);
  return {
    ...candidate,
    source,
    symbol: candidate.symbol || "UNKNOWN",
    name: candidate.name || candidate.projectName || "Unknown",
    tokenName: candidate.tokenName || candidate.name || candidate.projectName || "Unknown",
    chain: candidate.chain || candidate.requiredChain || "unknown",
    chainId: candidate.chainId ?? candidate.canonicalChainId ?? null,
    canonicalId: candidate.canonicalId || candidate.canonicalProjectId || null,
    contractAddress,
    tokenAddress: candidate.tokenAddress || contractAddress || null,
    pairAddress,
    poolAddress: candidate.poolAddress || pairAddress || null,
    dexName: candidate.dexName || candidate.bestVerifiedVenue || candidate.bestGlobalRoute || candidate.venue || null,
    provenance: candidate.provenance || candidate.sources || candidate.discoverySources || [],
    lastVerifiedAt: candidate.lastVerifiedAt || candidate.routeLastVerifiedAt || candidate.quoteTimestamp || null,
    routeVerificationStatus: candidate.routeVerificationStatus || candidate.routeTruthStatus || candidate.executionTruthState || "UNKNOWN",
    quarantineReason: candidate.quarantineReason || candidate.candidateQuarantineReason || candidate.highUpsideScalpQuarantineReason || null,
    strictRankEligible: candidate.strictRankEligible === true,
    lane: candidate.lane || candidate.scalpMicrostructureLane || candidate.accessibilityLane || candidate.qualificationState || "RESEARCH",
    score: scoreForResearchWorthy(candidate),
    priceUsd: first([candidate.priceUsd, candidate.currentPrice]),
    marketCapUsd: first([candidate.marketCapUsd, candidate.marketCap]),
    liquidityUsd: first([candidate.liquidityUsd, candidate.scalpLiquidityUsd, candidate.dexLiquidity]),
    routeStatus:
      candidate.liveExecutionReady || candidate.executionReady
        ? "Live Ready"
        : candidate.buySellRouteVerified || candidate.routeReady
          ? "Route Research"
          : "Needs Route Proof",
    missing:
      [
        ...(candidate.missingInfoNeeded || []),
        ...(candidate.missingEvidence || []),
        ...(candidate.missingRouteEvidence || []),
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || candidate.reasonNotQualified || "Keep researching",
  };
}

function buildResearchWorthyBoard({
  hottestTenNow = {},
  highUpsideScalp = {},
  scalpMicrostructure = {},
  utilityQuality = {},
  progressiveOpportunities = {},
  earlyAsymmetry = {},
  institutionalRanking = {},
  userAccessibility = {},
} = {}) {
  const sources = [
    ...(hottestTenNow.topTenCurrentResearchBoard || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Hottest Ten")),
    ...(hottestTenNow.topTenHighestRatedNow || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Qualified Now")),
    ...(hottestTenNow.watchlistNeedsMoreConfirmation || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Needs Confirmation")),
    ...(highUpsideScalp.topScalpResearchCandidates || []).map((candidate) => compactResearchWorthyCandidate(candidate, "High-Upside Scalp")),
    ...(highUpsideScalp.highUpsideWatchlist || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Scalp Watch")),
    ...(scalpMicrostructure.topScalpMicrostructureResearch || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Microstructure")),
    ...(utilityQuality.topRealUtilityResearch || utilityQuality.realUtilityResearch || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Real Utility")),
    ...(progressiveOpportunities.bestAvailableOpportunities || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Best Available")),
    ...(progressiveOpportunities.institutionalMoneyRank || institutionalRanking.institutionalMoneyRank || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Money Rank")),
    ...(earlyAsymmetry.topResearchCandidates || earlyAsymmetry.ranking || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Early Asymmetry")),
    ...(userAccessibility.topProjectsByOpportunity || []).map((candidate) => compactResearchWorthyCandidate(candidate, "Route Opportunity")),
  ];
  const byKey = new Map();

  for (const candidate of sources) {
    const key = researchKey(candidate) || `${candidate.source}:${candidate.symbol}:${candidate.chain}`;
    const current = byKey.get(key);
    if (!current || scoreForResearchWorthy(candidate) > scoreForResearchWorthy(current)) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()]
    .filter((candidate) =>
      rankDisplayEligible(candidate) &&
      ![
        "BLOCKED",
        "LATE_CHASE_REJECTED",
        "MEME_SPECULATION_EXCLUDED",
        "QUARANTINED_IDENTITY_OR_ROUTE",
        "MARKET_BENCHMARK",
      ].includes(candidate.lane)
    )
    .sort((a, b) => scoreForResearchWorthy(b) - scoreForResearchWorthy(a))
    .slice(0, 10)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function renderResearchWorthyBoard(candidates = []) {
  if (!candidates.length) {
    return `
      <section class="panel hero-panel">
        <div class="section-heading">
          <div>
            <h2>Top 10 Research-Worthy Utility Small Caps</h2>
            <p>No research-worthy candidates passed the latest display filters. Check source health and rescue queues before loosening safety gates.</p>
          </div>
          <div class="actions">
            <a class="button primary" href="./hottest-ten-now.json">View Latest Research</a>
            <a class="button" href="https://github.com/bilyeutaylor9-lang/Crypto-Launch-Intelligence/actions/workflows/pages-dashboard.yml">Run Next GitHub Scan</a>
          </div>
        </div>
        <div class="empty">No current research board candidates in the latest published scan.</div>
      </section>
    `;
  }

  return `
    <section class="panel hero-panel">
      <div class="section-heading">
        <div>
          <h2>Top 10 Research-Worthy Utility Small Caps</h2>
          <p>First-look board for candidates worth manual research. Research output only, not financial advice or a profit guarantee.</p>
        </div>
        <div class="actions">
          <a class="button primary" href="./hottest-ten-now.json">View Latest Research</a>
          <a class="button" href="./user-accessibility-ranking.json">View Latest Route Analysis</a>
          <a class="button" href="https://github.com/bilyeutaylor9-lang/Crypto-Launch-Intelligence/actions/workflows/pages-dashboard.yml">Run Next GitHub Scan</a>
        </div>
      </div>
      <div class="table-wrap">
        <table class="priority-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Symbol</th>
              <th>Chain</th>
              <th>Contract</th>
              <th>Pair / DEX</th>
              <th>Why Shown</th>
              <th>Score</th>
              <th>Price</th>
              <th>Market Cap</th>
              <th>Liquidity</th>
              <th>Route</th>
              <th>Needs Next</th>
            </tr>
          </thead>
          <tbody>
            ${candidates
              .map(
                (candidate) => `
                  <tr>
                    <td>${escapeHtml(candidate.rank)}</td>
                    <td><strong>${escapeHtml(candidate.symbol)}</strong><br /><span class="muted">${escapeHtml(candidate.name)}</span></td>
                    <td>${escapeHtml(candidate.chain)}</td>
                    <td>${escapeHtml(shortAddress(candidate.contractAddress))}<br /><span class="muted">${escapeHtml(candidate.canonicalId || "canonical pending")}</span></td>
                    <td>${escapeHtml(shortAddress(candidate.pairAddress))}<br /><span class="muted">${escapeHtml(candidate.dexName || "venue pending")}</span></td>
                    <td>${escapeHtml(candidate.source)}<br /><span class="muted">${escapeHtml(candidate.lane)}</span></td>
                    <td><strong>${escapeHtml(candidate.score)}</strong></td>
                    <td>${escapeHtml(formatDashboardNumber(candidate.priceUsd))}</td>
                    <td>${escapeHtml(formatDashboardNumber(candidate.marketCapUsd))}</td>
                    <td>${escapeHtml(formatDashboardNumber(candidate.liquidityUsd))}</td>
                    <td>${escapeHtml(candidate.routeVerificationStatus || candidate.routeStatus)}</td>
                    <td>${escapeHtml(candidate.quarantineReason || candidate.missing)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDailyCapitalSlate(dailyCapital = {}, recovery = {}) {
  const best = dailyCapital.bestCandidate;
  const board = [
    ...(best ? [best] : []),
    ...(dailyCapital.backupCandidates || []),
    ...(dailyCapital.watchlist || []),
  ].slice(0, 10);
  const status = dailyCapital.status || "REPORT NOT GENERATED";

  return `
    <section class="panel hero-panel">
      <div class="section-heading">
        <div>
          <h2>Daily Capital Move Status</h2>
          <p>${escapeHtml(
            best
              ? "One candidate has the strongest current research profile. Refresh route and safety proof before any manual decision."
              : dailyCapital.noMoveReason || "No valid capital move today. Use the recovery queue instead of forcing a pick."
          )}</p>
        </div>
        <div class="actions">
          <a class="button primary" href="./daily-capital-move.json">Daily Capital Slate</a>
          <a class="button" href="./daily-recovery-queue.json">Needs Missing Proof</a>
          <a class="button" href="./system-readiness.json">System Readiness</a>
        </div>
      </div>
      <div class="metrics">
        <div class="metric compact"><div class="metric-value">${escapeHtml(status)}</div><div class="metric-label">Daily Status</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(best?.symbol || "NO VALID MOVE")}</div><div class="metric-label">Top Candidate</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(dailyCapital.countsByLane?.CAPITAL_MOVE_RESEARCH || 0)}</div><div class="metric-label">Capital Move Research</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(dailyCapital.countsByLane?.NEEDS_PROOF || 0)}</div><div class="metric-label">Needs Proof</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(recovery.recoveryCandidateCount ?? 0)}</div><div class="metric-label">Recovery Queue</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(best?.executionTruthState || "NO VERIFIED ROUTE")}</div><div class="metric-label">Execution Truth</div></div>
      </div>
      ${renderScalpCandidateTable(board, "Daily Capital Slate")}
    </section>
  `;
}

function renderScalpCandidateTable(candidates = [], title = "Research Candidates") {
  const rows = (Array.isArray(candidates) ? candidates : []).slice(0, 10);

  if (!rows.length) {
    return `
      <div class="subsection">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty">No candidates in this lane for the latest scan.</div>
      </div>
    `;
  }

  return `
    <div class="subsection">
      <h3>${escapeHtml(title)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Symbol</th>
              <th>Chain</th>
              <th>Contract</th>
              <th>Pair / DEX</th>
              <th>Lane</th>
              <th>Score</th>
              <th>Price</th>
              <th>24h</th>
              <th>7d</th>
              <th>Liquidity</th>
              <th>Route</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((candidate) => {
                const needs = [
                  ...(candidate.missingInfoNeeded || []),
                  ...(candidate.missingEvidence || []),
                ]
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ");
                return `
                  <tr>
                    <td>${escapeHtml(candidate.rank ?? "")}</td>
                    <td>${escapeHtml(candidate.symbol || "UNKNOWN")}</td>
                    <td>${escapeHtml(candidate.chain || "unknown")}</td>
                    <td>${escapeHtml(shortAddress(contractFor(candidate)))}<br /><span class="muted">${escapeHtml(candidate.canonicalId || "")}</span></td>
                    <td>${escapeHtml(shortAddress(pairFor(candidate)))}<br /><span class="muted">${escapeHtml(candidate.dexName || candidate.bestVerifiedVenue || "")}</span></td>
                    <td>${escapeHtml(candidate.lane || candidate.scalpMicrostructureLane || "UNKNOWN")}</td>
                    <td>${escapeHtml(
                      candidate.hottestTenNowScore ??
                        candidate.highUpsideScalpScore ??
                        candidate.scalpMicrostructureScore ??
                        candidate.progressiveOpportunityScore ??
                        candidate.moneyRankScore ??
                        candidate.opportunityScore ??
                        candidate.score ??
                        0
                    )}</td>
                    <td>${escapeHtml(formatDashboardNumber(candidate.priceUsd))}</td>
                    <td>${escapeHtml(candidate.priceChange24hPct ?? 0)}%</td>
                    <td>${escapeHtml(candidate.priceChange7dPct ?? 0)}%</td>
                    <td>${escapeHtml(formatDashboardNumber(candidate.liquidityUsd ?? candidate.scalpLiquidityUsd))}</td>
                    <td>${escapeHtml(candidate.routeVerificationStatus || (
                      candidate.liveExecutionReady
                        ? "Live Ready"
                        : candidate.routeReady || candidate.buySellRouteVerified
                          ? "Route Research"
                          : "Needs Route Proof"
                    ))}</td>
                    <td>${escapeHtml(candidate.quarantineReason || needs || candidate.reasonNotQualified || "Current checks")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function writeLandingPage(copiedFiles = [], options = {}) {
  const reportsDir = path.resolve(options.reportsDir || REPORTS_DIR);
  const docsDir = path.resolve(options.docsDir || DOCS_DIR);
  const generatedAt = new Date().toISOString();
  const report = readJsonReport("report.json", reportsDir) || {};
  const council = readJsonReport("ai-council.json", reportsDir) || {};
  const researchOS = readJsonReport("research-os.json", reportsDir) || {};
  const simulationBrain = readJsonReport("simulation-brain.json", reportsDir) || {};
  const outcomeJudge = readJsonReport("outcome-judge.json", reportsDir) || {};
  const catalystRadar = readJsonReport("catalyst-radar.json", reportsDir) || {};
  const dossierSwarm = readJsonReport("dossier-swarm.json", reportsDir) || {};
  const commandCenter = readJsonReport("ai-command-center.json", reportsDir) || {};
  const warRoom = readJsonReport("portfolio-war-room.json", reportsDir) || {};
  const strategyLab = readJsonReport("strategy-lab.json", reportsDir) || {};
  const causalBrain = readJsonReport("causal-alpha-brain.json", reportsDir) || {};
  const alphaOS = readJsonReport("autonomous-alpha-os.json", reportsDir) || {};
  const alphaDashboardV2 = readJsonReport("alpha-dashboard-v2.json", reportsDir) || {};
  const paperLab = readJsonReport("paper-trading-lab.json", reportsDir) || {};
  const weightOptimizer = readJsonReport("weight-optimizer.json", reportsDir) || {};
  const breakoutBrain = readJsonReport("breakout-brain.json", reportsDir) || {};
  const quantumSuiteHealth = readJsonReport("quantum-suite-health.json", reportsDir) || {};
  const capitalMigration = readJsonReport("capital-migration-core.json", reportsDir) || {};
  const chainRotation = readJsonReport("chain-capital-rotation.json", reportsDir) || {};
  const narrativeRotation = readJsonReport("narrative-capital-rotation.json", reportsDir) || {};
  const marketCapRotation = readJsonReport("market-cap-rotation.json", reportsDir) || {};
  const capitalOutflow = readJsonReport("capital-outflow-watch.json", reportsDir) || {};
  const pipelineStageHealth = readJsonReport("pipeline-stage-health.json", reportsDir) || {};
  const exactOutcomeLab = readJsonReport("exact-outcome-horizon-lab.json", reportsDir) || {};
  const mathematicalValidation = readJsonReport("mathematical-validation.json", reportsDir) || {};
  const highTechAlphaStack = readJsonReport("high-tech-alpha-stack.json", reportsDir) || {};
  const selfEvolvingAlphaOS = readJsonReport("self-evolving-alpha-os.json", reportsDir) || {};
  const alphaTheses = readJsonReport("alpha-theses.json", reportsDir) || {};
  const alphaContracts = readJsonReport("alpha-contracts.json", reportsDir) || {};
  const alphaKnowledgeGraph = readJsonReport("alpha-knowledge-graph.json", reportsDir) || {};
  const causalMarketTwin = readJsonReport("causal-market-twin.json", reportsDir) || {};
  const alphaEvolutionGovernor = readJsonReport("alpha-evolution-governor.json", reportsDir) || {};
  const smallCapHunter = readJsonReport("small-cap-hunter.json", reportsDir) || {};
  const executionTwin = readJsonReport("proof-of-alpha-execution-twin.json", reportsDir) || {};
  const organicIntegrity = readJsonReport("organic-demand-integrity.json", reportsDir) || {};
  const discoveryTruth = readJsonReport("discovery-truth.json", reportsDir) || {};
  const nativeDiscoveryMesh = readJsonReport("native-discovery-mesh.json", reportsDir) || {};
  const discoveryDecision = readJsonReport("discovery-decision-engine.json", reportsDir) || {};
  const preBreakoutRadar = readJsonReport("pre-breakout-radar.json", reportsDir) || {};
  const sourceTruth = readJsonReport("source-truth.json", reportsDir) || {};
  const universeLedger = readJsonReport("universe-ledger.json", reportsDir) || {};
  const integrityStack = readJsonReport("integrity-stack.json", reportsDir) || {};
  const institutionalProvenance = readJsonReport("institutional-data-provenance.json", reportsDir) || {};
  const progressiveOpportunities = readJsonReport("progressive-opportunities.json", reportsDir) || {};
  const emergingRadarReport = readJsonReport("emerging-radar.json", reportsDir) || {};
  const debugStageHealth = readJsonReport("debug-stage-health.json", reportsDir) || {};
  const bestOpportunityNow = readJsonReport("best-opportunity-now.json", reportsDir) || {};
  const topFiveOpportunities = readJsonReport("top-five-opportunities.json", reportsDir) || {};
  const finalistComparison = readJsonReport("finalist-comparison.json", reportsDir) || {};
  const marketOpportunityLearning = readJsonReport("market-opportunity-learning.json", reportsDir) || {};
  const institutionalRanking = readJsonReport("institutional-ranking.json", reportsDir) || {};
  const executionReady = readJsonReport("execution-ready.json", reportsDir) || {};
  const opModeReadiness = readJsonReport("op-mode-readiness.json", reportsDir) || {};
  const evidenceKernel = readJsonReport("evidence-kernel.json", reportsDir) || {};
  const githubPro = readJsonReport("github-intelligence-pro.json", reportsDir) || {};
  const autonomousResearch = readJsonReport("autonomous-research.json", reportsDir) || {};
  const sourceRouter = readJsonReport("source-router.json", reportsDir) || {};
  const audit = readJsonReport("engine-audit.json", reportsDir) || {};
  const engineHealthReport = readJsonReport("engine-health-report.json", reportsDir) || {};
  const engineDataReadiness = readJsonReport("engine-data-readiness.json", reportsDir) || {};
  const engineDataContractHealth = readJsonReport("engine-data-contract-health.json", reportsDir) || {};
  const wholeEngineAudit = readJsonReport("whole-engine-audit.json", reportsDir) || {};
  const engineValueLedger = readJsonReport("engine-value-ledger.json", reportsDir) || {};
  const routeUniverse = readJsonReport("route-universe.json", reportsDir) || {};
  const executionProofRecovery = readJsonReport("execution-proof-recovery.json", reportsDir) || {};
  const alternativeRoutes = readJsonReport("alternative-execution-routes.json", reportsDir) || {};
  const userAccessibility = readJsonReport("user-accessibility-ranking.json", reportsDir) || {};
  const venueCoverage = readJsonReport("venue-coverage-health.json", reportsDir) || {};
  const dataStarvation = readJsonReport("data-starvation-root-cause.json", reportsDir) || {};
  const starvationRescue = readJsonReport("starvation-rescue-queue.json", reportsDir) || {};
  const firstSeenOpportunities = readJsonReport("first-seen-opportunities.json", reportsDir) || {};
  const missedWinnerReplay = readJsonReport("missed-winner-replay.json", reportsDir) || {};
  const earlyAsymmetry = readJsonReport("early-asymmetry-ranking.json", reportsDir) || {};
  const aliasResolution = readJsonReport("alias-resolution-summary.json", reportsDir) || {};
  const aliasConflicts = readJsonReport("alias-resolution-conflicts.json", reportsDir) || {};
  const unresolvedVerbiage = readJsonReport("unresolved-field-verbiage.json", reportsDir) || {};
  const advertisedCategoryCoverage = readJsonReport("advertised-category-coverage.json", reportsDir) || {};
  const crawlerHealth = readJsonReport("crawler-health.json", reportsDir) || {};
  const utilityQuality = readJsonReport("real-utility-opportunities.json", reportsDir) || {};
  const highUpsideScalp = readJsonReport("high-upside-scalp-research.json", reportsDir) || {};
  const scalpMicrostructure = readJsonReport("scalp-microstructure.json", reportsDir) || {};
  const hottestTenNow = readJsonReport("hottest-ten-now.json", reportsDir) || {};
  const dailyCapital = readJsonReport("daily-capital-move.json", reportsDir) || {};
  const dailyRecovery = readJsonReport("daily-recovery-queue.json", reportsDir) || {};
  const dailySourceGaps = readJsonReport("daily-source-gaps.json", reportsDir) || {};
  const systemReadiness = readJsonReport("system-readiness.json", reportsDir) || {};
  const topProject = report.projects?.[0] || {};
  const topWeightFamily = [...(weightOptimizer.families || [])].sort(
    (a, b) => Number(b.weight || 0) - Number(a.weight || 0)
  )[0];
  const topCouncil = council.strongBuyCandidates?.[0] || council.topCouncilSetups?.[0] || {};
  const topSimulation = simulationBrain.topSimulationCandidates?.[0] || {};
  const bestNowProject = bestOpportunityNow.bestOpportunityNow || topFiveOpportunities.topFiveOpportunities?.[0] || {};
  const bestNowHeadline = bestOpportunityNow.headline || "NO CLEAR MARKET LEADER";
  const scalpLead =
    highUpsideScalp.topScalpResearchCandidates?.[0] || highUpsideScalp.highUpsideWatchlist?.[0] || {};
  const hottestLead =
    hottestTenNow.topTenResearchWorthy?.[0] ||
    hottestTenNow.topTenCurrentResearchBoard?.[0] ||
    hottestTenNow.topTenHighestRatedNow?.[0] ||
    hottestTenNow.watchlistNeedsMoreConfirmation?.[0] ||
    {};
  const topTenBoard =
    hottestTenNow.topTenResearchWorthy ||
    hottestTenNow.topTenCurrentResearchBoard ||
    hottestTenNow.topTenHighestRatedNow ||
    [];
  const emergingRadarBoard =
    progressiveOpportunities.emergingRadar ||
    emergingRadarReport.emergingRadar ||
    progressiveOpportunities.fourLaneReport?.emergingResearch ||
    emergingRadarReport.emergingDiscoveryAILane ||
    [];
  const speculativeSignalBoard =
    progressiveOpportunities.speculativeSignals || emergingRadarReport.speculativeSignals || [];
  const researchWorthyBoard = buildResearchWorthyBoard({
    hottestTenNow,
    highUpsideScalp,
    scalpMicrostructure,
    utilityQuality,
    progressiveOpportunities,
    earlyAsymmetry,
    institutionalRanking,
    userAccessibility,
  });
  const bestNowText =
    bestOpportunityNow.verdict === "CLEAR_MARKET_LEADER"
      ? `${bestNowProject.identity?.symbol || bestNowProject.symbol || "Leader"} leads with Market Opportunity Rank ${
          bestNowProject.marketOpportunityRank ?? "NO QUALIFIED CANDIDATE"
        }.`
      : bestOpportunityNow.noClearLeaderReason ||
        "The top candidates are too closely ranked or lack enough independent evidence.";
  const links = copiedFiles
    .filter((fileName) => fileName !== "report.html")
    .map((fileName) => `<a href="./${fileName}">${fileName}</a>`)
    .join("");
  const cards = [
    ["Projects", report.totalProjects ?? 0],
    ["Best Now", bestNowProject.identity?.symbol || "No Clear"],
    ["Leader Verdict", bestOpportunityNow.verdict || finalistComparison.verdict || "NO QUALIFIED CANDIDATE"],
    ["Leader Rank", bestNowProject.marketOpportunityRank ?? "NO QUALIFIED CANDIDATE"],
    ["Learning Records", marketOpportunityLearning.records ?? 0],
    ["Learning Evaluated", marketOpportunityLearning.evaluated ?? 0],
    ["Learning Winners", marketOpportunityLearning.winners ?? 0],
    ["Sniper Ready", progressiveOpportunities.counts?.sniperReady ?? 0],
    ["Best Available", progressiveOpportunities.counts?.bestAvailable ?? 0],
    ["Money Ranked", progressiveOpportunities.counts?.moneyRanked ?? institutionalRanking.counts?.moneyRanked ?? 0],
    ["Execution Ready", progressiveOpportunities.counts?.executionReady ?? institutionalRanking.counts?.executionReady ?? 0],
    ["Stage Health", debugStageHealth.stageStatus || "REPORT NOT GENERATED"],
    ["Route Verified", debugStageHealth.executionChecksVerified ?? 0],
    ["Provider Failures", debugStageHealth.providerFailures ?? 0],
    ["Early High Conv", progressiveOpportunities.counts?.earlyHighConviction ?? 0],
    ["Emerging Radar", progressiveOpportunities.counts?.emergingRadar ?? 0],
    ["Missing Evidence", progressiveOpportunities.counts?.missingEvidence ?? 0],
    ["Starvation Status", dataStarvation.status || "REPORT NOT GENERATED"],
    ["External Missing", dataStarvation.externalDataMissing ?? 0],
    ["Pipeline Output Missing", dataStarvation.pipelineOutputMissing ?? 0],
    ["Not Applicable", dataStarvation.notApplicable ?? 0],
    ["Rescue Queue", starvationRescue.rescueCandidates ?? 0],
    ["Top Rescue", starvationRescue.top25RescueCandidates?.[0]?.symbol || "NO RESCUE CANDIDATE"],
    ["First Seen", firstSeenOpportunities.sampleSize ?? 0],
    ["Replay Status", missedWinnerReplay.status || "REPORT NOT GENERATED"],
    ["Early Recall Success", missedWinnerReplay.earlyRecallSuccesses ?? 0],
    ["Asymmetry Lead", earlyAsymmetry.topResearchCandidates?.[0]?.symbol || "NO RESEARCH LEADER"],
    ["Alias Resolved", aliasResolution.fieldsResolvedByExactAlias + aliasResolution.fieldsResolvedByProviderAlias + aliasResolution.fieldsResolvedByStructuralAlias + aliasResolution.fieldsResolvedBySemanticAlias + aliasResolution.fieldsResolvedByFuzzyAlias || 0],
    ["Alias Conflicts", aliasConflicts.conflictsDetected ?? 0],
    ["Unknown Verbiage", unresolvedVerbiage.topUnknownFieldNames?.length ?? 0],
    ["Category Coverage", advertisedCategoryCoverage.status || "REPORT NOT GENERATED"],
    ["Advertised Categories", advertisedCategoryCoverage.advertisedCategoryCount ?? 0],
    ["Categories With Results", advertisedCategoryCoverage.categoriesWithAnyResult ?? 0],
    ["Strict Category Results", advertisedCategoryCoverage.categoriesWithStrictResults ?? 0],
    ["Research Fallbacks", advertisedCategoryCoverage.categoriesUsingResearchFallback ?? 0],
    ["Research Backfills", advertisedCategoryCoverage.categoriesUsingResearchBackfill ?? 0],
    ["Empty Categories", advertisedCategoryCoverage.emptyCategories ?? 0],
    ["Crawler Health", crawlerHealth.status || "REPORT NOT GENERATED"],
    ["Crawler Mode", crawlerHealth.crawlMode || "REPORT NOT GENERATED"],
    ["Crawler Seeds", crawlerHealth.seedUrlsDiscovered ?? 0],
    ["Crawler Rejected", crawlerHealth.seedUrlsRejected ?? 0],
    ["Crawler Evidence", crawlerHealth.evidenceRecords ?? 0],
    ["Real Utility", utilityQuality.realUtilityQualifiedCount ?? 0],
    ["Utility Lead", utilityQuality.topRealUtilityResearch?.[0]?.symbol || "NO UTILITY LEAD"],
    ["Meme Speculative", utilityQuality.memeSpeculationCount ?? 0],
    ["High-Upside Mode", highUpsideScalp.mode || "REPORT NOT GENERATED"],
    ["Scalp Ready", highUpsideScalp.scalpReadyCount ?? 0],
    ["Scalp Watch", highUpsideScalp.highUpsideWatchCount ?? 0],
    ["Route Missing", highUpsideScalp.researchOnlyRouteMissingCount ?? 0],
    ["Manual Review", highUpsideScalp.manualReviewCount ?? 0],
    ["Deep Deferred", highUpsideScalp.highUpsideResearchDeferredCount ?? 0],
    ["Scalp Lead", scalpLead.symbol || "NO SCALP LEAD"],
    ["Late-Chase Kicked", highUpsideScalp.lateChaseRejectedCount ?? 0],
    ["Meme Excluded", highUpsideScalp.memeSpeculationExcludedCount ?? 0],
    ["Microstructure Pass", scalpMicrostructure.actionableResearchCount ?? 0],
    ["Microstructure Watch", scalpMicrostructure.watchlistCount ?? 0],
    ["Microstructure No-Trade", scalpMicrostructure.noTradeCount ?? 0],
    ["Top 10 Research", hottestTenNow.researchReturnedCount ?? hottestTenNow.currentResearchBoardCount ?? hottestTenNow.returnedCount ?? 0],
    ["Hot Lead", hottestLead.symbol || "NO HOT LEAD"],
    ["Qualified Now", hottestTenNow.qualifiedReturnedCount ?? hottestTenNow.qualifiedNowCount ?? 0],
    ["Top 10 Shortfall", hottestTenNow.researchBoardShortfallToTen ?? hottestTenNow.shortfallToTen ?? 10],
    ["System Readiness", systemReadiness.status || "REPORT NOT GENERATED"],
    ["Daily Slate", dailyCapital.status || "REPORT NOT GENERATED"],
    ["Daily Candidate", dailyCapital.bestCandidate?.symbol || "NO VALID MOVE"],
    ["Needs Proof", dailyCapital.countsByLane?.NEEDS_PROOF ?? 0],
    ["Recovery Queue", dailyRecovery.recoveryCandidateCount ?? 0],
    ["Source Gaps", dailySourceGaps.status || "REPORT NOT GENERATED"],
    [
      "Category Lead",
      advertisedCategoryCoverage.categories?.find((category) => category.displayedResults?.length)
        ?.displayedResults?.[0]?.symbol || "NO CATEGORY RESULT",
    ],
    ["Best Lead", progressiveOpportunities.bestAvailableOpportunities?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    [
      "Money Lead",
      institutionalRanking.institutionalMoneyRank?.[0]?.symbol ||
        progressiveOpportunities.institutionalMoneyRank?.[0]?.symbol ||
        "NO QUALIFIED CANDIDATE",
    ],
    ["Exec Lead", executionReady.executionReady?.[0]?.symbol || progressiveOpportunities.executionReady?.[0]?.symbol || "NO VERIFIED ROUTE"],
    ["Capital Migration", capitalMigration.status || "REPORT NOT GENERATED"],
    ["Capital Lead", capitalMigration.topCandidates?.[0]?.symbol || "NO QUALIFIED FLOW LEADER"],
    ["Confirmed Early Flow", capitalMigration.counts?.confirmedEarlyFlow ?? 0],
    ["Research Flow", capitalMigration.counts?.earlyFlowResearch ?? 0],
    ["Outflow Watch", capitalOutflow.outflowWatch?.length ?? 0],
    ["Top Flow Chain", chainRotation.topChainReceivingCapital?.chain || "INSUFFICIENT INPUT DATA"],
    ["Top Flow Narrative", narrativeRotation.topNarrativeReceivingCapital?.narrative || "INSUFFICIENT INPUT DATA"],
    ["Top Flow Bucket", marketCapRotation.fastestImprovingMarketCapBucket?.marketCapBucket || "INSUFFICIENT INPUT DATA"],
    ["Pipeline Health", pipelineStageHealth.status || "REPORT NOT GENERATED"],
    ["Mandatory Failures", pipelineStageHealth.mandatoryStageFailures ?? 0],
    ["Outcome Lab", exactOutcomeLab.status || "REPORT NOT GENERATED"],
    ["Outcome Sample", exactOutcomeLab.sampleState || "INSUFFICIENT_SAMPLE"],
    ["Math Validation", mathematicalValidation.status || "REPORT NOT GENERATED"],
    ["AI Candidate", topCouncil.symbol || topProject.symbol || "NO QUALIFIED CANDIDATE"],
    ["Council Score", topCouncil.score ?? topProject.aiEcosystemScore ?? 0],
    ["Simulation", topSimulation.symbol || topProject.symbol || "NO QUALIFIED CANDIDATE"],
    ["Breakout %", topSimulation.breakoutProbability30d ?? topProject.breakoutProbability30d ?? 0],
    ["Outcome Judged", outcomeJudge.trackedProjects ?? topProject.outcomeJudgeStatus ?? 0],
    ["Catalysts", catalystRadar.activeCatalystProjects ?? 0],
    ["Dossiers", dossierSwarm.dossieredProjects ?? 0],
    ["Alpha Cases", commandCenter.counts?.alphaCases ?? 0],
    ["Top Narrative", warRoom.topNarratives?.[0]?.narrative || "INSUFFICIENT INPUT DATA"],
    ["Strategy", strategyLab.topCandidates?.[0]?.bestStrategy || "INSUFFICIENT INPUT DATA"],
    ["Causal Driver", causalBrain.topProjects?.[0]?.primaryDriver || "INSUFFICIENT INPUT DATA"],
    ["Alpha OS", alphaOS.topCandidates?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Paper Win %", paperLab.memory?.winRate ?? alphaDashboardV2.headline?.paperWinRate ?? 0],
    [
      "Top Weight",
      topWeightFamily ? `${topWeightFamily.label} ${topWeightFamily.weight}x` : "INSUFFICIENT INPUT DATA",
    ],
    ["Breakout Pick", breakoutBrain.topThree?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Breakout Picks", breakoutBrain.selectedCount ?? 0],
    ["High-Tech", highTechAlphaStack.topProjects?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["HT Candidates", highTechAlphaStack.alphaCandidates ?? 0],
    ["Alpha OS Max", selfEvolvingAlphaOS.topProject?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Alpha Theses", alphaTheses.totalTheses ?? 0],
    ["Alpha Contracts", alphaContracts.alphaCandidates ?? 0],
    ["Contract Research", alphaContracts.priorityResearch ?? 0],
    ["Contract Receipts", alphaContracts.publicReceipts?.length ?? 0],
    ["Graph Pick", alphaKnowledgeGraph.topProjects?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Graph Priority", alphaKnowledgeGraph.priorityResearch ?? 0],
    ["Twin Pick", causalMarketTwin.topProjects?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Twin EV", causalMarketTwin.topProjects?.[0]?.expectedReturnPct ?? 0],
    ["Governor Priority", alphaEvolutionGovernor.counts?.priorityResearch ?? 0],
    ["Governor Blocks", alphaEvolutionGovernor.counts?.riskBlocks ?? 0],
    ["Small-Cap #1", smallCapHunter.topTwoResearch?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Small-Cap Route #1", smallCapHunter.topTwoResearch?.[0]?.routeStatus || "NO VERIFIED ROUTE"],
    ["Small-Cap #2", smallCapHunter.topTwoResearch?.[1]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Small-Cap Route #2", smallCapHunter.topTwoResearch?.[1]?.routeStatus || "NO VERIFIED ROUTE"],
    ["Small-Cap Processed", smallCapHunter.huntedProjects ?? 0],
    ["Small-Cap Research", smallCapHunter.topTwoResearch?.length ?? smallCapHunter.selectedCount ?? 0],
    ["Small-Cap Qualified", smallCapHunter.executionReadyCount ?? 0],
    ["Small-Cap Execution #1", smallCapHunter.topTwoExecutionReady?.[0]?.symbol || "NO VERIFIED ROUTE"],
    ["Small-Cap Execution #2", smallCapHunter.topTwoExecutionReady?.[1]?.symbol || "NO VERIFIED ROUTE"],
    ["Execution Twin", executionTwin.topVerifiedExecutions?.[0]?.symbol || "NO VERIFIED ROUTE"],
    ["Exec Route", executionTwin.topVerifiedExecutions?.[0]?.route || "NO VERIFIED ROUTE"],
    ["Execution Processed", executionTwin.twinProjects ?? 0],
    ["Execution Research", executionTwin.topExecutionResearchCandidates?.length ?? 0],
    ["Execution Qualified", executionTwin.verifiedCount ?? 0],
    ["Execution Verified", executionTwin.verifiedCount ?? 0],
    ["Execution Partial", executionTwin.partiallyVerifiedCount ?? 0],
    ["No Route", executionTwin.noRouteCount ?? 0],
    ["Organic Processed", organicIntegrity.analyzedProjects ?? 0],
    ["Organic Research Tasks", organicIntegrity.openResearchTasks ?? 0],
    ["Organic Confirmed", organicIntegrity.confirmedOrganicDemand ?? 0],
    ["Organic Blocks", organicIntegrity.institutionalBlocks ?? 0],
    ["Organic Manual Reviews", organicIntegrity.manualReviewRequired ?? 0],
    ["Organic Input Coverage", organicIntegrity.organicInputCoveragePct ?? 0],
    ["Discovery Sources", discoveryTruth.sourceCapabilityAudit?.enabledSources ?? 0],
    ["Native Mesh", nativeDiscoveryMesh.summary?.candidateCount ?? nativeDiscoveryMesh.topCandidates?.length ?? 0],
    ["Native Stage", nativeDiscoveryMesh.topCandidates?.[0]?.stage || "INSUFFICIENT INPUT DATA"],
    ["Decision Pass", discoveryDecision.summary?.pass ?? 0],
    ["Critical Risks", discoveryDecision.feeds?.criticalRisks?.length ?? 0],
    ["Radar ARMED", preBreakoutRadar.armedCount ?? 0],
    ["Radar Watch", preBreakoutRadar.watchCount ?? 0],
    ["Universe Ledger", universeLedger.persistentLedger?.trackedProjects ?? 0],
    ["Ledger Promoted", universeLedger.persistentLedger?.totals?.promoted ?? 0],
    ["Integrity Stack", integrityStack.status || "REPORT NOT GENERATED"],
    ["Integrity Score", integrityStack.readinessScore ?? 0],
    ["Provenance", institutionalProvenance.averageProvenanceScore ?? 0],
    ["Prov Ready", institutionalProvenance.counts?.institutionalReady ?? 0],
    ["OP Mode", opModeReadiness.status || "REPORT NOT GENERATED"],
    ["OP Score", opModeReadiness.score ?? 0],
    ["Native Ready", opModeReadiness.native?.liveReadyProtocols ?? 0],
    ["Missing Key Groups", opModeReadiness.keys?.missingGroups ?? 0],
    ["Kernel ARMED", evidenceKernel.summary?.armed ?? 0],
    ["Kernel Watch", evidenceKernel.summary?.watch ?? 0],
    ["Kernel Score", evidenceKernel.summary?.averageFinalScore ?? 0],
    ["Contract Pass", evidenceKernel.summary?.averageContractPassRate ?? 0],
    ["Kernel Sources", evidenceKernel.summary?.sourcesWithUsableEvidence ?? 0],
    ["Manifest Score", evidenceKernel.summary?.manifestScore ?? 0],
    ["Fixture Pass", evidenceKernel.summary?.fixtureAuditPassRate ?? 0],
    ["Source Truth", sourceTruth.topProjects?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["GitHub Pro", githubPro.topRepositories?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Research Brain", autonomousResearch.topProjects?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Best Source", sourceRouter.strongestSources?.[0]?.source || "PROVIDER UNAVAILABLE"],
    ["Quantum Suite Status", quantumSuiteHealth.status || "REPORT NOT GENERATED"],
    ["Quantum Processed", quantumSuiteHealth.projectsExpected ?? 0],
    ["Quantum Research", quantumSuiteHealth.topQuantumReasoningStates?.length ?? 0],
    ["Quantum Qualified", quantumSuiteHealth.status === "PASS" ? quantumSuiteHealth.projectsExpected ?? 0 : 0],
    ["Quantum Fields Completed", quantumSuiteHealth.outcomeFieldsCompleted ?? 0],
    ["Quantum Brains Completed", quantumSuiteHealth.reasoningBrainsCompleted ?? 0],
    ["Quantum Input Coverage", quantumSuiteHealth.averageInputCoverage ?? 0],
    ["Quantum State", topProject.quantumDecisionState || topProject.quantumReasoningBrain?.decisionState || "INSUFFICIENT INPUT DATA"],
    ["Research Queue", researchOS.researchQueue?.length ?? 0],
    ["Engine Audit", audit.auditName || "REPORT NOT GENERATED"],
    ["Engines", audit.totalEngines ?? 0],
    ["Full Engine Audit", engineHealthReport.status || "REPORT NOT GENERATED"],
    ["Engines Executed", engineHealthReport.runtime?.executedEngines ?? 0],
    ["Engine Failures", engineHealthReport.failures?.length ?? 0],
    ["Engine Coverage", `${engineHealthReport.coverage?.executionCoveragePercent ?? 0}%`],
    ["Whole Engine Audit", wholeEngineAudit.status || "REPORT NOT GENERATED"],
    ["Pipeline Stages", wholeEngineAudit.summary?.pipelineStageCount ?? 0],
    ["Miswired Engines", wholeEngineAudit.summary?.miswiredEngineCount ?? 0],
    ["Daily Core Engines", engineValueLedger.dailyCoreCount ?? wholeEngineAudit.summary?.dailyRequiredEngineCount ?? 0],
    ["Repair Before Trust", engineValueLedger.repairBeforeTrustCount ?? 0],
    ["Data Readiness", engineDataReadiness.averageCoverage ?? 0],
    ["Core Data Ready", engineDataReadiness.coreReady ?? 0],
    ["Core Data Starved", engineDataReadiness.coreDataStarved ?? 0],
    ["Top Data Gap", engineDataReadiness.topMissingInputs?.[0]?.fields || "NO CORE DATA GAP"],
    ["Contract Health", engineDataContractHealth.status || "REPORT NOT GENERATED"],
    ["Contract Engines", engineDataContractHealth.enginesChecked ?? 0],
    ["Input Gap Engines", engineDataContractHealth.enginesWithInputGaps ?? 0],
    ["Output Gap Engines", engineDataContractHealth.enginesWithOutputGaps ?? 0],
    ["Route Universe", routeUniverse.routeCount ?? 0],
    ["Alternative Routes", alternativeRoutes.routes?.length ?? 0],
    ["User Accessible", userAccessibility.userAccessibleCount ?? 0],
    ["Opportunity #1", userAccessibility.topProjectsByOpportunity?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
    ["Global Route #1", userAccessibility.topProjectsByGlobalRouteQuality?.[0]?.symbol || "NO VERIFIED ROUTE"],
    ["Route Truth", userAccessibility.topProjectsByGlobalRouteQuality?.[0]?.routeTruthStatus || "NO VERIFIED ROUTE"],
    ["Accessibility #1", userAccessibility.topProjectsByUserAccessibility?.[0]?.symbol || "NO ACCESSIBLE CANDIDATE"],
    ["Venue Coverage", venueCoverage.venueCoverageHealth?.[0]?.venue || "NO VERIFIED VENUE"],
  ]
    .map(
      ([label, value]) => `
        <div class="metric">
          <div class="metric-value">${value}</div>
          <div class="metric-label">${label}</div>
        </div>
      `
    )
    .join("");

  const scalpReadyCards = [
    ["Scalp-Ready Research", highUpsideScalp.scalpReadyCount ?? 0],
    ["High-Upside Watchlist", highUpsideScalp.highUpsideWatchCount ?? 0],
    ["Route-Missing Research", highUpsideScalp.researchOnlyRouteMissingCount ?? 0],
    ["Manual Review", highUpsideScalp.manualReviewCount ?? 0],
    ["Deep Deferred", highUpsideScalp.highUpsideResearchDeferredCount ?? 0],
    ["True Data-Starved", highUpsideScalp.dataStarvedCount ?? 0],
    ["Late-Chase Rejected", highUpsideScalp.lateChaseRejectedCount ?? 0],
    ["Meme-Only Excluded", highUpsideScalp.memeSpeculationExcludedCount ?? 0],
    ["Microstructure Rejected", highUpsideScalp.microstructureRejectedCount ?? 0],
  ]
    .map(
      ([label, value]) => `
        <div class="metric compact">
          <div class="metric-value">${escapeHtml(value)}</div>
          <div class="metric-label">${escapeHtml(label)}</div>
        </div>
      `
    )
    .join("");

  const emergingRadarCards = [
    ["Emerging Radar", progressiveOpportunities.counts?.emergingRadar ?? emergingRadarBoard.length],
    ["Speculative Signals", progressiveOpportunities.counts?.speculativeSignal ?? speculativeSignalBoard.length],
    [
      "Emerging AI Lane",
      progressiveOpportunities.counts?.emergingDiscoveryAI ?? emergingRadarReport.emergingDiscoveryAILane?.length ?? 0,
    ],
    ["Best Available", progressiveOpportunities.counts?.bestAvailable ?? 0],
    ["Missing Evidence", progressiveOpportunities.counts?.missingEvidence ?? 0],
  ]
    .map(
      ([label, value]) => `
        <div class="metric compact">
          <div class="metric-value">${escapeHtml(value)}</div>
          <div class="metric-label">${escapeHtml(label)}</div>
        </div>
      `
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crypto Launch Intelligence Live Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #071015;
      --panel: #101b23;
      --panel-2: #142532;
      --text: #edf7f2;
      --muted: #94a8b0;
      --line: #24404f;
      --green: #45e08f;
      --blue: #5fb7ff;
      --amber: #f2bd55;
      --red: #ff6b6b;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    header {
      border-bottom: 1px solid var(--line);
      padding: 24px clamp(18px, 4vw, 42px);
    }

    h1 {
      margin: 0;
      font-size: clamp(26px, 4vw, 46px);
      letter-spacing: 0;
    }

    .subtitle {
      color: var(--muted);
      margin-top: 8px;
      max-width: 820px;
      line-height: 1.5;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
      gap: 18px;
      align-items: stretch;
      margin-bottom: 20px;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 18px;
    }

    .panel h2,
    .panel h3 {
      margin: 0 0 10px;
    }

    .panel p {
      color: var(--muted);
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 16px;
    }

    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-2);
      padding: 12px;
      min-height: 76px;
    }

    .metric-value {
      color: var(--green);
      font-size: 24px;
      font-weight: 700;
      word-break: break-word;
    }

    .metric-label {
      color: var(--muted);
      margin-top: 4px;
      font-size: 13px;
    }

    .metric.compact {
      min-height: 64px;
    }

    main {
      padding: 22px clamp(18px, 4vw, 42px) 42px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }

    .status {
      color: var(--muted);
      font-size: 14px;
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    a {
      color: var(--text);
    }

    .button,
    .links a {
      display: inline-flex;
      align-items: center;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 8px 12px;
      text-decoration: none;
      font-size: 14px;
    }

    .button.primary {
      border-color: rgba(69, 224, 143, 0.55);
      background: #12301f;
    }

    iframe {
      width: 100%;
      height: min(76vh, 920px);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    .feature-list {
      display: grid;
      gap: 8px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      color: var(--muted);
      line-height: 1.45;
    }

    .feature-list strong {
      color: var(--text);
    }

    .hero-panel {
      border-color: rgba(69, 224, 143, 0.42);
      background: linear-gradient(180deg, rgba(18, 48, 31, 0.56), rgba(12, 22, 36, 0.96));
    }

    .section-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .section-heading h2 {
      margin-bottom: 6px;
    }

    .section-heading p {
      margin: 0;
      color: var(--muted);
      max-width: 780px;
      line-height: 1.45;
    }

    .priority-table {
      min-width: 1080px;
    }

    .muted {
      color: var(--muted);
      font-size: 12px;
    }

    .links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
    }

    .subsection {
      margin-top: 18px;
    }

    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 920px;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      font-size: 13px;
      vertical-align: top;
    }

    th {
      color: var(--muted);
      background: var(--panel-2);
      font-weight: 600;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .empty {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 18px;
      color: var(--muted);
      line-height: 1.5;
    }

    @media (max-width: 720px) {
      .hero-grid,
      .metrics {
        grid-template-columns: 1fr;
      }

      iframe {
        height: 72vh;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Crypto Launch Intelligence</h1>
    <div class="subtitle">Live high-upside research board. Research output only, not financial advice, and never a profit guarantee.</div>
  </header>
  <main>
    ${renderResearchWorthyBoard(researchWorthyBoard)}
    ${renderDailyCapitalSlate(dailyCapital, dailyRecovery)}
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>High-Upside Scalp</h2>
          <p>Short-horizon research lane for liquid, not-yet-late candidates with route and microstructure checks. Research output only, not trading advice.</p>
        </div>
        <div class="actions">
          <a class="button primary" href="./high-upside-scalp-research.json">Open Scalp Research</a>
          <a class="button" href="./scalp-microstructure.json">Open Microstructure</a>
        </div>
      </div>
      <div class="metrics">${scalpReadyCards}</div>
      ${renderScalpCandidateTable(highUpsideScalp.topScalpResearchCandidates || [], "Scalp-Ready Research")}
      ${renderScalpCandidateTable(highUpsideScalp.highUpsideWatchlist || [], "High-Upside Watchlist")}
      ${renderScalpCandidateTable(highUpsideScalp.researchOnlyRouteMissing || [], "Research Only: Route Missing")}
      ${renderScalpCandidateTable(highUpsideScalp.manualReview || [], "Manual Review")}
    </section>
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Emerging Radar</h2>
          <p>Earlier research lane for projects with developing evidence that should stay visible before they become obvious or overextended.</p>
        </div>
        <div class="actions">
          <a class="button primary" href="./emerging-radar.json">Open Emerging Radar</a>
          <a class="button" href="./progressive-opportunities.json">Open Progressive Ranking</a>
        </div>
      </div>
      <div class="metrics">${emergingRadarCards}</div>
      ${renderScalpCandidateTable(emergingRadarBoard, "Emerging Radar")}
      ${renderScalpCandidateTable(speculativeSignalBoard, "Speculative Signals")}
    </section>
    <section class="panel">
      <h2>Top 10 Current Research Board</h2>
      <p>${escapeHtml(
        hottestTenNow.disclaimer ||
          "Research output only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee."
      )}</p>
      <div class="metrics">
        <div class="metric compact"><div class="metric-value">${escapeHtml(hottestTenNow.researchReturnedCount ?? hottestTenNow.currentResearchBoardCount ?? topTenBoard.length ?? 0)}</div><div class="metric-label">Research Names</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(hottestTenNow.qualifiedReturnedCount ?? hottestTenNow.qualifiedNowCount ?? 0)}</div><div class="metric-label">Qualified Now</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(hottestTenNow.confirmationGapCount ?? 0)}</div><div class="metric-label">Need Confirmation</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(hottestTenNow.researchBoardShortfallToTen ?? 10)}</div><div class="metric-label">Missing To Ten</div></div>
      </div>
      ${renderScalpCandidateTable(topTenBoard, "Top 10 Current Research")}
    </section>
    <section class="panel">
      <h2>Scan Truth</h2>
      <div class="metrics">
        <div class="metric compact"><div class="metric-value">${escapeHtml(dataStarvation.externalDataMissing ?? 0)}</div><div class="metric-label">External Missing</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(dataStarvation.pipelineOutputMissing ?? 0)}</div><div class="metric-label">Pipeline Missing</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(debugStageHealth.providerFailures ?? 0)}</div><div class="metric-label">Provider Failures</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(debugStageHealth.stageStatus || "REPORT NOT GENERATED")}</div><div class="metric-label">Stage Health</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(engineHealthReport.status || "REPORT NOT GENERATED")}</div><div class="metric-label">Full Engine Audit</div></div>
        <div class="metric compact"><div class="metric-value">${escapeHtml(engineHealthReport.runtime?.executedEngines ?? 0)}</div><div class="metric-label">Engines Executed</div></div>
      </div>
    </section>
    <div class="toolbar">
      <div class="status">Last published: ${generatedAt}</div>
      <div class="actions">
        <a class="button primary" href="./report.html">Open Full Dashboard</a>
        <a class="button" href="./report.json">JSON</a>
        <a class="button" href="./ai-council.json">AI Council</a>
        <a class="button" href="./research-os.json">Research OS</a>
        <a class="button" href="./simulation-brain.json">Simulation Brain</a>
        <a class="button" href="./outcome-judge.json">Outcome Judge</a>
        <a class="button" href="./catalyst-radar.json">Catalyst Radar</a>
        <a class="button" href="./dossier-swarm.json">Dossier Swarm</a>
        <a class="button" href="./ai-command-center.json">Command Center</a>
        <a class="button" href="./alpha-investigator.json">Alpha Investigator</a>
        <a class="button" href="./portfolio-war-room.json">War Room</a>
        <a class="button" href="./strategy-lab.json">Strategy Lab</a>
        <a class="button" href="./causal-alpha-brain.json">Causal Brain</a>
        <a class="button" href="./autonomous-alpha-os.json">Alpha OS</a>
        <a class="button" href="./alpha-dashboard-v2.json">Dashboard v2</a>
        <a class="button" href="./paper-trading-lab.json">Paper Lab</a>
        <a class="button" href="./weight-optimizer.json">Weights</a>
        <a class="button" href="./breakout-brain.json">Breakouts</a>
        <a class="button" href="./high-tech-alpha-stack.json">High-Tech</a>
        <a class="button" href="./alpha-contracts.json">Alpha Contracts</a>
        <a class="button" href="./alpha-contract-leaderboard.json">Contract Board</a>
        <a class="button" href="./alpha-contract-receipts.json">Receipts</a>
        <a class="button" href="./alpha-evolution-governor.json">Governor</a>
        <a class="button" href="./alpha-evolution-queue.json">Gov Queue</a>
        <a class="button" href="./proof-of-alpha-execution-twin.json">Execution Twin</a>
        <a class="button" href="./capital-migration-core.json">Capital Migration</a>
        <a class="button" href="./chain-capital-rotation.json">Chain Rotation</a>
        <a class="button" href="./narrative-capital-rotation.json">Narrative Rotation</a>
        <a class="button" href="./capital-outflow-watch.json">Outflow Watch</a>
        <a class="button" href="./pipeline-stage-health.json">Pipeline Health</a>
        <a class="button" href="./exact-outcome-horizon-lab.json">Outcome Lab</a>
        <a class="button" href="./mathematical-validation.json">Math Validation</a>
        <a class="button" href="./organic-demand-integrity.json">Organic Integrity</a>
        <a class="button" href="./discovery-truth.json">Discovery Truth</a>
        <a class="button" href="./pre-consensus-breakout-hunter.json">Pre-Consensus</a>
        <a class="button" href="./pre-breakout-radar.json">Pre-Breakout Radar</a>
        <a class="button" href="./sniper-report.json">Sniper</a>
        <a class="button" href="./source-truth.json">Source Truth</a>
        <a class="button" href="./github-intelligence-pro.json">GitHub Pro</a>
        <a class="button" href="./autonomous-research.json">Research Brain</a>
        <a class="button" href="./source-router.json">Source Router</a>
        <a class="button" href="./roadmap.json">Roadmap</a>
        <a class="button" href="./engine-audit.json">Engine Audit</a>
        <a class="button" href="./engine-health-report.json">Engine Health</a>
        <a class="button" href="./engine-data-readiness.json">Data Readiness</a>
        <a class="button" href="./engine-data-contract-health.json">Contract Health</a>
        <a class="button primary" href="./whole-engine-audit.json">Whole Engine Audit</a>
        <a class="button" href="./engine-value-ledger.json">Engine Value Ledger</a>
        <a class="button" href="./route-universe.json">View Route Universe</a>
        <a class="button" href="./execution-proof-recovery.json">Execution Recovery</a>
        <a class="button" href="./alternative-execution-routes.json">View Alt Routes</a>
        <a class="button" href="./user-accessibility-ranking.json">View Latest Route Analysis</a>
        <a class="button" href="./venue-coverage-health.json">View Venue Health</a>
        <a class="button" href="./integrity-stack.json">Integrity Stack</a>
        <a class="button" href="./institutional-data-provenance.json">Provenance</a>
        <a class="button" href="./progressive-opportunities.json">Opportunities</a>
        <a class="button" href="./debug-progressive-ladder.json">Debug Ladder</a>
        <a class="button" href="./debug-identity-conflicts.json">Identity Debug</a>
        <a class="button" href="./debug-execution-proof.json">Execution Debug</a>
        <a class="button" href="./debug-block-reasons.json">Block Debug</a>
        <a class="button" href="./debug-stage-health.json">Stage Health</a>
        <a class="button primary" href="./best-opportunity-now.json">Best Now</a>
        <a class="button" href="./top-five-opportunities.json">Top Five</a>
        <a class="button" href="./finalist-comparison.json">Finalist Compare</a>
        <a class="button" href="./time-horizon-leaders.json">Horizons</a>
        <a class="button" href="./opportunity-lane-leaders.json">Lanes</a>
        <a class="button" href="./crawler-changes.json">Crawler Changes</a>
        <a class="button" href="./local-ai-chief-judgment.json">Chief Judge</a>
        <a class="button" href="./market-opportunity-learning.json">Opportunity Learning</a>
        <a class="button" href="./standard-4000-selection.json">4000 Selection</a>
        <a class="button" href="./standard-4000-exclusions.json">4000 Exclusions</a>
        <a class="button" href="./selection-lane-audit.json">Lane Audit</a>
        <a class="button" href="./candidate-rescue-report.json">Rescue Audit</a>
        <a class="button" href="./missed-opportunity-audit.json">Missed Audit</a>
        <a class="button" href="./institutional-ranking.json">Money Rank</a>
        <a class="button" href="./best-available.json">Best Available</a>
        <a class="button" href="./advertised-category-coverage.json">Category Coverage</a>
        <a class="button primary" href="./high-upside-scalp-research.json">High-Upside Scalp</a>
        <a class="button" href="./scalp-microstructure.json">Scalp Microstructure</a>
        <a class="button primary" href="./hottest-ten-now.json">Hottest Ten Now</a>
        <a class="button primary" href="./daily-capital-move.json">Daily Capital</a>
        <a class="button" href="./daily-recovery-queue.json">Recovery Queue</a>
        <a class="button" href="./daily-source-gaps.json">Source Gaps</a>
        <a class="button" href="./system-readiness.json">System Readiness</a>
        <a class="button" href="./execution-ready.json">Execution Ready</a>
        <a class="button" href="./emerging-radar.json">Emerging Radar</a>
        <a class="button" href="./blocked-projects.json">Blocked</a>
        <a class="button" href="./alerts.json">Alerts</a>
      </div>
    </div>
    <div class="links">${links}</div>
  </main>
</body>
</html>
`.trim();

  fs.writeFileSync(path.join(docsDir, "index.html"), html.replace(/\bN\/A\b/g, "REPORT NOT GENERATED"));
}

export function publishGithubPagesDashboard(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || REPORTS_DIR);
  const docsDir = path.resolve(options.docsDir || DOCS_DIR);
  fs.mkdirSync(docsDir, { recursive: true });
  sanitizeReportJsonFiles(PUBLIC_REPORTS, reportsDir);
  const validation =
    path.resolve(reportsDir) === REPORTS_DIR
      ? assertReportContracts({ reportsDir })
      : assertReportContracts({
          reportsDir,
          requiredFiles: REQUIRED_REPORT_FILES.filter((fileName) => fs.existsSync(path.join(reportsDir, fileName))),
        });

  const copiedFiles = PUBLIC_REPORTS.filter((fileName) => copyIfExists(fileName, reportsDir, docsDir));
  writeLandingPage(copiedFiles, { reportsDir, docsDir });

  return {
    outputDir: docsDir,
    copiedFiles,
    validation,
    urlPath: "docs/index.html",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = publishGithubPagesDashboard();
  console.log(JSON.stringify(result, null, 2));
}
