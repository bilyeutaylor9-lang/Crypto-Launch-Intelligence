
import fs from "node:fs";
import { armCanaryPolicy } from "../canary/canaryPolicyStore.js";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
const governance = readJson(process.argv[2] || "reports/committed-loaded-vacuum-evidence-governor.json") || {};
const requested = readJson(process.argv[3] || "config/ignition-canary-policy.json") || {};
const result = armCanaryPolicy(requested, governance);
console.log(JSON.stringify(result, null, 2));
if (result.state !== "CANARY_POLICY_FROZEN") process.exitCode = 2;
