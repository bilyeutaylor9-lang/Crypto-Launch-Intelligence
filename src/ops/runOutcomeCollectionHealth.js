import { buildOutcomeCollectionHealth } from "../production/outcomeCollectionHealth.js";

const report = buildOutcomeCollectionHealth({
  maximumAgeMinutes: process.env.OUTCOME_COLLECTION_MAX_AGE_MINUTES || 180,
});
console.log(JSON.stringify(report, null, 2));
if (report.state !== "OUTCOME_COLLECTION_HEALTHY") process.exitCode = 2;
