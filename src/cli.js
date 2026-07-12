#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const command = process.argv[2] || "help";
const args = process.argv.slice(3);

function runNpm(script = "", extraArgs = []) {
  const result = spawnSync("npm", ["run", script, ...extraArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  process.exit(result.status ?? 1);
}

function readJson(filePath = "") {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function explain(symbol = "") {
  const report = readJson(path.resolve("reports", "report.json"));

  if (!report?.projects?.length) {
    console.log("No report found. Run `crypto-launch demo` or `crypto-launch scan` first.");
    return;
  }

  const target = String(symbol || "").toLowerCase();
  const project = report.projects.find(
    (item) =>
      String(item.symbol || "").toLowerCase() === target ||
      String(item.name || "").toLowerCase() === target
  );

  if (!project) {
    console.log(`Project not found: ${symbol}`);
    return;
  }

  console.log(`${project.name || "Unknown"} (${project.symbol || "N/A"})`);
  console.log(`Score: ${project.pipelineScore || project.opportunityScore || 0}`);
  console.log(`AI Council: ${project.aiEcosystemVerdict || "Unknown"} (${project.aiEcosystemScore || 0})`);
  console.log(`Quantum: ${project.quantumDecisionState || "Unknown"} | Bull ${project.quantumBullProbability || 0}% / Bear ${project.quantumBearProbability || 0}%`);
  console.log(`Simulation: ${project.simulationDecision || "Unknown"} (${project.simulationBrainScore || 0}) | Breakout ${project.breakoutProbability30d || 0}% | 30d ${project.expectedReturn30dPct || 0}%`);
  console.log(`Outcome Judge: ${project.outcomeJudgeVerdict || "Unknown"} (${project.outcomeJudgeScore || 0}) | ${project.outcomeAdjustedConfidence || "Unknown"} confidence`);
  console.log(`Catalyst Radar: ${project.liveCatalystUrgency || "Low"} (${project.liveCatalystRadarScore || 0}) | ${project.liveCatalystEvents?.[0]?.type || "No catalyst"}`);
  console.log(`Dossier Swarm: ${project.dossierSwarmDecision || "Unknown"} (${project.dossierSwarmScore || 0}) | ${project.dossierSwarmConsensus || "No consensus"}`);
  console.log(`Lifecycle: ${project.strongBuyLifecycleStage || "Unknown"}`);
  console.log(`Why now: ${(project.whyNow?.whyThisProject || []).join(" ") || "No why-now summary."}`);
  console.log(`Invalidation: ${(project.whyNow?.invalidation || project.invalidationSignals || []).slice(0, 3).join(" ")}`);
}

function help() {
  console.log(`
Crypto Launch Intelligence

Commands:
  crypto-launch demo              Run no-key demo and generate example reports
  crypto-launch scan              Run the standard scanner
  crypto-launch wide              Run the 10,000-candidate wide scan
  crypto-launch dashboard         Open the HTML dashboard
  crypto-launch council           Print AI Council report
  crypto-launch research-os       Print Research OS report
  crypto-launch webcrawl          Run free web crawler research demo
  crypto-launch alpha-lab         Print Alpha Lab report
  crypto-launch simulation        Print Simulation Brain report
  crypto-launch outcome           Print Outcome Judge report
  crypto-launch catalysts         Print Live Catalyst Radar report
  crypto-launch dossier           Print Dossier Swarm report
  crypto-launch command-center    Print AI Command Center report
  crypto-launch commander         Print AI Research Commander report
  crypto-launch investigator      Print Alpha Investigator report
  crypto-launch war-room          Print Portfolio War Room report
  crypto-launch strategy-lab      Print Autonomous Strategy Lab report
  crypto-launch causal-brain      Print Causal Alpha Brain report
  crypto-launch alpha-os          Print Autonomous Alpha OS report
  crypto-launch alpha-dashboard   Print Alpha Dashboard v2 report
  crypto-launch paper-lab         Print Paper Trading Outcome Lab report
  crypto-launch weight-optimizer  Print Auto-Learning Weight Optimizer report
  crypto-launch source-truth      Print Source Truth report
  crypto-launch github-pro        Print GitHub Intelligence Pro report
  crypto-launch roadmap           Generate and print roadmap summary
  crypto-launch source-router     Print adaptive source router report
  crypto-launch github-discovery  Search free GitHub project discovery
  crypto-launch ai-discovery      Run AI discovery swarm
  crypto-launch audit             Run engine import health check
  crypto-launch explain SYMBOL    Explain a project from the latest report
`);
}

switch (command) {
  case "demo":
    runNpm("demo", args);
    break;
  case "scan":
    runNpm("scan", args);
    break;
  case "wide":
    runNpm("scan:wide", args);
    break;
  case "dashboard":
    runNpm("dashboard", args);
    break;
  case "council":
    runNpm("ai-council", args);
    break;
  case "research-os":
    runNpm("research-os", args);
    break;
  case "webcrawl":
  case "research-webcrawl":
    runNpm("research:webcrawl", args);
    break;
  case "alpha-lab":
    runNpm("alpha-lab", args);
    break;
  case "simulation":
  case "simulation-brain":
    runNpm("simulation-brain", args);
    break;
  case "outcome":
  case "outcome-judge":
    runNpm("outcome-judge", args);
    break;
  case "catalysts":
  case "catalyst-radar":
    runNpm("catalyst-radar", args);
    break;
  case "dossier":
  case "dossier-swarm":
    runNpm("dossier-swarm", args);
    break;
  case "command-center":
  case "ai-command-center":
    runNpm("ai-command-center", args);
    break;
  case "commander":
  case "research-commander":
    runNpm("research-commander", args);
    break;
  case "investigator":
  case "alpha-investigator":
    runNpm("alpha-investigator", args);
    break;
  case "war-room":
  case "portfolio-war-room":
    runNpm("portfolio-war-room", args);
    break;
  case "strategy-lab":
  case "strategies":
    runNpm("strategy-lab", args);
    break;
  case "causal-brain":
  case "causal-alpha":
    runNpm("causal-brain", args);
    break;
  case "alpha-os":
  case "autonomous-alpha-os":
    runNpm("alpha-os", args);
    break;
  case "alpha-dashboard":
  case "alpha-dashboard-v2":
  case "dashboard-v2":
    runNpm("alpha-dashboard-v2", args);
    break;
  case "paper-lab":
  case "paper-trading":
    runNpm("paper-lab", args);
    break;
  case "weight-optimizer":
  case "weights":
    runNpm("weight-optimizer", args);
    break;
  case "source-truth":
  case "truth":
    runNpm("source-truth", args);
    break;
  case "github-pro":
  case "github-intelligence":
    runNpm("github-pro", args);
    break;
  case "roadmap":
    runNpm("roadmap", args);
    break;
  case "source-router":
  case "router":
  case "sources":
    runNpm("source-router", args);
    break;
  case "github-discovery":
  case "github":
    runNpm("sources:github", args);
    break;
  case "ai-discovery":
  case "ai-swarm":
    runNpm("sources:ai-swarm", args);
    break;
  case "audit":
    runNpm("engine:audit", args);
    break;
  case "explain":
    explain(args[0] || "");
    break;
  default:
    help();
}
