import { runForwardEvidenceRemoteCommand } from "../production/forwardEvidenceRemoteStore.js";

const requested = process.argv[2];
const command = ["restore", "sync", "verify"].includes(requested) ? requested : "restore";
const report = await runForwardEvidenceRemoteCommand(command);
console.log(JSON.stringify(report, null, 2));
if (![
  "REMOTE_FORWARD_EVIDENCE_RESTORED",
  "REMOTE_FORWARD_EVIDENCE_SYNCED",
  "REMOTE_FORWARD_EVIDENCE_VERIFIED",
].includes(report.state)) process.exitCode = 2;
