// src/index.js

import "./config/loadEnv.js";
import { runDiscoveryManager } from "./discoveryManager.js";

import {
  runIntelligencePipeline,
  summarizePipelineResults,
} from "./intelligencePipeline.js";

import { generateReports } from "./reports/reportOrchestrator.js";
import { resolveAnalysisFunnelConfig } from "./config/analysisFunnelConfig.js";
import { planInstitutionalCandidateSelection } from "./discovery/institutionalCandidateSelector.js";
import { writeCandidateSelectionAuditReports } from "./discovery/candidateSelectionAudit.js";
import { resolveLocalAIOptions } from "./brain/localAIOptions.js";
import {
  loadResearchCoverageLedger,
  saveResearchCoveragePlan,
} from "./learning/researchCoverageStore.js";
import { syncScanToSupabase } from "./storage/supabaseSync.js";
import {
  applySupabaseMemory,
  collectSupabaseMemory,
  summarizeSupabaseMemoryImpact,
  writeSupabaseMemoryReport,
} from "./storage/supabaseMemory.js";
import { persistAlphaTruthMemory } from "./kernel/alphaTruthKernel.js";

export { resolveLocalAIOptions } from "./brain/localAIOptions.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedScore(project = {}) {
  const score =
    num(project.marketRankScore) * 0.12 +
    num(project.richTokenScore) * 0.08 +
    num(project.prePump?.score) * 0.13 +
    num(project.momentumShiftScore) * 0.08 +
    num(project.relativeStrengthScore) * 0.07 +
    num(project.buyPressureScore) * 0.08 +
    num(project.capitalFlowScore) * 0.1 +
    num(project.liquidityScore) * 0.08 +
    num(project.narrativeScore) * 0.08 +
    num(project.narrativeForecastScore) * 0.07 +
    num(project.smartMoneyAccumulationScore) * 0.08 +
    num(project.smartWalletPerformanceScore) * 0.07 +
    num(project.catalystScore) * 0.07 +
    num(project.catalystCalendarScore) * 0.06 +
    num(project.communityGrowthScore) * 0.04 +
    num(project.developerActivityScore) * 0.04 -
    num(project.riskScore) * 0.08;

  return clamp(score);
}

function tierForScore(score = 0) {
  if (score >= 95) return "Institutional Alpha";
  if (score >= 90) return "Elite";
  if (score >= 85) return "A+ Opportunity";
  if (score >= 80) return "Strong Watchlist";
  if (score >= 70) return "Watchlist";
  if (score >= 55) return "Early Candidate";
  return "Low Priority";
}

function confidenceForScore(score = 0) {
  if (score >= 85) return "High";
  if (score >= 70) return "Medium";
  if (score >= 55) return "Developing";
  return "Low";
}

export function scoreOf(project = {}) {
  const current = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const fallback = weightedScore(project);
  const authoritativeScore = current || fallback;

  // Final integrity is allowed to lower a score. It must never be used to boost one.
  if (project.finalSelectionState && project.finalSelectionState !== "QUALIFIED") {
    const integrityScore = num(project.finalIntegrityScore);
    return integrityScore > 0 ? Math.min(authoritativeScore, integrityScore) : authoritativeScore;
  }

  return authoritativeScore;
}

