import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSmartWallets, analyzeSmartWalletBatch, calculateSmartWalletSignal } from "../src/engines/smartWalletEngine.js";
import { analyzeSmartMoneyAccumulation, analyzeSmartMoneyAccumulationBatch } from "../src/engines/smartMoneyAccumulationEngine.js";
import { produceMeasuredWalletFlowInputs } from "../src/data/measuredWalletFlow.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import { UNISWAP_V3_EVENT_TOPICS, __uniswapV3EventTapeSensorTestHooks } from "../src/sensors/uniswapV3EventTapeSensor.js";
import { __evmTransactionActorResolverTestHooks } from "../src/sensors/evmTransactionActorResolver.js";
import { encodeSignedWord, encodeAddressWord } from "../src/sensors/evmAbi.js";
import { normalizeBlockscoutWalletEvidence } from "../src/data/blockscoutWalletConnector.js";
import { analyzeCapitalFlow } from "../src/engines/capitalFlowEngine.js";
import { analyzeSmartMoneyRotation } from "../src/engines/smartMoneyRotationEngine.js";
import { resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const TOKEN = `0x${"a".repeat(40)}`;
const options = { now: NOW };
const POOL = `0x${"b".repeat(40)}`;
const WALLET = `0x${"c".repeat(40)}`;
const QUOTE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// The actual recovery transport wrapper does not certify qualification or a
// complete daily window. This synthetic source is not an implemented provider.
function providerMeta(field, value, extra = {}) {
  return { field, value, source: "transport-only-fixture", sourceTimestamp: new Date(NOW).toISOString(),
    confidence: 0.9, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", chain: "base", tokenAddress: TOKEN, ...extra };
}

function providerProject(extra = {}) {
  const values = { smartWalletBuys24h: 3, smartWalletSells24h: 1,
    smartWalletBuyVolumeUsd: 1000, smartWalletSellVolumeUsd: 100 };
  return { chain: "base", tokenAddress: TOKEN, ...values,
    fieldProvenance: Object.fromEntries(Object.entries(values).map(([field, value]) => [field, providerMeta(field, value)])),
    ...extra };
}

// Positive contract test only: no existing acquisition adapter supplies these
// qualification + complete-window attestations. Do not treat this as live wiring.
function qualifiedProviderProject(extra = {}) {
  const input = providerProject(extra);
  for (const meta of Object.values(input.fieldProvenance)) {
    Object.assign(meta, { source: "synthetic-qualified-daily-contract", tradeClassification: "VERIFIED_SWAPS",
      qualification: provenance().qualification, window: provenance().window });
  }
  return input;
}

// Replay the actual pool-log decoder and actor producer. These fields are the
// output of observeUniswapV3EventTape + resolveEvmTransactionActors, not a
// hand-authored smartWalletFlowProvenance receipt.
function eventTapeProject() {
  const identity = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL };
  const word = (value) => BigInt(value).toString(16).padStart(64, "0");
  const events = [1000, -100].map((notional, index) => {
    const buy = notional > 0;
    const log = { address: POOL, topics: [UNISWAP_V3_EVENT_TOPICS.SWAP,
      `0x${encodeAddressWord(WALLET)}`, `0x${encodeAddressWord(WALLET)}`],
    data: `0x${encodeSignedWord(buy ? -1n : 1n, 256)}${encodeSignedWord(BigInt(notional) * 1_000_000n, 256)}${word(2n ** 96n)}${word(1000)}${encodeSignedWord(0, 24)}`,
    blockNumber: `0x${(100 + index).toString(16)}`, blockHash: `0x${"d".repeat(64)}`,
    transactionHash: `0x${word(index + 1)}`, logIndex: "0x0" };
    const event = __uniswapV3EventTapeSensorTestHooks.decodeLog(log, {
      project: identity, pool: { token0: TOKEN, token1: QUOTE, token0Decimals: 18, token1Decimals: 6 },
      priceCtx: { token0Usd: 1, token1Usd: 1 }, quoteUsd: { priceUsd: 1 },
      timestamp: { timestamp: NOW / 1000 - 600 + index, mode: "RPC_BLOCK_TIMESTAMP" },
    });
    return { ...__evmTransactionActorResolverTestHooks.resolveEventActor(event,
      { from: WALLET, to: POOL }, { logs: [log] }, { initiatorCode: "0x", entryCode: "0x1234" }, null, identity),
    observedAt: new Date(NOW).toISOString() }; // Pin the producer's wall-clock receipt for offline replay.
  });
  const smartWallets = [{ address: WALLET, sampleSize: 12, hitRate: 60, rugExposureRate: 0, fundingCluster: "independent-a" }];
  return { ...identity, smartWallets,
    fieldProvenance: { smartWallets: providerMeta("smartWallets", smartWallets,
      { source: "tracked-wallet-history", sourceTimestamp: new Date(NOW - 1800_000).toISOString() }) },
    ignitionRawSensors: { eventTape: { ...identity, source: "UNISWAP_V3_POOL_EVENTS", status: "OBSERVED_EVENT_TAPE",
      observedAt: new Date(NOW).toISOString(), fromBlock: 90, blockNumber: 101, lookbackSeconds: 600,
      timestampMode: "RPC_BLOCK_TIMESTAMP_WITH_FALLBACK", events } } };
}

test("regression: bounded swap samples cannot feed capital flow or smart-money rotation totals", () => {
  const input = eventTapeProject();
  assert.equal(input.previousSmartWalletNetFlowUsd, undefined);
  assert.equal(input.previousSmartWalletBuys24h, undefined);
  const wallet = analyzeSmartWallets(input, options);
  const capital = analyzeCapitalFlow(wallet);
  const rotation = analyzeSmartMoneyRotation(capital);
  assert.deepEqual({ capitalScore: capital.capitalFlowScore, capitalTotal: capital.capitalFlow.totalNetFlow,
    rotationScore: rotation.smartMoneyRotationScore, rotationDelta: rotation.smartMoneyRotation.netFlowDelta },
  { capitalScore: 0, capitalTotal: 0, rotationScore: 0, rotationDelta: 0 });
  assert.equal(wallet.smartWalletNetFlowUsd ?? null, null);
  assert.equal(wallet.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
  assert.equal(wallet.measuredWalletFlow.observedSample.netFlowUsd, 900);
  assert.deepEqual(wallet.ignitionRawSensors.eventTape, input.ignitionRawSensors.eventTape);
});

test("regression: transport metadata and a qualified-looking field name do not certify wallet qualification", () => {
  for (const qualification of [undefined, null, {}, { status: "UNKNOWN" }, { status: "DENIED" },
    { status: "VERIFIED" }, { status: "VERIFIED", cohortId: "missing-history-policy" }]) {
    const input = providerProject();
    for (const meta of Object.values(input.fieldProvenance)) meta.qualification = qualification;
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletNetFlowUsd ?? null, null, JSON.stringify(qualification));
    assert.equal(result.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
    for (const [field, meta] of Object.entries(input.fieldProvenance)) {
      assert.equal(result.measuredWalletFlow.unverifiedProviderFields[field].value, input[field]);
      assert.deepEqual(result.measuredWalletFlow.unverifiedProviderFields[field].provenance, meta);
    }
  }
});

test("sample isolation survives both engine orders, signed/large values, and repeated downstream consumers", () => {
  for (const [buy, sell] of [[1000, 100], [0, 0], [0, 1000], [1_000_000, 100]]) {
    const input = eventTapeProject();
    const events = input.ignitionRawSensors.eventTape.events;
    events[0].usdNotional = buy;
    events[1].usdNotional = sell;
    const raw = structuredClone(input);
    for (let result of [produceMeasuredWalletFlowInputs(input, options),
      analyzeSmartWallets(input, options), analyzeSmartMoneyAccumulation(input, options)]) {
      for (let i = 0; i < 3; i++) {
        result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(result, options), options);
        const capital = analyzeCapitalFlow(result);
        const rotation = analyzeSmartMoneyRotation(capital);
        assert.equal(capital.capitalFlowScore, 0);
        assert.equal(capital.capitalFlow.totalNetFlow, 0);
        assert.equal(rotation.smartMoneyRotationScore, 0);
        assert.equal(rotation.smartMoneyRotation.netFlowDelta, 0);
        assert.equal(result.smartWalletNetFlowUsd ?? null, null);
        assert.equal(result.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
        assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, buy - sell);
        assert.equal(result.measuredWalletFlow.effectiveValues.smartWalletNetFlowUsd, null);
        assert.equal(result.accumulationDays, undefined);
        assert.deepEqual(result.ignitionRawSensors.eventTape, raw.ignitionRawSensors.eventTape);
      }
    }
    assert.deepEqual(input, raw);
  }
});

test("cached e444 sample aliases are retired without dropping their value or provenance", () => {
  const input = eventTapeProject();
  const prior = { ...input, smartWalletNetFlowUsd: 900,
    smartWalletSignal: { sampleOnly: true, scope: "OBSERVED_QUALIFIED_SWAPS_ONLY",
      smartWalletNetFlowUsd: 900, smartWalletBuyVolumeUsd: 1000, smartWalletSellVolumeUsd: 100 },
    fieldProvenance: { ...input.fieldProvenance, smartWalletNetFlowUsd: {
      derivation: "measured-wallet-flow-v1", observationType: "DERIVED", verificationStatus: "VERIFIED_DERIVED_OBSERVATION",
      receipts: [{ scope: "OBSERVED_QUALIFIED_SWAPS_ONLY", source: "UNISWAP_V3_POOL_EVENTS" }],
    } } };
  const raw = structuredClone(prior);
  for (const result of [produceMeasuredWalletFlowInputs(prior, options), analyzeSmartWallets(prior, options),
    analyzeSmartMoneyAccumulation(prior, options)]) {
    assert.equal(result.smartWalletNetFlowUsd, null);
    assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, null);
    assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, 900);
    assert.equal(result.measuredWalletFlow.rawSampleTotals.smartWalletNetFlowUsd.value, 900);
    assert.deepEqual(result.measuredWalletFlow.rawSampleSignal, raw.smartWalletSignal);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
  }
  const retired = analyzeSmartMoneyAccumulation({ ...prior, ignitionRawSensors: undefined, smartWalletSignal: null }, options);
  assert.equal(retired.smartWalletNetFlowUsd, null);
  assert.equal(retired.measuredWalletFlow.rawSampleTotals.smartWalletNetFlowUsd.value, 900);
  assert.equal(analyzeCapitalFlow(retired).capitalFlowScore, 0);
  for (const input of [{ ...prior, fieldProvenance: { smartWallets: raw.fieldProvenance.smartWallets } },
  { ...prior, fieldProvenance: {}, ignitionRawSensors: undefined }]) {
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletNetFlowUsd, null);
    assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, null);
    assert.equal(result.measuredWalletFlow.rawSampleTotals.smartWalletNetFlowUsd.value, 900);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
  }
  assert.deepEqual(prior, raw);
});

