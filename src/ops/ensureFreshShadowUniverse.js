import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { evaluateOperationalTruth } from "./operationalTruthGate.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

const REFRESHABLE = new Set(["EXACT_CANDIDATE_UNIVERSE_MISSING", "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE",
  "EXACT_CANDIDATE_UNIVERSE_TIMESTAMP_INVALID", "EXACT_CANDIDATE_UNIVERSE_STALE"]);

export function refreshBoundedShadowUniverse({ run = execFileSync, timeoutMs = 12 * 60 * 1000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12 * 60 * 1000) throw new TypeError("Invalid bounded refresh timeout");
  // Run the existing scan:debug100 profile directly, so its deadline terminates
  // the scanner rather than leaving it behind an already-killed npm wrapper.
  run(process.execPath, ["src/index.js"], { stdio: "inherit", timeout: timeoutMs, killSignal: "SIGKILL",
    env: { ...process.env, PIPELINE_ENGINE_PROFILE: "tenx", LOCAL_AI_MODE: "OFF",
      DISCOVERY_SCAN_LIMIT: "100", WIDE_SCAN_LIMIT: "100", DISCOVERY_TARGET_CANDIDATES: "100",
      STANDARD_INTELLIGENCE_LIMIT: "100", INTELLIGENCE_PIPELINE_LIMIT: "100" } });
}

export async function ensureFreshShadowUniverse({ clock = () => new Date().toISOString(),
  loadUniverse = loadEdgeCandidateUniverse, refresh = refreshBoundedShadowUniverse,
  reportFile = "reports/shadow-universe-preflight.json", writeReport = true } = {}) {
  const check = () => {
    const now = clock();
    if (typeof now !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(Date.parse(now))) {
      throw new TypeError("Invalid shadow preflight clock");
    }
    return evaluateOperationalTruth({ universe: loadUniverse() }, { now, scope: "shadow-universe" });
  };
  const before = check();
  let refreshAttempted = false, after = before, refreshError = null;
  if (!before.pass && before.blockers.length && before.blockers.every(blocker => REFRESHABLE.has(blocker))) {
    refreshAttempted = true;
    try { await refresh(); }
    catch (error) { refreshError = error; }
    after = check();
  }
  const report = { schemaVersion: 1, status: !refreshError && after.pass ? "PASS" : "FAIL",
    refreshAttempted, before, after, refreshFailure: refreshError ? String(refreshError.message) : null,
    automaticTrading: false, automaticPromotion: false };
  if (writeReport) writeAtomicJson(reportFile, report);
  if (report.status !== "PASS") {
    const error = new Error("EXACT_SHADOW_UNIVERSE_PREFLIGHT_FAILED:" +
      (after.blockers.join(",") || "REFRESH_FAILED"), refreshError ? { cause: refreshError } : undefined);
    error.report = report;
    throw error;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await ensureFreshShadowUniverse(), null, 2)); }
  catch (error) { console.error(JSON.stringify(error.report || { status: "FAIL", error: error.message })); process.exitCode = 1; }
}
