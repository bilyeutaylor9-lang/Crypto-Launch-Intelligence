import fs from "fs";
import path from "path";

function esc(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function scoreOf(project = {}) {
  return Number(project.opportunityScore ?? project.score ?? 0);
}

function qualifiedForDashboard(project = {}) {
  return (
    project.finalSelectionQualified === true &&
    project.finalSelectionState === "QUALIFIED" &&
    project.identityVerified === true &&
    (project.contractVerified === true || project.finalIdentityState === "VERIFIED_LISTING") &&
    project.purchaseRouteConfirmed === true &&
    project.executionRouteAvailable === true &&
    project.liquidityVerified === true &&
    project.hasBlockingVerdict !== true
  );
}

function listText(items = []) {
  return items
    .slice(0, 4)
    .map((item) => (typeof item === "string" ? item : item.text || item.label || item.summary || ""))
    .filter(Boolean)
    .map(esc)
    .join("<br />");
}

function scoreBreakdownText(project = {}) {
  const breakdown = project.scoreBreakdown || {};
  const entries = Object.entries(breakdown)
    .filter(([, value]) => Number(value) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 5);

  return entries
    .map(([key, value]) => `${esc(key)} ${esc(value)}`)
    .join("<br />");
}

function reasonText(project = {}) {
  return [...(project.finalBlockingReasons || []), ...(project.finalWarningReasons || [])]
    .slice(0, 5)
    .map(esc)
    .join("<br />");
}

function candidateRows(projects = [], emptyMessage = "No qualified candidates") {
  if (!projects.length) {
    return `
      <tr>
        <td colspan="9" class="empty">${esc(emptyMessage)}</td>
      </tr>
    `;
  }

  return projects
    .map(
      (p, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td>${esc(p.chain || p.finalChain || "")}</td>
          <td><strong>${scoreOf(p).toFixed(1)}</strong></td>
          <td>${esc(p.finalSelectionState || "")}</td>
          <td>${esc(p.finalIntegrityVerdict || "")}</td>
          <td>${esc(p.permanentProjectKey || "")}</td>
          <td>${reasonText(p) || esc((p.finalSelectionReasons || [])[0] || "")}</td>
        </tr>
      `
    )
    .join("");
}

function preConsensusRows(projects = [], emptyMessage = "No projects") {
  if (!projects.length) {
    return `
      <tr>
        <td colspan="10" class="empty">${esc(emptyMessage)}</td>
      </tr>
    `;
  }

  return projects
    .map(
      (p, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td>${esc(p.chain || p.finalChain || "")}</td>
          <td><strong>${esc(p.preConsensusOpportunityScore ?? p.regimeAdjustedOpportunityScore ?? "")}</strong></td>
          <td>${esc(p.preConsensusTier || "")}</td>
          <td>${esc(p.preConsensusCandidateType || "")}</td>
          <td>${esc(p.estimatedConsensusStage || "")}</td>
          <td>${esc(p.finalSelectionState || "")}</td>
          <td>${reasonText(p) || esc((p.topBullishSignals || []).slice(0, 3).join("; "))}</td>
        </tr>
      `
    )
    .join("");
}

function sniperRows(projects = [], emptyMessage = "No projects") {
  if (!projects.length) {
    return `
      <tr>
        <td colspan="10" class="empty">${esc(emptyMessage)}</td>
      </tr>
    `;
  }

  return projects
    .map(
      (p, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td>${esc(p.chain || p.finalChain || "")}</td>
          <td><strong>${esc(p.confidenceAdjustedSniperScore ?? p.sniperScore ?? "")}</strong></td>
          <td>${esc(p.sniperState || "")}</td>
          <td>${esc(p.sniperConfidence || "")}</td>
          <td>${esc(p.preConsensusGapScore ?? "")}</td>
          <td>${esc(p.pointInTimeStatus || p.sniperDataStatus || "")}</td>
          <td>${listText(p.sniperBlockingReasons || p.sniperReasons || [])}</td>
        </tr>
      `
    )
    .join("");
}

function causalNetworkRows(projects = [], emptyMessage = "No projects") {
  if (!projects.length) {
    return `
      <tr>
        <td colspan="11" class="empty">${esc(emptyMessage)}</td>
      </tr>
    `;
  }

  return projects
    .map(
      (p) => `
        <tr>
          <td>${esc(p.autonomousCausalNetworkRank ?? "")}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td>${esc(p.chain || p.finalChain || "")}</td>
          <td><strong>${esc(p.autonomousCausalNetworkScore ?? "")}</strong></td>
          <td>${esc(p.autonomousCausalProjectState || "")}</td>
          <td>${esc(p.autonomousCausalNetworkVerdict || "")}</td>
          <td>${esc(p.autonomousCausalAlphaNetwork?.causalSequence?.sequenceScore ?? "")}</td>
          <td>${esc(p.causalEvidenceFragility || "")}</td>
          <td>${esc(p.causalPatternSuccessRate ?? "")}% / ${esc(p.causalPatternSampleSize ?? "")}</td>
          <td>${esc(p.autonomousCausalAlphaNetwork?.hypothesis?.nextRequiredConfirmation || "")}</td>
        </tr>
      `
    )
    .join("");
}

export function writeHtmlReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects].sort((a, b) => scoreOf(b) - scoreOf(a));
  const qualifiedCandidates = ranked.filter(qualifiedForDashboard);
  const executionVerifiedCandidates = qualifiedCandidates.filter(
    (project) => project.executionVerifiedSelected || project.proofOfAlphaExecutionTwinSelected
  );
  const researchLeads = ranked.filter((project) => project.finalSelectionState === "RESEARCH_ONLY");
  const blockedCandidates = ranked.filter((project) => project.finalSelectionState === "BLOCKED");
  const identityConflicts = ranked.filter((project) => project.finalSelectionState === "IDENTITY_CONFLICT");
  const insufficientData = ranked.filter((project) => project.finalSelectionState === "INSUFFICIENT_DATA");
  const preConsensusRanked = ranked
    .filter((project) => project.preConsensusBreakoutHunter)
    .sort((a, b) => Number(b.regimeAdjustedOpportunityScore || 0) - Number(a.regimeAdjustedOpportunityScore || 0));
  const exceptionalPreConsensus = preConsensusRanked.filter(
    (project) => project.finalSelectionQualified && project.preConsensusTier === "Exceptional Pre-Consensus Candidate"
  );
  const highConvictionPreConsensus = preConsensusRanked.filter(
    (project) => project.finalSelectionQualified && project.preConsensusTier === "High-Conviction Research Candidate"
  );
  const quietAccumulationSetups = preConsensusRanked.filter((project) => project.quietAccumulationDetected);
  const upcomingCatalystSetups = preConsensusRanked.filter((project) => (project.catalystTimeline || []).length);
  const newNativePoolSetups = preConsensusRanked.filter((project) => project.normalizedNativePool || project.nativeLifecycle);
  const developerAccelerationSetups = preConsensusRanked.filter(
    (project) => Number(project.developerActivityScore ?? project.developerScore ?? 0) >= 60 || Number(project.githubProScore || 0) >= 60
  );
  const smartWalletAccumulationSetups = preConsensusRanked.filter(
    (project) => Number(project.smartWalletAccumulationScore || project.smartMoneyAccumulationScore || 0) >= 60
  );
  const narrativesForming = preConsensusRanked.filter(
    (project) => Number(project.narrativeHeatScore || project.narrativeForecastScore || 0) >= 60
  );
  const neglectedReaccelerationSetups = preConsensusRanked.filter(
    (project) => project.preConsensusCandidateType === "NEGLECTED_REACCELERATION"
  );
  const alreadyPumpedSetups = preConsensusRanked.filter((project) =>
    ["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage)
  );
  const sniperRanked = ranked
    .filter((project) => project.sniperIntegrityGate)
    .sort((a, b) => Number(b.confidenceAdjustedSniperScore || 0) - Number(a.confidenceAdjustedSniperScore || 0));
  const causalNetworkRanked = ranked
    .filter((project) => project.autonomousCausalAlphaNetwork)
    .sort((a, b) => Number(b.autonomousCausalNetworkScore || 0) - Number(a.autonomousCausalNetworkScore || 0));
  const causalNetworkArmed = causalNetworkRanked.filter((project) => project.autonomousCausalProjectState === "ARMED");
  const causalNetworkPriority = causalNetworkRanked.filter(
    (project) => project.autonomousCausalNetworkVerdict === "Causal Network Priority Research"
  );
  const causalNetworkLowFragility = causalNetworkRanked.filter((project) => project.causalEvidenceFragility === "Low");
  const armedSniperCandidates = sniperRanked.filter((project) => project.sniperQualified && project.sniperState === "ARMED");
  const sniperQuietAccumulation = sniperRanked.filter((project) => project.sniperState === "QUIET_ACCUMULATION");
  const sniperFundamentalsAccelerating = sniperRanked.filter((project) => project.sniperState === "FUNDAMENTALS_ACCELERATING");
  const sniperEarlyDeveloperSignals = sniperRanked.filter(
    (project) => Number(project.developerAccelerationScore || project.developerActivityScore || project.githubProScore || 0) >= 60
  );
  const sniperSmartWalletAccumulation = sniperRanked.filter((project) => Number(project.smartWalletAccumulationScore || 0) >= 60);
  const sniperLiquidityForming = sniperRanked.filter((project) => Number(project.liquidityFormationScore || 0) >= 60);
  const sniperVerifiedCatalysts = sniperRanked.filter((project) => Number(project.catalystQualityScore || project.liveCatalystRadarScore || 0) >= 60);
  const sniperPrelaunchResearch = sniperRanked.filter(
    (project) => project.preConsensusCandidateType === "PRE_LAUNCH" || project.discoveryLane === "prelaunch"
  );
  const sniperNeglectedReacceleration = sniperRanked.filter(
    (project) => project.preConsensusCandidateType === "NEGLECTED_REACCELERATION" || project.legitimateReacceleration
  );
  const sniperDevelopingSignals = sniperRanked.filter((project) =>
    ["FORMING", "EARLY_BUILD", "LIQUIDITY_FORMING"].includes(project.sniperState)
  );
  const sniperLateChase = sniperRanked.filter((project) => project.sniperState === "LATE_CHASE");
  const sniperDistressed = sniperRanked.filter((project) => ["DISTRESSED", "RECOVERY_ATTEMPT"].includes(project.sniperState));
  const sniperBlocked = sniperRanked.filter((project) => (project.sniperBlockingReasons || []).length);
  const sniperIdentityConflicts = sniperRanked.filter((project) => project.finalSelectionState === "IDENTITY_CONFLICT" || project.identityConflict);
  const sniperInsufficientData = sniperRanked.filter((project) => project.sniperDataStatus === "INSUFFICIENT");
  const smallCapPicks = qualifiedCandidates
    .filter((project) => project.smallCapHunterSelected)
    .sort((a, b) => Number(a.smallCapHunterSelectionRank || 999) - Number(b.smallCapHunterSelectionRank || 999));
  const executionTwinPicks = qualifiedCandidates
    .filter((project) => project.proofOfAlphaExecutionTwinSelected)
    .sort((a, b) => Number(a.proofOfAlphaExecutionTwinRank || 999) - Number(b.proofOfAlphaExecutionTwinRank || 999));
  const confidenceRanked = [...projects].sort(
    (a, b) => Number(b.confidenceAdjustedScore || 0) - Number(a.confidenceAdjustedScore || 0)
  );
  const top = ranked[0];
  const avg =
    ranked.length === 0
      ? 0
      : ranked.reduce((sum, p) => sum + scoreOf(p), 0) / ranked.length;

  const rows = ranked
    .map((p, index) => {
      const score = scoreOf(p);
      const tier =
        score >= 90
          ? "Institutional"
          : score >= 80
          ? "Strong Buy"
          : score >= 70
          ? "Watchlist"
          : score >= 60
          ? "Speculative"
          : "Low Priority";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td>${esc(p.chain || "")}</td>
          <td><strong>${score.toFixed(1)}</strong></td>
          <td>${esc(p.finalSelectionState || "")}</td>
          <td>${esc(p.finalIntegrityVerdict || "")}</td>
          <td>${esc(p.finalIdentityState || "")}</td>
          <td>${esc(p.purchaseRouteConfirmed ? "yes" : "no")}</td>
          <td>${esc(p.executionRouteAvailable ? "yes" : "no")}</td>
          <td>${reasonText(p)}</td>
          <td>${esc(p.confidence || "")}</td>
          <td>${esc(p.dataConfidence || "")}</td>
          <td>${esc(p.conviction || "")}</td>
          <td>${esc(p.allocationBucket || "")}</td>
          <td>${esc(p.executionPlan?.action || "")}</td>
          <td>${esc(tier)}</td>
          <td>${esc(p.aiDecision || "")}</td>
          <td>${esc(p.proofScore ?? "")}</td>
          <td>${esc(p.proofVerdict || "")}</td>
          <td>${esc(p.proofCarryingAlphaContractRank ?? "")}</td>
          <td>${esc(p.proofCarryingAlphaContractScore ?? "")}</td>
          <td>${esc(p.proofCarryingAlphaContractVerdict || "")}</td>
          <td>${esc(p.proofCarryingAlphaContract?.confidenceNow || "")}</td>
          <td>${esc(p.alphaEvolutionGovernorRank ?? "")}</td>
          <td>${esc(p.alphaEvolutionGovernorScore ?? "")}</td>
          <td>${esc(p.alphaEvolutionGovernorVerdict || "")}</td>
          <td>${esc(p.alphaEvolutionGovernor?.actionPlan?.primaryAction || "")}</td>
          <td>${esc(p.smallCapHunterSelectionRank ?? "")}</td>
          <td>${esc(p.smallCapHunterScore ?? "")}</td>
          <td>${esc(p.smallCapHunterVerdict || "")}</td>
          <td>${esc(p.smallCapBand || "")}</td>
          <td>${esc(p.smallCapHunter?.purchaseRoute?.preferredRoute || "")}</td>
          <td>${esc(p.smallCapHunter?.purchaseRoute?.status || "")}</td>
          <td>${esc(p.smallCapHunter?.paperPlan?.totalPaperBudgetUsd ?? "")}</td>
          <td>${esc(p.proofOfAlphaExecutionTwinRank ?? "")}</td>
          <td>${esc(p.proofOfAlphaExecutionTwinScore ?? "")}</td>
          <td>${esc(p.proofOfAlphaExecutionTwinVerdict || "")}</td>
          <td>${esc(p.proofOfAlphaExecutionTwinRoute || "")}</td>
          <td>${esc(p.proofOfAlphaExecutionTwinSlippagePct ?? "")}</td>
          <td>${esc(p.confidenceAdjustedRank ?? "")}</td>
          <td>${esc(p.confidenceAdjustedScore ?? "")}</td>
          <td>${esc(p.narrativeHeatScore ?? "")}</td>
          <td>${esc(p.narrativeHeatState || "")}</td>
          <td>${esc(p.projectChangeState || "")}</td>
          <td>${esc(p.sourceReliabilityScore ?? "")}</td>
          <td>${esc(p.trapRiskScore ?? "")}</td>
          <td>${esc(p.trapRiskLevel || "")}</td>
          <td>${esc(p.aiEcosystemScore ?? "")}</td>
          <td>${esc(p.aiEcosystemVerdict || "")}</td>
          <td>${esc(p.localAIVerdict || p.localAIStatus || "")}</td>
          <td>${esc(p.localAIResearchDecision || "")}</td>
          <td>${esc(p.localAIConfidence ?? "")}</td>
          <td>${esc(p.localAICoverage ?? "")}</td>
          <td>${esc(p.localAIAdjustment ?? "")}</td>
          <td>${esc(p.strongBuyLifecycleStage || "")}</td>
          <td>${esc(p.multiTimeframeIntelligence?.bestHorizon || "")}</td>
          <td>${esc(p.redTeamReview?.status || "")}</td>
          <td>${esc(p.aiDisagreement?.level || "")}</td>
          <td>${esc(p.alphaLabStatus || "")}</td>
          <td>${esc(p.institutionalVNextScore ?? "")}</td>
          <td>${esc(p.xSocialScore ?? "")}</td>
          <td>${esc(p.externalSignalScore ?? "")}</td>
          <td>${esc(p.learningEdgeScore ?? "")}</td>
          <td>${esc(p.outcomeLearningScore ?? "")}</td>
          <td>${esc(p.prePumpPatternMatchPct ?? "")}</td>
          <td>${esc(p.signalCombinationScore ?? "")}</td>
          <td>${esc(p.calibrationAdjustment ?? "")}</td>
          <td>${esc(p.quantumOpportunityScore ?? "")}</td>
          <td>${esc(p.quantumFieldState || "")}</td>
          <td>${esc(p.narrative || "")}</td>
          <td>${esc(p.riskScore ?? "")}</td>
          <td>${listText(p.topEvidence || [])}</td>
          <td>${listText(p.topRisks || [])}</td>
          <td>${scoreBreakdownText(p)}</td>
          <td>${esc(p.whyThisMatters || "")}</td>
          <td>${esc(p.explainabilitySummary || p.aiThesis?.memo || p.opportunityThesis || "")}</td>
        </tr>
      `;
    })
    .join("");

  const intelligenceRows = confidenceRanked
    .slice(0, 12)
    .map(
      (p) => `
        <tr>
          <td>${esc(p.confidenceAdjustedRank ?? "")}</td>
          <td>${esc(p.name || "Unknown")}</td>
          <td>${esc(p.symbol || "")}</td>
          <td><strong>${esc(p.confidenceAdjustedScore ?? "")}</strong></td>
          <td>${esc(p.pipelineScore ?? p.opportunityScore ?? "")}</td>
          <td>${esc(p.dataConfidence || "")}</td>
          <td>${esc(p.narrativeHeatScore ?? "")}</td>
          <td>${esc(p.projectChangeState || "")}</td>
          <td>${esc(p.sourceReliabilityScore ?? "")}</td>
          <td>${esc(p.trapRiskScore ?? "")}</td>
          <td>${esc(p.trapRiskLevel || "")}</td>
          <td>${esc(p.aiEcosystemVerdict || "")}</td>
          <td>${esc(p.strongBuyLifecycleStage || "")}</td>
          <td>${esc(p.multiTimeframeIntelligence?.bestHorizon || "")}</td>
        </tr>
      `
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Crypto Launch Intelligence Report</title>
  <style>
    body {
      background: #050b12;
      color: #e8f6ff;
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 30px;
    }

    h1 {
      color: #39ff88;
      margin-bottom: 5px;
    }

    .subtitle {
      color: #8aa0b5;
      margin-bottom: 30px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }

    .card {
      background: #0c1624;
      border: 1px solid #1d344d;
      border-radius: 12px;
      padding: 18px;
    }

    .card h2 {
      margin: 0;
      color: #39ff88;
      font-size: 28px;
    }

    .card p {
      color: #8aa0b5;
      margin: 6px 0 0;
    }

    .warning {
      background: #241707;
      border: 1px solid #8a5a13;
      color: #ffd991;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 14px;
    }

    .empty {
      color: #8aa0b5;
      text-align: center;
      padding: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #0c1624;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 28px;
    }

    h2.section-title {
      margin: 30px 0 12px;
      color: #e8f6ff;
      font-size: 20px;
    }

    th {
      background: #102033;
      color: #39ff88;
      text-align: left;
      padding: 12px;
      font-size: 13px;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #1d344d;
      font-size: 13px;
      vertical-align: top;
    }

    tr:hover {
      background: #12243a;
    }

    .footer {
      margin-top: 25px;
      color: #8aa0b5;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>Crypto Launch Intelligence</h1>
  <div class="subtitle">AI-powered early opportunity discovery report</div>
  <div class="warning">
    Research leads have not passed final identity, liquidity, execution, risk, and purchase-route validation.
  </div>

  <div class="cards">
    <div class="card">
      <h2>${ranked.length}</h2>
      <p>Projects Scanned</p>
    </div>

    <div class="card">
      <h2>${avg.toFixed(1)}</h2>
      <p>Average Score</p>
    </div>

    <div class="card">
      <h2>${top ? scoreOf(top).toFixed(1) : "N/A"}</h2>
      <p>Top Score</p>
    </div>

    <div class="card">
      <h2>${qualifiedCandidates.length}</h2>
      <p>Qualified Candidates</p>
    </div>

    <div class="card">
      <h2>${smallCapPicks.map((p) => esc(p.symbol || p.name || "N/A")).join(" / ") || "N/A"}</h2>
      <p>Qualified Small-Cap Candidates</p>
    </div>

    <div class="card">
      <h2>${executionTwinPicks.map((p) => esc(p.symbol || p.name || "N/A")).join(" / ") || "N/A"}</h2>
      <p>Execution-Verified Candidates</p>
    </div>

    <div class="card">
      <h2>${researchLeads.length}</h2>
      <p>Research Leads - Not Validated</p>
    </div>

    <div class="card">
      <h2>${blockedCandidates.length}</h2>
      <p>Blocked Candidates</p>
    </div>

    <div class="card">
      <h2>${identityConflicts.length}</h2>
      <p>Identity Conflicts</p>
    </div>

    <div class="card">
      <h2>${insufficientData.length}</h2>
      <p>Insufficient-Data Candidates</p>
    </div>

    <div class="card">
      <h2>${preConsensusRanked.length}</h2>
      <p>Pre-Consensus Analyzed</p>
    </div>

    <div class="card">
      <h2>${armedSniperCandidates.length}</h2>
      <p>ARMED Sniper Candidates</p>
    </div>

    <div class="card">
      <h2>${causalNetworkArmed.length}</h2>
      <p>Causal Network ARMED</p>
    </div>

    <div class="card">
      <h2>${causalNetworkLowFragility.length}</h2>
      <p>Low-Fragility Causal Cases</p>
    </div>
  </div>

  <h2 class="section-title">Autonomous Causal Alpha Network</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>State</th><th>Verdict</th><th>Sequence</th><th>Fragility</th><th>Pattern</th><th>Next Proof</th>
      </tr>
    </thead>
    <tbody>${causalNetworkRows(causalNetworkRanked.slice(0, 50), "No causal-network analysis yet")}</tbody>
  </table>

  <h2 class="section-title">Causal Network Priority Research</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>State</th><th>Verdict</th><th>Sequence</th><th>Fragility</th><th>Pattern</th><th>Next Proof</th>
      </tr>
    </thead>
    <tbody>${causalNetworkRows([...causalNetworkArmed, ...causalNetworkPriority].slice(0, 50), "No causal-network priority candidates")}</tbody>
  </table>

  <h2 class="section-title">Armed Sniper Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(armedSniperCandidates, "No ARMED sniper candidates currently exist")}</tbody>
  </table>

  <h2 class="section-title">Sniper Quiet Accumulation</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperQuietAccumulation.slice(0, 25), "No sniper quiet-accumulation setups")}</tbody>
  </table>

  <h2 class="section-title">Fundamentals Accelerating</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperFundamentalsAccelerating.slice(0, 25), "No fundamentals-accelerating sniper setups")}</tbody>
  </table>

  <h2 class="section-title">Early Developer Signals</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperEarlyDeveloperSignals.slice(0, 25), "No early developer signals")}</tbody>
  </table>

  <h2 class="section-title">Sniper Smart-Wallet Accumulation</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperSmartWalletAccumulation.slice(0, 25), "No smart-wallet sniper setups")}</tbody>
  </table>

  <h2 class="section-title">Liquidity Forming</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperLiquidityForming.slice(0, 25), "No liquidity-forming sniper setups")}</tbody>
  </table>

  <h2 class="section-title">Verified Upcoming Catalysts</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperVerifiedCatalysts.slice(0, 25), "No verified catalyst sniper setups")}</tbody>
  </table>

  <h2 class="section-title">Prelaunch Research</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperPrelaunchResearch.slice(0, 25), "No prelaunch research setups")}</tbody>
  </table>

  <h2 class="section-title">Sniper Neglected Reacceleration</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperNeglectedReacceleration.slice(0, 25), "No sniper neglected reacceleration setups")}</tbody>
  </table>

  <h2 class="section-title">Developing Signals</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperDevelopingSignals.slice(0, 25), "No developing sniper signals")}</tbody>
  </table>

  <h2 class="section-title">Late-Chase Projects</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperLateChase.slice(0, 25), "No late-chase sniper blocks")}</tbody>
  </table>

  <h2 class="section-title">Distressed Projects</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperDistressed.slice(0, 25), "No distressed sniper blocks")}</tbody>
  </table>

  <h2 class="section-title">Sniper Blocked Projects</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperBlocked.slice(0, 50), "No sniper-blocked projects")}</tbody>
  </table>

  <h2 class="section-title">Sniper Identity Conflicts</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperIdentityConflicts.slice(0, 25), "No sniper identity conflicts")}</tbody>
  </table>

  <h2 class="section-title">Sniper Insufficient Data</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Sniper</th><th>State</th><th>Confidence</th><th>Gap</th><th>Data</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${sniperRows(sniperInsufficientData.slice(0, 50), "No sniper insufficient-data projects")}</tbody>
  </table>

  <h2 class="section-title">Exceptional Pre-Consensus Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(exceptionalPreConsensus, "No exceptional pre-consensus candidates")}</tbody>
  </table>

  <h2 class="section-title">High-Conviction Research Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(highConvictionPreConsensus, "No high-conviction pre-consensus candidates")}</tbody>
  </table>

  <h2 class="section-title">Quiet Accumulation</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(quietAccumulationSetups.slice(0, 25), "No quiet accumulation setups")}</tbody>
  </table>

  <h2 class="section-title">Upcoming Catalysts</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(upcomingCatalystSetups.slice(0, 25), "No upcoming catalyst setups")}</tbody>
  </table>

  <h2 class="section-title">New Native Pools</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(newNativePoolSetups.slice(0, 25), "No native pool setups")}</tbody>
  </table>

  <h2 class="section-title">Developer Acceleration</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(developerAccelerationSetups.slice(0, 25), "No developer acceleration setups")}</tbody>
  </table>

  <h2 class="section-title">Smart-Wallet Accumulation</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(smartWalletAccumulationSetups.slice(0, 25), "No smart-wallet accumulation setups")}</tbody>
  </table>

  <h2 class="section-title">Narratives Forming</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(narrativesForming.slice(0, 25), "No narrative formation setups")}</tbody>
  </table>

  <h2 class="section-title">Neglected Reacceleration</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(neglectedReaccelerationSetups.slice(0, 25), "No neglected reacceleration setups")}</tbody>
  </table>

  <h2 class="section-title">Already Pumped</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Project</th><th>Symbol</th><th>Chain</th><th>Score</th><th>Tier</th><th>Type</th><th>Consensus</th><th>Final</th><th>Reasons</th>
      </tr>
    </thead>
    <tbody>${preConsensusRows(alreadyPumpedSetups.slice(0, 25), "No already-pumped setups")}</tbody>
  </table>

  <h2 class="section-title">Qualified Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Final State</th>
        <th>Final Verdict</th>
        <th>Permanent Key</th>
        <th>Reasons</th>
      </tr>
    </thead>
    <tbody>
      ${candidateRows(qualifiedCandidates)}
    </tbody>
  </table>

  <h2 class="section-title">Execution-Verified Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Final State</th>
        <th>Final Verdict</th>
        <th>Permanent Key</th>
        <th>Reasons</th>
      </tr>
    </thead>
    <tbody>
      ${candidateRows(executionVerifiedCandidates, "No execution-verified candidates")}
    </tbody>
  </table>

  <h2 class="section-title">Research Leads - Not Validated</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Final State</th>
        <th>Final Verdict</th>
        <th>Permanent Key</th>
        <th>Reasons</th>
      </tr>
    </thead>
    <tbody>
      ${candidateRows(researchLeads, "No research leads")}
    </tbody>
  </table>

  <h2 class="section-title">Blocked Candidates</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Final State</th>
        <th>Final Verdict</th>
        <th>Permanent Key</th>
        <th>Reasons</th>
      </tr>
    </thead>
    <tbody>
      ${candidateRows([...blockedCandidates, ...identityConflicts, ...insufficientData], "No blocked candidates")}
    </tbody>
  </table>

  <h2 class="section-title">Institutional Confidence Ranking</h2>
  <table>
    <thead>
      <tr>
        <th>Adj Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Adj Score</th>
        <th>Score</th>
        <th>Data</th>
        <th>Heat</th>
        <th>Change</th>
        <th>Source</th>
        <th>Trap</th>
        <th>Trap Level</th>
        <th>AI Council</th>
        <th>Lifecycle</th>
        <th>Horizon</th>
      </tr>
    </thead>
    <tbody>
      ${intelligenceRows}
    </tbody>
  </table>

  <h2 class="section-title">Full Scanner Results</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Final State</th>
        <th>Final Verdict</th>
        <th>Identity State</th>
        <th>Route</th>
        <th>Execution</th>
        <th>Final Reasons</th>
        <th>Confidence</th>
        <th>Data</th>
        <th>Conviction</th>
        <th>Bucket</th>
        <th>Action</th>
        <th>Tier</th>
        <th>AI Decision</th>
        <th>Proof</th>
        <th>Proof Verdict</th>
        <th>Contract Rank</th>
        <th>Contract Score</th>
        <th>Contract Verdict</th>
        <th>Contract Confidence</th>
        <th>Governor Rank</th>
        <th>Governor Score</th>
        <th>Governor Verdict</th>
        <th>Governor Action</th>
        <th>Small Cap Rank</th>
        <th>Small Cap Score</th>
        <th>Small Cap Verdict</th>
        <th>Cap Band</th>
        <th>Purchase Route</th>
        <th>Route Status</th>
        <th>Paper Budget</th>
        <th>Exec Rank</th>
        <th>Exec Score</th>
        <th>Exec Verdict</th>
        <th>Exec Route</th>
        <th>Exec Slippage</th>
        <th>Adj Rank</th>
        <th>Adj Score</th>
        <th>Heat</th>
        <th>Heat State</th>
        <th>Change</th>
        <th>Source</th>
        <th>Trap</th>
        <th>Trap Level</th>
        <th>AI Score</th>
        <th>AI Council</th>
        <th>Local AI Verdict</th>
        <th>Local AI Decision</th>
        <th>Local AI Confidence</th>
        <th>Local AI Coverage</th>
        <th>Local AI Adjustment</th>
        <th>Lifecycle</th>
        <th>Horizon</th>
        <th>Red Team</th>
        <th>Disagree</th>
        <th>Alpha Lab</th>
        <th>vNext</th>
        <th>X Social</th>
        <th>External</th>
        <th>Learning</th>
        <th>Outcome</th>
        <th>Pattern</th>
        <th>Combos</th>
        <th>Calibration</th>
        <th>Quantum</th>
        <th>Field</th>
        <th>Narrative</th>
        <th>Risk</th>
        <th>Top Evidence</th>
        <th>Top Risks</th>
        <th>Breakdown</th>
        <th>Why It Matters</th>
        <th>AI Thesis</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    Generated ${new Date().toLocaleString()}
  </div>
</body>
</html>
`.trim();

  const filePath = path.join(reportsDir, "report.html");
  fs.writeFileSync(filePath, html);

  return filePath;
}
