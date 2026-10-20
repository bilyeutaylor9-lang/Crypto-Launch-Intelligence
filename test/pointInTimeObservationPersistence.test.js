import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildFirstSeenSnapshot,
  loadPointInTimeObservationStore,
  pointInTimeIdentityKey,
  recordPointInTimeObservation,
  recordPointInTimeObservations,
} from "../src/data/pointInTimeObservationStore.js";
import { analyzeFirstSeenOpportunity, analyzeFirstSeenOpportunityBatch } from "../src/engines/firstSeenOpportunityEngine.js";

const SOLANA = "Ab".repeat(16);
const EVM = `0x${"A".repeat(40)}`;
const FIRST_META = { observedAt: "2026-01-01T00:00:00.000Z", scanRunId: "first", codeCommitSha: "old-sha" };
const NEXT_META = { observedAt: "2026-01-02T00:00:00.000Z", scanRunId: "next", codeCommitSha: "new-sha" };

function tempStore(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "point-in-time-persistence-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "store.json");
  if (contents !== undefined) fs.writeFileSync(filePath, typeof contents === "string" ? contents : JSON.stringify(contents));
  return filePath;
}

function countIO(t, filePath) {
  const calls = { reads: 0, writes: 0 };
  const read = fs.readFileSync;
  const write = fs.writeFileSync;
  const readMock = t.mock.method(fs, "readFileSync", function (file, ...args) {
    assert.equal(file, filePath);
    calls.reads += 1;
    return read.call(fs, file, ...args);
  });
  const writeMock = t.mock.method(fs, "writeFileSync", function (file, ...args) {
    assert.equal(file, filePath);
    calls.writes += 1;
    return write.call(fs, file, ...args);
  });
  return { calls, restore: () => { readMock.mock.restore(); writeMock.mock.restore(); } };
}

function legacyRecord(project = {}, observations = []) {
  return {
    identityKey: pointInTimeIdentityKey(project),
    firstSeen: buildFirstSeenSnapshot(project, FIRST_META),
    observations,
    lastObservedAt: FIRST_META.observedAt,
    customRecordMetadata: { retained: true },
  };
}

test("engine batch reads and writes once, preserves row order and immutable first-seen snapshots", (t) => {
  const filePath = tempStore(t, { version: "custom-v9", projects: {}, customStoreMetadata: { retained: [1, 2] } });
  const projects = [
    { chain: "base", tokenAddress: EVM, symbol: "FIRST", priceUsd: 0, preIntelligenceMissingEvidence: ["holders"] },
    { chain: "solana", tokenAddress: SOLANA, symbol: "OTHER", priceUsd: 3 },
    { chain: "base", tokenAddress: EVM.toLowerCase(), symbol: "RENAMED", priceUsd: 9 },
  ];
  const original = structuredClone(projects);
  const io = countIO(t, filePath);
  const results = analyzeFirstSeenOpportunityBatch(projects, { meta: FIRST_META, store: { filePath } });
  assert.deepEqual(io.calls, { reads: 1, writes: 1 });
  io.restore();
  assert.deepEqual(projects, original);
  assert.deepEqual(results.map((row) => row.symbol), ["FIRST", "OTHER", "RENAMED"]);
  assert.deepEqual(results.map((row) => row.firstSeenOpportunity.firstSeenPrice), [0, 3, 0]);
  assert.ok(results.every((row) => row.firstSeenSnapshotImmutable));
  assert.deepEqual(results[2].firstSeenMissingEvidence, ["holders"]);

  const later = analyzeFirstSeenOpportunity({ ...projects[0], priceUsd: 30 }, { ...NEXT_META, store: { filePath } });
  assert.deepEqual(later.firstSeenOpportunity, results[0].firstSeenOpportunity);
  const store = loadPointInTimeObservationStore({ filePath });
  assert.equal(store.version, "custom-v9");
  assert.deepEqual(store.customStoreMetadata, { retained: [1, 2] });
  assert.deepEqual(Object.keys(store.projects), projects.slice(0, 2).map(pointInTimeIdentityKey));
  const saved = store.projects[pointInTimeIdentityKey(projects[0])];
  assert.equal(saved.symbol, "FIRST");
  assert.deepEqual(saved.observations.map((row) => row.priceUsd), [0, 9, 30]);
  assert.equal(saved.lastObservedAt, NEXT_META.observedAt);
  assert.equal(saved.rawIdentity.tokenAddress, EVM);
});

