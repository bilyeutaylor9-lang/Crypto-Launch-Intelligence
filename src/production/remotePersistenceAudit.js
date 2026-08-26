import { writeAtomicJson } from "./atomicArtifactStore.js";

export async function runRemotePersistenceAudit(options = {}) {
  const env = options.env || process.env;
  let report;
  try {
    const { createBackendSupabaseClient, summarizeBackendSupabaseConfig } =
      await import("../db/supabaseClient.js");
    const configSummary = summarizeBackendSupabaseConfig(env);
    const supabase = createBackendSupabaseClient({ env });

    if (!supabase.client) {
      report = {
        schemaVersion: 1,
        generatedAt: options.now || new Date().toISOString(),
        state: "NOT_CONFIGURED",
        configured: false,
        serverWriteCapable: false,
        readProbe: null,
        reason: configSummary.reason,
      };
    } else {
      const started = Date.now();
      const { error } = await supabase.client
        .from("forward_evidence_records")
        .select("ledger_name,record_id,content_hash")
        .limit(1);
      report = {
        schemaVersion: 1,
        generatedAt: options.now || new Date().toISOString(),
        state: error ? "REMOTE_READ_FAILED" : "REMOTE_READ_HEALTHY",
        configured: true,
        serverWriteCapable: Boolean(configSummary.serverWriteCapable),
        readProbe: {
          pass: !error,
          latencyMs: Date.now() - started,
          error: error?.message || null,
        },
        destructiveWritePerformed: false,
        auditedTable: "forward_evidence_records",
        appendOnlyEvidenceLedger: !error,
      };
    }
  } catch (error) {
    report = {
      schemaVersion: 1,
      generatedAt: options.now || new Date().toISOString(),
      state: "REMOTE_AUDIT_FAILED",
      configured: Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
      serverWriteCapable: Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
      readProbe: null,
      error: error?.message || "REMOTE_AUDIT_FAILED",
      destructiveWritePerformed: false,
    };
  }

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/remote-persistence-audit.json",
      report
    );
  }
  return report;
}
