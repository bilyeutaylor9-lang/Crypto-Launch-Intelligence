
import fs from "node:fs";
import { loadCanaryPolicy } from "../canary/canaryPolicyStore.js";
import { captureExecutableEdgeCanary } from "../canary/canaryCoordinator.js";

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function extractProjects(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}
const input = process.argv[2] || process.env.IGNITION_CANARY_INPUT || "reports/ignition-raw-sensors.json";
const payload = readJson(input);
const projects = extractProjects(payload || {});
const policy = loadCanaryPolicy();
const governance = readJson("reports/committed-loaded-vacuum-evidence-governor.json") || {};
if (!policy?.frozen) {
  console.error("V14 canary policy is not frozen. Run npm run ignition:canary:arm only after V13 governance eligibility.");
  process.exitCode = 2;
} else {
  const result = await captureExecutableEdgeCanary(projects, policy, governance, {
    maxCandidates: Number(process.env.IGNITION_CANARY_MAX_CANDIDATES || 20),
    persist: true,
  });
  console.log(JSON.stringify({ state: result.state, candidates: result.candidates, tickets: result.tickets.length, saved: result.saved, paperOnly: true }, null, 2));
}
