import { runForwardEvidenceRemoteCommand } from "../production/forwardEvidenceRemoteStore.js";

const command = process.argv[2] === "sync" ? "sync" : process.argv[2] === "verify" ? "verify" : "restore";
const report = await runForwardEvidenceRemoteCommand(command);
console.log(JSON.stringify(report, null, 2));
// Restore outages are intentionally non-blocking so local evidence collection can
// continue. A sync outage is not healthy completion and must remain visible to
// workflows that enforce their operational-truth gate.
if (report.state === "REMOTE_FORWARD_EVIDENCE_FAILED" ||
    (command === "sync" && report.state === "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE")) process.exitCode = 2;