test("a stale or removed tape preserves its observed metric as unknown, never as daily flow", () => {
  const first = analyzeSmartWallets(eventTapeProject(), options);
  for (const input of [first, { ...first, ignitionRawSensors: undefined }]) {
    const result = analyzeSmartWallets(input, { now: NOW + 3_600_001 });
    assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, 900);
    assert.equal(result.measuredWalletFlow.observedSample.status, "UNKNOWN");
    assert.deepEqual(result.measuredWalletFlow.observedSample.provenance, first.measuredWalletFlow.observedSample.provenance);
    assert.equal(result.smartWalletNetFlowUsd ?? null, null);
    assert.equal(result.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
  }
});

test("sample isolation does not suppress independently measured daily or retail flow", () => {
  const tape = eventTapeProject();
  tape.ignitionRawSensors.eventTape.events[0].usdNotional = 1_000_000;
  const daily = project();
  const input = { ...tape, ...daily, buyVolume24h: 2000, sellVolume24h: 500 };
  const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
  assert.equal(result.smartWalletNetFlowUsd, 900);
  assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, 900);
  assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, 999_900);
  assert.equal(analyzeCapitalFlow(result).capitalFlow.totalNetFlow, 2400);
  const retailOnly = analyzeCapitalFlow(analyzeSmartWallets({ ...tape, buyVolume24h: 2000, sellVolume24h: 500 }, options));
  assert.equal(retailOnly.capitalFlow.totalNetFlow, 1500);
  assert.equal(retailOnly.capitalFlowScore, analyzeCapitalFlow({ buyVolume24h: 2000, sellVolume24h: 500 }).capitalFlowScore);
});

test("one denied or incomplete provider attestation cannot borrow qualification from the other fields", () => {
  for (const patch of [
    { qualification: undefined }, { qualification: null }, { qualification: {} },
    { qualification: { ...provenance().qualification, status: "DENIED" } },
    { qualification: { ...provenance().qualification, available: false } },
    { qualification: { ...provenance().qualification, policyId: "" } },
    { qualification: { ...provenance().qualification, qualifiedAt: new Date(NOW).toISOString() } },
    { tradeClassification: undefined }, { tradeClassification: "UNKNOWN" }, { window: undefined },
    { window: { ...provenance().window, complete: false } },
    { window: { ...provenance().window, startAt: new Date(NOW - DAY / 2).toISOString() } },
  ]) {
    const input = qualifiedProviderProject();
    Object.assign(input.fieldProvenance.smartWalletBuyVolumeUsd, patch);
    const raw = structuredClone(input);
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletNetFlowUsd ?? null, null, JSON.stringify(patch));
    assert.equal(result.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
    assert.equal(result.measuredWalletFlow.unverifiedProviderFields.smartWalletBuyVolumeUsd.value, 1000);
    assert.deepEqual(input, raw);
  }
});

