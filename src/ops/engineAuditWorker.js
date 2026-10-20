import fs from "node:fs";
import { runEngineFixtureAudit } from "../engineHealthCheck.js";

const { sampleProject, options } = JSON.parse(fs.readFileSync("engine-audit-input.json", "utf8"));
const results = await runEngineFixtureAudit(sampleProject, options);
fs.writeFileSync("engine-audit-result.json", JSON.stringify({ results }));
// An isolated worker must not leave background fixture work running after its result is published.
process.exit(results.some((result) => result.status === "FAIL") ? 1 : 0);
