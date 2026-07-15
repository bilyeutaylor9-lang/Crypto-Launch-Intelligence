import fs from "fs";
import path from "path";
import { summarizeOrganicDemandIntegrity } from "../engines/organicDemandIntegrityEngine.js";

export function writeOrganicDemandIntegrityReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ...summarizeOrganicDemandIntegrity(projects),
    operatingRules: [
      "Do not promote raw holder count unless buyer, active-holder, and balance-depth proof exists.",
      "Treat approvals, transfers, reward claims, and repetitive calls separately from economic swaps.",
      "Require unique-trader ratio, repeat-wallet concentration, circular-flow, and trade-size-distribution proof before rewarding extreme transaction counts.",
      "Reconcile circulating supply, total supply, max supply, FDV, and market cap across sources before allowing a high valuation confidence score.",
      "Discount displayed liquidity when LP control, stablecoin reserves, and hard exit liquidity are unknown.",
      "Block high-confidence status when mint/admin/yield/supply-disagreement risk is unresolved.",
    ],
    lgnsLesson: "High liquidity, holders, and activity can describe a tradable anomaly rather than organic investment demand.",
  };
  const filePath = path.join(reportsDir, "organic-demand-integrity.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
