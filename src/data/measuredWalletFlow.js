import { exactScanHistoryIdentity, historyTimestamp } from "../identity/exactScanHistoryIdentity.js";
import { normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

const DAY_MS = 86_400_000;
export const MEASURED_WALLET_FLOW_MAX_AGE_MS = 3_600_000;
const DERIVATION = "measured-wallet-flow-v1";
const FIELDS = ["smartWalletNetFlowUsd", "smartWalletBuyCount", "smartWalletSellCount", "accumulationDays"];
const ALIASES = {
  smartWalletNetFlowUsd: ["smartWalletNetFlowUsd"],
  smartWalletBuyCount: ["smartWalletBuyCount", "smartWalletBuys24h"],
  smartWalletSellCount: ["smartWalletSellCount", "smartWalletSells24h"],
  smartWalletBuyVolumeUsd: ["smartWalletBuyVolumeUsd"],
  smartWalletSellVolumeUsd: ["smartWalletSellVolumeUsd"],
};
const present = (value) => value !== undefined && value !== null && value !== "";
const identifier = (value) => typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "unknown";
const sameNumber = (a, b) => a === b || (a !== null && b !== null &&
  Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b)));

export function measuredWalletNumber(value, { signed = false, count = false } = {}) {
  if (typeof value !== "number" && (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && (signed || number >= 0) && (!count || Number.isSafeInteger(number))
    ? number : null;
}

// Optional explicit daily receipts remain supported. Existing provider fields
// and the resolved event tape below do not need this additional input schema.
function receipt(raw, project, now, historical = false) {
  const expected = exactScanHistoryIdentity(project);
  const actual = exactScanHistoryIdentity(raw);
  if (!expected || !actual || actual.key !== expected.key || project.identityConflict === true ||
      project.canonicalIdentityHardBlock === true) return { reason: "EXACT_TOKEN_IDENTITY_REQUIRED" };
  if (raw?.schemaVersion !== 1 || !identifier(raw.source) || !identifier(raw.evidenceId) ||
      raw.observationType !== "MEASURED" || raw.exactTokenIdentity !== true ||
      raw.tradeClassification !== "VERIFIED_SWAPS") return { reason: "MEASURED_QUALIFIED_SWAPS_REQUIRED" };
  const start = historyTimestamp(raw.window?.startAt);
  const end = historyTimestamp(raw.window?.endAt);
  const observed = historyTimestamp(raw.observedAt);
  const qualified = historyTimestamp(raw.qualification?.qualifiedAt);
  if (start === null || end === null || end - start !== DAY_MS || raw.window?.complete !== true ||
      observed === null || observed < end || observed > now || end > now ||
      (!historical && now - end > MEASURED_WALLET_FLOW_MAX_AGE_MS)) {
    return { reason: "FRESH_COMPLETE_PINNED_24H_WINDOW_REQUIRED" };
  }
  if (raw.qualification?.status !== "VERIFIED" || !identifier(raw.qualification.cohortId) ||
      !identifier(raw.qualification.policyId) || qualified === null || qualified > start) {
    return { reason: "PREWINDOW_WALLET_QUALIFICATION_REQUIRED" };
  }
  return { provenance: { ...raw, chain: actual.chain, tokenAddress: actual.tokenAddress,
    observedAt: new Date(observed).toISOString(),
    window: { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), complete: true },
    qualification: { ...raw.qualification, qualifiedAt: new Date(qualified).toISOString() } }, start, end };
}

function cohortKey(flow) {
  const p = flow.provenance;
  if (!p.qualification) return JSON.stringify([flow.path, p.source, p.chain, p.tokenAddress, p.fromBlock, p.toBlock]);
  return JSON.stringify([p.chain, p.tokenAddress, p.qualification.cohortId,
    p.qualification.policyId, p.qualification.qualifiedAt]);
}

function windowKey(flow) {
  return JSON.stringify([cohortKey(flow), flow.start, flow.end]);
}

function normalizeFlow(raw, values, project, now, path, diagnostics, historical = false, generated = {}) {
  const checked = receipt(raw, project, now, historical);
  if (!checked.provenance) {
    if (present(raw)) diagnostics.push({ path, reason: checked.reason });
    return null;
  }
  return { ...checked, ...normalizeMeasurements(values, path, diagnostics, generated), path, dailyComplete: true };
}

function normalizeMeasurements(values, path, diagnostics, generated = {}) {
  const normalized = {};
  const inputs = {};
  const invalidFields = new Set();
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const active = aliases.filter((alias) => present(values?.[alias]) && generated[alias]?.derivation !== DERIVATION);
    const numbers = active.map((alias) => measuredWalletNumber(values[alias], {
      signed: field === "smartWalletNetFlowUsd", count: field.endsWith("Count"),
    }));
    normalized[field] = numbers.length && numbers.every((value) => value !== null && sameNumber(value, numbers[0]))
      ? numbers[0] : null;
    inputs[field] = active.map((alias) => `${path}.${alias}`);
    if (active.length && normalized[field] === null) {
      invalidFields.add(field);
      diagnostics.push({ path, field, reason: "INVALID_OR_CONFLICTING_MEASUREMENT" });
    }
  }
  const buy = normalized.smartWalletBuyVolumeUsd;
  const sell = normalized.smartWalletSellVolumeUsd;
  if (buy !== null && sell !== null) {
    const net = buy - sell;
    if (normalized.smartWalletNetFlowUsd !== null && !sameNumber(normalized.smartWalletNetFlowUsd, net)) {
      normalized.smartWalletNetFlowUsd = null;
      invalidFields.add("smartWalletNetFlowUsd");
      diagnostics.push({ path, field: "smartWalletNetFlowUsd", reason: "NET_FLOW_CONFLICT" });
    } else if (Number.isFinite(net) && !invalidFields.has("smartWalletNetFlowUsd")) {
      normalized.smartWalletNetFlowUsd = net;
      inputs.smartWalletNetFlowUsd = [...inputs.smartWalletBuyVolumeUsd, ...inputs.smartWalletSellVolumeUsd];
    }
  }
  return { values: normalized, inputs, invalidFields };
}

