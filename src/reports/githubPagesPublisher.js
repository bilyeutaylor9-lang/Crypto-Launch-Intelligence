import fs from "fs";
import path from "path";
import { REQUIRED_REPORT_FILES, assertReportContracts } from "./reportContractValidator.js";

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
  "engine-data-readiness.json",
  "route-universe.json",
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
  const engineDataReadiness = readJsonReport("engine-data-readiness.json", reportsDir) || {};
  const routeUniverse = readJsonReport("route-universe.json", reportsDir) || {};
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
  const topProject = report.projects?.[0] || {};
  const topWeightFamily = [...(weightOptimizer.families || [])].sort(
    (a, b) => Number(b.weight || 0) - Number(a.weight || 0)
  )[0];
  const topCouncil = council.strongBuyCandidates?.[0] || council.topCouncilSetups?.[0] || {};
  const topSimulation = simulationBrain.topSimulationCandidates?.[0] || {};
  const bestNowProject = bestOpportunityNow.bestOpportunityNow || topFiveOpportunities.topFiveOpportunities?.[0] || {};
  const bestNowHeadline = bestOpportunityNow.headline || "NO CLEAR MARKET LEADER";
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
    ["Data Readiness", engineDataReadiness.averageCoverage ?? 0],
    ["Core Data Ready", engineDataReadiness.coreReady ?? 0],
    ["Core Data Starved", engineDataReadiness.coreDataStarved ?? 0],
    ["Top Data Gap", engineDataReadiness.topMissingInputs?.[0]?.fields || "NO CORE DATA GAP"],
    ["Route Universe", routeUniverse.routeCount ?? 0],
    ["Alternative Routes", alternativeRoutes.routes?.length ?? 0],
    ["User Accessible", userAccessibility.userAccessibleCount ?? 0],
    ["Opportunity #1", userAccessibility.topProjectsByOpportunity?.[0]?.symbol || "NO QUALIFIED CANDIDATE"],
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

    .links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
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
    <div class="subtitle">Autonomous crypto research desk with AI Council debate, Quantum Brain probabilities, Research OS tasks, Alpha Lab strategy discovery, and self-learning memory.</div>
  </header>
  <main>
    <section class="hero-grid">
      <div class="panel">
        <h2>Live Intelligence Snapshot</h2>
        <p>Generated by the scanner from the latest workflow run or local demo. The system ranks projects, challenges the thesis, models uncertainty, and publishes machine-readable reports.</p>
        <div class="metrics">${cards}</div>
      </div>
      <div class="panel">
        <h3>Why This Is Different</h3>
        <ul class="feature-list">
          <li><strong>AI Council:</strong> specialist agents debate bull and bear cases.</li>
          <li><strong>Quantum Brain:</strong> bull/base/bear/black-swan probabilities and collapse triggers.</li>
          <li><strong>Research OS:</strong> lifecycle, scenarios, red-team review, and research tasks.</li>
          <li><strong>Simulation Brain:</strong> market-memory analogs, future paths, mutation tests, and engine tournaments.</li>
          <li><strong>Outcome Judge:</strong> grades old calls against reality and adjusts confidence.</li>
          <li><strong>Catalyst Radar:</strong> detects why-now events, urgency, and action windows.</li>
          <li><strong>AI Command Center:</strong> routes research, builds alpha case files, and organizes portfolio priorities.</li>
          <li><strong>Portfolio War Room:</strong> ranks narratives, best-in-class candidates, and research allocation.</li>
          <li><strong>Strategy Lab:</strong> tests strategy hypotheses and creates paper-trade plans.</li>
          <li><strong>Causal Alpha Brain:</strong> explains which signals actually drive the verdict.</li>
          <li><strong>Autonomous Alpha OS:</strong> fuses agents into one operating decision and action queue.</li>
          <li><strong>Paper Trading Lab:</strong> grades simulated strategy calls against later outcomes.</li>
          <li><strong>Weight Optimizer:</strong> adjusts engine-family trust from paper performance.</li>
          <li><strong>Breakout Brain:</strong> selects the top three best-available breakout candidates from thousands of simulations.</li>
          <li><strong>High-Tech Alpha Stack:</strong> runs ten advanced command modules over each project.</li>
          <li><strong>Proof-Carrying Alpha Contracts:</strong> turns top ideas into falsifiable receipts with review windows and invalidation rules.</li>
          <li><strong>Alpha Evolution Governor:</strong> fuses contracts, outcomes, sources, agents, discovery, risk, and memory into one operating queue.</li>
          <li><strong>Proof-of-Alpha Execution Twin:</strong> checks route proof, $100 paper execution, slippage, safety, and thesis accountability.</li>
          <li><strong>Organic Demand Integrity:</strong> separates real demand from holder-count, approval, reward, liquidity, yield, and admin-control traps.</li>
          <li><strong>Discovery Truth Network:</strong> audits active sources, discovery lanes, independent evidence families, and rejected-candidate recall.</li>
          <li><strong>Source Truth:</strong> measures provider reliability and source agreement.</li>
          <li><strong>GitHub Pro:</strong> scores repository activity, contributors, releases, and repo risk.</li>
          <li><strong>Research Brain:</strong> loops through hypotheses, missing proof, evidence graph, critic review, and memory.</li>
          <li><strong>Source Router:</strong> learns which free providers are healthy and useful.</li>
          <li><strong>Dossier Swarm:</strong> specialist agents build project research packets.</li>
          <li><strong>Alpha Lab:</strong> strategy hypotheses, paper testing, and self-critique.</li>
          <li><strong>Progressive Opportunity Ranking:</strong> separates opportunity from trust, shows best-available leads, and keeps hard safety blocks authoritative.</li>
          <li><strong>Advertised Category Coverage:</strong> gives every public category a strict-result lane plus a research-only fallback lane when proof is incomplete.</li>
          <li><strong>Progressive Debug Ladder:</strong> shows identity, trust, execution, money, and final-integrity gates for every candidate.</li>
          <li><strong>Market Opportunity Rank:</strong> unifies opportunity, timing, trust, attention gap, evidence, and local AI consensus into one authoritative research decision.</li>
          <li><strong>Market Opportunity Learning:</strong> records top opportunity receipts, grades later scans when market data is available, and produces cautious weight hints.</li>
          <li><strong>Route Accessibility:</strong> separates strongest opportunities from easiest current buy routes across CEX, DEX, aggregator, wallet, region, and bridge paths.</li>
          <li><strong>Engine Audit:</strong> transparent inventory of the scanner engine stack.</li>
        </ul>
      </div>
    </section>
    <section class="panel">
      <h2>${bestNowHeadline}</h2>
      <p>${bestNowText}</p>
      <div class="metrics">
        <div class="metric"><span>Leader</span><strong>${bestNowProject.identity?.symbol || "NO QUALIFIED CANDIDATE"}</strong></div>
        <div class="metric"><span>Market Rank</span><strong>${bestNowProject.marketOpportunityRank ?? "NO QUALIFIED CANDIDATE"}</strong></div>
        <div class="metric"><span>Evidence</span><strong>${bestNowProject.evidenceCoverage ?? "INSUFFICIENT INPUT DATA"}</strong></div>
        <div class="metric"><span>Horizon</span><strong>${bestNowProject.recommendedHorizon || "INSUFFICIENT INPUT DATA"}</strong></div>
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
        <a class="button" href="./engine-data-readiness.json">Data Readiness</a>
        <a class="button" href="./route-universe.json">Route Universe</a>
        <a class="button" href="./alternative-execution-routes.json">Alt Routes</a>
        <a class="button" href="./user-accessibility-ranking.json">Accessibility Rank</a>
        <a class="button" href="./venue-coverage-health.json">Venue Health</a>
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
        <a class="button" href="./execution-ready.json">Execution Ready</a>
        <a class="button" href="./emerging-radar.json">Emerging Radar</a>
        <a class="button" href="./blocked-projects.json">Blocked</a>
        <a class="button" href="./alerts.json">Alerts</a>
      </div>
    </div>
    ${
      copiedFiles.includes("report.html")
        ? '<iframe title="Crypto Launch Intelligence Report" src="./report.html"></iframe>'
        : '<div class="empty">No report has been generated yet. Run the scanner first, then publish the dashboard.</div>'
    }
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
