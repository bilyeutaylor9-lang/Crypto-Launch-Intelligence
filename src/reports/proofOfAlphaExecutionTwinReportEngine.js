import fs from "fs";
import path from "path";
import { summarizeProofOfAlphaExecutionTwin } from "../engines/proofOfAlphaExecutionTwinEngine.js";

export function writeProofOfAlphaExecutionTwinReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeProofOfAlphaExecutionTwin(projects),
    operatingRules: [
      "Promote only paper-executable candidates with detected Coinbase or MetaMask-compatible route proof.",
      "Block candidates when route proof, liquidity depth, slippage, contract/pair proof, or safety checks fail.",
      "Treat every quote as a simulation until manually verified inside Coinbase or MetaMask.",
      "Feed paper execution outcomes back into future scan memory before trusting the pattern.",
    ],
    commandMap: {
      report: "npm run execution-twin",
      opScan: "npm run scan:op",
      smallCaps: "npm run small-caps",
      dashboard: "npm run dashboard",
    },
  };
  const filePath = path.join(reportsDir, "proof-of-alpha-execution-twin.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