function providerObservation(meta, project, now) {
  const expected = exactScanHistoryIdentity(project);
  const actual = exactScanHistoryIdentity(meta);
  const observed = historyTimestamp(meta?.sourceTimestamp ?? meta?.observedAt);
  const confidence = measuredWalletNumber(meta?.confidence);
  return expected && actual?.key === expected.key && project.identityConflict !== true &&
    project.canonicalIdentityHardBlock !== true && identifier(meta?.source) &&
    meta.verificationStatus === "VERIFIED_PROVIDER_OBSERVATION" &&
    confidence !== null && confidence > 0 && confidence <= 1 &&
    (!meta.observationType || (typeof meta.observationType === "string" &&
      ["MEASURED", "DIRECT"].includes(meta.observationType.toUpperCase()))) &&
    observed !== null && observed <= now && now - observed <= MEASURED_WALLET_FLOW_MAX_AGE_MS
    ? { identity: actual, observed } : null;
}

// attachFieldProvenance in activeEvidenceRecoveryEngine already retains these
// exact provider observations. Qualified daily field names carry the provider's
// aggregate semantics; holder/transfer adapters explicitly cannot supply them.
function providerFieldFlow(project, now, diagnostics) {
  const raw = {};
  const entries = [];
  let invalid = false;
  const transferSources = new Set(["blockscout-wallets", "rpc-wallets", "solana-rpc-wallets", "goplus", "wallet-history database"]);
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const meta = project.fieldProvenance?.[alias];
      if (!meta || meta.derivation === DERIVATION || !present(project[alias])) continue;
      const checked = providerObservation(meta, project, now);
      if (!checked || transferSources.has(String(meta.source).toLowerCase()) ||
          meta.holderSampleOnly === true || meta.buyerClassificationAvailable === false ||
          meta.complete24h === false || meta.coverageComplete === false ||
          (meta.window && (meta.window.complete !== true ||
            historyTimestamp(meta.window.endAt) !== checked.observed ||
            checked.observed - historyTimestamp(meta.window.startAt) !== DAY_MS)) ||
          (meta.tradeClassification && meta.tradeClassification !== "VERIFIED_SWAPS") ||
          (meta.field && meta.field !== alias) ||
          (present(meta.value) && !sameNumber(measuredWalletNumber(meta.value, { signed: true }),
            measuredWalletNumber(project[alias], { signed: true })))) {
        diagnostics.push({ path: `fieldProvenance.${alias}`, reason: "EXACT_FRESH_QUALIFIED_PROVIDER_FIELD_REQUIRED" });
        invalid = true;
        continue;
      }
      raw[alias] = project[alias];
      entries.push({ meta, checked, field, alias });
    }
  }
  if (!entries.length || invalid) return null;
  const first = entries[0];
  if (!entries.every(({ meta, checked }) => meta.source === first.meta.source && checked.observed === first.checked.observed)) {
    diagnostics.push({ reason: "INCOMPATIBLE_PROVIDER_FIELD_CLOCKS_OR_SOURCES" });
    return null;
  }
  // A standalone canonical net/count has no implicit daily window. At least
  // one existing 24h primitive must attest the common aggregate timestamp.
  if (!entries.some(({ alias }) => /24h$|VolumeUsd$/.test(alias))) return null;
  const end = first.checked.observed;
  const meta = { chain: first.checked.identity.chain,
    tokenAddress: first.checked.identity.tokenAddress, source: first.meta.source,
    observedAt: new Date(end).toISOString(), scope: "PROVIDER_QUALIFIED_24H_FIELDS",
    windowBasis: "PROVIDER_DAILY_FIELD_SEMANTICS",
    providerObservations: entries.map(({ alias, meta }) => ({ field: alias, ...meta })) };
  // Aggregate field provenance has no stable cross-day wallet cohort. It may
  // bridge today's flow, but never certify a multi-day streak by itself.
  return { start: end - DAY_MS, end, provenance: meta,
    ...normalizeMeasurements(raw, "root", diagnostics), path: "fieldProvenance",
    dailyComplete: true, historyCompatible: false };
}

