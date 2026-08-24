import test from "node:test";
import assert from "node:assert/strict";
import { buildMatchedVerificationControls, runEdgeVerificationProgram } from "../src/production/edgeVerificationProgram.js";

function addressFor(id) { return `0x${Buffer.from(String(id)).toString("hex").padEnd(40, "0").slice(0, 40)}`; }
function row(id, ret, extra = {}) { const tokenAddress = addressFor(id); return { identityKey: `base:${tokenAddress}`, chain: "base", tokenAddress, liquidityUsd: 500000, marketCapUsd: 10000000, volume24hUsd: 1000000, realizedReturnPct: ret, ...extra }; }

test("verification program reports insufficient evidence honestly", () => {
  const report = runEdgeVerificationProgram([row("a", 40), row("b", 30)], [row("c", 5), row("d", 3), row("e", 2)], { minimumSelections: 20, minimumUniqueProjects: 10, iterations: 250 });
  assert.equal(report.edgeState, "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE");
});

test("strong forward separation produces positive incremental estimates", () => {
  const selections = Array.from({ length: 220 }, (_, i) => row(`s${i}`, i % 5 === 0 ? 10 : 35));
  const universe = Array.from({ length: 700 }, (_, i) => row(`c${i}`, i % 5 === 0 ? 20 : 0));
  const report = runEdgeVerificationProgram(selections, universe, { minimumSelections: 200, minimumUniqueProjects: 80, maxControlsPerSelection: 2, iterations: 300, maximumCatastropheDelta: 0.03 });
  assert.equal(report.gates.enoughData, true);
  assert.ok(report.incremental.averageReturnPct.estimate > 0);
  assert.ok(report.incremental.hitRate.estimate > 0);
  assert.equal(report.edgeState, "VERIFIED_FORWARD_EDGE");
});

test("matched controls exclude selected identity", () => {
  const controls = buildMatchedVerificationControls([row("same", 40)], [row("same", 1), row("other", 2)], { maxControlsPerSelection: 1 });
  assert.equal(controls.length, 1);
  assert.equal(controls[0].identityKey, `base:${addressFor("other")}`);
});
