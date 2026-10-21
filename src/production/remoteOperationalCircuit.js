import fs from "node:fs";
import path from "node:path";

import { writeAtomicJson } from "./atomicArtifactStore.js";

export const REMOTE_OPERATIONAL_CIRCUIT_FILE = "data/remote-operational-circuits.json";
const SCHEMA_VERSION = 1;
const MAX_BYTES = 16 * 1024;
const MAX_INCIDENTS = 64;
export const EGRESS_QUOTA_PROVIDER_CODE = "exceed_egress_quota";
export const DATABASE_SIZE_QUOTA_PROVIDER_CODE = "exceed_db_size_quota";
const QUOTA_STATES = Object.freeze({
  [EGRESS_QUOTA_PROVIDER_CODE]: "REMOTE_EGRESS_OUTAGE",
  [DATABASE_SIZE_QUOTA_PROVIDER_CODE]: "REMOTE_DATABASE_SIZE_OUTAGE",
});

function restrictionMessage(providerCode) {
  return `Service for this project is restricted due to the following violations: ${providerCode}. ` +
    "The project owner must upgrade their plan or remove spend caps to restore service.";
}

function fileFor(options = {}) { return path.resolve(options.root || ".", REMOTE_OPERATIONAL_CIRCUIT_FILE); }

export function supabaseCircuitScope(config = {}) {
  const url = String(config.url || config.restUrl || "").replace(/\/rest\/v1\/?$/, "");
  let parsed;
  try { parsed = new URL(url); } catch { return ""; }
  // The project endpoint, not a credential, is the circuit identity.
  return `supabase:${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
}

function validIncident(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.providerCode === "string" && Object.hasOwn(QUOTA_STATES, value.providerCode) &&
    value.state === QUOTA_STATES[value.providerCode] &&
    Number.isFinite(Date.parse(value.detectedAt || ""));
}

function loadAll(options = {}) {
  const file = fileFor(options);
  if (!fs.existsSync(file)) return { schemaVersion: SCHEMA_VERSION, incidents: {} };
  if (fs.statSync(file).size > MAX_BYTES) throw new Error("Remote operational circuit state is too large.");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("Remote operational circuit state is malformed."); }
  if (value?.schemaVersion !== SCHEMA_VERSION || !value.incidents || typeof value.incidents !== "object" || Array.isArray(value.incidents) ||
      Object.keys(value.incidents).length > MAX_INCIDENTS || Object.entries(value.incidents).some(([scope, incident]) => !scope || !validIncident(incident))) {
    throw new Error("Remote operational circuit state is invalid.");
  }
  return value;
}

function saveAll(value, options = {}) {
  if (Object.keys(value.incidents).length > MAX_INCIDENTS ||
      Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`) > MAX_BYTES) {
    throw new Error("Remote operational circuit state exceeds its bounded limit.");
  }
  writeAtomicJson(fileFor(options), value);
}

export function loadRemoteOperationalCircuit(scope, options = {}) {
  if (!scope) return null;
  const incident = loadAll(options).incidents[scope];
  return incident ? { ...incident, detectedAt: new Date(Date.parse(incident.detectedAt)).toISOString() } : null;
}

export function openRemoteOperationalCircuit(scope, providerCode, options = {}) {
  if (!scope) return null;
  if (typeof providerCode !== "string" || !Object.hasOwn(QUOTA_STATES, providerCode)) throw new Error("Unknown remote quota provider code.");
  const state = loadAll(options);
  const incident = { state: QUOTA_STATES[providerCode], providerCode,
    detectedAt: options.now || new Date().toISOString() };
  state.incidents[scope] = incident;
  saveAll(state, options);
  return incident;
}

// Retain the empty snapshot so the latest operational cache records recovery
// instead of falling back to an older snapshot containing this incident.
export function clearRemoteOperationalCircuit(scope, options = {}) {
  if (!scope) return;
  const state = loadAll(options);
  if (!Object.hasOwn(state.incidents, scope)) return;
  delete state.incidents[scope];
  saveAll(state, options);
}

export function trustedRemoteQuotaProviderCode(error) {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  let trustedCode = null;
  for (const code of [error.providerCode, error.code]) {
    if (typeof code !== "string" || !Object.hasOwn(QUOTA_STATES, code)) continue;
    if (trustedCode && trustedCode !== code) return null;
    trustedCode = code;
  }
  if (typeof error.message === "string") {
    for (const code of Object.keys(QUOTA_STATES)) {
      if (error.message.trim() !== restrictionMessage(code)) continue;
      if (trustedCode && trustedCode !== code) return null;
      trustedCode = code;
    }
  }
  return trustedCode;
}

// Keep legacy egress consumers type-specific; a database-size incident is not egress.
export function loadRemoteEgressCircuit(scope, options = {}) {
  const incident = loadRemoteOperationalCircuit(scope, options);
  return incident?.providerCode === EGRESS_QUOTA_PROVIDER_CODE ? incident : null;
}

export function openRemoteEgressCircuit(scope, options = {}) {
  return openRemoteOperationalCircuit(scope, EGRESS_QUOTA_PROVIDER_CODE, options);
}

export function clearRemoteEgressCircuit(scope, options = {}) {
  if (loadRemoteEgressCircuit(scope, options)) clearRemoteOperationalCircuit(scope, options);
}

export function isTrustedEgressQuota(error) {
  return trustedRemoteQuotaProviderCode(error) === EGRESS_QUOTA_PROVIDER_CODE;
}

export const __remoteOperationalCircuitHooks = { loadAll, fileFor, validIncident };