// The real producer is ignitionRawSensors.eventTape after
// resolveEvmTransactionActors. No transfer, holder balance, current price or
// raw pool sender/recipient is promoted to a qualified wallet swap here.
function eventTapeFlow(project, now, diagnostics) {
  const tape = project.ignitionRawSensors?.eventTape;
  if (!tape) return null;
  const expected = exactScanHistoryIdentity(project);
  const actual = exactScanHistoryIdentity(tape);
  const end = historyTimestamp(tape.observedAt);
  const fail = (reason) => { diagnostics.push({ path: "ignitionRawSensors.eventTape", reason }); return null; };
  if (!expected || actual?.key !== expected.key || !expected.poolAddress || actual.poolAddress !== expected.poolAddress ||
      expected.chain === "solana" || project.identityConflict === true || project.canonicalIdentityHardBlock === true) {
    return fail("EXACT_TOKEN_AND_POOL_IDENTITY_REQUIRED");
  }
  if (tape.source !== "UNISWAP_V3_POOL_EVENTS" || !["OBSERVED_EVENT_TAPE", "OBSERVED_NO_RECENT_POOL_EVENTS"].includes(tape.status) ||
      end === null || end > now || now - end > MEASURED_WALLET_FLOW_MAX_AGE_MS ||
      !Number.isSafeInteger(tape.fromBlock) || tape.fromBlock < 0 ||
      !Number.isSafeInteger(tape.blockNumber) || tape.blockNumber < tape.fromBlock || !Array.isArray(tape.events)) {
    return fail("FRESH_PINNED_PRICED_EVENT_TAPE_REQUIRED");
  }
  const walletField = Array.isArray(project.smartWallets) ? "smartWallets" : "trackedWallets";
  const walletMeta = project.fieldProvenance?.[walletField];
  const walletReceipt = providerObservation(walletMeta, project, now);
  if (!walletReceipt || !Array.isArray(project[walletField])) return fail("PROVENANCED_TRACKED_WALLET_HISTORY_REQUIRED");
  const wallets = new Map();
  for (const row of project[walletField] || []) {
    const address = normalizeTokenAddress(row?.address || row?.wallet, expected.chain);
    // Same measured-history and independence bounds as smartWalletNoveltyEngine.
    const sample = measuredWalletNumber(row?.walletResolvedSampleSize ?? row?.sampleSize, { count: true });
    const hit = measuredWalletNumber(row?.walletHistoricalHitRate ?? row?.hitRate);
    const rug = measuredWalletNumber(row?.walletRugExposureRate ?? row?.rugExposureRate);
    const cluster = row?.walletFundingCluster ?? row?.fundingCluster;
    const qualified = address && sample !== null && sample >= 8 && hit !== null && hit >= 45 && hit <= 100 &&
      rug !== null && rug <= 25 && identifier(cluster) && row.insiderLinked !== true &&
      row.deployerLinked !== true && row.fundingClusterLinked !== true;
    if (!address) continue;
    if (wallets.has(address) && JSON.stringify(wallets.get(address)) !== JSON.stringify(row)) {
      return fail("CONFLICTING_TRACKED_WALLET_HISTORY");
    }
    wallets.set(address, qualified ? row : null);
  }
  if (![...wallets.values()].some(Boolean)) return fail("MEASURED_QUALIFIED_WALLET_HISTORY_REQUIRED");
  const seen = new Map();
  const swaps = [];
  for (const event of tape.events) {
    if (event?.eventType !== "SWAP") continue;
    const identity = exactScanHistoryIdentity(event);
    const time = historyTimestamp(event.eventTime);
    const observed = historyTimestamp(event.observedAt);
    const actor = normalizeTokenAddress(event.economicActorAddress, expected.chain);
    if (identity?.key !== expected.key || identity.poolAddress !== expected.poolAddress ||
        event.source !== tape.source || event.reorgSafe !== true || event.timestampMode !== "RPC_BLOCK_TIMESTAMP" ||
        time === null || time > end || observed === null || observed < time || observed > now ||
        !Number.isSafeInteger(event.blockNumber) || event.blockNumber < tape.fromBlock || event.blockNumber > tape.blockNumber ||
        !/^0x[\da-f]{64}$/i.test(event.txHash || "") || !/^0x[\da-f]{64}$/i.test(event.blockHash || "") ||
        !Number.isSafeInteger(event.logIndex) || event.logIndex < 0 || !["BUY", "SELL"].includes(event.side) ||
        !actor || normalizeTokenAddress(event.transactionInitiator, expected.chain) !== actor ||
        event.transactionInitiatorType !== "EOA_OR_UNDEPLOYED_AT_BLOCK" || !(measuredWalletNumber(event.actorConfidencePct) >= 60)) {
      return fail("EXACT_TIMESTAMPED_RESOLVED_SWAP_REQUIRED");
    }
    const key = `${event.txHash.toLowerCase()}:${event.logIndex}`;
    const fingerprint = JSON.stringify([event.side, event.usdNotional, actor, time, event.blockHash, event.blockNumber]);
    if (seen.has(key) && seen.get(key) !== fingerprint) return fail("CONFLICTING_SWAP_OBSERVATIONS");
    if (seen.has(key)) continue;
    seen.set(key, fingerprint);
    if (!wallets.get(actor)) continue;
    if (walletReceipt.observed > time) return fail("PRETRADE_WALLET_HISTORY_REQUIRED");
    swaps.push(event);
  }
  if (!swaps.length) return fail("QUALIFIED_SWAP_OBSERVATIONS_REQUIRED");
  const values = Object.fromEntries(Object.keys(ALIASES).map((field) => [field, null]));
  for (const side of ["BUY", "SELL"]) {
    const rows = swaps.filter((row) => row.side === side);
    const name = side === "BUY" ? "Buy" : "Sell";
    // Counts and zero absent sides are not daily totals in this bounded sample.
    if (rows.length && rows.every((row) => measuredWalletNumber(row.usdNotional) !== null)) {
      const sum = rows.reduce((total, row) => total + measuredWalletNumber(row.usdNotional), 0);
      if (Number.isFinite(sum)) values[`smartWallet${name}VolumeUsd`] = sum;
    }
  }
  const buy = values.smartWalletBuyVolumeUsd;
  const sell = values.smartWalletSellVolumeUsd;
  if (buy !== null && sell !== null && Number.isFinite(buy - sell)) values.smartWalletNetFlowUsd = buy - sell;
  return { start: null, end, dailyComplete: false, historyCompatible: false,
    values, invalidFields: new Set(), path: "ignitionRawSensors.eventTape.events",
    inputs: Object.fromEntries(Object.keys(ALIASES).map((field) => [field, ["ignitionRawSensors.eventTape.events", `fieldProvenance.${walletField}`]])),
    provenance: { source: tape.source, chain: actual.chain, tokenAddress: actual.tokenAddress,
      poolAddress: actual.poolAddress, observedAt: tape.observedAt, fromBlock: tape.fromBlock, toBlock: tape.blockNumber,
      scope: "OBSERVED_QUALIFIED_SWAPS_ONLY", complete24h: false, walletHistory: walletMeta,
      swaps: swaps.map(({ txHash, logIndex, blockHash, eventTime, economicActorAddress, side, usdNotional }) =>
        ({ txHash, logIndex, blockHash, eventTime, economicActorAddress, side, usdNotional })) } };
}