test("regression: declared-but-rejected receipts cannot leak root or nested daily totals downstream", () => {
  const invalid = [
    provenance(NOW, { qualification: { ...provenance().qualification, status: "UNKNOWN" } }),
    provenance(NOW, { qualification: { ...provenance().qualification, status: "DENIED" } }),
    provenance(NOW, { qualification: { ...provenance().qualification, available: false } }),
    provenance(NOW + 1), provenance(NOW - 3_600_001),
    provenance(NOW, { tokenAddress: WALLET }), provenance(NOW, { chain: "ethereum" }),
    provenance(NOW, { observedAt: new Date(NOW + 1).toISOString() }),
    provenance(NOW, { window: { ...provenance().window, complete: false } }),
  ];
  for (const meta of invalid) {
    for (const scope of ["root", "nested", "both"]) {
      const input = { chain: "base", tokenAddress: TOKEN,
        smartWalletNetFlowUsd: "100000.00", smartWalletBuyCount: 20, smartWalletSellCount: 1,
        smartWalletBuys24h: 20, smartWalletSells24h: 1,
        smartWalletBuyVolumeUsd: 110_000, smartWalletSellVolumeUsd: 10_000, accumulationDays: 100,
        smartWalletSignal: { smartWalletNetFlowUsd: "100000.00", smartWalletBuys24h: 20,
          smartWalletSells24h: 1, smartWalletBuyVolumeUsd: 110_000, smartWalletSellVolumeUsd: 10_000,
          smartWalletBuySellRatio: 20, smartWalletVolumeRatio: 11,
          ...(scope !== "root" ? { provenance: meta } : {}) },
        ...(scope !== "nested" ? { smartWalletFlowProvenance: meta } : {}) };
      const raw = structuredClone(input);
      for (const result of [produceMeasuredWalletFlowInputs(input, options), analyzeSmartWallets(input, options),
        analyzeSmartMoneyAccumulation(input, options)]) {
        const capital = analyzeCapitalFlow(result);
        const rotation = analyzeSmartMoneyRotation(capital);
        assert.deepEqual({ capitalScore: capital.capitalFlowScore, total: capital.capitalFlow.totalNetFlow,
          rotationScore: rotation.smartMoneyRotationScore, delta: rotation.smartMoneyRotation.netFlowDelta },
        { capitalScore: 0, total: 0, rotationScore: 0, delta: 0 }, `${scope}: ${JSON.stringify(meta)}`);
        assert.equal(result.smartWalletNetFlowUsd, null);
        assert.equal(result.smartWalletSignal?.smartWalletNetFlowUsd ?? null, null);
        assert.equal(result.measuredWalletFlow.effectiveValues.smartWalletNetFlowUsd, null);
        assert.equal(result.accumulationDays, null);
        assert.equal(result.measuredWalletFlow.rejectedReceiptInputs.root.values.smartWalletNetFlowUsd, "100000.00");
        assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.smartWalletSignal.value, raw.smartWalletSignal);
        if (scope !== "nested") assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.root.provenance, meta);
        let current = result;
        for (let i = 0; i < 3; i++) {
          current = analyzeSmartMoneyAccumulation(analyzeSmartWallets(current, options), options);
          assert.equal(analyzeCapitalFlow(current).capitalFlowScore, 0);
          assert.equal(analyzeSmartMoneyRotation(current).smartMoneyRotationScore, 0);
          assert.deepEqual(current.measuredWalletFlow.rejectedReceiptInputs, result.measuredWalletFlow.rejectedReceiptInputs);
        }
      }
      assert.deepEqual(input, raw);
    }
  }
});

test("regression: malformed explicit receipt is not an unguarded legacy caller", () => {
  for (const rawReceipt of [null, {}, "invalid"]) {
    for (const scope of ["root", "nested"]) {
      const input = { chain: "base", tokenAddress: TOKEN, smartWalletNetFlowUsd: 100_000,
        smartWalletSignal: { smartWalletNetFlowUsd: 100_000,
          ...(scope === "nested" ? { provenance: rawReceipt } : {}) },
        ...(scope === "root" ? { smartWalletFlowProvenance: rawReceipt } : {}) };
      const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
      assert.equal(result.smartMoneyAccumulationScore, null);
      assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
      assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
    }
  }
});

test("one rejected declaration cannot fall back to another receipt or scope-unaware scalar", () => {
  const denied = provenance(NOW, { qualification: { ...provenance().qualification, status: "DENIED" } });
  for (const [rootReceipt, nestedReceipt] of [[denied, provenance()], [provenance(), denied]]) {
    const input = project({ smartWalletFlowProvenance: rootReceipt, smartWalletNetFlowUsd: 900,
      smartWalletSignal: { provenance: nestedReceipt, smartWalletNetFlowUsd: 900, smartWalletBuys24h: 3, smartWalletSells24h: 1 } });
    let result = produceMeasuredWalletFlowInputs(input, options);
    const snapshot = structuredClone(result.measuredWalletFlow.rejectedReceiptInputs);
    for (let i = 0; i < 3; i++) {
      result = produceMeasuredWalletFlowInputs(result, options);
      assert.equal(result.smartWalletNetFlowUsd, null);
      assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, null);
      assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
      assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
      assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs, snapshot);
    }
  }
});

test("declared receipt rejection masks coercible invalid values but preserves their exact representations", () => {
  const meta = provenance(NOW, { qualification: { ...provenance().qualification, status: "UNKNOWN" } });
  for (const value of [true, [100_000], " 100000.00 ", "1e5"]) {
    const input = { chain: "base", tokenAddress: TOKEN, smartWalletFlowProvenance: meta,
      smartWalletNetFlowUsd: value, smartWalletSignal: { provenance: meta, smartWalletNetFlowUsd: value } };
    const result = produceMeasuredWalletFlowInputs(input, options);
    assert.equal(result.smartWalletNetFlowUsd, null);
    assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, null);
    assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.root.values.smartWalletNetFlowUsd, value);
    assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.smartWalletSignal.value, input.smartWalletSignal);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
  }
});

test("unguarded legacy root and nested callers retain their preexisting downstream behavior", () => {
  const input = { chain: "base", tokenAddress: TOKEN, smartWalletNetFlowUsd: "100000.00",
    smartWalletBuys24h: 20, smartWalletSells24h: 1, smartWalletBuyCount: 20, smartWalletSellCount: 1,
    smartWalletBuyVolumeUsd: 110_000, smartWalletSellVolumeUsd: 10_000, accumulationDays: 100,
    smartWalletSignal: { smartWalletNetFlowUsd: "100000.00", smartWalletBuys24h: 20, smartWalletSells24h: 1 } };
  for (const candidate of [input, { ...input, smartWalletFlowProvenance: undefined,
    smartWalletSignal: { ...input.smartWalletSignal, provenance: undefined } }]) {
    for (const result of [produceMeasuredWalletFlowInputs(candidate, options), analyzeSmartWallets(candidate, options),
      analyzeSmartMoneyAccumulation(candidate, options)]) {
      assert.equal(result.smartWalletNetFlowUsd, "100000.00");
      assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 50);
      assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 90);
      assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs, {});
    }
  }
});

