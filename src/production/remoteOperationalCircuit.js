import fs from "node:fs";
import path from "node:path";

import { writeAtomicJson } from "./atomicArtifactStore.js";

export const REMOTE_OPERATIONAL_CIRCUIT_FILE = "data/remote-operational-circuits.json";
const SCHEMA_VERSION = 1;
const MAX_BYTES = 16 * 1024;
const MAX_INCIDENTS = 64;
export const EGRESS_QUOTA_PROVIDER_CODE = "exceed_egress_quota";

function fileFor(options = {}) { return path.resolve(options.root || ".", REMOTE_OPERATIONAL_CIRCUIT_FILE); }

export function supabaseCircuitScope(config = {}) {
  const url = String(config.url || config.restUrl || "").replace(/\/rest\/v1\/?$/, "");
  let parsed;
  try { parsed = new URL(url); } catch { return ""; }
  // The project endpoint, not a credential, is the circuit identity.
  return `supabase:${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
}

function validIncident(value) {
  return value && typeof value === "object" && value.state === "REMOTE_EGRESS_OUTAGE" &&
    value.providerCode === EGRESS_QUOTA_PROVIDER_CODE && Number.isFinite(Date.parse(value.detectedAt || ""));
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

export function loadRemoteEgressCircuit(scope, options = {}) {
  if (!scope) return null;
  const incident = loadAll(options).incidents[scope];
  return incident ? { ...incident, detectedAt: new Date(Date.parse(incident.detectedAt)).toISOString() } : null;
}

export function openRemoteEgressCircuit(scope, options = {}) {
  if (!scope) return null;
  const state = loadAll(options);
  const incident = { state: "REMOTE_EGRESS_OUTAGE", providerCode: EGRESS_QUOTA_PROVIDER_CODE,
    detectedAt: options.now || new Date().toISOString() };
  state.incidents[scope] = incident;
  saveAll(state, options);
  return incident;
}

// Retain the empty snapshot so the latest operational cache records recovery
// instead of falling back to an older snapshot containing this incident.
export function clearRemoteEgressCircuit(scope, options = {}) {
  if (!scope) return;
  const state = loadAll(options);
  if (!Object.hasOwn(state.incidents, scope)) return;
  delete state.incidents[scope];
  saveAll(state, options);
}

export function isTrustedEgressQuota(error) {
  if ([error?.providerCode, error?.code].includes(EGRESS_QUOTA_PROVIDER_CODE)) return true;
  if (typeof error?.message !== "string") return false;
  return /^Service for this project is restricted due to the following violations:\s*[^.]*\bexceed_egress_quota\b(?:[.,\s]|$)/i
    .test(error.message.trim());
}

export const __remoteOperationalCircuitHooks = { loadAll, fileFor, validIncident };
