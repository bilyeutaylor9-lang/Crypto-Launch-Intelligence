import { runProductionSecurityAudit } from "../production/productionSecurityAudit.js";

const report = runProductionSecurityAudit();
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 2;