// Exact trailing positive-day count needs a measured non-positive boundary.
// Positive-only history is a lower bound, never an extrapolated duration.
function accumulationHistory(anchor, history, project, now, diagnostics) {
  const unknown = (reason, observedPositiveDays = 0) => ({ value: null, reason, observedPositiveDays, receipts: [] });
  if (!anchor || anchor.values.smartWalletNetFlowUsd === null) return unknown("QUALIFIED_DAILY_NET_FLOW_REQUIRED");
  if (!anchor.dailyComplete) return unknown("COMPLETE_DAILY_SWAP_COVERAGE_REQUIRED");
  if (anchor.values.smartWalletNetFlowUsd <= 0) {
    return { value: 0, observedPositiveDays: 0, receipts: [anchor.provenance], reason: null };
  }
  if (anchor.historyCompatible === false) return unknown("PINNED_DAILY_HISTORY_WITH_STABLE_QUALIFIED_COHORT_REQUIRED");
  if (!Array.isArray(history)) history = [];
  const windows = new Map([[anchor.end, anchor]]);
  const receiptWindows = new Map([[JSON.stringify([anchor.provenance.source, anchor.provenance.evidenceId]), anchor.end]]);
  for (const [index, row] of history.entries()) {
    const flow = normalizeFlow(row?.provenance, row?.values, project, now,
      `smartWalletFlowHistory[${index}]`, diagnostics, true);
    if (!flow || flow.values.smartWalletNetFlowUsd === null || flow.invalidFields.has("smartWalletNetFlowUsd") ||
        cohortKey(flow) !== cohortKey(anchor) || flow.end > anchor.end) {
      return unknown("COMPATIBLE_PINNED_DAILY_HISTORY_REQUIRED");
    }
    const receiptKey = JSON.stringify([flow.provenance.source, flow.provenance.evidenceId]);
    if (receiptWindows.has(receiptKey) && receiptWindows.get(receiptKey) !== flow.end) {
      return unknown("DAILY_RECEIPT_REUSED_ACROSS_WINDOWS");
    }
    receiptWindows.set(receiptKey, flow.end);
    const duplicate = windows.get(flow.end);
    if (duplicate && duplicate.values.smartWalletNetFlowUsd !== flow.values.smartWalletNetFlowUsd) {
      return unknown("CONFLICTING_DAILY_HISTORY");
    }
    windows.set(flow.end, duplicate || flow);
  }
  let end = anchor.end;
  let days = 0;
  const receipts = [];
  while (windows.has(end)) {
    const flow = windows.get(end);
    receipts.push(flow.provenance);
    if (flow.values.smartWalletNetFlowUsd <= 0) return { value: days, observedPositiveDays: days, receipts, reason: null };
    days += 1;
    end = flow.start;
  }
  return unknown("CONTIGUOUS_DAILY_HISTORY_WITH_NONPOSITIVE_BOUNDARY_REQUIRED", days);
}

