import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSourcifyContract } from "../src/data/security/sourcifyV2Connector.js";

const ADDRESS = `0x${"a".repeat(40)}`;
const OTHER = `0x${"b".repeat(40)}`;
const CREATOR = `0x${"c".repeat(40)}`;
const META = { chain: "base", address: ADDRESS };

function source(deployment, patch = {}) {
  return Object.freeze({ match: "exact_match", address: ADDRESS, chainId: 8453,
    deployment: Object.freeze({ deployer: CREATOR, ...deployment }), ...patch });
}

const unknownBlocks = [
  ["absent", {}], ["undefined", { blockNumber: undefined }], ["null", { blockNumber: null }],
  ...[
    ["blank", ""], ["whitespace", " \t\n"], ["false", false], ["true", true],
    ["object", {}], ["empty array", []], ["numeric array", [0]],
    ["boxed number", new Number(0)], ["boxed string", new String("0")],
    ["unsafe number", Number.MAX_SAFE_INTEGER + 1], ["unsafe string", "9007199254740992"],
    ["negative number", -1], ["negative string", "-1"], ["signed zero string", "-0"],
    ["fraction number", 1.5], ["fraction string", "1.5"], ["decimal point string", "1.0"],
    ["NaN", NaN], ["Infinity", Infinity], ["negative Infinity", -Infinity],
    ["hex string", "0x10"], ["exponent string", "1e3"], ["signed string", "+1"],
    ["null string", "null"], ["undefined string", "undefined"], ["invalid string", "abc"],
    ["mixed string", "12blocks"], ["separated digits", "1 2"], ["bigint", 0n],
  ].map(([label, blockNumber]) => [label, { blockNumber }]),
];

for (const [label, deployment] of unknownBlocks) {
  test(`Sourcify creation block stays unknown for ${label}`, () => {
    const raw = source(deployment);
    const before = structuredClone(raw);
    const result = normalizeSourcifyContract(raw, META);
    assert.equal(result.status, "EVIDENCE_AVAILABLE");
    assert.equal(result.creatorAddress, CREATOR);
    assert.strictEqual(result.raw, raw);
    assert.deepEqual(raw, before);
    assert.equal(result.creationBlockNumber, null);
  });
}

test("Sourcify creation block stays unknown without deployment metadata", () => {
  const raw = Object.freeze({ match: "exact_match", address: ADDRESS, chainId: 8453 });
  const result = normalizeSourcifyContract(raw, META);
  assert.equal(result.creationBlockNumber, null);
  assert.strictEqual(result.raw, raw);
  assert.equal(Object.hasOwn(raw, "deployment"), false);
});

for (const blockNumber of [0, -0, "0", "00", " 0 ", 1, "1", "00123", " 12345 ",
  Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)]) {
  const label = Object.is(blockNumber, -0) ? "-0" : JSON.stringify(blockNumber);
  test(`Sourcify preserves safe decimal creation block ${label}`, () => {
    const raw = source({ blockNumber });
    const before = structuredClone(raw);
    const result = normalizeSourcifyContract(raw, META);
    assert.equal(result.creationBlockNumber, Number(blockNumber));
    assert.equal(result.verifiedSource, true);
    assert.equal(result.exactMatch, true);
    assert.equal(result.creatorAddress, CREATOR);
    assert.equal(result.chain, META.chain);
    assert.equal(result.address, META.address);
    assert.strictEqual(result.raw, raw);
    assert.deepEqual(raw, before);
  });
}

for (const patch of [{ address: OTHER }, { chainId: 1 }, { tokenAddress: OTHER }, { network: "ethereum" }]) {
  test(`Sourcify block metadata cannot bypass identity rejection: ${JSON.stringify(patch)}`, () => {
    const raw = source({ blockNumber: "0" }, patch);
    const before = structuredClone(raw);
    const result = normalizeSourcifyContract(raw, META);
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.responseIdentityVerified, false);
    assert.notEqual(result.verifiedSource, true);
    assert.equal(result.creatorAddress, undefined);
    assert.equal(result.creationBlockNumber, undefined);
    assert.strictEqual(result.raw, raw);
    assert.deepEqual(raw, before);
  });
}
