import { evaluateProviderHealth } from "./providerReliabilityGovernor.js";
import { buildProductionObservability } from "./productionObservability.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export function runFaultInjectionAudit(options = {}) {
  const now = options.now || "2026-08-22T00:00:00.000Z";
  const nowMs = Date.parse(now);

  const provider429 = Array.from({ length: 20 }, (_, index) => ({
    at: new Date(nowMs - index * 60_000).toISOString(),
    ok: index < 4,
    statusCode: index < 4 ? 200 : 429,
    latencyMs: 100,
  }));
  const providerTimeout = Array.from({ length: 20 }, (_, index) => ({
    at: new Date(nowMs - index * 60_000).toISOString(),
    ok: index < 5,
    statusCode: index < 5 ? 200 : null,
    latencyMs: index < 5 ? 200 : 9000,
  }));

  const rateLimitHealth = evaluateProviderHealth(provider429, { now });
  const timeoutHealth = evaluateProviderHealth(providerTimeout, {
    now,
    maxP95Ms: 5000,
  });
  const degradedObservability = buildProductionObservability({
    providerA: { state: "CIRCUIT_OPEN" },
    providerB: { state: "DEGRADED" },
    learning: { state: "HEALTHY" },
  }, { now });

  const checks = [
    {
      name: "RATE_LIMIT_CIRCUIT_BREAKER",
      pass: rateLimitHealth.state === "CIRCUIT_OPEN" && rateLimitHealth.routingWeight === 0,
      observed: rateLimitHealth,
    },
    {
      name: "TIMEOUT_DEGRADATION",
      pass: ["DEGRADED", "CIRCUIT_OPEN"].includes(timeoutHealth.state),
      observed: timeoutHealth,
    },
    {
      name: "OBSERVABILITY_PROPAGATES_BLOCK",
      pass: degradedObservability.state !== "HEALTHY" &&
        degradedObservability.alerts.some((value) => value.includes("providerA")),
      observed: degradedObservability,
    },
  ];

  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    pass: checks.every((row) => row.pass),
    state: checks.every((row) => row.pass)
      ? "FAULT_INJECTION_PASS"
      : "FAULT_INJECTION_FAIL",
    checks,
    destructiveLiveFaultsInjected: false,
    policy: "Synthetic deterministic fault injection only. No destructive fault is sent to live providers.",
  };

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/fault-injection-audit.json",
      report
    );
  }
  return report;
}