test("batch matches sequential single-record results, including duplicate keys, metadata and the per-project cap", (t) => {
  const project = { chain: "base", tokenAddress: EVM, priceUsd: 1 };
  const key = pointInTimeIdentityKey(project);
  const oldObservations = Array.from({ length: 249 }, (_, index) => ({ observedAt: FIRST_META.observedAt, priceUsd: index, custom: index }));
  const previous = legacyRecord(project, oldObservations);
  const untouched = legacyRecord({ projectId: "untouched" });
  const seed = { version: "preserve-version", custom: { owner: "fixture" }, projects: { [key]: previous, untouched } };
  const batchFile = tempStore(t, seed);
  const singleFile = tempStore(t, seed);
  const rows = [
    { ...project, priceUsd: 500 },
    { projectId: "new-project", priceUsd: 2 },
    { ...project, tokenAddress: EVM.toLowerCase(), priceUsd: 501 },
    { projectId: "new-project", priceUsd: 3 },
    { ...project, priceUsd: 502 },
  ];
  const io = countIO(t, batchFile);
  const batch = recordPointInTimeObservations(rows, NEXT_META, { filePath: batchFile });
  assert.deepEqual(io.calls, { reads: 1, writes: 1 });
  io.restore();
  const sequential = rows.map((row) => recordPointInTimeObservation(row, NEXT_META, { filePath: singleFile }));
  assert.deepEqual(batch, sequential);
  assert.deepEqual(batch.map((record) => record.observations.length), [250, 1, 250, 2, 250]);
  assert.equal(batch[0].observations.at(-1).priceUsd, 500);
  assert.equal(batch[1].observations.at(-1).priceUsd, 2);
  assert.deepEqual(loadPointInTimeObservationStore({ filePath: batchFile }), loadPointInTimeObservationStore({ filePath: singleFile }));
  const store = loadPointInTimeObservationStore({ filePath: batchFile });
  assert.deepEqual(store.projects[key].firstSeen, previous.firstSeen);
  assert.equal(store.projects[key].observations[0].priceUsd, 2);
  assert.deepEqual(store.projects[key].observations.slice(-3).map((row) => row.priceUsd), [500, 501, 502]);
  assert.deepEqual(store.projects[key].customRecordMetadata, previous.customRecordMetadata);
  assert.equal(store.projects[key].rawIdentity, undefined);
  assert.deepEqual(store.projects.untouched, untouched);
  assert.deepEqual(Object.keys(store.projects), [key, "untouched", "new-project"]);
});

test("one batch caps a cold project's history at 250 without changing first-seen or append order", (t) => {
  const filePath = tempStore(t);
  const rows = Array.from({ length: 260 }, (_, priceUsd) => ({ projectId: "duplicate", priceUsd }));
  const io = countIO(t, filePath);
  const records = recordPointInTimeObservations(rows, FIRST_META, { filePath });
  assert.deepEqual(io.calls, { reads: 1, writes: 1 });
  io.restore();
  assert.equal(records[0].observations.length, 1);
  assert.equal(records[259].observations.length, 250);
  assert.ok(records.every((record) => record.firstSeen.firstSeenPrice === 0));
  assert.deepEqual(records[259].observations.map((row) => row.priceUsd), Array.from({ length: 250 }, (_, i) => i + 10));
});

