import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendMarketContextObservations,
  buildMarketContextObservation,
  loadMarketContextObservations,
} from "../src/production/marketContextObservationLedger.js";
import {
  attachMarketContext,
  collectMarketContextSnapshot,
  deriveExactMarketSampleContext,
} from "../src/production/marketContextSnapshotProvider.js";
import { auditDataSourceReadiness } from "../src/production/dataSourceReadinessAudit.js";
import { forecastLiquidityWeather } from "../src/production/liquidityWeatherForecast.js";
import { enableSource, getSourceConfig, getSourcePlan } from "../src/data/dataSourceManager.js";
import { runMarketContextCapture } from "../src/ops/runMarketContextCapture.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;

test("market context derives only point-in-time observed values and labels unavailable sources", async () => {
  const now = "2026-08-24T01:00:00.000Z";
  const current = [{
    chain: "base", tokenAddress: TOKEN, poolAddress: POOL, observedAt: now,
    priceUsd: 1.2, volume24hUsd: 120, liquidityUsd: 220,
  }];
  const previousExact = [{
    chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    observedAt: "2026-08-24T00:00:00.000Z",
    priceUsd: 1, volume24hUsd: 100, liquidityUsd: 200,
  }];
  const context = await collectMarketContextSnapshot({
    now,
    currentExactObservations: current,
    previousExactObservations: previousExact,
    previousContext: [{
      observedAt: "2026-08-24T00:00:00.000Z",
      stablecoinSupplyUsd: 90,
      openInterestUsd: 100,
    }],
    providers: {
      getCoinGeckoMarketsByIds: async () => [
        { id: "bitcoin", current_price: 100, high_24h: 105, low_24h: 95, price_change_percentage_24h: 2 },
        { id: "ethereum", price_change_percentage_24h: 3 },
      ],
      getDefiLlamaStablecoinSnapshot: async () => ({ totalSupplyUsd: 100 }),
      observeHyperliquidLeverage: async () => ({
        status: "OBSERVED_PERP_MARKET",
        derivatives: { fundingRate: 0.0001, openInterestUsd: 110 },
      }),
    },
  });

  assert.equal(context.btcReturnPct, 2);
  assert.equal(context.ethReturnPct, 3);
  assert.equal(context.btcVolatilityPct, 10);
  assert.equal(context.stablecoinNetFlowUsd, 10);
  assert.ok(Math.abs(context.openInterestChangePct - 10) < 1e-9);
  assert.equal(context.marketBreadthPct, 100);
  assert.equal(context.dexVolumeChangePct, 20);
  assert.equal(context.liquidityChangePct, 10);
  assert.equal(context.bridgeNetFlowUsd, null);
  assert.equal(context.liquidationUsd, null);
  assert.ok(context.unavailableFields.some((row) => row.field === "bridgeNetFlowUsd"));
  assert.equal(context.automaticTrading, false);
});

test("market context does not manufacture change when no prior snapshot exists", async () => {
  const context = await collectMarketContextSnapshot({
    now: "2026-08-24T01:00:00.000Z",
    providers: {
      getCoinGeckoMarketsByIds: async () => [],
      getDefiLlamaStablecoinSnapshot: async () => ({ totalSupplyUsd: 100 }),
      observeHyperliquidLeverage: async () => ({ status: "NO_MATCHING_PERP_MARKET" }),
    },
  });
  assert.equal(context.stablecoinSupplyUsd, 100);
  assert.equal(context.stablecoinNetFlowUsd, null);
  assert.equal(context.openInterestChangePct, null);
});

