import { runForwardEvidenceRemoteCommand } from "../production/forwardEvidenceRemoteStore.js";

const command = process.argv[2] === "sync" ? "sync" : "restore";
const report = await runForwardEvidenceRemoteCommand(command);
console.log(JSON.stringify(report, null, 2));
if (report.state === "REMOTE_FORWARD_EVIDENCE_FAILED") process.exitCode = 2;