test("explicit qualified complete per-field input contract bridges without a root receipt", () => {
  const input = qualifiedProviderProject();
  const before = structuredClone(input);
  let wallet = analyzeSmartWallets(input, options);
  assert.equal(wallet.smartWalletSignal.smartWalletNetFlowUsd, 900);
  assert.equal(wallet.smartWalletNetFlowUsd, 900);
  assert.equal(wallet.smartWalletBuyCount, 3);
  assert.equal(wallet.smartWalletSellCount, 1);
  assert.equal(wallet.smartWalletFlowProvenance, undefined);
  for (let i = 0; i < 3; i++) wallet = analyzeSmartMoneyAccumulation(analyzeSmartWallets(wallet, options), options);
  assert.equal(wallet.smartMoneyAccumulationCoverage.coveragePct, 75);
  assert.ok(Number.isFinite(wallet.smartMoneyAccumulationScore));
  assert.equal(wallet.accumulationDays, undefined);
  assert.equal(wallet.measuredWalletFlow.rawPrerequisites.accumulationDays.reason,
    "PINNED_DAILY_HISTORY_WITH_STABLE_QUALIFIED_COHORT_REQUIRED");
  assert.equal(wallet.measuredWalletFlow.rawPrerequisites.accumulationDays.recoveryDisposition, "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
  assert.equal(wallet.measuredWalletFlow.rawPrerequisites.accumulationDays.rootCause, "RAW_SOURCE_MISSING");
  assert.deepEqual(wallet.fieldProvenance.smartWalletNetFlowUsd.receipts[0].providerObservations[0],
    input.fieldProvenance.smartWalletBuys24h);
  assert.deepEqual(input, before);
});

test("actual raw pool logs -> decoded/resolved swaps -> smart wallet -> scoped accumulation inputs", (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No network allowed"));
  const input = eventTapeProject();
  const before = structuredClone(input);
  const wallet = analyzeSmartWallets(input, options);
  assert.equal(input.ignitionRawSensors.eventTape.events[0].transactionInitiatorType, "EOA_OR_UNDEPLOYED_AT_BLOCK");
  assert.ok(wallet.smartWalletSignal, JSON.stringify({ flow: wallet.measuredWalletFlow, events: input.ignitionRawSensors.eventTape.events }));
  assert.equal(wallet.smartWalletSignal.smartWalletNetFlowUsd, null);
  assert.equal(wallet.smartWalletSignal.observedSample.netFlowUsd, 900);
  const result = analyzeSmartMoneyAccumulation(wallet, options);
  assert.equal(result.smartWalletNetFlowUsd, undefined);
  assert.equal(result.smartWalletBuyCount, undefined);
  assert.equal(result.smartWalletBuys24h, undefined);
  assert.equal(result.accumulationDays, undefined);
  assert.equal(result.measuredWalletFlow.dailyTotals, false);
  assert.equal(result.measuredWalletFlow.rawPrerequisites.accumulationDays.reason, "COMPLETE_DAILY_SWAP_COVERAGE_REQUIRED");
  assert.equal(result.smartMoneyAccumulationScore, null);
  assert.equal(result.smartWalletScore, null);
  assert.equal(result.alerts?.length ?? 0, 0);
  assert.equal(result.measuredWalletFlow.observedSample.provenance.scope, "OBSERVED_QUALIFIED_SWAPS_ONLY");
  assert.equal(result.measuredWalletFlow.values.smartWalletNetFlowUsd, null);
  assert.equal(result.measuredWalletFlow.effectiveValues.smartWalletNetFlowUsd, null);
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd, undefined);
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 0);
  assert.deepEqual(input, before);
  assert.equal(analyzeSmartMoneyAccumulation(analyzeSmartWallets(result, options), options).measuredWalletFlow.observedSample.netFlowUsd, 900);
});

test("existing provider aggregate zeros and partial sides preserve measured versus missing", () => {
  const zero = qualifiedProviderProject();
  for (const field of Object.keys(zero.fieldProvenance)) {
    zero[field] = 0;
    zero.fieldProvenance[field].value = 0;
  }
  const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(zero, options), options);
  assert.equal(result.smartWalletNetFlowUsd, 0);
  assert.equal(result.accumulationDays, 0);
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 100);
  const partial = qualifiedProviderProject();
  delete partial.smartWalletSells24h;
  delete partial.smartWalletSellVolumeUsd;
  const missing = analyzeSmartMoneyAccumulation(analyzeSmartWallets(partial, options), options);
  assert.equal(missing.smartWalletNetFlowUsd, undefined);
  assert.equal(missing.smartWalletSellCount, undefined);
  assert.equal(missing.smartMoneyAccumulationScore, null);
});

test("existing provider provenance fails closed for stale, mismatched, conflicting and transfer observations", () => {
  for (const patch of [
    { sourceTimestamp: new Date(NOW - 3_600_001).toISOString() }, { sourceTimestamp: new Date(NOW + 1).toISOString() },
    { chain: "ethereum" }, { tokenAddress: WALLET }, { network: "ethereum" }, { value: 123 },
    { source: "blockscout-wallets" }, { source: "rpc-wallets" }, { source: "goplus" },
    { holderSampleOnly: true }, { buyerClassificationAvailable: false }, { tradeClassification: "TRANSFER" },
    { complete24h: false }, { window: { startAt: NOW - DAY / 2, endAt: NOW, complete: true } },
    { confidence: 0 }, { confidence: null }, { observationType: {} },
    { verificationStatus: "RECOVERED_EXISTING_OBSERVATION" }, { observationType: "INFERRED" },
  ]) {
    const input = qualifiedProviderProject();
    Object.assign(input.fieldProvenance.smartWalletBuyVolumeUsd, patch);
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletNetFlowUsd, undefined, JSON.stringify(patch));
    assert.equal(result.smartMoneyAccumulationScore, null);
  }
  const incompatible = qualifiedProviderProject();
  incompatible.fieldProvenance.smartWalletSellVolumeUsd.sourceTimestamp = new Date(NOW - 1).toISOString();
  assert.equal(analyzeSmartMoneyAccumulation(incompatible, options).smartWalletNetFlowUsd, undefined);
  const conflict = qualifiedProviderProject({ smartWalletNetFlowUsd: 100_000, smartWalletBuyCount: 400 });
  const blocked = analyzeSmartMoneyAccumulation(analyzeSmartWallets(conflict, options), options);
  assert.equal(blocked.smartWalletNetFlowUsd, 100_000);
  assert.equal(blocked.measuredWalletFlow.values.smartWalletNetFlowUsd, null);
  assert.equal(blocked.measuredWalletFlow.values.smartWalletBuyCount, null);
  assert.equal(blocked.smartMoneyAccumulationScore, null);
});

test("actual event samples cannot manufacture absent sells, unpriced flow, daily zero or short-history days", () => {
  for (const change of [
    (tape) => { tape.events.pop(); },
    (tape) => { tape.events[1].usdNotional = null; },
    (tape) => { tape.events[0].usdNotional = 0; tape.events[1].usdNotional = 0; },
  ]) {
    const input = eventTapeProject();
    change(input.ignitionRawSensors.eventTape);
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.accumulationDays, undefined);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(result.smartWalletBuyCount, undefined);
    assert.equal(result.smartWalletNetFlowUsd, undefined);
    if (input.ignitionRawSensors.eventTape.events[0].usdNotional === 0) assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, 0);
    else assert.equal(result.measuredWalletFlow.observedSample.netFlowUsd, null);
  }
});

