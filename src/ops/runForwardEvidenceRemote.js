import { forwardEvidenceRemoteExitCode, runForwardEvidenceRemoteCommand } from "../production/forwardEvidenceRemoteStore.js";

const command = process.argv[2] === "sync" ? "sync" : process.argv[2] === "verify" ? "verify" : "restore";
const report = await runForwardEvidenceRemoteCommand(command);
console.log(JSON.stringify(report, null, 2));
// Confirmed persisted restore outages may continue local collection without
// acknowledging remote health. Sync and verification outages remain failures.
process.exitCode = forwardEvidenceRemoteExitCode(command, report);