function pipelineLimit(env = process.env) {
  const configured = Number(env.INTELLIGENCE_PIPELINE_LIMIT || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return resolveAnalysisFunnelConfig(env).standardIntelligenceLimit;
}

export function planResearchQueue(projects = [], options = {}) {
  return planInstitutionalCandidateSelection(projects, {
    ...(options || {}),
    config: options.config || resolveAnalysisFunnelConfig(options.env || process.env, {
      standardIntelligenceLimit: options.limit ?? pipelineLimit(options.env),
    }),
    history: options.history,
    runSequence: options.runSequence,
  });
}

export function selectResearchQueue(projects = [], options = {}) {
  return planResearchQueue(projects, options).selected;
}

function normalizeForReports(projects = []) {
  return [...projects]
    .map((project) => {
      const score = project.finalSelectionState
        ? num(project.pipelineScore ?? project.opportunityScore ?? project.score)
        : scoreOf(project);
      const tier = project.pipelineTier || project.tier || tierForScore(score);

      return {
        ...project,
        opportunityScore: score,
        pipelineScore: score,
        score,
        tier,
        pipelineTier: tier,
        confidence: project.confidence || project.pipelineConfidence || confidenceForScore(score),
        pipelineConfidence: project.pipelineConfidence || confidenceForScore(score),
        riskScore: project.riskScore ?? project.risk?.score ?? 0,
        narrative:
          project.narrative ||
          project.primaryNarrative ||
          project.narrativeForecast?.narrative ||
          "",
        volume24h: project.volume24h ?? project.volume ?? "",
        marketCap: project.circulatingMarketCap ?? project.verifiedMarketCap ?? project.marketCap ?? "",
        fdv: project.fdv ?? project.fullyDilutedValue ?? "",
        liquidity: project.liquidityUsd ?? project.liquidity ?? "",
      };
    })
    .sort((a, b) => scoreOf(b) - scoreOf(a));
}

function printBanner() {
  console.clear();
  console.log("");
  console.log("========================================================");
  console.log("        CRYPTO LAUNCH INTELLIGENCE PLATFORM");
  console.log("========================================================");
  console.log("");
}

function printDiscoveryStats(discovery = {}, discoveredList = []) {
  if (!discovery || Array.isArray(discovery)) {
    console.log(`✓ Found ${discoveredList.length} projects`);
    return;
  }

  console.log(`✓ Found ${discoveredList.length} projects`);
  console.log(
    `Discovery Mode: ${discovery.mode || "standard"} | Raw: ${discovery.rawCount || 0} | Deduped: ${discovery.dedupedCount || 0} | Accepted Before Cap: ${discovery.acceptedBeforeLimitCount ?? discovery.acceptedCount ?? discoveredList.length} | Scan Cap: ${discovery.scanLimit || "none"}`
  );
  if (discovery.targetCoverage) {
    console.log(
      `Discovery Target: ${discovery.targetCoverage.targetCandidates || discovery.targetCandidates || "none"} | Accepted: ${discovery.targetCoverage.acceptedAfterLimitCount || discoveredList.length} | Target Met: ${discovery.targetCoverage.targetMet ? "yes" : "no"} | Shortfall: ${discovery.targetCoverage.shortfall || 0}`
    );
  }
  if (discovery.candidateSelection) {
    console.log(
      `Discovery Coverage: ${discovery.candidateSelection.selectedCount || 0}/${discovery.candidateSelection.uniqueCandidateCount || 0} selected | Coverage Reserve: ${discovery.candidateSelection.selectedByReason?.COVERAGE_RESERVE || 0} | Deferred: ${discovery.candidateSelection.deferredCount || 0}`
    );
  }
  if (discovery.discoveryFrontier) {
    const frontier = discovery.discoveryFrontier;
    const native = frontier.nativeProtocolCoverage || {};
    console.log(
      `Discovery Frontier: ${frontier.observedChainCount || 0}/${frontier.targetChainCount || 0} declared chains observed | Native routes: ${native.configured || 0}/${native.total || 0} configured | Critical gaps: ${frontier.criticalGapCount || 0}`
    );
  }
  if (discovery.candidateRescue) {
    console.log(
      `Candidate Rescue: ${discovery.candidateRescue.status || "UNKNOWN"} | Added: ${discovery.candidateRescue.addedCount || 0} | Clusters: ${discovery.candidateRescue.expandedClusters?.length || discovery.candidateRescue.clusters?.length || 0}`
    );
  }
  if (discovery.providerHealth) {
    console.log(
      `Provider Health: ${discovery.providerHealth.healthy || 0}/${discovery.providerHealth.total || 0} healthy | Missing Keys: ${discovery.providerHealth.authenticationRequired || 0} | Rate Limited: ${discovery.providerHealth.rateLimited || 0} | Region Blocked: ${discovery.providerHealth.regionBlocked || 0}`
    );
  }
  if (discovery.sourceReports?.githubProjectDiscovery || discovery.aiDiscoverySwarm) {
    console.log(
      `GitHub Discovery: ${discovery.sourceReports?.githubProjectDiscovery?.scannedTokens || 0} | AI Swarm: ${discovery.aiDiscoverySwarmCount || 0}`
    );
  }
  if (discovery.universeLedger?.totals) {
    console.log(
      `Universe Ledger: ${discovery.universeLedger.savedProjects || 0} saved | Promoted: ${discovery.universeLedger.totals.promoted || 0} | Research: ${discovery.universeLedger.totals.researchOnly || 0} | Blocked: ${discovery.universeLedger.totals.blocked || 0}`
    );
  }
}

function printResearchCoverage(coverage = {}) {
  const funnel = coverage.funnel || {};
  const allocation = coverage.allocation || {};
  console.log("============= ANALYSIS FUNNEL =============");
  console.log(`Discovery Universe: ${funnel.discoveryUniverse ?? coverage.candidateCount ?? 0}`);
  console.log(`Deduplicated Universe: ${funnel.deduplicatedUniverse ?? coverage.uniqueCandidateCount ?? 0}`);
  console.log(`Eligible Pre-Intelligence Universe: ${funnel.eligiblePreIntelligenceUniverse ?? coverage.eligibleCandidateCount ?? 0}`);
  console.log(`Standard Intelligence Selected: ${funnel.standardIntelligenceSelected ?? coverage.selectedCount ?? 0} / ${funnel.standardIntelligenceLimit ?? coverage.configuredLimit ?? 4000}`);
  console.log(`Advanced Intelligence Selected: ${funnel.advancedIntelligenceSelected ?? 0} / ${funnel.advancedIntelligenceLimit ?? 1500}`);
  console.log(`Deep Intelligence Selected: ${funnel.deepIntelligenceSelected ?? 0} / ${funnel.deepIntelligenceLimit ?? 500}`);
  console.log(`Crawler Research Selected: ${funnel.crawlerResearchSelected ?? 0} / ${funnel.crawlerResearchLimit ?? 300}`);
  console.log(`Llama 3 Selected: ${funnel.llama3Selected ?? 0} / ${funnel.llama3Limit ?? 100}`);
  console.log(`Debate Selected: ${funnel.debateSelected ?? 0} / ${funnel.debateLimit ?? 25}`);
  console.log(`Finalists: ${funnel.finalists ?? 0} / ${funnel.finalistLimit ?? 5}`);
  console.log(`Best Opportunity: ${funnel.bestOpportunity || "no eligible leader"}`);
  console.log("4,000 Allocation:");
  console.log(`Composite Merit: ${allocation.compositeMerit || 0}`);
  console.log(`Acceleration Reserve: ${allocation.accelerationReserve || 0}`);
  console.log(`Attention Gap Reserve: ${allocation.attentionGapReserve || 0}`);
  console.log(`Catalyst/Developer Reserve: ${allocation.catalystDeveloperReserve || 0}`);
  console.log(`Coverage Reserve: ${allocation.coverageReserve || 0}`);
  console.log(`Deferred Rotation: ${allocation.deferredRotation || 0}`);
  console.log(`Rescued Candidates: ${allocation.rescuedCandidates || 0}`);
  console.log(`Merit Fill: ${allocation.meritFill || 0}`);
  console.log("============================================");
}

function printSummary(summary) {
  console.log("");
  console.log("============= PIPELINE SUMMARY =============");
  console.log(`Projects Scanned: ${summary.scannedProjects}`);
  console.log(`Market Regime: ${summary.marketRegime || "Unknown"}`);
  console.log(`Healthy Breadth: ${summary.marketContext?.healthyBreadth ?? "N/A"}%`);
  console.log(`Scoring Model: ${summary.scoringPrimaryModel || "legacy"}`);
  console.log(
    `Engine Health: ${summary.engineHealth?.enginesSuccessful || 0}/${summary.engineHealth?.enginesAttempted || 0} successful | Failed: ${summary.engineHealth?.enginesFailed || 0} | Partial: ${summary.engineHealth?.enginesPartial || 0} | No Data: ${summary.engineHealth?.enginesNoData || 0} | Avg Coverage: ${summary.engineHealth?.averageEvidenceCoverage || 0}%`
  );
  console.log(`Institutional Alpha: ${summary.institutionalAlphaCount}`);
  console.log(`A+ Opportunities: ${summary.aPlusOpportunityCount}`);
  console.log(`Strong Watchlist: ${summary.strongWatchlistCount}`);
  console.log(`Local AI Completed: ${summary.localAICompletedCount}`);
  console.log(`Local AI Positive / Negative: ${summary.localAIPositiveCount} / ${summary.localAINegativeCount}`);
  console.log(`Local AI Queued: ${summary.localAIQueuedCount}`);
  console.log(`Local AI Top-100 Triage: ${summary.localAITriageCount}`);
  console.log(`Local AI Promotion Blocks: ${summary.localAIPromotionBlockCount}`);
  console.log(`Local AI Unavailable: ${summary.localAIUnavailableCount}`);
  console.log("");
  console.log(`High Market Rank: ${summary.highMarketRankCount}`);
  console.log(`High Rich Token: ${summary.highRichTokenCount}`);
  console.log(`High Momentum: ${summary.highMomentumCount}`);
  console.log(`High Pre-Pump: ${summary.highPrePumpCount}`);
  console.log(`High Launch/Staking: ${summary.highNarrativeLaunchStakingCount}`);
  console.log("");
  console.log(`High Conviction: ${summary.highConvictionCount}`);
  console.log(`Smart Money + Flow: ${summary.smartMoneyFlowSetupCount}`);
  console.log(`Narrative + Momentum: ${summary.narrativeMomentumSetupCount}`);
  console.log(`Defensive / Avoid: ${summary.defensiveCount}`);
  console.log(`Priority Research: ${summary.priorityResearchCount}`);
  console.log(`Core Watch: ${summary.coreWatchCount}`);
  console.log(`Starter Watch: ${summary.starterWatchCount}`);
  console.log(`Speculative Lab: ${summary.speculativeLabCount}`);
  console.log(`X/Social Setups: ${summary.socialAccelerationSetupCount}`);
  console.log(`Positive Learning Edge: ${summary.positiveLearningSetupCount}`);
  console.log(`Accelerating Watched: ${summary.acceleratingWatchedProjectCount}`);
  console.log(`Quantum Upside Fields: ${summary.quantumUpsideSetupCount}`);
  console.log(`Quantum Fragile Fields: ${summary.quantumFragileSetupCount}`);
  console.log(`Proof-Backed Setups: ${summary.proofBackedCount}`);
  console.log(`Thin Proof Setups: ${summary.thinProofCount}`);
  console.log(`Hot Narrative Setups: ${summary.hotNarrativeCount}`);
  console.log(`Improving Projects: ${summary.improvingProjectCount}`);
  console.log(`High Trap Risk: ${summary.highTrapRiskCount}`);
  console.log(`Reliable Source Setups: ${summary.reliableSourceCount}`);
  console.log(`AI Strong Buy Candidates: ${summary.aiStrongBuyCount}`);
  console.log(`Pre-Strong Buy: ${summary.preStrongBuyCount}`);
  console.log(`High AI Disagreement: ${summary.highDisagreementCount}`);
  console.log(`Red-Team Blocks: ${summary.redTeamBlockCount}`);
  console.log(`Alpha Lab Matches: ${summary.alphaLabMatchCount}`);
  console.log(`Strategy Strong Buys: ${summary.strategyStrongBuyCount}`);
  console.log(`Causal Strong Buys: ${summary.causalStrongBuyCount}`);
  console.log(`Alpha OS Strong Buys: ${summary.alphaOSStrongBuyCount}`);
  console.log(`Alpha OS Best Available: ${summary.alphaOSBestAvailableCount}`);
  console.log(`Weight-Optimized Priority: ${summary.weightOptimizedPriorityCount}`);
  console.log(`Breakout Brain Picks: ${summary.breakoutBrainSelectionCount}`);
  console.log(`High Breakout Probability: ${summary.breakoutBrainHighProbabilityCount}`);
  console.log(`High-Tech Alpha Candidates: ${summary.highTechAlphaCandidateCount}`);
  console.log(`High-Tech Priority Research: ${summary.highTechPriorityResearchCount}`);
  console.log(`Self-Evolving Alpha Candidates: ${summary.selfEvolvingAlphaCandidateCount}`);
  console.log(`Self-Evolving Priority Research: ${summary.selfEvolvingPriorityResearchCount}`);
  console.log(`Proof-Carrying Alpha Candidates: ${summary.proofCarryingAlphaCandidateCount}`);
  console.log(`Accountable Contract Research: ${summary.accountablePriorityContractCount}`);
  console.log(`Alpha Contract Invalidations: ${summary.alphaContractInvalidationCount}`);
  console.log(`Knowledge Graph Alpha: ${summary.alphaKnowledgeGraphCandidateCount}`);
  console.log(`Knowledge Graph Priority: ${summary.alphaKnowledgeGraphPriorityCount}`);
  console.log(`Causal Twin Strong Buys: ${summary.causalMarketTwinStrongBuyCount}`);
  console.log(`Causal Twin Priority: ${summary.causalMarketTwinPriorityCount}`);
  console.log(`Causal Twin Risk Blocks: ${summary.causalMarketTwinRiskBlockCount}`);
  console.log(`Causal Network ARMED: ${summary.causalNetworkArmedCount}`);
  console.log(`Causal Network Priority: ${summary.causalNetworkPriorityCount}`);
  console.log(`Causal Network Blocks: ${summary.causalNetworkBlockCount}`);
  console.log(`Causal Network Low Fragility: ${summary.causalNetworkLowFragilityCount}`);
  console.log(`Alpha Governor Promotes: ${summary.alphaGovernorPromoteCount}`);
  console.log(`Alpha Governor Priority: ${summary.alphaGovernorPriorityCount}`);
  console.log(`Alpha Governor Risk Blocks: ${summary.alphaGovernorRiskBlockCount}`);
  console.log(`Small-Cap Hunter Picks: ${summary.smallCapHunterSelectedCount}`);
  console.log(`Small-Cap Watch: ${summary.smallCapHunterWatchCount}`);
  console.log(`Small-Cap Risk Blocks: ${summary.smallCapHunterRiskBlockCount}`);
  console.log(`Small-Cap Route Blocks: ${summary.smallCapHunterPurchaseRouteBlockCount}`);
  console.log(`Execution Twin Picks: ${summary.executionTwinSelectedCount}`);
  console.log(`Execution Twin Route Blocks: ${summary.executionTwinRouteBlockCount}`);
  console.log(`Execution Twin Safety Blocks: ${summary.executionTwinSafetyBlockCount}`);
  console.log(`7-Day Asymmetric Research Picks: ${summary.sevenDayTenXSelectedCount}`);
  console.log(`7-Day Asymmetric Watch: ${summary.sevenDayTenXWatchCount}`);
  console.log(`7-Day Asymmetric Blocks: ${summary.sevenDayTenXBlockedCount}`);
  console.log(`vNext Buy Eligible: ${summary.vNextBuyEligibleCount}`);
  console.log(`vNext Blocks / Restricted: ${summary.vNextBlockedCount} / ${summary.vNextRestrictedCount}`);
  console.log(`vNext Low Coverage: ${summary.vNextLowCoverageCount}`);
  console.log(`vNext Upgrades / Downgrades: ${summary.vNextUpgradeCount} / ${summary.vNextDowngradeCount}`);
  console.log(`vNext Evidence Coverage Avg: ${summary.averageVNextEvidenceCoverage}%`);
  console.log(`Final Qualified Candidates: ${summary.finalQualifiedCandidateCount}`);
  console.log(`Final Blocked Candidates: ${summary.finalBlockedCandidateCount}`);
  console.log(`Final Identity Conflicts: ${summary.finalIdentityConflictCount}`);
  console.log(`Final Insufficient Data: ${summary.finalInsufficientDataCount}`);
  console.log(`Final Integrity Deselections: ${summary.finalIntegrityDeselectionCount}`);
  console.log(`Pre-Consensus Analyzed: ${summary.preConsensusAnalyzedCount}`);
  console.log(`Pre-Consensus Exceptional: ${summary.exceptionalPreConsensusCount}`);
  console.log(`Pre-Consensus High Conviction: ${summary.highConvictionPreConsensusCount}`);
  console.log(`Quiet Accumulation: ${summary.quietAccumulationDetectedCount}`);
  console.log(`Pre-Consensus Late/Already Pumped: ${summary.alreadyPumpedPreConsensusCount}`);
  console.log(`Pre-Consensus Blocked: ${summary.blockedPreConsensusCount}`);
  console.log(`Sniper ARMED Candidates: ${summary.armedSniperCandidateCount}`);
  console.log(`Sniper Quiet Accumulation: ${summary.sniperQuietAccumulationCount}`);
  console.log(`Sniper Fundamentals Accelerating: ${summary.sniperFundamentalsAcceleratingCount}`);
  console.log(`Sniper Blocked: ${summary.sniperBlockedCount}`);
  console.log(`Sniper Insufficient Data: ${summary.sniperInsufficientDataCount}`);
  console.log(`Organic Demand Confirmed: ${summary.organicDemandConfirmedCount}`);
  console.log(`Organic Integrity Blocks: ${summary.organicIntegrityBlockCount}`);
  console.log(`Tradable Anomalies: ${summary.tradableAnomalyCount}`);
  console.log(`Paper Strategy Promotions: ${summary.paperOutcomePromotionCount}`);
  console.log(`Verified Source Stacks: ${summary.verifiedSourceStackCount}`);
  console.log(`Healthy GitHub Signals: ${summary.healthyGithubSignalCount}`);
  console.log(`Autonomous Research Priority: ${summary.autonomousResearchPriorityCount}`);
  console.log(`Autonomous Research Blocked: ${summary.autonomousResearchBlockedCount}`);
  console.log("");
  console.log(`Smart Money Accumulation: ${summary.strongSmartMoneyAccumulationCount}`);
  console.log(`Smart Wallet Performance: ${summary.strongSmartWalletPerformanceCount}`);
  console.log(`Narrative Forecast: ${summary.strongNarrativeForecastCount}`);
  console.log(`Catalyst Calendar: ${summary.strongCatalystCalendarCount}`);
  console.log("");
  console.log(`Already Pumped: ${summary.alreadyPumpedCount}`);
  console.log(`Late Chase: ${summary.lateChaseCount}`);
  console.log("============================================");
}

function printTopProjects(results) {
  console.log("");
  console.log("============= TOP OPPORTUNITIES =============");
  console.log("");

  results.slice(0, 10).forEach((project, index) => {
    console.log(`${index + 1}. ${project.name || "Unknown"}`);
    console.log(`   Symbol: ${project.symbol || "-"}`);
    console.log(`   Chain: ${project.chain || "-"}`);
    console.log(`   Pipeline Score: ${scoreOf(project).toFixed(1)}`);
    if (project.vNextScore !== undefined) {
      console.log(
        `   Legacy/vNext: ${project.legacyScore || 0} (#${project.legacyRank || "-"}) -> ${project.vNextScore || 0} (#${project.vNextRank || "-"}) | ${project.vNextRecommendation || "Unknown"}`
      );
      console.log(
        `   vNext: ${project.vNextProjectCategory || "Unknown"} / ${project.vNextMarketStage || "UNKNOWN"} / ${project.vNextSafetyState || "UNKNOWN"} | Evidence ${project.evidenceCoverageScore || 0}% | ${project.reasonForDifference || "No material difference."}`
      );
    }
    if (project.confidenceAdjustedScore) {
      console.log(`   Confidence-Adjusted: ${project.confidenceAdjustedScore} (#${project.confidenceAdjustedRank || "-"})`);
    }
    if (project.aiEcosystemVerdict) {
      console.log(`   AI Council: ${project.aiEcosystemVerdict} (${project.aiEcosystemScore || 0})`);
    }
    if (project.localAIStatus) {
      const adjustment = num(project.localAIAdjustment);
      console.log(
        `   Local AI: ${project.localAIVerdict || project.localAIStatus} | Decision: ${project.localAIResearchDecision || "PENDING"} | Adjustment: ${adjustment >= 0 ? "+" : ""}${adjustment} | Confidence: ${num(project.localAIConfidence)}% | Coverage: ${num(project.localAICoverage)}%`
      );
    }
    if (project.autonomousAlphaOSVerdict) {
      console.log(`   Alpha OS: ${project.autonomousAlphaOSVerdict} (${project.autonomousAlphaOSScore || 0})`);
    }
    if (project.bestAutonomousStrategy?.name) {
      console.log(`   Strategy: ${project.bestAutonomousStrategy.name} (${project.strategyLabScore || 0})`);
    }
    if (project.causalMarketTwinVerdict) {
      console.log(
        `   Market Twin: ${project.causalMarketTwinVerdict} (${project.causalMarketTwinScore || 0}, EV ${project.causalMarketTwinExpectedReturnPct || 0}%)`
      );
    }
    if (project.autonomousCausalNetworkVerdict) {
      console.log(
        `   Causal Network: ${project.autonomousCausalNetworkVerdict} (${project.autonomousCausalNetworkScore || 0}, ${project.autonomousCausalProjectState || "WATCH"})`
      );
    }
    if (project.smallCapHunterSelected) {
      console.log(
        `   Small-Cap Hunter: #${project.smallCapHunterSelectionRank} (${project.smallCapHunterScore || 0}) via ${project.smallCapHunter?.purchaseRoute?.preferredRoute || "unverified route"}`
      );
    }
    if (project.proofOfAlphaExecutionTwinSelected) {
      console.log(
        `   Execution Twin: #${project.proofOfAlphaExecutionTwinRank} (${project.proofOfAlphaExecutionTwinScore || 0}) via ${project.proofOfAlphaExecutionTwinRoute || "unverified route"}`
      );
    }
    if (project.sevenDayTenXSelected || project.sevenDayTenXWatchRank) {
      console.log(
        `   7-Day Asymmetric Research: ${project.sevenDayTenXVerdict || "Watch"} (${project.sevenDayTenXScore || 0}, scenario strength ${project.sevenDayAsymmetricScenarioStrength || project.sevenDayTenXModeledScenarioPct || 0})`
      );
    }
    if (project.organicDemandVerdict) {
      console.log(
        `   Organic Integrity: ${project.organicDemandVerdict} (${project.organicEconomicIntegrityScore || 0}, risk ${project.economicIntegrityRiskScore || 0})`
      );
    }
    console.log(`   Tier: ${project.pipelineTier || project.tier || "Unknown"}`);
    if (project.finalSelectionState) {
      console.log(`   Final Selection: ${project.finalSelectionState} / ${project.finalIntegrityVerdict || "Unknown"}`);
      if (project.finalBlockingReasons?.length) {
        console.log(`   Final Blockers: ${project.finalBlockingReasons.slice(0, 3).join("; ")}`);
      }
    }
    console.log(`   Confidence: ${project.confidence || "Unknown"} / Data: ${project.dataConfidence || "Unknown"}`);
    console.log(`   Conviction: ${project.conviction || "Unknown"}`);
    console.log(`   Action: ${project.executionPlan?.action || "Unknown"}`);
    if (project.narrativeHeatScore || project.trapRiskScore || project.sourceReliabilityScore) {
      console.log(`   Heat/Source/Trap: ${project.narrativeHeatScore || 0} / ${project.sourceReliabilityScore || 0} / ${project.trapRiskScore || 0}`);
    }
    console.log(`   Pre-Pump: ${project.prePump?.score || 0}`);
    console.log(`   Status: ${project.prePump?.status || "UNKNOWN"}`);
    if (project.alphaTags?.length) {
      console.log(`   Tags: ${project.alphaTags.slice(0, 4).join(", ")}`);
    }
    console.log("");
  });
}

function printAlerts(summary) {
  if (!summary.alerts?.length) return;

  console.log("");
  console.log("================ ALERTS ====================");

  summary.alerts.forEach((alert) => {
    console.log(`${alert.project}`);
    console.log(` • ${alert.alert}`);
  });

  console.log("============================================");
}

function printReportPaths(paths) {
  console.log("");
  console.log("============= REPORTS GENERATED =============");
  console.log(`HTML Dashboard: ${paths.htmlPath}`);
  console.log(`JSON Report:    ${paths.jsonPath}`);
  console.log(`CSV Export:     ${paths.csvPath}`);
  console.log(`Quantum Field:  ${paths.quantumFieldPath}`);
  console.log(`Patterns:       ${paths.prePumpPatternPath}`);
  console.log(`Calibration:    ${paths.calibrationPath}`);
  console.log(`vNext:          ${paths.institutionalVNextPath}`);
  console.log(`State Signals:  ${paths.stateOfArtPath}`);
  console.log(`AI Council:     ${paths.aiCouncilPath}`);
  console.log(`Local AI Queue: ${paths.localAIResearchPath}`);
  console.log(`Agent Memory:   ${paths.agentPerformancePath}`);
  console.log(`Research OS:    ${paths.researchOSPath}`);
  console.log(`Alpha Lab:      ${paths.alphaLabPath}`);
  console.log(`Simulation:     ${paths.simulationBrainPath}`);
  console.log(`Outcome Judge:  ${paths.outcomeJudgePath}`);
  console.log(`Catalyst Radar: ${paths.catalystRadarPath}`);
  console.log(`Dossier Swarm:  ${paths.dossierSwarmPath}`);
  console.log(`Command Center: ${paths.commandCenterPath}`);
  console.log(`Commander:      ${paths.commanderPath}`);
  console.log(`Investigator:   ${paths.alphaInvestigatorPath}`);
  console.log(`War Room:       ${paths.warRoomPath}`);
  console.log(`Strategy Lab:   ${paths.strategyLabPath}`);
  console.log(`Causal Brain:   ${paths.causalBrainPath}`);
  console.log(`Alpha OS:       ${paths.alphaOSPath}`);
  console.log(`Dashboard v2:   ${paths.alphaDashboardV2Path}`);
  console.log(`Paper Lab:      ${paths.paperLabPath}`);
  console.log(`Weights:        ${paths.weightOptimizerPath}`);
  console.log(`Source Truth:   ${paths.sourceTruthPath}`);
  console.log(`GitHub Pro:     ${paths.githubProPath}`);
  console.log(`Research Brain: ${paths.autonomousResearchPath}`);
  console.log(`Breakout Brain: ${paths.breakoutBrainPath}`);
  console.log(`High-Tech:      ${paths.highTechAlphaStackPath}`);
  console.log(`Alpha OS Max:   ${paths.selfEvolvingAlphaOSPath}`);
  console.log(`Alpha Theses:   ${paths.alphaThesesPath}`);
  console.log(`Alpha Contracts:${paths.alphaContractsPath}`);
  console.log(`Contract Board: ${paths.alphaContractLeaderboardPath}`);
  console.log(`Receipts:       ${paths.alphaContractReceiptsPath}`);
  console.log(`Alpha Graph:    ${paths.alphaKnowledgeGraphPath}`);
  console.log(`Market Twin:    ${paths.causalMarketTwinPath}`);
  console.log(`Causal Network: ${paths.autonomousCausalNetworkPath}`);
  console.log(`Governor:      ${paths.alphaEvolutionGovernorPath}`);
  console.log(`Gov Queue:     ${paths.alphaEvolutionQueuePath}`);
  console.log(`Small Caps:    ${paths.smallCapHunterPath}`);
  console.log(`Execution Twin:${paths.proofOfAlphaExecutionTwinPath}`);
  console.log(`Organic Integrity:${paths.organicDemandIntegrityPath}`);
  console.log(`7-Day Asym:   ${paths.sevenDayTenXResearchPath}`);
  if (paths.scannerVNextPath) console.log(`Scanner vNext: ${paths.scannerVNextPath}`);
  if (paths.alphaTruthKernelPath) console.log(`Alpha Truth:   ${paths.alphaTruthKernelPath}`);
  console.log(`Discovery Truth: ${paths.discoveryTruthPath}`);
  if (paths.standard4000SelectionPath) console.log(`4000 Selection: ${paths.standard4000SelectionPath}`);
  if (paths.standard4000ExclusionsPath) console.log(`4000 Exclusions:${paths.standard4000ExclusionsPath}`);
  if (paths.selectionLaneAuditPath) console.log(`Lane Audit:     ${paths.selectionLaneAuditPath}`);
  if (paths.candidateRescueReportPath) console.log(`Rescue Report:  ${paths.candidateRescueReportPath}`);
  if (paths.missedOpportunityAuditPath) console.log(`Missed Audit:   ${paths.missedOpportunityAuditPath}`);
  console.log(`Pre-Consensus: ${paths.preConsensusBreakoutPath}`);
  console.log(`Sniper Report:  ${paths.sniperReportPath}`);
  console.log(`Universe Ledger: ${paths.universeLedgerPath}`);
  console.log(`Integrity Stack: ${paths.integrityStackPath}`);
  console.log(`OP Readiness:   ${paths.opModeReadinessPath}`);
  console.log(`Evidence Kernel: ${paths.evidenceKernelPath}`);
  if (paths.debugProgressiveLadderPath) console.log(`Debug Ladder:   ${paths.debugProgressiveLadderPath}`);
  if (paths.debugIdentityConflictsPath) console.log(`Debug Identity: ${paths.debugIdentityConflictsPath}`);
  if (paths.debugExecutionProofPath) console.log(`Debug Execution:${paths.debugExecutionProofPath}`);
  if (paths.debugBlockReasonsPath) console.log(`Debug Blocks:   ${paths.debugBlockReasonsPath}`);
  if (paths.debugStageHealthPath) console.log(`Debug Health:   ${paths.debugStageHealthPath}`);
  if (paths.top10BreakoutPath) console.log(`Top 10 JSON:    ${paths.top10BreakoutPath}`);
  if (paths.top10BreakoutHtmlPath) console.log(`Top 10 HTML:    ${paths.top10BreakoutHtmlPath}`);
  if (paths.top10BreakoutCsvPath) console.log(`Top 10 CSV:     ${paths.top10BreakoutCsvPath}`);
  if (paths.top10BreakoutExplanationsPath) console.log(`Top 10 Explain: ${paths.top10BreakoutExplanationsPath}`);
  if (paths.top10ExcludedFinalistsPath) console.log(`Top 10 Excluded:${paths.top10ExcludedFinalistsPath}`);
  console.log(`Roadmap:        ${paths.roadmapPath}`);
  console.log(`Source Router:  ${paths.sourceRouterPath}`);
  console.log(`Engine Audit:   ${paths.engineAuditPath}`);
  console.log(`Alerts:         ${paths.alertsPath}`);
  console.log(`Daily Brief:    ${paths.briefPath}`);
  console.log(`Performance:    ${paths.watchtowerPerformancePath}`);
  console.log(`Watchlist:      ${paths.watchlistPath}`);
  console.log(`Summary:        ${paths.summaryPath}`);
  console.log(`Watchlist Count: ${paths.watchlistCount}`);
  console.log(`Alerts: ${paths.alertCount} total / ${paths.highAlertCount} high / ${paths.criticalAlertCount} critical`);
  console.log(`Watchtower Hit Rate: ${paths.watchtowerHitRate}% (${paths.watchtowerEvaluatedAlerts} evaluated, ${paths.watchtowerPendingAlerts} pending)`);
  if (paths.dailyBrief) console.log(`Brief: ${paths.dailyBrief}`);
  console.log("=============================================");
  console.log("");
  console.log("Open dashboard with:");
  console.log("open reports/report.html");
  console.log("");
}

function printSupabaseSync(sync = {}) {
  if (!sync.enabled && sync.status === "SKIPPED") return;

  const detail =
    sync.status === "OK"
      ? `Run: ${sync.runId} | Projects: ${sync.syncedProjects || 0} | Reports: ${sync.syncedReports || 0} | Alpha receipts: ${sync.syncedAlphaReceipts || 0}`
      : sync.reason || "unknown";

  console.log(`Supabase Sync: ${sync.status || "UNKNOWN"} | ${detail}`);
}

function printSupabaseMemory(memory = {}) {
  if (!memory.status || memory.status === "SKIPPED") return;
  const detail =
    memory.status === "OK"
      ? `Matched: ${memory.matchedProjects || 0} | Remembered: ${memory.rememberedProjects || 0} | New: ${memory.newOrUnseenProjects || 0}`
      : memory.reason || "remote memory unavailable";
  console.log(`Supabase Memory: ${memory.status} | ${detail}`);
}

function printAlphaTruthMemory(alphaTruth = {}) {
  const persistence = alphaTruth.persistence || {};
  if (!persistence.status) return;
  const detail =
    persistence.status === "OK"
      ? `Receipts: ${persistence.receiptsSaved || 0} | Evidence events: ${persistence.evidenceEventsSaved || 0} | Sources: ${persistence.sourceHistorySaved || 0}`
      : persistence.reason || "not persisted";
  console.log(`Alpha Truth Memory: ${persistence.status} | ${detail}`);
}

async function main() {
  try {
    const startedAt = new Date();

    printBanner();

    console.log("Discovering projects...\n");

    const discoveredProjects = await runDiscoveryManager();

    const discoveredList = Array.isArray(discoveredProjects)
      ? discoveredProjects
      : discoveredProjects.candidates || [];

    printDiscoveryStats(discoveredProjects, discoveredList);

    const researchLedger = loadResearchCoverageLedger();
    const researchPlan = planResearchQueue(discoveredList, {
      history: researchLedger,
      runSequence: num(researchLedger.runCount) + 1,
    });
    const researchQueue = researchPlan.selected;
    const selectionAuditPaths = writeCandidateSelectionAuditReports(researchPlan);

    console.log("");
    printResearchCoverage(researchPlan.report);
    console.log(
      `Running intelligence pipeline on ${researchQueue.length.toLocaleString()} of ${discoveredList.length.toLocaleString()} discovered projects...\n`
    );

    const localAI = resolveLocalAIOptions();
    console.log(
      `Local AI Mode: ${localAI.mode} | Inline Research: ${localAI.inline ? localAI.inlineLimit : 0} | Queue: ${localAI.queue ? "enabled" : "disabled"}`
    );

    const pipelineResults = await runIntelligencePipeline(researchQueue, {
      saveMemory: true,
      freeOnly: discoveredProjects.freeMode?.enabled === true,
      localAI,
    });

    let results = normalizeForReports(pipelineResults);
    const summary = summarizePipelineResults(results);
    let researchCoverage = researchPlan.report;

    try {
      researchCoverage = {
        ...researchPlan.report,
        ledger: saveResearchCoveragePlan(discoveredList, researchPlan),
      };
    } catch (error) {
      researchCoverage = {
        ...researchPlan.report,
        ledger: { status: "FAILED", error: error.message },
      };
      console.warn(`Research coverage ledger failed: ${error.message}`);
    }

    let supabaseMemory = { status: "SKIPPED", reason: "Remote memory was not collected." };
    try {
      supabaseMemory = await collectSupabaseMemory({ projects: results });
      results = applySupabaseMemory(results, supabaseMemory);
    } catch (error) {
      supabaseMemory = { status: "FAILED", reason: error.message };
      results = applySupabaseMemory(results, supabaseMemory);
      console.warn(`Supabase memory failed: ${error.message}`);
    }
    const supabaseMemoryPath = writeSupabaseMemoryReport(supabaseMemory);

    const reportMeta = {
      runId: `scan_${startedAt.getTime()}`,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      discoveredProjects: discoveredList.length,
      discovery: discoveredProjects,
      researchCoverage,
      analysisFunnel: researchPlan.report,
      scannedProjects: results.length,
      engineMode: "full",
      scoringMode: "institutional-weighted-fallback",
      localAIMode: localAI.mode,
      supabaseMemory: summarizeSupabaseMemoryImpact(results, supabaseMemory),
      platform: "Crypto Launch Intelligence",
    };

    const alphaTruth = persistAlphaTruthMemory(results, reportMeta);
    reportMeta.alphaTruth = alphaTruth.report;
    reportMeta.alphaTruthPersistence = alphaTruth.persistence;

    const reportPaths = {
      ...generateReports(results, reportMeta),
      supabaseMemoryPath,
      ...selectionAuditPaths,
    };

    const supabaseSync = await syncScanToSupabase({
      projects: results,
      summary,
      meta: reportMeta,
      reportPaths,
      alphaTruth: alphaTruth.report,
    });

    printSummary(summary);
    printTopProjects(results);
    printAlerts(summary);
    printAlphaTruthMemory(alphaTruth);
    printSupabaseMemory(reportMeta.supabaseMemory);
    printSupabaseSync(supabaseSync);
    printReportPaths(reportPaths);

    console.log("Scan Complete.");
    console.log("");
  } catch (error) {
    console.error("");
    console.error("Pipeline Failed");
    console.error(error);
    console.error("");

    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0));
}

export { main };