test("actual event/qualification provenance rejects foreign, stale, unresolved, estimated or conflicting evidence", () => {
  for (const patch of [{ chain: "ethereum" }, { tokenAddress: WALLET }, { poolAddress: WALLET },
    { eventType: "TRANSFER" }, { side: "UNKNOWN" }, { economicActorAddress: null },
    { actorConfidencePct: 59 }, { timestampMode: "BLOCK_TIME_ESTIMATE" }, { reorgSafe: false },
    { transactionInitiatorType: "CONTRACT" }, { blockNumber: 102 },
    { eventTime: new Date(NOW + 1).toISOString() }, { source: "rpc-wallets" }]) {
    const input = eventTapeProject();
    Object.assign(input.ignitionRawSensors.eventTape.events[0], patch);
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletNetFlowUsd, undefined, JSON.stringify(patch));
    assert.equal(result.smartMoneyAccumulationScore, null);
  }
  for (const change of [
    (input) => { input.ignitionRawSensors.eventTape.observedAt = new Date(NOW - 3_600_001).toISOString(); },
    (input) => { delete input.fieldProvenance; },
    (input) => { input.fieldProvenance.smartWallets.sourceTimestamp = new Date(NOW).toISOString(); },
    (input) => { input.smartWallets[0].sampleSize = 7; },
    (input) => { input.smartWallets[0].insiderLinked = true; },
    (input) => { input.smartWallets[0].rugExposureRate = 26; },
    (input) => { input.fieldProvenance.smartWallets.qualification = { status: "DENIED" }; },
    (input) => { input.fieldProvenance.smartWallets.qualification = { status: "VERIFIED", available: false }; },
    (input) => { const tape = input.ignitionRawSensors.eventTape; tape.events.push({ ...tape.events[0], usdNotional: 2000 }); },
  ]) {
    const input = eventTapeProject();
    change(input);
    const result = analyzeSmartMoneyAccumulation(input, options);
    assert.equal(result.smartWalletNetFlowUsd, undefined);
    assert.equal(result.smartMoneyAccumulationScore, null);
  }
  const duplicate = eventTapeProject();
  duplicate.ignitionRawSensors.eventTape.events.push({ ...duplicate.ignitionRawSensors.eventTape.events[0] });
  assert.equal(analyzeSmartMoneyAccumulation(duplicate, options).measuredWalletFlow.observedSample.netFlowUsd, 900);
});

test("actual Blockscout transfer producer stays unknown even with tracked wallets and current price", () => {
  const input = eventTapeProject();
  const raw = normalizeBlockscoutWalletEvidence({ transfers: { items: [{ token: { address_hash: TOKEN, decimals: 0 },
    from: POOL, to: WALLET, value: "5", transaction_hash: `0x${"e".repeat(64)}`,
    timestamp: new Date(NOW - 1000).toISOString() }] } }, input,
  { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, now: new Date(NOW) });
  const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets({ ...raw, chain: "base", tokenAddress: TOKEN, priceUsd: 1e9 }, options), options);
  assert.equal(result.smartWalletNetFlowUsd, undefined);
  assert.equal(result.accumulationDays, undefined);
  assert.equal(result.smartMoneyAccumulationScore, null);
});

test("net math retains decimals, signed flow, overflow safety and contradictory explicit aliases", () => {
  const input = project({ smartWalletBuyVolumeUsd: 0.3, smartWalletSellVolumeUsd: 0.1, smartWalletNetFlowUsd: 0.2 });
  assert.ok(Math.abs(analyzeSmartMoneyAccumulation(input, options).measuredWalletFlow.values.smartWalletNetFlowUsd - 0.2) < 1e-12);
  for (const extra of [{ smartWalletNetFlowUsd: "invalid" },
    { smartWalletNetFlowUsd: true }, { smartWalletBuyVolumeUsd: Number.MAX_VALUE, smartWalletSellVolumeUsd: 0,
      smartWalletNetFlowUsd: -Number.MAX_VALUE }]) {
    assert.equal(analyzeSmartMoneyAccumulation(project(extra), options).measuredWalletFlow.values.smartWalletNetFlowUsd, null);
  }
});

function provenance(end = NOW, extra = {}) {
  return {
    schemaVersion: 1,
    chain: "base",
    tokenAddress: TOKEN,
    source: "qualified-swap-fixture",
    evidenceId: `receipt-${end}`,
    observationType: "MEASURED",
    exactTokenIdentity: true,
    tradeClassification: "VERIFIED_SWAPS",
    observedAt: new Date(end).toISOString(),
    window: {
      startAt: new Date(end - DAY).toISOString(),
      endAt: new Date(end).toISOString(),
      complete: true,
    },
    qualification: {
      status: "VERIFIED",
      cohortId: "pinned-wallet-cohort",
      policyId: "historical-performance-v1",
      qualifiedAt: "2026-10-01T00:00:00Z",
    },
    ...extra,
  };
}

function project(extra = {}) {
  return {
    chain: "base", tokenAddress: TOKEN,
    smartWalletBuys24h: 3, smartWalletSells24h: 1,
    smartWalletBuyVolumeUsd: 1000, smartWalletSellVolumeUsd: 100,
    smartWalletFlowProvenance: provenance(),
    ...extra,
  };
}

function history(end, net = 900) {
  return {
    provenance: provenance(end),
    values: { smartWalletBuyVolumeUsd: 1000, smartWalletSellVolumeUsd: 1000 - net },
  };
}

test("derived wallet provenance carries the original window clock, identity and separate computation time", () => {
  const end = NOW - 60_000;
  const observedAt = new Date(NOW - 45_000).toISOString();
  const input = project({
    sourceTimestamp: "2099-01-01T00:00:00Z",
    smartWalletFlowProvenance: provenance(end, { observedAt }),
    smartWalletFlowHistory: [history(end - DAY, 0)],
  });
  const original = structuredClone(input);
  const result = produceMeasuredWalletFlowInputs(input, options);
  const fields = ["smartWalletNetFlowUsd", "smartWalletBuyCount", "smartWalletSellCount", "accumulationDays"];
  for (const field of fields) {
    const meta = result.fieldProvenance[field];
    assert.equal(meta.sourceTimestamp, new Date(end).toISOString(), field);
    assert.equal(meta.observedAt, observedAt, field);
    assert.equal(meta.computedAt, new Date(NOW).toISOString(), field);
    assert.equal(meta.source, "measured-wallet-flow-v1", field);
    assert.equal(meta.chain, "base", field);
    assert.equal(meta.tokenAddress, TOKEN, field);
    assert.equal(Object.hasOwn(meta, "confidence"), false, field);
    assert.equal(meta.receipts[0].observedAt, observedAt, field);
  }
  const aliases = resolveCanonicalAliases(result, { fields, disableSemanticScan: true });
  for (const field of fields) assert.equal(aliases.provenance[field].sourceTimestamp, new Date(end).toISOString(), field);
  assert.deepEqual(input, original);
  const refreshed = produceMeasuredWalletFlowInputs(result, { now: NOW + 30_000 });
  assert.equal(refreshed.fieldProvenance.smartWalletNetFlowUsd.sourceTimestamp, new Date(end).toISOString());
  assert.equal(refreshed.fieldProvenance.smartWalletNetFlowUsd.computedAt, new Date(NOW + 30_000).toISOString());
  const expired = produceMeasuredWalletFlowInputs(refreshed, { now: NOW + 3_600_000 });
  assert.equal(expired.smartWalletNetFlowUsd, null);
  assert.equal(expired.fieldProvenance.smartWalletNetFlowUsd.verificationStatus, "UNKNOWN");
  assert.equal(expired.fieldProvenance.smartWalletNetFlowUsd.sourceTimestamp, new Date(end).toISOString());
});

