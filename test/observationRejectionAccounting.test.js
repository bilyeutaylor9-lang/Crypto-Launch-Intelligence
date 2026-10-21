import assert from "node:assert/strict";
import test from "node:test";

import { buildExactMarketObservation } from "../src/production/exactMarketObservationLedger.js";
import { buildForwardAlphaValidationOS } from "../src/production/forwardAlphaValidationOS.js";
import { gradeProspectiveEdgeCohorts } from "../src/production/prospectiveEdgeCohortGrader.js";

const AS_OF = "2026-01-01T00:00:00.000Z";
const FUTURE = "2026-01-02T00:00:00.000Z";
const address = value => `0x${value.toString(16).padStart(40, "0")}`;

function observation(id = 1, observedAt = AS_OF) {
  return buildExactMarketObservation({
    chain: "base", tokenAddress: address(id), poolAddress: address(id + 100),
    observedAt, priceUsd: 1, source: "synthetic-audit-accounting-fixture",
  }, { asOf: observedAt });
}

function grade(rows, requireObservationLedgerIntegrity = true) {
  const original = JSON.stringify(rows);
  const report = gradeProspectiveEdgeCohorts([], rows, { asOf: AS_OF, requireObservationLedgerIntegrity });
  assert.equal(JSON.stringify(rows), original, "Auditing must not rewrite or rehash input evidence");
  const audit = report.inputAudit;
  assert.equal(audit.observationsAttempted, audit.exactPastOrPresentObservations + audit.observationsRejected);
  assert.equal(Object.values(audit.rejectionReasons).reduce((sum, count) => sum + count, 0), audit.observationsRejected);
  assert.equal(report.certificateEligible, false);
  return audit;
}

test("all otherwise-valid copies of a duplicate observation key receive a rejection reason", () => {
  const row = observation();
  const audit = grade([row, structuredClone(row)]);
  assert.equal(audit.exactPastOrPresentObservations, 0);
  assert.equal(audit.observationsRejected, 2);
  assert.equal(audit.rejectionReasons.duplicateObservation, 2);
  assert.equal(audit.rejectionReasons.integrityFailure, 0);
  assert.equal(audit.duplicateObservationKeys.length, 1);
  assert.equal(audit.exactMarketObservationLedgerIntegrityPass, false);
});

test("mixed duplicate, invalid-hash, future and malformed rows are each counted once", () => {
  const row = observation();
  const future = observation(2, FUTURE);
  const audit = grade([
    row, structuredClone(row), { ...row, priceUsd: 999 },
    future, structuredClone(future), null, observation(3),
  ]);
  assert.equal(audit.exactPastOrPresentObservations, 1);
  assert.equal(audit.observationsRejected, 6);
  assert.equal(audit.rejectionReasons.duplicateObservation, 2);
  assert.equal(audit.rejectionReasons.integrityFailure, 1);
  assert.equal(audit.rejectionReasons.futureTimestamp, 2);
  assert.equal(audit.rejectionReasons.invalidIdentity, 1);
  assert.equal(audit.duplicateObservationKeys.length, 2);
  assert.equal(audit.exactMarketObservationLedgerIntegrityPass, false);
});

test("the diagnostic does not change duplicate handling when ledger integrity is not required", () => {
  const row = observation();
  const audit = grade([row, structuredClone(row)], false);
  assert.equal(audit.exactPastOrPresentObservations, 2);
  assert.equal(audit.observationsRejected, 0);
  assert.equal(audit.rejectionReasons.duplicateObservation, 0);
  assert.deepEqual(audit.duplicateObservationKeys, []);
});

test("the CLI 15 wrapper retains duplicate reasons and the existing integrity veto", () => {
  const row = observation();
  const rows = [row, structuredClone(row)];
  const original = JSON.stringify(rows);
  const report = buildForwardAlphaValidationOS({ episodes: [], observations: rows }, { asOf: AS_OF });
  assert.equal(JSON.stringify(rows), original);
  assert.equal(report.forwardCertificate.inputAudit.rejectionReasons.duplicateObservation, 2);
  assert.equal(report.forwardCertificate.inputAudit.observationsRejected, 2);
  assert.equal(report.forwardCertificate.inputAudit.exactMarketObservationLedgerIntegrityPass, false);
  assert.equal(report.forwardCertificate.certificateEligible, false);
  assert.ok(report.promotionGate.blockers.includes("FORWARD_EVIDENCE_LEDGER_INTEGRITY_FAILURE"));
});
