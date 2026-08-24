import test from "node:test";
import assert from "node:assert/strict";
import { buildMatchedVerificationControls, runEdgeVerificationProgram } from "../src/production/edgeVerificationProgram.js";
import { runEdgeVerificationCycle } from "../src/ops/runEdgeVerificationProgram.js";

function addressFor(id) { return `0x${Buffer.from(String(id)).toString("hex").padEnd(40, "0").slice(0, 40)}`; }
function row(id, ret, extra = {}) { const tokenAddress = addressFor(id); return { identityKey: `base:${tokenAddress}`, chain: "base", tokenAddress, liquidityUsd: 500000, marketCapUsd: 10000000, volume24hUsd: 1000000, realizedReturnPct: ret, ...extra }; }

test("verification program reports insufficient evidence honestly", () => {
  const report = runEdgeVerificationProgram([row("a", 40), row("b", 30)], [row("c", 5), row("d", 3), row("e", 2)], { minimumSelections: 20, minimumUniqueProjects: 10, iterations: 250 });
  assert.equal(report.edgeState, "DIAGNOSTIC_INSUFFICIENT_SAMPLE");
  assert.equal(report.certificateEligible, false);
});

test("strong forward separation produces positive incremental estimates", () => {
  const selections = Array.from({ length: 220 }, (_, i) => row(`s${i}`, i % 5 === 0 ? 10 : 35));
  const universe = Array.from({ length: 700 }, (_, i) => row(`c${i}`, i % 5 === 0 ? 20 : 0));
  const report = runEdgeVerificationProgram(selections, universe, { minimumSelections: 200, minimumUniqueProjects: 80, maxControlsPerSelection: 2, iterations: 300, maximumCatastropheDelta: 0.03 });
  assert.equal(report.gates.enoughData, true);
  assert.ok(report.incremental.averageReturnPct.estimate > 0);
  assert.ok(report.incremental.hitRate.estimate > 0);
  assert.equal(report.edgeState, "DIAGNOSTIC_POSITIVE_SEPARATION");
  assert.equal(report.certificateEligible, false);
  assert.equal(report.policy.controlsFrozenProspectively, false);
  assert.equal(report.policy.postOutcomeControlSelection, true);
});

test("matched controls exclude selected identity", () => {
  const controls = buildMatchedVerificationControls([row("same", 40)], [row("same", 1), row("other", 2)], { maxControlsPerSelection: 1 });
  assert.equal(controls.length, 1);
  assert.equal(controls[0].identityKey, `base:${addressFor("other")}`);
});

test("certificate runner cannot promote post-hoc diagnostics without frozen cohorts", () => {
  const result = runEdgeVerificationCycle({
    now: "2026-01-10T00:00:00.000Z",
    resolvedReport: { rows: [row("selected", 200)] },
    snapshots: [],
    prospectiveEpisodes: [],
    prospectiveObservations: [],
    minimumSelections: 1,
    minimumUniqueProjects: 1,
    writeReports: false,
  });
  assert.equal(result.report.edgeState, "UNVERIFIED_NO_FROZEN_COHORTS");
  assert.equal(result.certificate.verified, false);
  assert.equal(result.certificate.certificateEligible, false);
  assert.equal(result.certificate.posthocDiagnosticCertificateEligible, false);
});

test("certificate runner never substitutes legacy snapshots for the exact observation ledger", () => {
  const result = runEdgeVerificationCycle({
    now: "2026-01-10T00:00:00.000Z",
    resolvedReport: { rows: [] },
    snapshots: [{
      chain: "base",
      tokenAddress: addressFor("legacy"),
      observedAt: "2026-01-02T00:00:00.000Z",
      priceUsd: 99,
    }],
    prospectiveEpisodes: [],
    writeReports: false,
  });
  assert.equal(result.report.inputAudit.observationsAttempted, 0);
  assert.equal(result.report.inputAudit.exactMarketObservationLedgerIntegrityRequired, true);
  assert.equal(result.certificate.certificateEligible, false);
});