test("explicit provider contract clocks survive derivation without recertifying raw observations", () => {
  const input = qualifiedProviderProject({ sourceTimestamp: "2099-01-01T00:00:00Z" });
  const original = structuredClone(input);
  const result = produceMeasuredWalletFlowInputs(input, options);
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd.sourceTimestamp, new Date(NOW).toISOString());
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd.chain, "base");
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd.tokenAddress, TOKEN);
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd.confidence, undefined);
  assert.deepEqual(result.fieldProvenance.smartWalletBuys24h, original.fieldProvenance.smartWalletBuys24h);
  assert.deepEqual(input, original);
});

test("regression: measured smart-wallet output produces root inputs before accumulation recompute", () => {
  const input = project({ smartWalletFlowHistory: [history(NOW - DAY, 0)] });
  const raw = JSON.stringify(input);
  const wallet = analyzeSmartWallets(input, options);
  assert.equal(wallet.smartWalletSignal.smartWalletNetFlowUsd, 900);
  assert.equal(wallet.smartWalletNetFlowUsd, 900);
  assert.equal(wallet.smartWalletBuyCount, 3);
  assert.equal(wallet.smartWalletSellCount, 1);
  assert.equal(wallet.accumulationDays, 1);
  const result = analyzeSmartMoneyAccumulation(wallet, options);
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 100);
  assert.ok(Number.isFinite(result.smartMoneyAccumulationScore));
  assert.equal(JSON.stringify(input), raw);
});

test("complete pinned history counts exact consecutive positive windows, not observations", () => {
  const input = project({ smartWalletFlowHistory: [
    history(NOW - 2 * DAY), history(NOW - DAY), history(NOW - 3 * DAY, -10),
    history(NOW - DAY), history(NOW),
  ] });
  let result = analyzeSmartMoneyAccumulation(input, options);
  assert.equal(result.accumulationDays, 3);
  const score = result.smartMoneyAccumulationScore;
  for (let i = 0; i < 3; i++) result = analyzeSmartMoneyAccumulation(result, options);
  assert.equal(result.accumulationDays, 3);
  assert.equal(result.smartMoneyAccumulationScore, score);
  assert.equal(result.measuredWalletFlow.status, "MEASURED");
  assert.equal(result.measuredWalletFlow.history.exact, true);
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd.receipts[0].evidenceId, provenance().evidenceId);
  assert.deepEqual(result.fieldProvenance.smartWalletNetFlowUsd.inputs,
    ["root.smartWalletBuyVolumeUsd", "root.smartWalletSellVolumeUsd"]);
  assert.equal(result.fieldProvenance.accumulationDays.receipts.length, 4);
});

test("qualified nested measurements bridge without root primitives and survive repeated engines", () => {
  const nested = {
    provenance: provenance(), smartWalletNetFlowUsd: 900,
    smartWalletBuys24h: 3, smartWalletSells24h: 1,
  };
  const input = { chain: "base", tokenAddress: TOKEN, smartWalletSignal: nested,
    smartWalletFlowHistory: [history(NOW - DAY, 0)] };
  let result = analyzeSmartMoneyAccumulation(input, options);
  assert.equal(result.smartWalletNetFlowUsd, 900);
  assert.equal(result.accumulationDays, 1);
  result = analyzeSmartWallets(result, options);
  result = analyzeSmartMoneyAccumulation(result, options);
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 100);
  assert.equal(result.smartWalletSignal, nested);
  assert.ok(result.fieldProvenance.smartWalletNetFlowUsd.inputs.includes("smartWalletSignal.smartWalletNetFlowUsd"));
});

test("partial buys never invent sells, net flow, a ratio, or accumulation days", () => {
  const input = project({ smartWalletBuys24h: 20, smartWalletBuyVolumeUsd: 1e9,
    smartWalletSells24h: null, smartWalletSellVolumeUsd: null, holderGrowthScore: 100 });
  const signal = calculateSmartWalletSignal(input, options);
  assert.equal(signal.smartWalletSells24h, null);
  assert.equal(signal.smartWalletSellVolumeUsd, null);
  assert.equal(signal.smartWalletNetFlowUsd, null);
  assert.equal(signal.smartWalletBuySellRatio, null);
  assert.equal(signal.smartWalletVolumeRatio, null);
  const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
  assert.equal(result.smartWalletBuyCount, 20);
  assert.equal(result.smartWalletSellCount, undefined);
  assert.equal(result.smartWalletNetFlowUsd, undefined);
  assert.equal(result.accumulationDays, undefined);
  assert.equal(result.smartMoneyAccumulationScore, null);
  assert.equal(result.smartMoneyAccumulationLevel, "unmeasured");
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 25);
  assert.equal(result.alerts?.length ?? 0, 0);
  assert.ok(result.smartWalletScore < 50);
});

test("explicit complete zero is measured zero, including zero accumulation days", () => {
  const input = project({ smartWalletBuys24h: 0, smartWalletSells24h: 0,
    smartWalletBuyVolumeUsd: 0, smartWalletSellVolumeUsd: 0 });
  const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
  assert.equal(result.smartWalletNetFlowUsd, 0);
  assert.equal(result.smartWalletBuyCount, 0);
  assert.equal(result.smartWalletSellCount, 0);
  assert.equal(result.accumulationDays, 0);
  assert.equal(result.smartWalletScore, 0);
  assert.equal(result.smartMoneyAccumulationScore, 0);
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 100);
});

test("negative measured flow is retained and terminates the accumulation streak", () => {
  const result = analyzeSmartMoneyAccumulation(project({ smartWalletBuyVolumeUsd: 0 }), options);
  assert.equal(result.smartWalletNetFlowUsd, -100);
  assert.equal(result.accumulationDays, 0);
  assert.equal(result.measuredWalletFlow.values.smartWalletNetFlowUsd, -100);
  const zero = analyzeSmartMoneyAccumulation(project({ smartWalletBuyVolumeUsd: 100,
    smartWalletFlowHistory: [{ invalid: true }] }), options);
  assert.equal(zero.accumulationDays, 0);
});

test("stale receipts cannot be refreshed by a new observedAt or repeated recomputation", () => {
  for (const meta of [provenance(NOW - 3_600_001),
    provenance(NOW - 3_600_001, { observedAt: new Date(NOW).toISOString() })]) {
    const input = project({ smartWalletFlowProvenance: meta,
      smartWalletNetFlowUsd: 1e9, accumulationDays: 100 });
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(input, options), options);
    assert.equal(result.smartWalletScore, null);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 0);
    assert.equal(result.smartWalletNetFlowUsd, null);
    assert.equal(result.measuredWalletFlow.rejectedReceiptInputs.root.values.smartWalletNetFlowUsd, 1e9);
    assert.equal(result.measuredWalletFlow.rejectedReceiptInputs.root.values.accumulationDays, 100);
    assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.root.provenance, meta);
    assert.equal(result.measuredWalletFlow.status, "UNKNOWN");
  }
  const first = analyzeSmartMoneyAccumulation(project({ smartWalletFlowHistory: [history(NOW - DAY, 0)] }), options);
  const stale = analyzeSmartMoneyAccumulation(first, { now: NOW + 3_600_001 });
  assert.equal(stale.smartWalletNetFlowUsd, null);
  assert.equal(stale.accumulationDays, null);
  assert.equal(stale.smartMoneyAccumulationScore, null);
  assert.equal(stale.fieldProvenance.smartWalletNetFlowUsd.verificationStatus, "UNKNOWN");
  const snapshot = structuredClone(stale.measuredWalletFlow.rejectedReceiptInputs);
  const repeated = analyzeSmartMoneyAccumulation(analyzeSmartWallets(stale, { now: NOW + 3_600_001 }), { now: NOW + 3_600_001 });
  assert.deepEqual(repeated.measuredWalletFlow.rejectedReceiptInputs, snapshot);
  assert.equal(snapshot.root.fieldProvenance.smartWalletNetFlowUsd.verificationStatus, "VERIFIED_DERIVED_OBSERVATION");
  assert.equal(analyzeCapitalFlow(repeated).capitalFlowScore, 0);
  assert.equal(analyzeSmartMoneyRotation(repeated).smartMoneyRotationScore, 0);
});

