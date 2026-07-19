import { createStorageAdapter } from "./storageAdapter.js";
import { summarizeBackendSupabaseConfig } from "./supabaseClient.js";

export async function runDatabaseHealthCheck(options = {}) {
  const adapter = createStorageAdapter(options);
  const status = adapter.status();
  adapter.close?.();
  return {
    generatedAt: new Date().toISOString(),
    status: status.sqlite.status === "OK" ? "OK" : "FAILED",
    supabase: summarizeBackendSupabaseConfig(options.env || process.env),
    storage: status,
    fallbackPolicy:
      "Scans continue with SQLite fallback when Supabase is missing, read-only, or temporarily unavailable. Failed remote writes are reported.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runDatabaseHealthCheck();
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "FAILED") process.exitCode = 1;
}
