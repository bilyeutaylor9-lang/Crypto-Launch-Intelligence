import fs from "node:fs";
import path from "node:path";

import { loadEdgeProductionEpisodes } from "../learning/edgeProductionEpisodeStore.js";
import { loadEdgeEvidenceOutcomes } from "../learning/edgeEvidenceOutcomeStore.js";
import { runEdgeEvidenceHealth } from "../learning/edgeEvidenceHealthGovernor.js";
import { runEdgeEvidenceOutcomeLab } from "../learning/edgeEvidenceOutcomeLab.js";
import { runEdgeFailureAutopsy } from "../learning/edgeFailureAutopsy.js";
import { runEdgeMechanismContrast } from "../learning/edgeMechanismContrastLab.js";
import { runEdgeDiscoveryLoop } from "../learning/edgeDiscoveryLoop.js";
import { runEdgeResearchAutopilot } from "../learning/edgeResearchAutopilot.js";
import { runAvoidanceEdgeVerification } from "../learning/avoidanceEdgeVerificationLab.js";
import { runProspectiveEntryEdgeLab } from "../learning/prospectiveEntryEdgeLab.js";
import { loadAcquisitionHealthGate } from "../diagnostics/acquisitionHealthGate.js";

function readJson(file) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) return null;
  try { return JSON.parse(fs.readFileSync(absolute, "utf8")); } catch { return null; }
}

export function runEdgeEvidenceTruthCycle(options = {}) {
  const episodes = options.episodes || loadEdgeProductionEpisodes(options.episodeStore || {});
  const outcomes = options.outcomes || loadEdgeEvidenceOutcomes(options.outcomeStore || {});
  const probeReport = options.probeReport || readJson("reports/edge-evidence-probe.json");
  const health = runEdgeEvidenceHealth(episodes, outcomes, { ...options.health, probeReport });
  const outcomeLab = runEdgeEvidenceOutcomeLab(episodes, outcomes, health, options.outcomeLab || {});
  const autopsy = runEdgeFailureAutopsy(outcomeLab, options.autopsy || {});
  const contrast = runEdgeMechanismContrast(outcomeLab, options.contrast || {});
  const avoidanceVerification = runAvoidanceEdgeVerification(options.avoidance || {});
  const prospectiveEntryEdge = runProspectiveEntryEdgeLab(options.prospectiveEntry || {});
  const acquisitionHealth = options.acquisitionHealth || loadAcquisitionHealthGate(options.acquisitionHealthOptions || {});
  const discovery = runEdgeDiscoveryLoop({ health, outcomeLab, autopsy, contrast }, options.discovery || {});
  const autopilot = runEdgeResearchAutopilot({
    acquisitionHealth,
    health,
    outcomeLab,
    autopsy,
    contrast,
    avoidanceVerification,
    prospectiveEntryEdge,
    discovery,
  }, options.autopilot || {});
  return {
    episodes: episodes.length,
    outcomes: outcomes.length,
    acquisitionHealth,
    health,
    outcomeLab,
    autopsy,
    contrast,
    avoidanceVerification,
    prospectiveEntryEdge,
    discovery,
    autopilot,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runEdgeEvidenceTruthCycle();
    console.log(JSON.stringify({
      episodes: result.episodes,
      outcomes: result.outcomes,
      acquisitionHealthState: result.acquisitionHealth.state,
      evidenceHealthState: result.health.state,
      edgeVerificationState: result.outcomeLab.verification.state,
      avoidanceVerificationState: result.avoidanceVerification.state,
      prospectiveEntryEdgeState: result.prospectiveEntryEdge.state,
      autopilotState: result.autopilot.state,
      nextMechanism: result.autopilot.nextMechanism,
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
