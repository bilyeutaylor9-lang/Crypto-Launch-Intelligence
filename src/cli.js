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
  crypto-launch alpha-lab         Print Alpha Lab report
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
  case "alpha-lab":
    runNpm("alpha-lab", args);
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
