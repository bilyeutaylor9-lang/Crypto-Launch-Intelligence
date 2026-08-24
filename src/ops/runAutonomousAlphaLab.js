import fs from "node:fs";
import { buildAlphaChallengerRegistry, discoverAlphaHypotheses, evaluateProspectiveExperiment, freezeProspectiveExperiments } from "../production/autonomousAlphaLab.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return fallback; } }

export function runAutonomousAlphaLab(options = {}) {
  const now = options.now || new Date().toISOString();
  const resolvedReport = options.resolvedReport || readJson("reports/production-shadow-resolved.json", {});
  const rows = resolvedReport.rows || [];
  const registryFile = "data/autonomous-alpha-experiments.json";
  const existing = options.experiments || readJson(registryFile, []);
  let experiments = existing; let discovered = [];
  const latestFrozenAt = existing.map((row) => Date.parse(row.frozenAt || 0)).filter(Number.isFinite).sort((a,b)=>b-a)[0] || 0;
  const discoveryIntervalMs = Number(options.discoveryIntervalHours || 168) * 3_600_000;
  const discoveryDue = !existing.length || options.forceDiscovery === true || Date.parse(now) - latestFrozenAt >= discoveryIntervalMs;
  if (discoveryDue && rows.length >= Number(options.minimumDiscoveryRows || 60)) {
    discovered = discoverAlphaHypotheses(rows, { targetReturnPct:25, minimumTreatmentSamples:20, minimumControlSamples:30, maxSignals:18, maxHypotheses:80, combinationSizes:[2,3], permutationIterations:700, fdrAlpha:0.05 });
    const knownKeys = new Set(existing.map((row) => JSON.stringify((row.definition?.signals || []).slice().sort())));
    const novel = discovered.filter((row) => !knownKeys.has(JSON.stringify((row.signals || []).slice().sort())));
    experiments = [...existing, ...freezeProspectiveExperiments(novel, { frozenAt:now, targetReturnPct:25, lossReturnPct:-20, horizonHours:24, minimumForwardTreatmentSamples:60, minimumForwardControlSamples:100, minimumWilsonLowerBound:0.50, minimumForwardReturnDeltaPct:3, fdrAlpha:0.05 })];
    discovered = novel;
  }
  const evaluated = experiments.map((experiment)=>evaluateProspectiveExperiment(experiment, rows));
  writeAtomicJson(registryFile, evaluated);
  const challengers = buildAlphaChallengerRegistry(evaluated, { now });
  writeAtomicJson("reports/autonomous-alpha-challengers.json", challengers);
  const report = { schemaVersion:1, generatedAt:now, discoveryRows:rows.length, newlyDiscoveredHypotheses:discovered.length, totalExperiments:evaluated.length,
    awaitingForwardEvidence:evaluated.filter((row)=>["FROZEN_AWAITING_FORWARD_EVIDENCE","FROZEN_PROSPECTIVE"].includes(row.state)).length,
    forwardVerified:evaluated.filter((row)=>row.state==="FORWARD_ALPHA_VERIFIED").length,
    forwardRejected:evaluated.filter((row)=>row.state==="FORWARD_ALPHA_REJECTED").length,
    experiments:evaluated, challengerRegistry:challengers,
    discoveryDue,
    nextDiscoveryEligibleAt: new Date((latestFrozenAt || Date.parse(now)) + discoveryIntervalMs).toISOString(),
    policy:{ dataMiningCorrection:"BENJAMINI_HOCHBERG_FDR", prospectiveFreezeRequired:true, discoverySampleCannotValidateSameHypothesis:true, duplicateHypothesesSuppressed:true, periodicDiscoveryHours:Number(options.discoveryIntervalHours || 168), automaticPromotion:false, automaticTrading:false } };
  writeAtomicJson("reports/autonomous-alpha-lab.json", report); return report;
}
if (import.meta.url === `file://${process.argv[1]}`) { try { const report=runAutonomousAlphaLab(); console.log(JSON.stringify({ totalExperiments:report.totalExperiments, awaitingForwardEvidence:report.awaitingForwardEvidence, forwardVerified:report.forwardVerified, forwardRejected:report.forwardRejected, challengers:report.challengerRegistry.verifiedExperiments },null,2)); } catch(error){ console.error(error); process.exitCode=1; } }
