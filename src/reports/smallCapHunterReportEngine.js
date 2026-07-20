import fs from "fs";
import path from "path";
import { summarizeSmallCapHunter } from "../engines/smallCapHunterEngine.js";

export function writeSmallCapHunterReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeSmallCapHunter(projects),
    operatingRules: [
      "Always surface two best-available small-cap research candidates when enough eligible projects exist.",
      "Keep small-cap opportunity quality separate from user accessibility and preferred venue convenience.",
      "Never treat this report as financial advice or a guaranteed buy list.",
      "Require manual verification of a legitimate exchange, wallet, DEX, aggregator, bridge, buy route, and sell route before any real trade.",
      "Require manual verification of contract, source identity, liquidity, slippage, unlocks, and jurisdiction before any real trade.",
      "Use the $100 plan as a paper simulation for small-account research sizing.",
    ],
    commandMap: {
      report: "npm run small-caps",
      opScan: "npm run scan:op",
      wideScan: "npm run scan:wide",
      dashboard: "npm run dashboard",
    },
  };
  const filePath = path.join(reportsDir, "small-cap-hunter.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
