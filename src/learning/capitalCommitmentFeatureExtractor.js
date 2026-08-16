import crypto from "node:crypto";
import { capitalPathFeatureVector } from "./capitalPathFeatureExtractor.js";

function lower(value = "") { return String(value || "").trim().toLowerCase(); }
function address(value = "") {
  const v = lower(value);
  return /^0x[0-9a-f]{40}$/.test(v) ? v : null;
}
function hash(parts = []) {
  return crypto.createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 32);
}

function fundingSourceFingerprint(wallet = {}) {
  const sources = (Array.isArray(wallet.fundingSources) ? wallet.fundingSources : [])
    .map((row) => address(row?.address || row?.from || row?.sourceAddress || row?.source))
    .filter(Boolean)
    .sort();
  if (!sources.length) return null;
  return hash(sources);
}

export function capitalCommitmentFeatureVector(wallet = {}, chainObservation = {}, options = {}) {
  const base = capitalPathFeatureVector(wallet, chainObservation, options);
  return {
    ...base,
    schemaVersion: 2,
    fundingSourceFingerprint: fundingSourceFingerprint(wallet),
    correlationEvidence: fundingSourceFingerprint(wallet) ? "SHARED_FUNDING_SOURCE_FINGERPRINT_ONLY" : "UNOBSERVED",
    featurePolicyV10: "Funding-source fingerprint is derived only from pre-destination public-chain funding addresses. It is used for correlation discounting, never as a beneficial-owner identity claim.",
  };
}

export function extractCapitalCommitmentFeatures(radar = {}, options = {}) {
  const rows = [];
  for (const chainObservation of Array.isArray(radar?.chains) ? radar.chains : []) {
    for (const wallet of Array.isArray(chainObservation?.wallets) ? chainObservation.wallets : []) {
      if (!wallet?.executionPrepared || !(Number(wallet.executionReadyCapitalUsd) > 0)) continue;
      if (wallet.destination?.assignedProjectKey) continue;
      const feature = capitalCommitmentFeatureVector(wallet, chainObservation, options);
      if (feature.walletAddress) rows.push(feature);
    }
  }
  return rows;
}

export const __capitalCommitmentFeatureHooks = { fundingSourceFingerprint };
