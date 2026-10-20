import test from "node:test";
import assert from "node:assert/strict";

import { createFrozenOutcomeCollector } from "../src/archive/frozenOutcomeCollector.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const REQUESTED_AT = "2026-10-20T00:00:00.000Z";
const RECEIVED_AT = "2026-10-20T00:00:03.000Z";

function fixture() {
  const admitted = [];
  const observed = [];
  const archive = { admitPrediction: (record) => { admitted.push(record); return { status: "admitted" }; } };
  const request = {
    requestId: "req-1",
    requestedAt: REQUESTED_AT,
    observeTransport: async (receipt) => { observed.push(receipt); },
  };
  const prediction = { immutableContract: { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, frozenEpisode: "episode-1" } };
  const task = { recordId: "prediction-1", taskId: "task-1", frozen: { horizonHours: 24, observationClockPolicy: "COLLECTION_RECEIPT_V1" } };
  return { admitted, observed, archive, request, prediction, task };
}

function receipt(provider, body, status = 200) {
  return { provider, url: `https://provider.example/${provider}`, status, requestedAt: REQUESTED_AT, receivedAt: RECEIVED_AT, headers: { contentType: "application/json", date: "ignored" }, rawBytes: Buffer.from(body) };
}

function dexRow(priceUsd = "1.25") {
  return { chainId: "base", pairAddress: POOL, baseToken: { address: TOKEN, symbol: "ONE" }, priceUsd };
}

test("collector archives raw diagnostic before returning an exact receipt-timed outcome", async () => {
  const context = fixture();
  const body = JSON.stringify({ pairs: [dexRow()] });
  const collector = createFrozenOutcomeCollector({
    archive: context.archive,
    clock: () => RECEIVED_AT,
    dexFetcher: async ({ onResponseBytes }) => {
      await onResponseBytes(receipt("dexscreener", body));
      return JSON.parse(body);
    },
  });
  const evidence = await collector.collect(context);
  assert.equal(context.observed.length, 1);
  assert.equal(context.admitted.length, 1);
  assert.equal(context.admitted[0].immutableContract.kind, "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC");
  assert.equal(context.admitted[0].rawBytes.toString(), body);
  assert.equal(evidence.immutableContract.kind, "CAPTURED_EXACT_OUTCOME_V1");
  assert.equal(evidence.rawBytes.toString(), body);
  assert.equal(evidence.immutableContract.observationOf.receivedAt, RECEIVED_AT);
  assert.equal(evidence.immutableContract.observationOf.marketObservedAt, null);
  assert.equal(evidence.immutableContract.exactObservation.observationIntegrityHash.length, 64);
  assert.equal(evidence.immutableContract.exactObservation.receiptObservedAt, RECEIVED_AT);
});

test("collector keeps invalid DEX response diagnostic and falls back to one exact Gecko pool request", async () => {
  const context = fixture();
  const bad = '{"error":"upstream"}';
  const geckoBody = JSON.stringify({ data: { id: `base_${POOL}`, attributes: { address: POOL, base_token_price_usd: "2.5" }, relationships: { network: { data: { id: "base" } }, base_token: { data: { id: `base_${TOKEN}` } } } } });
  let geckoOptions = null;
  const collector = createFrozenOutcomeCollector({
    archive: context.archive,
    dexFetcher: async ({ onResponseBytes }) => {
      await onResponseBytes(receipt("dexscreener", bad, 503));
      const error = new Error("503"); error.statusCode = 503; throw error;
    },
    geckoFetcher: async (options) => {
      geckoOptions = options;
      await options.onResponseBytes(receipt("geckoterminal", geckoBody));
      return JSON.parse(geckoBody);
    },
  });
  const evidence = await collector.collect(context);
  assert.equal(geckoOptions.maxAttempts, 1);
  assert.equal(context.admitted.length, 2);
  assert.equal(context.admitted[0].rawBytes.toString(), bad);
  assert.equal(evidence.immutableContract.poolAddress, POOL);
  assert.equal(evidence.immutableContract.exactObservation.priceUsd, 2.5);
});

test("diagnostic archive failures are fatal and prevent fallback", async () => {
  const context = fixture();
  context.archive.admitPrediction = () => { throw new Error("disk unavailable"); };
  let geckoCalled = false;
  const collector = createFrozenOutcomeCollector({
    archive: context.archive,
    dexFetcher: async ({ onResponseBytes }) => {
      await onResponseBytes(receipt("dexscreener", "{}"));
      return { pairs: [] };
    },
    geckoFetcher: async () => { geckoCalled = true; return null; },
  });
  await assert.rejects(collector.collect(context), (error) => error.fatalCollectionStorageFailure === true && /disk unavailable/.test(error.message));
  assert.equal(geckoCalled, false);
});