test("market context ledger rejects future rows and deduplicates durable observations", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "market-context-"));
  const file = path.join(dir, "context.jsonl");
  const row = {
    observedAt: "2026-08-24T01:00:00.000Z",
    state: "PARTIAL_POINT_IN_TIME_CONTEXT",
    btcReturnPct: 2,
    pointInTimeVerified: true,
  };
  assert.equal(buildMarketContextObservation(row, { asOf: "2026-08-24T00:00:00.000Z" }), null);
  assert.equal(appendMarketContextObservations([row], { file, asOf: row.observedAt }).saved, 1);
  assert.equal(appendMarketContextObservations([row], { file, asOf: row.observedAt }).saved, 0);
  assert.equal(loadMarketContextObservations({ file }).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("market context ledger exposes tampering and refuses explicitly unverified rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "market-context-integrity-"));
  const file = path.join(dir, "context.jsonl");
  const observedAt = "2026-08-24T01:00:00.000Z";
  const row = {
    observedAt,
    state: "PARTIAL_POINT_IN_TIME_CONTEXT",
    btcReturnPct: 2,
    pointInTimeVerified: true,
  };
  assert.equal(appendMarketContextObservations([row], { file, asOf: observedAt }).saved, 1);
  const stored = JSON.parse(fs.readFileSync(file, "utf8").trim());
  fs.writeFileSync(file, `${JSON.stringify({ ...stored, btcReturnPct: 99 })}\n`);
  const [tampered] = loadMarketContextObservations({ file });
  assert.equal(tampered.__marketContextLedgerIntegrityFailure, true);
  assert.equal(tampered.pointInTimeVerified, false);
  assert.equal(buildMarketContextObservation({ ...row, pointInTimeVerified: false }, { asOf: observedAt }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("context attachment cannot put a later observation into an earlier market row", () => {
  const rows = attachMarketContext([{
    chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    observedAt: "2026-08-24T00:00:00.000Z", priceUsd: 1,
  }], {
    observedAt: "2026-08-24T01:00:00.000Z",
    pointInTimeVerified: true,
    btcReturnPct: 9,
  });
  assert.equal(rows[0].marketContextPointInTimeVerified, false);
  assert.equal(rows[0].btcReturnPct, undefined);
});

test("sample context enforces pool compatibility when both observations know the pool", () => {
  const sample = deriveExactMarketSampleContext([{
    chain: "base", tokenAddress: TOKEN, poolAddress: POOL,
    observedAt: "2026-08-24T01:00:00.000Z", priceUsd: 2,
  }], [{
    chain: "base", tokenAddress: TOKEN, poolAddress: `0x${"3".repeat(40)}`,
    observedAt: "2026-08-24T00:00:00.000Z", priceUsd: 1,
  }]);
  assert.equal(sample.marketBreadthSampleSize, 0);
  assert.equal(sample.marketBreadthPct, null);
});

test("liquidity weather reports insufficient evidence instead of treating missing inputs as zero", () => {
  const weather = forecastLiquidityWeather([]);
  assert.equal(weather.state, "INSUFFICIENT_EVIDENCE");
  assert.equal(weather.expansionProbability, null);
});

test("data-source readiness distinguishes code coverage from real live configuration and health", () => {
  const local = auditDataSourceReadiness({
    root: path.resolve("."),
    now: "2026-08-24T01:00:00.000Z",
    env: {},
  });
  assert.equal(local.criticalCodeComplete, true);
  assert.equal(local.liveReady, false);
  assert.equal(local.policy.fabricatedProviderHealthAllowed, false);
  assert.ok(local.optionalGaps.some((row) => row.downstreamField === "bridgeNetFlowUsd"));

  const health = Object.fromEntries(local.requiredFamilies.map((family) => [family.id, "HEALTHY"]));
  const live = auditDataSourceReadiness({
    root: path.resolve("."),
    now: "2026-08-24T01:00:00.000Z",
    env: {
      BASE_RPC_URL: "https://rpc.invalid.example",
      SUPABASE_URL: "https://storage.invalid.example",
      SUPABASE_SERVICE_ROLE_KEY: "configured-for-test",
      NATIVE_DISCOVERY_CHAINS: "base",
    },
    familyLiveHealth: health,
    latestMarketContext: {
      observedAt: "2026-08-24T00:30:00.000Z",
      providerHealth: {
        coingecko: { status: "OBSERVED" },
        defillamaStablecoins: { status: "OBSERVED" },
      },
    },
  });
  assert.equal(live.configurationComplete, true);
  assert.equal(live.liveReady, true);
  assert.equal(live.state, "DATA_SOURCES_LIVE");
});

test("declared-only provider names cannot appear enabled merely because a key exists", () => {
  const source = getSourceConfig("nansen");
  const enabled = enableSource("nansen");
  const plan = getSourcePlan();
  assert.equal(source.implemented, false);
  assert.equal(source.enabled, false);
  assert.equal(enabled.status, "IMPLEMENTATION_MISSING");
  assert.ok(plan.declaredOnlySources.some((row) => row.source === "nansen"));
  assert.ok(!plan.enabledSources.includes("nansen"));
});

test("scheduled market-context capture persists independently of due token outcomes", async () => {
  let saved = [];
  const result = await runMarketContextCapture({
    now: "2026-08-24T01:00:00.000Z",
    exactObservations: [],
    previousContext: [],
    provider: async ({ now }) => ({
      observedAt: now,
      state: "PARTIAL_POINT_IN_TIME_CONTEXT",
      pointInTimeVerified: true,
      btcReturnPct: 1,
      providerHealth: { coingecko: { status: "OBSERVED" } },
    }),
    save: (rows) => {
      saved = rows;
      return { saved: rows.length, rejected: 0 };
    },
    writeReport: false,
  });
  assert.equal(result.report.observationsSaved, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].pointInTimeVerified, true);
  assert.equal(result.report.automaticTrading, false);
});
