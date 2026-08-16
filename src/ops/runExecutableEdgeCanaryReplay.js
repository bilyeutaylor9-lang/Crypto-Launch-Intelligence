
import { loadCanaryPolicy } from "../canary/canaryPolicyStore.js";
import { loadCanaryTickets } from "../canary/canaryTicketStore.js";
import { loadCanaryReplayQuotes } from "../canary/canaryReplayStore.js";
import { replayExecutableEdgeCanary } from "../canary/canaryCoordinator.js";

const policy = loadCanaryPolicy();
if (!policy?.frozen) {
  console.error("V14 canary policy is not frozen.");
  process.exitCode = 2;
} else {
  const tickets = loadCanaryTickets();
  const existingReplays = loadCanaryReplayQuotes();
  const result = await replayExecutableEdgeCanary(tickets, policy, { existingReplays, persist: true });
  console.log(JSON.stringify({ state: result.state, replayQuotes: result.rows.length, saved: result.saved, paperOnly: true }, null, 2));
}