export function produceMeasuredWalletFlowInputs(project = {}, options = {}) {
  const now = historyTimestamp(options.now ?? Date.now());
  if (now === null) throw new TypeError("Measured wallet flow requires a valid evaluation clock.");
  const diagnostics = [];
  const existingProvenance = project.fieldProvenance || {};
  const root = normalizeFlow(project.smartWalletFlowProvenance, project, project, now,
    "root", diagnostics, false, existingProvenance);
  const nested = normalizeFlow(project.smartWalletSignal?.provenance, project.smartWalletSignal, project, now,
    "smartWalletSignal", diagnostics);
  const provider = providerFieldFlow(project, now, diagnostics);
  const tape = eventTapeFlow(project, now, diagnostics);
  const flows = [root, nested, provider, tape].filter(Boolean);
  const compatible = flows.every((flow) => windowKey(flow) === windowKey(flows[0]));
  if (!compatible) diagnostics.push({ reason: "INCOMPATIBLE_FLOW_WINDOWS_OR_COHORTS" });
  const values = Object.fromEntries([...Object.keys(ALIASES), "accumulationDays"].map((field) => [field, null]));
  const provenance = {};
  for (const field of Object.keys(ALIASES)) {
    if (flows.some((flow) => flow.invalidFields.has(field))) continue;
    const available = compatible ? flows.filter((flow) => flow.values[field] !== null) : [];
    if (!available.length) continue;
    if (!available.every((flow) => sameNumber(flow.values[field], available[0].values[field]))) {
      diagnostics.push({ field, reason: "CONFLICTING_QUALIFIED_FLOW" });
      continue;
    }
    values[field] = available[0].values[field];
    provenance[field] = { derivation: DERIVATION, observationType: "DERIVED",
      verificationStatus: "VERIFIED_DERIVED_OBSERVATION", receipts: available.map((flow) => flow.provenance),
      inputs: available.flatMap((flow) => flow.inputs[field]) };
  }
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (values[field] === null) continue;
    if (aliases.some((alias) => present(project[alias]) && existingProvenance[alias]?.derivation !== DERIVATION &&
        !sameNumber(values[field], measuredWalletNumber(project[alias], { signed: field === "smartWalletNetFlowUsd",
          count: field.endsWith("Count") })))) {
      values[field] = null;
      delete provenance[field];
      diagnostics.push({ field, reason: "CONFLICTING_SUPPLIED_FLOW_VALUE" });
    }
  }
  const anchor = compatible && values.smartWalletNetFlowUsd !== null
    ? flows.find((flow) => flow.values.smartWalletNetFlowUsd === values.smartWalletNetFlowUsd) : null;
  const history = accumulationHistory(anchor, project.smartWalletFlowHistory, project, now, diagnostics);
  if (history.value !== null) {
    values.accumulationDays = history.value;
    provenance.accumulationDays = { derivation: DERIVATION, observationType: "DERIVED",
      verificationStatus: "VERIFIED_DERIVED_OBSERVATION", receipts: history.receipts,
      inputs: [anchor.path, "smartWalletFlowHistory"] };
  } else diagnostics.push({ field: "accumulationDays", reason: history.reason });

  const promoted = {};
  const effectiveValues = {};
  const fieldProvenance = { ...existingProvenance };
  const guarded = present(project.smartWalletFlowProvenance) || present(project.smartWalletSignal?.provenance) ||
    present(project.ignitionRawSensors?.eventTape) || Object.values(ALIASES).flat()
      .some((alias) => existingProvenance[alias] && existingProvenance[alias].derivation !== DERIVATION);
  for (const field of FIELDS) {
    const generated = existingProvenance[field]?.derivation === DERIVATION;
    // Legacy direct canonical inputs retain their caller contract, but do not
    // certify a receipt or supply history. Derived roots are always revalidated.
    const legacy = !generated && !guarded
      ? measuredWalletNumber(project[field], { signed: field === "smartWalletNetFlowUsd", count: field !== "smartWalletNetFlowUsd" })
      : null;
    effectiveValues[field] = legacy ?? values[field];
    if (!present(project[field]) && values[field] !== null) {
      promoted[field] = values[field];
      fieldProvenance[field] = provenance[field];
    } else if (generated) {
      fieldProvenance[field] = { ...(provenance[field] || existingProvenance[field]),
        verificationStatus: values[field] === null ? "UNKNOWN" : "VERIFIED_DERIVED_OBSERVATION" };
      // Refresh only our own outputs, never supplied raw observations.
      promoted[field] = values[field];
    }
  }
  return { ...project, ...promoted, fieldProvenance,
    measuredWalletFlow: {
      schemaVersion: 1, evaluatedAt: new Date(now).toISOString(),
      status: FIELDS.every((field) => values[field] !== null) ? "MEASURED" :
        FIELDS.some((field) => values[field] !== null) ? "PARTIAL" : "UNKNOWN",
      values, effectiveValues, fieldProvenance: provenance, diagnostics,
      dailyTotals: flows.length > 0 && compatible && flows.every((flow) => flow.dailyComplete),
      sampleOnly: Boolean(tape),
      history: { observedPositiveDays: history.observedPositiveDays, exact: history.value !== null },
      rawPrerequisites: Object.fromEntries(FIELDS.filter((field) => values[field] === null).map((field) => [field, {
        recoveryDisposition: "UNAVAILABLE_WITH_CURRENT_PROVIDERS",
        rootCause: "RAW_SOURCE_MISSING",
        reason: field === "accumulationDays" ? history.reason :
          "IDENTITY_PINNED_QUALIFIED_SWAP_RECEIPT_AND_COMPLETE_24H_MEASUREMENTS_REQUIRED",
        requiredAny: field === "accumulationDays" ? [["smartWalletFlowHistory", "qualified daily net flow with nonpositive boundary"]] :
          field === "smartWalletNetFlowUsd" ? [["smartWalletNetFlowUsd"], ["smartWalletBuyVolumeUsd", "smartWalletSellVolumeUsd"]] :
            [ALIASES[field]],
        receiptPaths: ["fieldProvenance", "ignitionRawSensors.eventTape", "smartWalletFlowProvenance", "smartWalletSignal.provenance"],
      }])),
    } };
}