test("Solana token and pool case variants stay distinct; EVM variants share history", (t) => {
  for (const addressField of ["tokenAddress", "poolAddress"]) {
    const filePath = tempStore(t);
    const rows = [
      { chain: "solana", [addressField]: SOLANA, priceUsd: 1 },
      { chain: "solana", [addressField]: SOLANA.toLowerCase(), priceUsd: 2 },
      { chain: "base", [addressField]: EVM, priceUsd: 3 },
      { chain: "base", [addressField]: EVM.toLowerCase(), priceUsd: 4 },
    ];
    const records = recordPointInTimeObservations(rows, FIRST_META, { filePath });
    assert.notEqual(pointInTimeIdentityKey(rows[0]), pointInTimeIdentityKey(rows[1]));
    assert.equal(pointInTimeIdentityKey(rows[2]), pointInTimeIdentityKey(rows[3]));
    assert.deepEqual(records.map((record) => record.firstSeen.firstSeenPrice), [1, 2, 3, 3]);
    assert.equal(records[0].rawIdentity[addressField], SOLANA);
    assert.equal(records[1].rawIdentity[addressField], SOLANA.toLowerCase());
    const again = recordPointInTimeObservation({ ...rows[0], priceUsd: 9 }, NEXT_META, { filePath });
    assert.equal(again.firstSeen.firstSeenPrice, 1);
    assert.equal(Object.keys(loadPointInTimeObservationStore({ filePath }).projects).length, 3);
  }
});

test("fallback address aliases preserve Solana case and never infer an address from a symbol", (t) => {
  for (const field of ["finalContractAddress", "canonicalAddress", "tokenAddress", "contractAddress", "address"]) {
    assert.equal(pointInTimeIdentityKey({ canonicalChain: "solana", [field]: SOLANA }), `solana:token:${SOLANA}`);
  }
  for (const field of ["primaryTradablePool", "poolAddress", "pairAddress"]) {
    assert.equal(pointInTimeIdentityKey({ network: "solana", [field]: SOLANA }), `solana:pool:${SOLANA}`);
  }
  assert.equal(pointInTimeIdentityKey({ chainId: 101, tokenAddress: SOLANA }), `101:token:${SOLANA}`);
  const filePath = tempStore(t);
  const symbolOnly = { chain: "solana", source: "fixture", symbol: "SYMBOL" };
  const record = recordPointInTimeObservation(symbolOnly, FIRST_META, { filePath });
  assert.equal(record.identityKey, "fixture:symbol");
  assert.equal(record.rawIdentity, null);
  assert.equal(record.exactIdentityVerified, undefined);
  const malformed = recordPointInTimeObservation({ ...symbolOnly, tokenAddress: "SYMBOL" }, FIRST_META, { filePath });
  assert.equal(malformed.identityKey, "solana:token:SYMBOL");
  assert.equal(malformed.rawIdentity, null);
  assert.equal(malformed.exactIdentityVerified, undefined);
  const exact = recordPointInTimeObservation({ ...symbolOnly, tokenAddress: SOLANA }, NEXT_META, { filePath });
  assert.equal(exact.firstSeen.firstSeenAt, NEXT_META.observedAt);
  assert.equal(Object.keys(loadPointInTimeObservationStore({ filePath }).projects).length, 3);
});

test("explicit ID precedence remains stable except for a declared address conflict", () => {
  const project = { chain: "solana", tokenAddress: SOLANA };
  assert.equal(pointInTimeIdentityKey({ ...project, projectId: "Opaque-ID", permanentProjectKey: "second", finalProjectKey: "third" }), "Opaque-ID");
  assert.equal(pointInTimeIdentityKey({ ...project, permanentProjectKey: "Opaque-Key", finalProjectKey: "third" }), "Opaque-Key");
  assert.equal(pointInTimeIdentityKey({ ...project, finalProjectKey: "Final-Key" }), "Final-Key");
  assert.equal(pointInTimeIdentityKey({ ...project, projectId: "solana:opaque-project" }), "solana:opaque-project");
  for (const projectId of [`solana:token:${SOLANA}`, `solana:${SOLANA}`]) {
    assert.equal(pointInTimeIdentityKey({ ...project, projectId }), projectId);
  }
  for (const projectId of [`solana:token:${SOLANA.toLowerCase()}`, `solana:${SOLANA.toLowerCase()}`, `base:token:${EVM}`]) {
    assert.equal(pointInTimeIdentityKey({ ...project, projectId }), `solana:token:${SOLANA}`);
  }
  assert.equal(pointInTimeIdentityKey({ chain: "base", tokenAddress: EVM.toLowerCase(), projectId: `base:${EVM}` }), `base:${EVM}`);
});