test("wrong or conflicting identities, absent qualification and unpinned windows stay unknown", () => {
  const invalid = [
    provenance(NOW, { chain: "ethereum" }),
    provenance(NOW, { tokenAddress: `0x${"b".repeat(40)}` }),
    provenance(NOW, { network: "ethereum" }),
    provenance(NOW, { exactTokenIdentity: false }),
    provenance(NOW, { source: "unknown" }),
    provenance(NOW, { evidenceId: "" }),
    provenance(NOW, { observationType: "INFERRED" }),
    provenance(NOW, { tradeClassification: "TRANSFER" }),
    provenance(NOW, { qualification: { ...provenance().qualification, status: "UNKNOWN" } }),
    provenance(NOW, { qualification: { ...provenance().qualification, qualifiedAt: new Date(NOW).toISOString() } }),
    provenance(NOW, { window: { ...provenance().window, complete: false } }),
    provenance(NOW, { window: { ...provenance().window, startAt: new Date(NOW - DAY / 2).toISOString() } }),
    provenance(NOW, { observedAt: new Date(NOW + 1).toISOString() }),
    provenance(NOW, { observedAt: new Date(NOW - 1).toISOString() }),
  ];
  for (const meta of invalid) {
    const result = analyzeSmartMoneyAccumulation(analyzeSmartWallets(project({ smartWalletFlowProvenance: meta }), options), options);
    assert.equal(result.smartMoneyAccumulationScore, null, JSON.stringify(meta));
    assert.equal(result.smartWalletScore, null);
    assert.equal(result.smartWalletNetFlowUsd, undefined);
    assert.equal(result.accumulationDays, undefined);
    assert.ok(result.measuredWalletFlow.diagnostics.length);
  }
  for (const extra of [{ network: "ethereum" }, { identityConflict: true }, { canonicalIdentityHardBlock: true }]) {
    assert.equal(analyzeSmartMoneyAccumulation(project(extra), options).smartMoneyAccumulationScore, null);
  }
});

test("EVM aliases normalize but Solana identity remains case sensitive", () => {
  const evm = project({ chain: "8453", tokenAddress: TOKEN.toUpperCase().replace("0X", "0x") });
  assert.equal(analyzeSmartMoneyAccumulation(evm, options).smartWalletNetFlowUsd, 900);
  const mint = "G8aVC4nk5oPWzTHp4PDm3kAuixCebv9WRQMD93h9pump";
  const solana = project({ chain: "solana", tokenAddress: mint,
    smartWalletFlowProvenance: provenance(NOW, { chain: "solana", tokenAddress: mint }) });
  assert.equal(analyzeSmartMoneyAccumulation(solana, options).smartWalletNetFlowUsd, 900);
  solana.smartWalletFlowProvenance = { ...solana.smartWalletFlowProvenance, tokenAddress: mint.replace("G", "g") };
  assert.equal(analyzeSmartMoneyAccumulation(solana, options).smartMoneyAccumulationScore, null);
});

test("short, gapped, partial, future, conflicting and foreign history cannot manufacture days", () => {
  const badHistory = [
    [], [history(NOW - DAY)], [history(NOW - 2 * DAY, 0)],
    [{ ...history(NOW - DAY, 0), provenance: provenance(NOW - DAY, { tokenAddress: `0x${"b".repeat(40)}` }) }],
    [{ ...history(NOW - DAY, 0), provenance: provenance(NOW - DAY, {
      window: { ...provenance(NOW - DAY).window, complete: false } }) }],
    [{ ...history(NOW - DAY, 0), provenance: provenance(NOW - DAY, {
      qualification: { ...provenance().qualification, cohortId: "other-cohort" } }) }],
    [{ ...history(NOW - DAY, 0), values: { smartWalletBuyVolumeUsd: 0 } }],
    [history(NOW, 0)], [history(NOW + DAY, 0)],
    [history(NOW - DAY, 0), history(NOW - DAY, 900)],
    [history(NOW - DAY - 1, 0)],
    [{ ...history(NOW - DAY, 0), provenance: provenance(NOW - DAY, { evidenceId: provenance().evidenceId }) }],
  ];
  for (const smartWalletFlowHistory of badHistory) {
    const result = analyzeSmartMoneyAccumulation(project({ smartWalletFlowHistory }), options);
    assert.equal(result.accumulationDays, undefined, JSON.stringify(smartWalletFlowHistory));
    assert.equal(result.measuredWalletFlow.history.exact, false);
    assert.ok(result.measuredWalletFlow.rawPrerequisites.accumulationDays);
    assert.ok(result.smartMoneyAccumulationCoverage.missingValues.includes("accumulationDays"));
  }
  const short = produceMeasuredWalletFlowInputs(project({ smartWalletFlowHistory: [history(NOW - DAY)] }), options);
  assert.equal(short.measuredWalletFlow.history.observedPositiveDays, 2);
  assert.equal(short.measuredWalletFlow.values.accumulationDays, null);
});

test("compatible window primitives are required within one receipt, never mixed to derive net", () => {
  const input = project({ smartWalletBuyVolumeUsd: 1000, smartWalletSellVolumeUsd: null,
    smartWalletSignal: { provenance: provenance(), smartWalletSellVolumeUsd: 100 } });
  const result = analyzeSmartMoneyAccumulation(input, options);
  assert.equal(result.smartWalletNetFlowUsd, undefined);
  assert.equal(result.accumulationDays, undefined);
  assert.equal(result.measuredWalletFlow.values.smartWalletNetFlowUsd, null);
});

test("incompatible root/nested windows and contradictory qualified measurements fail closed", () => {
  for (const nested of [
    { provenance: provenance(NOW - 1), smartWalletNetFlowUsd: 900 },
    { provenance: provenance(), smartWalletNetFlowUsd: 800 },
    { provenance: provenance(NOW, { qualification: { ...provenance().qualification, cohortId: "other-cohort" } }),
      smartWalletNetFlowUsd: 900 },
  ]) {
    const input = project({ smartWalletSignal: nested });
    const wallet = analyzeSmartWallets(input, options);
    const result = analyzeSmartMoneyAccumulation(wallet, options);
    assert.equal(result.smartWalletNetFlowUsd, undefined);
    assert.equal(result.accumulationDays, undefined);
    assert.equal(result.smartWalletSignal.smartWalletNetFlowUsd, null);
    assert.deepEqual(result.measuredWalletFlow.rejectedReceiptInputs.smartWalletSignal.value, nested);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
    assert.ok(result.measuredWalletFlow.rejectedReceiptInputs.smartWalletSignal.reasons
      .some((row) => /CONFLICT|INCOMPATIBLE/.test(row.reason)));
    const repeated = analyzeSmartMoneyAccumulation(analyzeSmartWallets(result, options), options);
    assert.equal(analyzeCapitalFlow(repeated).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(repeated).smartMoneyRotationScore, 0);
    assert.deepEqual(repeated.measuredWalletFlow.rejectedReceiptInputs, result.measuredWalletFlow.rejectedReceiptInputs);
  }
});

