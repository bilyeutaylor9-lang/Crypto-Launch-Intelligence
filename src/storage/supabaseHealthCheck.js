// src/storage/supabaseHealthCheck.js
import "../config/loadEnv.js";
import { collectSupabaseMemory, writeSupabaseMemoryReport } from "./supabaseMemory.js";
import { summarizeSupabaseConfig, syncScanToSupabase } from "./supabaseSync.js";

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function healthPayload(runId = `supabase_health_${Date.now()}`) {
  const now = new Date().toISOString();
  const projectKey = "system:supabase-health-check";

  return {
    projects: [
      {
        permanentProjectKey: projectKey,
        name: "Supabase Health Check",
        symbol: "SUPABASE_HEALTH",
        chain: null,
        pipelineScore: 0,
        finalSelectionState: "HEALTH_CHECK",
        finalSelectionQualified: false,
        confidence: "System",
        source: "supabase-health-check",
      },
    ],
    summary: {
      marketRegime: "HEALTH_CHECK",
      strongWatchlistCount: 0,
    },
    meta: {
      runId,
      startedAt: now,
      completedAt: now,
      discoveredProjects: 0,
      status: "HEALTH_CHECK",
      platform: "Crypto Launch Intelligence Supabase Health",
    },
    reportPaths: {
      supabaseHealthPath: "reports/supabase-health.json",
    },
    alphaTruth: {
      receipts: [
        {
          receiptId: `${runId}_receipt`,
          runId,
          projectKey,
          decisionAt: now,
          identity: {
            name: "Supabase Health Check",
            symbol: "SUPABASE_HEALTH",
            chain: null,
          },
          decision: {
            rank: 0,
            finalState: "HEALTH_CHECK",
            finalQualified: false,
            score: 0,
            confidence: "System",
          },
          truthStatus: "HEALTH_CHECK",
          evidenceLineage: {
            effectiveIndependentEvidenceCount: 0,
            groups: [],
          },
          requiredProof: {
            systemHealthCheck: true,
          },
          executionSnapshot: {},
          marketSnapshot: {},
        },
      ],
    },
  };
}

export async function runSupabaseHealthCheck(options = {}) {
  const env = options.env || process.env;
  const writeCheck = options.writeCheck ?? boolEnv(env.SUPABASE_HEALTH_WRITE, false);
  const config = summarizeSupabaseConfig(env);
  const memory = await collectSupabaseMemory({
    ...options,
    runLimit: options.runLimit || 5,
    projectLimit: options.projectLimit || 50,
    receiptLimit: options.receiptLimit || 50,
  });
  const memoryReportPath = writeSupabaseMemoryReport(memory);
  let writeResult = {
    status: "SKIPPED",
    reason: "Run with --write or SUPABASE_HEALTH_WRITE=true to verify scanner table writes.",
  };

  if (writeCheck) {
    writeResult = await syncScanToSupabase(healthPayload(), {
      ...options,
      env,
    });
  }

  const status = config.enabled && config.configured && config.serverWriteCapable && memory.status === "OK"
    ? writeCheck
      ? writeResult.status === "OK"
        ? "OK"
        : "FAILED"
      : "READ_OK"
    : "FAILED";

  return {
    generatedAt: new Date().toISOString(),
    status,
    config,
    memory: {
      status: memory.status,
      counts: memory.counts || null,
      reason: memory.reason || null,
      reportPath: memoryReportPath,
    },
    writeCheck: writeResult,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const writeCheck = process.argv.includes("--write") || boolEnv(process.env.SUPABASE_HEALTH_WRITE, false);
  const report = await runSupabaseHealthCheck({ writeCheck });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "FAILED") process.exitCode = 1;
}
