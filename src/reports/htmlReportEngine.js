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

export function writeHtmlReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects].sort((a, b) => scoreOf(b) - scoreOf(a));
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
      <h2>${ranked.filter((p) => scoreOf(p) >= 80).length}</h2>
      <p>Strong Buy Candidates</p>
    </div>
  </div>

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