test("arbitrary explicit IDs use own dictionary properties without prototype collisions", (t) => {
  const filePath = tempStore(t);
  const keys = ["__proto__", "constructor", "toString", "hasOwnProperty", "toJSON"];
  const rows = keys.map((projectId, priceUsd) => ({ projectId, priceUsd }));
  const records = recordPointInTimeObservations([...rows, { projectId: "__proto__", priceUsd: 99 }], FIRST_META, { filePath });
  assert.deepEqual(records.slice(0, 5).map((record) => record.identityKey), keys);
  const store = loadPointInTimeObservationStore({ filePath });
  assert.equal(Object.getPrototypeOf(store.projects), Object.prototype);
  assert.deepEqual(Object.keys(store.projects), keys);
  for (const key of keys) assert.equal(Object.hasOwn(store.projects, key), true);
  assert.equal(store.projects.__proto__.firstSeen.firstSeenPrice, 0);
  assert.deepEqual(store.projects.__proto__.observations.map((row) => row.priceUsd), [0, 99]);
  assert.equal(Object.hasOwn(Object.prototype, "observations"), false);
  const again = recordPointInTimeObservation({ projectId: "constructor", priceUsd: 88 }, NEXT_META, { filePath });
  assert.equal(again.firstSeen.firstSeenPrice, 1);
  assert.equal(again.observations.length, 2);
});

test("reusing an opaque explicit ID for a different declared exact identity fails before writing", (t) => {
  const filePath = tempStore(t);
  const first = recordPointInTimeObservation({ projectId: "shared", chain: "solana", tokenAddress: SOLANA }, FIRST_META, { filePath });
  const before = fs.readFileSync(filePath, "utf8");
  const io = countIO(t, filePath);
  assert.throws(() => recordPointInTimeObservation({ projectId: "shared", chain: "solana", tokenAddress: SOLANA.toLowerCase() }, NEXT_META, { filePath }), /Conflicting point-in-time observation identity/);
  assert.deepEqual(io.calls, { reads: 1, writes: 0 });
  io.restore();
  assert.equal(fs.readFileSync(filePath, "utf8"), before);
  assert.deepEqual(loadPointInTimeObservationStore({ filePath }).projects.shared, first);
});

test("legacy lowercase Solana token/pool histories are retained, never reused or silently migrated", (t) => {
  for (const field of ["tokenAddress", "poolAddress"]) {
    const project = { chain: "solana", [field]: SOLANA, priceUsd: 1 };
    const legacyKey = pointInTimeIdentityKey(project).toLowerCase();
    const legacy = { ...legacyRecord(project), identityKey: legacyKey };
    const filePath = tempStore(t, { version: "legacy", extra: "retain", projects: { [legacyKey]: legacy } });
    const before = fs.readFileSync(filePath, "utf8");
    for (const row of [project, { ...project, [field]: SOLANA.toLowerCase() }, { ...project, projectId: legacyKey }]) {
      const io = countIO(t, filePath);
      assert.throws(() => recordPointInTimeObservations([{ projectId: "safe-new-row" }, row], NEXT_META, { filePath }), /Ambiguous legacy point-in-time observation identity/);
      assert.deepEqual(io.calls, { reads: 1, writes: 0 });
      io.restore();
      assert.equal(fs.readFileSync(filePath, "utf8"), before);
    }
    assert.deepEqual(loadPointInTimeObservationStore({ filePath }).projects, { [legacyKey]: legacy });
    recordPointInTimeObservation({ chain: "base", tokenAddress: EVM }, NEXT_META, { filePath });
    assert.deepEqual(loadPointInTimeObservationStore({ filePath }).projects[legacyKey], legacy);
  }
});

