
import { loadCanaryPolicy } from "../canary/canaryPolicyStore.js";
import { loadCanaryTickets } from "../canary/canaryTicketStore.js";
import { loadCanaryReplayQuotes } from "../canary/canaryReplayStore.js";
import { runExecutableEdgeCanaryLab } from "../canary/executableEdgeCanaryLab.js";

const policy = loadCanaryPolicy() || { policy: {}, specificationHash: null };
const tickets = loadCanaryTickets();
const replays = loadCanaryReplayQuotes();
const report = runExecutableEdgeCanaryLab(tickets, replays, policy);
console.log(JSON.stringify({ state: report.state, metrics: report.metrics, paperOnly: true }, null, 2));
