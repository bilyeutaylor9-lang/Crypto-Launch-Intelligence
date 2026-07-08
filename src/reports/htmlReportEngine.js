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

export function writeHtmlReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects].sort((a, b) => scoreOf(b) - scoreOf(a));
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
          <td>${esc(p.conviction || "")}</td>
          <td>${esc(p.allocationBucket || "")}</td>
          <td>${esc(p.executionPlan?.action || "")}</td>
          <td>${esc(tier)}</td>
          <td>${esc(p.xSocialScore ?? "")}</td>
          <td>${esc(p.learningEdgeScore ?? "")}</td>
          <td>${esc(p.outcomeLearningScore ?? "")}</td>
          <td>${esc(p.signalCombinationScore ?? "")}</td>
          <td>${esc(p.calibrationAdjustment ?? "")}</td>
          <td>${esc(p.quantumOpportunityScore ?? "")}</td>
          <td>${esc(p.quantumFieldState || "")}</td>
          <td>${esc(p.narrative || "")}</td>
          <td>${esc(p.riskScore ?? "")}</td>
          <td>${esc(p.opportunityThesis || "")}</td>
        </tr>
      `;
    })
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

  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Project</th>
        <th>Symbol</th>
        <th>Chain</th>
        <th>Score</th>
        <th>Confidence</th>
        <th>Conviction</th>
        <th>Bucket</th>
        <th>Action</th>
        <th>Tier</th>
        <th>X Social</th>
        <th>Learning</th>
        <th>Outcome</th>
        <th>Combos</th>
        <th>Calibration</th>
        <th>Quantum</th>
        <th>Field</th>
        <th>Narrative</th>
        <th>Risk</th>
        <th>Thesis</th>
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