test("unqualified numbers, holders, transfers and engine coverage cannot mint a flow receipt", () => {
  for (const extra of [
    { smartWalletSignal: { smartWalletNetFlowUsd: 1e9, smartWalletBuys24h: 500, smartWalletSells24h: 0 } },
    { holderAddresses: [TOKEN], holderGrowthScore: 100, accumulationHistory: [1, 2, 3] },
    { walletParticipationHistory: [{ direction: "TRANSFER", smartWallet: true, volumeUsd: 1e9 }] },
    { smartWalletCoverage: { coveragePct: 100, observedValues: { smartWalletNetFlowUsd: 1e9 } } },
  ]) {
    const result = analyzeSmartMoneyAccumulation({ chain: "base", tokenAddress: TOKEN, ...extra }, options);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(result.measuredWalletFlow.status, "UNKNOWN");
    assert.equal(result.smartWalletNetFlowUsd, undefined);
    assert.equal(result.accumulationDays, undefined);
  }
  const unqualified = project({ smartWalletFlowProvenance: undefined });
  const wallet = analyzeSmartWallets(unqualified, options);
  assert.equal(wallet.smartWalletSignal.smartWalletNetFlowUsd, 900);
  assert.equal(analyzeSmartMoneyAccumulation(wallet, options).smartWalletNetFlowUsd, undefined);
});

test("null, booleans, whitespace, invalid counts and nonfinite values are not measured zero", () => {
  for (const value of [null, undefined, "", " ", false, true, [], {}, Infinity, NaN, -1, 1.5]) {
    const result = analyzeSmartMoneyAccumulation(project({ smartWalletBuys24h: value, smartWalletSells24h: value,
      smartWalletBuyVolumeUsd: null, smartWalletSellVolumeUsd: null }), options);
    assert.equal(result.smartMoneyAccumulationScore, null, String(value));
    assert.equal(result.smartWalletBuyCount, undefined);
    assert.equal(result.smartWalletNetFlowUsd, undefined);
  }
  const result = analyzeSmartMoneyAccumulation(project({ smartWalletBuys24h: "0", smartWalletSells24h: "0",
    smartWalletBuyVolumeUsd: "0", smartWalletSellVolumeUsd: "0" }), options);
  assert.equal(result.smartWalletNetFlowUsd, 0);
  assert.equal(result.accumulationDays, 0);
});

test("supplied canonical values and provenance are not overwritten or silently recertified", () => {
  const marker = { source: "raw-root", observationType: "MEASURED" };
  const input = project({ smartWalletNetFlowUsd: "900", fieldProvenance: { smartWalletNetFlowUsd: marker } });
  const raw = JSON.stringify(input);
  const result = analyzeSmartMoneyAccumulation(input, options);
  assert.equal(result.smartWalletNetFlowUsd, "900");
  assert.equal(result.fieldProvenance.smartWalletNetFlowUsd, marker);
  assert.equal(JSON.stringify(input), raw);
});

test("legacy direct canonical callers retain scores, zero semantics and advisory decisions", () => {
  const input = { smartWalletNetFlowUsd: 100_000, smartWalletBuyCount: 5, smartWalletSellCount: 1,
    accumulationDays: 10, marketCap: 1_000_000, volume24h: 500_000, holderGrowthScore: 100,
    whaleRiskScore: 0, finalDecision: "UNKNOWN", decisionEligible: false, alerts: [] };
  const result = analyzeSmartMoneyAccumulation(input, options);
  assert.equal(result.smartMoneyAccumulationScore, 100);
  assert.equal(result.smartMoneyAccumulationLevel, "heavy smart money accumulation");
  assert.equal(result.smartMoneyAccumulationCoverage.coveragePct, 100);
  assert.equal(result.measuredWalletFlow.status, "UNKNOWN"); // Compatibility is not new certification.
  assert.equal(result.finalDecision, "UNKNOWN");
  assert.equal(result.decisionEligible, false);
  assert.equal(result.accumulationDays, 10);
  assert.equal(analyzeSmartMoneyAccumulation({ smartWalletBuyCount: 500, holderGrowthScore: 100 }, options)
    .smartMoneyAccumulationScore, null);
  const batch = analyzeSmartMoneyAccumulationBatch(analyzeSmartWalletBatch([project()], options), options);
  assert.equal(batch[0].smartWalletNetFlowUsd, 900);
  for (const id of ["smartWallet", "smartMoneyAccumulation"]) {
    const contract = getEngineContracts().find((entry) => entry.id === id);
    assert.equal(contract.affectsFinalDecision, false);
    assert.equal(contract.canBlockCandidate, false);
  }
});

test("a cached derived result cannot replace raw receipts on the next recomputation", () => {
  const first = analyzeSmartMoneyAccumulation(project({ smartWalletFlowHistory: [history(NOW - DAY, 0)] }), options);
  const stripped = { ...first, smartWalletFlowProvenance: undefined, smartWalletSignal: null,
    smartWalletFlowHistory: undefined };
  const result = analyzeSmartMoneyAccumulation(stripped, options);
  assert.equal(result.smartWalletNetFlowUsd, null);
  assert.equal(result.smartWalletBuyCount, null);
  assert.equal(result.accumulationDays, null);
  assert.equal(result.smartMoneyAccumulationScore, null);
});

test("conflicting declared aliases or net flow are isolated with originals retained in diagnostics", () => {
  const input = project({ smartWalletBuyCount: 400, smartWalletNetFlowUsd: 100_000 });
  for (const candidate of [input, analyzeSmartWallets(input, options)]) {
    const result = analyzeSmartMoneyAccumulation(candidate, options);
    assert.equal(result.smartWalletBuyCount, null);
    assert.equal(result.smartWalletNetFlowUsd, null);
    assert.equal(result.measuredWalletFlow.rejectedReceiptInputs.root.values.smartWalletBuyCount, 400);
    assert.equal(result.measuredWalletFlow.rejectedReceiptInputs.root.values.smartWalletNetFlowUsd, 100_000);
    assert.equal(result.smartMoneyAccumulationScore, null);
    assert.equal(result.measuredWalletFlow.values.smartWalletBuyCount, null);
    assert.equal(result.measuredWalletFlow.values.smartWalletNetFlowUsd, null);
    assert.equal(analyzeCapitalFlow(result).capitalFlowScore, 0);
    assert.equal(analyzeSmartMoneyRotation(result).smartMoneyRotationScore, 0);
    const repeated = analyzeSmartMoneyAccumulation(analyzeSmartWallets(result, options), options);
    assert.equal(repeated.smartWalletNetFlowUsd, null);
    assert.deepEqual(repeated.measuredWalletFlow.rejectedReceiptInputs, result.measuredWalletFlow.rejectedReceiptInputs);
  }
});
