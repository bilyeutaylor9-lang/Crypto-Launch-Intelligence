import { isDeepStrictEqual } from "node:util";
import { getPath, resolveCanonicalAliases } from "./canonicalAliasResolver.js";
import { aliasesForCanonicalField } from "./canonicalFieldAliasRegistry.js";
import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

function putObservation(input, sourcePath, value) {
  const parts = sourcePath.split(".");
  if (sourcePath.length > 1024 || parts.length > 32 ||
      parts.some(part => !part || ["__proto__", "constructor", "prototype"].includes(part))) return false;
  let target = input;
  for (const part of parts.slice(0, -1)) {
    const child = Object.hasOwn(target, part) ? target[part] : undefined;
    if (child !== undefined && (!child || typeof child !== "object" || Array.isArray(child))) return false;
    target[part] = { ...child };
    target = target[part];
  }
  target[parts.at(-1)] = value;
  return true;
}

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

function observationIdentityMatches(item, resolved) {
  const chain = normalizeChainId(item.field === "chain" ? item.value : resolved.chain);
  const token = normalizeTokenAddress(item.field === "tokenAddress" ? item.value : resolved.tokenAddress, chain);
  const pool = normalizePoolAddress(item.field === "poolAddress" ? item.value : resolved.poolAddress, chain);
  const declared = names => names.map(name => item.provenance[name]).filter(present);
  return declared(["chain", "chainId", "network"]).every(value => chain && normalizeChainId(value) === chain) &&
    declared(["tokenAddress", "contractAddress"]).every(value => token && normalizeTokenAddress(value, chain) === token) &&
    declared(["poolAddress", "pairAddress"]).every(value => pool && normalizePoolAddress(value, chain) === pool);
}

export function resolveCanonicalObservationAliases(project = {}, options = {}) {
  const fields = [...new Set(["chain", "tokenAddress", "poolAddress", ...(options.fields || [])])];
  const resolution = resolveCanonicalAliases(project, { ...options, fields });
  const stored = [];
  for (const field of fields) {
    if (Object.hasOwn(project, field) || present(resolution.resolved[field]) ||
        !Object.hasOwn(project.canonicalAliases || {}, field)) continue;
    const value = project.canonicalAliases[field];
    if (!present(value) || aliasesForCanonicalField(field).some(alias => getPath(project, alias) !== undefined)) continue;
    // Provenance belongs to this stored value, not a partial current observation.
    const provenance = project.canonicalAliasProvenance?.[field] || project.fieldProvenance?.[field] || {};
    const sourcePath = typeof provenance.sourcePath === "string" && provenance.sourcePath ? provenance.sourcePath : field;
    stored.push({ field, value, provenance, sourcePath,
      timestamp: provenance.sourceTimestamp ?? provenance.observedAt ?? provenance.timestamp ?? null });
  }
  if (!stored.length) return resolution;
  const byPath = new Map();
  for (const item of stored) byPath.set(item.sourcePath, [...(byPath.get(item.sourcePath) || []), item]);
  const conflicted = new Set();
  for (const [sourcePath, items] of byPath) {
    if (items.every(item => isDeepStrictEqual(item.value, items[0].value))) continue;
    for (const item of items) {
      conflicted.add(item.field);
      resolution.conflicts[item.field] = items.map(other => ({ canonicalField: other.field,
        canonicalValue: other.value, sourcePath, sourceTimestamp: other.timestamp,
        reason: "Conflicting stored observations share one source path." }));
    }
  }
  const identityFields = ["chain", "tokenAddress", "poolAddress"];
  const identityInput = { ...project };
  for (const item of stored) {
    if (identityFields.includes(item.field) && !conflicted.has(item.field)) identityInput[item.field] = item.value;
  }
  const identity = resolveCanonicalAliases(identityInput, { ...options, fields: identityFields });
  for (const field of identityFields) {
    if (!present(resolution.resolved[field]) || present(identity.resolved[field])) continue;
    resolution.conflicts[field] = [...(resolution.conflicts[field] || []), { canonicalField: field,
      canonicalValue: resolution.resolved[field], reason: "Stored identity evidence is incompatible with this address." }];
    resolution.resolved[field] = null;
    if (resolution.provenance[field]) resolution.provenance[field].validationStatus = "INVALID";
  }
  for (const item of stored) {
    const acceptedIdentity = identityFields.includes(item.field) ? identity.resolved : resolution.resolved;
    if (conflicted.has(item.field) || !observationIdentityMatches(item, acceptedIdentity)) continue;
    const input = { ...project };
    for (const identityField of identityFields) {
      if (identityField !== item.field && !Object.hasOwn(input, identityField) && present(acceptedIdentity[identityField]))
        input[identityField] = acceptedIdentity[identityField];
    }
    // Each stored observation gets its own validation view, never a shared last-write-wins path.
    if (!putObservation(input, item.sourcePath, item.value) ||
        !putObservation(input, `${item.sourcePath}Timestamp`, item.timestamp || "INVALID_STORED_OBSERVATION_TIMESTAMP")) continue;
    input.fieldProvenance = { ...input.fieldProvenance, [item.sourcePath]: item.provenance };
    const checked = resolveCanonicalAliases(input, { ...options,
      fields: [...new Set(["chain", "tokenAddress", "poolAddress", item.field])] });
    if (!present(checked.resolved[item.field]) || !checked.provenance[item.field]) continue;
    const record = { ...checked.provenance[item.field], ...item.provenance,
      canonicalField: item.field, canonicalValue: checked.resolved[item.field], resolvedValue: checked.resolved[item.field],
      validationStatus: checked.provenance[item.field].validationStatus, confidence: item.provenance.confidence ?? 0,
      sourceTimestamp: item.timestamp, timestamp: item.timestamp,
      validationConfidence: checked.provenance[item.field].confidence };
    resolution.resolved[item.field] = checked.resolved[item.field];
    resolution.provenance[item.field] = record;
    resolution.audits.push(record);
    (resolution.storedObservationFields ||= []).push(item.field);
    if (checked.conflicts[item.field]?.length) resolution.conflicts[item.field] = checked.conflicts[item.field];
  }
  if (resolution.resolved.tokenAddress && resolution.resolved.tokenAddress === resolution.resolved.poolAddress) {
    resolution.conflicts.tokenAddress = [...(resolution.conflicts.tokenAddress || []), {
      canonicalField: "tokenAddress", canonicalValue: resolution.resolved.tokenAddress,
      reason: "Token address equals pool address.",
    }];
    resolution.resolved.tokenAddress = null;
    if (resolution.provenance.tokenAddress) resolution.provenance.tokenAddress.validationStatus = "INVALID";
  }
  const order = new Map(fields.map((field, index) => [field, index]));
  resolution.audits.sort((left, right) => order.get(left.canonicalField) - order.get(right.canonicalField));
  resolution.aliasResolutionSummary = { requestedFields: fields.length,
    resolvedFields: Object.values(resolution.resolved).filter(present).length,
    conflictFields: Object.keys(resolution.conflicts) };
  return resolution;
}
