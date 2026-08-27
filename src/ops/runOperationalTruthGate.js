import { runOperationalTruthGate } from "./operationalTruthGate.js";

const scopeArg = process.argv.find((value) => value.startsWith("--scope="));
const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeArg?.slice("--scope=".length) || (scopeIndex >= 0 ? process.argv[scopeIndex + 1] : null) || "production-shadow";
const report = runOperationalTruthGate({ scope });
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 2;
