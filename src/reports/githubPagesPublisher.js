import fs from "fs";
import path from "path";

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
  "sniper-report.json",
  "universe-ledger.json",
  "integrity-stack.json",
  "op-mode-readiness.json",
  "evidence-kernel.json",
  "source-truth.json",
  "github-intelligence-pro.json",
  "autonomous-research.json",
  "roadmap.json",
  "source-router.json",
  "engine-audit.json",
];

function copyIfExists(fileName = "") {
  const source = path.join(REPORTS_DIR, fileName);
  const target = path.join(DOCS_DIR, fileName);

  if (!fs.existsSync(source)) return false;

  fs.copyFileSync(source, target);
  return true;
}

function readJsonReport(fileName = "") {
  const filePath = path.join(REPORTS_DIR, fileName);

  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeLandingPage(copiedFiles = []) {
  const generatedAt = new Date().toISOString();
  const report = readJsonReport("report.json") || {};
  const council = readJsonReport("ai-council.json") || {};
  const researchOS = readJsonReport("research-os.json") || {};
  const simulationBrain = readJsonReport("simulation-brain.json") || {};
  const outcomeJudge = readJsonReport("outcome-judge.json") || {};
  const catalystRadar = readJsonReport("catalyst-radar.json") || {};
  const dossierSwarm = readJsonReport("dossier-swarm.json") || {};
  const commandCenter = readJsonReport("ai-command-center.json") || {};
  const warRoom = readJsonReport("portfolio-war-room.json") || {};
  const strategyLab = readJsonReport("strategy-lab.json") || {};
  const causalBrain = readJsonReport("causal-alpha-brain.json") || {};
  const alphaOS = readJsonReport("autonomous-alpha-os.json") || {};
  const alphaDashboardV2 = readJsonReport("alpha-dashboard-v2.json") || {};
  const paperLab = readJsonReport("paper-trading-lab.json") || {};
  const weightOptimizer = readJsonReport("weight-optimizer.json") || {};
  const breakoutBrain = readJsonReport("breakout-brain.json") || {};
  const highTechAlphaStack = readJsonReport("high-tech-alpha-stack.json") || {};
  const selfEvolvingAlphaOS = readJsonReport("self-evolving-alpha-os.json") || {};
  const alphaTheses = readJsonReport("alpha-theses.json") || {};
  const alphaContracts = readJsonReport("alpha-contracts.json") || {};
  const alphaKnowledgeGraph = readJsonReport("alpha-knowledge-graph.json") || {};
  const causalMarketTwin = readJsonReport("causal-market-twin.json") || {};
  const alphaEvolutionGovernor = readJsonReport("alpha-evolution-governor.json") || {};
  const smallCapHunter = readJsonReport("small-cap-hunter.json") || {};
  const executionTwin = readJsonReport("proof-of-alpha-execution-twin.json") || {};
  const organicIntegrity = readJsonReport("organic-demand-integrity.json") || {};
  const discoveryTruth = readJsonReport("discovery-truth.json") || {};
  const nativeDiscoveryMesh = readJsonReport("native-discovery-mesh.json") || {};
  const discoveryDecision = readJsonReport("discovery-decision-engine.json") || {};
  const sourceTruth = readJsonReport("source-truth.json") || {};
  const universeLedger = readJsonReport("universe-ledger.json") || {};
  const integrityStack = readJsonReport("integrity-stack.json") || {};
  const opModeReadiness = readJsonReport("op-mode-readiness.json") || {};
  const evidenceKernel = readJsonReport("evidence-kernel.json") || {};
  const githubPro = readJsonReport("github-intelligence-pro.json") || {};
  const autonomousResearch = readJsonReport("autonomous-research.json") || {};
  const sourceRouter = readJsonReport("source-router.json") || {};
  const audit = readJsonReport("engine-audit.json") || {};
  const topProject = report.projects?.[0] || {};
  const topWeightFamily = [...(weightOptimizer.families || [])].sort(
    (a, b) => Number(b.weight || 0) - Number(a.weight || 0)
  )[0];
  const topCouncil = council.strongBuyCandidates?.[0] || council.topCouncilSetups?.[0] || {};
  const topSimulation = simulationBrain.topSimulationCandidates?.[0] || {};
  const links = copiedFiles
    .filter((fileName) => fileName !== "report.html")
    .map((fileName) => `<a href="./${fileName}">${fileName}</a>`)
    .join("");
  const cards = [
    ["Projects", report.totalProjects ?? 0],
    ["AI Candidate", topCouncil.symbol || topProject.symbol || "N/A"],
    ["Council Score", topCouncil.score ?? topProject.aiEcosystemScore ?? "N/A"],
    ["Simulation", topSimulation.symbol || topProject.symbol || "N/A"],
    ["Breakout %", topSimulation.breakoutProbability30d ?? topProject.breakoutProbability30d ?? "N/A"],
    ["Outcome Judged", outcomeJudge.trackedProjects ?? topProject.outcomeJudgeStatus ?? "N/A"],
    ["Catalysts", catalystRadar.activeCatalystProjects ?? "N/A"],
    ["Dossiers", dossierSwarm.dossieredProjects ?? "N/A"],
    ["Alpha Cases", commandCenter.counts?.alphaCases ?? "N/A"],
    ["Top Narrative", warRoom.topNarratives?.[0]?.narrative || "N/A"],
    ["Strategy", strategyLab.topCandidates?.[0]?.bestStrategy || "N/A"],
    ["Causal Driver", causalBrain.topProjects?.[0]?.primaryDriver || "N/A"],
    ["Alpha OS", alphaOS.topCandidates?.[0]?.symbol || "N/A"],
    ["Paper Win %", paperLab.memory?.winRate ?? alphaDashboardV2.headline?.paperWinRate ?? "N/A"],
    [
      "Top Weight",
      topWeightFamily ? `${topWeightFamily.label} ${topWeightFamily.weight}x` : "N/A",
    ],
    ["Breakout Pick", breakoutBrain.topThree?.[0]?.symbol || "N/A"],
    ["Breakout Picks", breakoutBrain.selectedCount ?? "N/A"],
    ["High-Tech", highTechAlphaStack.topProjects?.[0]?.symbol || "N/A"],
    ["HT Candidates", highTechAlphaStack.alphaCandidates ?? "N/A"],
    ["Alpha OS Max", selfEvolvingAlphaOS.topProject?.symbol || "N/A"],
    ["Alpha Theses", alphaTheses.totalTheses ?? "N/A"],
    ["Alpha Contracts", alphaContracts.alphaCandidates ?? "N/A"],
    ["Contract Research", alphaContracts.priorityResearch ?? "N/A"],
    ["Contract Receipts", alphaContracts.publicReceipts?.length ?? "N/A"],
    ["Graph Pick", alphaKnowledgeGraph.topProjects?.[0]?.symbol || "N/A"],
    ["Graph Priority", alphaKnowledgeGraph.priorityResearch ?? "N/A"],
    ["Twin Pick", causalMarketTwin.topProjects?.[0]?.symbol || "N/A"],
    ["Twin EV", causalMarketTwin.topProjects?.[0]?.expectedReturnPct ?? "N/A"],
    ["Governor Priority", alphaEvolutionGovernor.counts?.priorityResearch ?? "N/A"],
    ["Governor Blocks", alphaEvolutionGovernor.counts?.riskBlocks ?? "N/A"],
    ["Small-Cap #1", smallCapHunter.topTwo?.[0]?.symbol || "N/A"],
    ["Small-Cap Route #1", smallCapHunter.topTwo?.[0]?.purchaseRoute?.preferredRoute || "N/A"],
    ["Small-Cap #2", smallCapHunter.topTwo?.[1]?.symbol || "N/A"],
    ["Small-Cap Route #2", smallCapHunter.topTwo?.[1]?.purchaseRoute?.preferredRoute || "N/A"],
    ["Execution Twin", executionTwin.topExecutions?.[0]?.symbol || "N/A"],
    ["Exec Route", executionTwin.topExecutions?.[0]?.route || "N/A"],
    ["Organic Blocks", organicIntegrity.institutionalBlocks ?? "N/A"],
    ["Discovery Sources", discoveryTruth.sourceCapabilityAudit?.enabledSources ?? "N/A"],
    ["Native Mesh", nativeDiscoveryMesh.summary?.candidateCount ?? nativeDiscoveryMesh.topCandidates?.length ?? "N/A"],
    ["Native Stage", nativeDiscoveryMesh.topCandidates?.[0]?.stage || "N/A"],
    ["Decision Pass", discoveryDecision.summary?.pass ?? "N/A"],
    ["Critical Risks", discoveryDecision.feeds?.criticalRisks?.length ?? "N/A"],
    ["Universe Ledger", universeLedger.persistentLedger?.trackedProjects ?? "N/A"],
    ["Ledger Promoted", universeLedger.persistentLedger?.totals?.promoted ?? "N/A"],
    ["Integrity Stack", integrityStack.status || "N/A"],
    ["Integrity Score", integrityStack.readinessScore ?? "N/A"],
    ["OP Mode", opModeReadiness.status || "N/A"],
    ["OP Score", opModeReadiness.score ?? "N/A"],
    ["Native Ready", opModeReadiness.native?.liveReadyProtocols ?? "N/A"],
    ["Missing Key Groups", opModeReadiness.keys?.missingGroups ?? "N/A"],
    ["Kernel ARMED", evidenceKernel.summary?.armed ?? "N/A"],
    ["Kernel Watch", evidenceKernel.summary?.watch ?? "N/A"],
    ["Kernel Score", evidenceKernel.summary?.averageFinalScore ?? "N/A"],
    ["Contract Pass", evidenceKernel.summary?.averageContractPassRate ?? "N/A"],
    ["Kernel Sources", evidenceKernel.summary?.sourcesWithUsableEvidence ?? "N/A"],
    ["Manifest Score", evidenceKernel.summary?.manifestScore ?? "N/A"],
    ["Fixture Pass", evidenceKernel.summary?.fixtureAuditPassRate ?? "N/A"],
    ["Source Truth", sourceTruth.topProjects?.[0]?.symbol || "N/A"],
    ["GitHub Pro", githubPro.topRepositories?.[0]?.symbol || "N/A"],
    ["Research Brain", autonomousResearch.topProjects?.[0]?.symbol || "N/A"],
    ["Best Source", sourceRouter.strongestSources?.[0]?.source || "N/A"],
    ["Quantum State", topProject.quantumDecisionState || topProject.quantumReasoningBrain?.decisionState || "N/A"],
    ["Research Queue", researchOS.researchQueue?.length ?? 0],
    ["Engines", audit.totalEngines ?? "N/A"],
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
          <li><strong>Engine Audit:</strong> transparent inventory of the scanner engine stack.</li>
        </ul>
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
        <a class="button" href="./organic-demand-integrity.json">Organic Integrity</a>
        <a class="button" href="./discovery-truth.json">Discovery Truth</a>
        <a class="button" href="./pre-consensus-breakout-hunter.json">Pre-Consensus</a>
        <a class="button" href="./sniper-report.json">Sniper</a>
        <a class="button" href="./source-truth.json">Source Truth</a>
        <a class="button" href="./github-intelligence-pro.json">GitHub Pro</a>
        <a class="button" href="./autonomous-research.json">Research Brain</a>
        <a class="button" href="./source-router.json">Source Router</a>
        <a class="button" href="./roadmap.json">Roadmap</a>
        <a class="button" href="./engine-audit.json">Engine Audit</a>
        <a class="button" href="./integrity-stack.json">Integrity Stack</a>
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

  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), html);
}

export function publishGithubPagesDashboard() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const copiedFiles = PUBLIC_REPORTS.filter(copyIfExists);
  writeLandingPage(copiedFiles);

  return {
    outputDir: DOCS_DIR,
    copiedFiles,
    urlPath: "docs/index.html",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = publishGithubPagesDashboard();
  console.log(JSON.stringify(result, null, 2));
}