test("an existing mixed-case Solana key can retain its proven exact history without metadata backfill", (t) => {
  const project = { chain: "solana", tokenAddress: SOLANA, priceUsd: 1 };
  const key = pointInTimeIdentityKey(project);
  const legacy = legacyRecord(project);
  const filePath = tempStore(t, { version: "legacy", projects: { [key]: legacy } });
  const record = recordPointInTimeObservation({ ...project, priceUsd: 5 }, NEXT_META, { filePath });
  assert.deepEqual(record.firstSeen, legacy.firstSeen);
  assert.equal(record.rawIdentity, undefined);
  assert.equal(Object.keys(loadPointInTimeObservationStore({ filePath }).projects).length, 1);
});

test("corrupt JSON and structurally invalid stores remain byte-for-byte unchanged", (t) => {
  const invalidStores = [
    "{\"version\":\"old\",\"projects\":", "", "null", "[]", "{}",
    '{"projects":null}', '{"projects":[]}', '{"projects":{"bad":null}}',
    '{"projects":{"bad":{"firstSeen":null,"observations":[]}}}',
    '{"projects":{"bad":{"firstSeen":{},"observations":[]}}}',
    '{"projects":{"bad":{"firstSeen":{"firstSeenAt":"old"},"observations":{}}}}',
    '{"projects":{"bad":{"firstSeen":{"firstSeenAt":"old"},"observations":[null]}}}',
  ];
  for (const contents of invalidStores) {
    const filePath = tempStore(t, contents);
    const io = countIO(t, filePath);
    assert.throws(() => recordPointInTimeObservations([{ projectId: "new" }], NEXT_META, { filePath }), /JSON|Invalid point-in-time/);
    assert.deepEqual(io.calls, { reads: 1, writes: 0 });
    io.restore();
    assert.equal(fs.readFileSync(filePath, "utf8"), contents);
    assert.throws(() => loadPointInTimeObservationStore({ filePath }));
  }
});

test("read failures other than ENOENT propagate without creating an empty store", (t) => {
  const filePath = tempStore(t);
  const error = Object.assign(new Error("fixture read denied"), { code: "EACCES" });
  t.mock.method(fs, "readFileSync", () => { throw error; });
  const write = t.mock.method(fs, "writeFileSync", () => assert.fail("must not write"));
  assert.throws(() => recordPointInTimeObservation({ projectId: "new" }, FIRST_META, { filePath }), (caught) => caught === error);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(fs.existsSync(filePath), false);
});

test("a missing store is a cold start and nested directories are created only when recording", (t) => {
  const filePath = path.join(path.dirname(tempStore(t)), "nested", "store.json");
  assert.deepEqual(loadPointInTimeObservationStore({ filePath }), { version: "point-in-time-v1", projects: {} });
  assert.equal(fs.existsSync(path.dirname(filePath)), false);
  const record = recordPointInTimeObservation({ projectId: "cold", priceUsd: 2 }, FIRST_META, { filePath });
  assert.equal(record.firstSeen.firstSeenAt, FIRST_META.observedAt);
  assert.equal(loadPointInTimeObservationStore({ filePath }).projects.cold.observations.length, 1);
});

test("empty/non-array batches and persist:false do no filesystem work", (t) => {
  const filePath = tempStore(t, "corrupt JSON must not be read");
  const io = countIO(t, filePath);
  assert.deepEqual(recordPointInTimeObservations([], FIRST_META, { filePath }), []);
  assert.deepEqual(recordPointInTimeObservations(null, FIRST_META, { filePath }), []);
  assert.deepEqual(analyzeFirstSeenOpportunityBatch([], { store: { filePath } }), []);
  assert.deepEqual(analyzeFirstSeenOpportunityBatch(null, { store: { filePath } }), []);
  const rows = [{ projectId: "same", priceUsd: 1 }, { projectId: "same", priceUsd: 2 }];
  const results = analyzeFirstSeenOpportunityBatch(rows, { persist: false, meta: FIRST_META, store: { filePath } });
  assert.deepEqual(results.map((row) => row.firstSeenOpportunity.firstSeenPrice), [1, 2]);
  assert.equal(analyzeFirstSeenOpportunity(rows[0], { persist: false, ...NEXT_META, store: { filePath } }).firstSeenAt, NEXT_META.observedAt);
  assert.deepEqual(io.calls, { reads: 0, writes: 0 });
  io.restore();
});
