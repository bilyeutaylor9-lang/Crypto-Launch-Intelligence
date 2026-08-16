import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { COMMITTED_LOADED_VACUUM_SIGNAL_VERSION } from "./committedLoadedVacuumObservationStore.js";

const FILE = path.resolve("data", "committed-loaded-vacuum-replication-plan.json");

export const REPLICATION_SPEC = Object.freeze({
  schemaVersion: 1,
  signalDefinitionVersion: COMMITTED_LOADED_VACUUM_SIGNAL_VERSION,
  treatment: "COMMITTED_LOADED_VACUUM_SHADOW",
  primaryOutcome: "+25% observed before -15% within 168h using future discrete outcome snapshots",
  confirmationOnlyAfterFrozenCutoff: true,
  sameChainMatchedControls: true,
  futureControlsForbidden: true,
  crossCodeVersionMatchingDefault: false,
  confirmationDefaults: Object.freeze({
    minResolvedTreatments: 50,
    minUniqueProjects: 25,
    minSpanDays: 28,
    minPositiveTimeBlockPct: 70,
    maxFalseIgnitionDeteriorationPct: 5,
  }),
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function replicationSpecHash(spec = REPLICATION_SPEC) {
  return crypto.createHash("sha256").update(stable(spec)).digest("hex");
}

function readPlan(file = FILE) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function loadCommittedLoadedVacuumReplicationPlan(options = {}) {
  return readPlan(options.file || FILE);
}

export function armCommittedLoadedVacuumReplicationPlan(validationReport = {}, observations = [], options = {}) {
  const file = options.file || FILE;
  const existing = readPlan(file);
  if (existing) return { state: "REPLICATION_PLAN_ALREADY_ARMED", plan: existing, wrote: false };
  const discoveryReady = validationReport?.promotion?.state === "REVIEW_FOR_INDEPENDENT_REPLICATION";
  if (!discoveryReady && options.forceArm !== true) return { state: "REPLICATION_NOT_ARMED_DISCOVERY_NOT_READY", plan: null, wrote: false };
  const times = (Array.isArray(observations) ? observations : []).map((row) => Date.parse(row?.observedAt || "")).filter(Number.isFinite);
  if (!times.length) return { state: "REPLICATION_NOT_ARMED_NO_FROZEN_OBSERVATIONS", plan: null, wrote: false };
  const cutoffObservedAt = new Date(Math.max(...times)).toISOString();
  const defaults = { ...REPLICATION_SPEC.confirmationDefaults, ...(options.confirmationDefaults || {}) };
  const plan = {
    schemaVersion: 1,
    armedAt: options.armedAt || new Date().toISOString(),
    cutoffObservedAt,
    signalDefinitionVersion: REPLICATION_SPEC.signalDefinitionVersion,
    signalSpecHash: replicationSpecHash(),
    discoveryValidationGeneratedAt: validationReport?.generatedAt || null,
    discoveryPromotionState: validationReport?.promotion?.state || null,
    discoveryMatchedRiskDifferenceLower95Pct: validationReport?.matchedRiskDifferenceBootstrap95?.lower95Pct ?? null,
    discoveryResolvedTreatments: validationReport?.treatedPerformance?.resolved ?? null,
    confirmationDefaults: defaults,
    immutable: true,
    policy: "The cutoff and signal specification are frozen before confirmation outcomes. Existing plans are never overwritten by this module. Confirmation data must be strictly post-cutoff.",
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return { state: "REPLICATION_PLAN_ARMED", plan, wrote: true };
}

export const COMMITTED_LOADED_VACUUM_REPLICATION_PLAN_FILE = FILE;
export const __committedLoadedVacuumReplicationPlanHooks = { stable, readPlan };
