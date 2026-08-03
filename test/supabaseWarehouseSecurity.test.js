import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  "supabase/migrations/20260802000000_secure_public_warehouse.sql"
);

test("scanner warehouse enables RLS and revokes client roles", () => {
  const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();
  const tables = [
    "projects",
    "project_identities",
    "pools",
    "market_observations",
    "capital_flow_observations",
    "wallet_observations",
    "wallet_performance",
    "execution_quotes",
    "engine_runs",
    "predictions",
    "prediction_outcomes",
    "source_health",
    "alerts",
    "report_runs",
  ];

  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(`alter table if exists public\\.${table} enable row level security`)
    );
  }
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /create policy[\s\S]+using\s*\(true\)/);
});

test("updated-at trigger function has an immutable search path", () => {
  const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
  const schema = fs.readFileSync(path.resolve("supabase/schema.sql"), "utf8").toLowerCase();
  assert.match(
    migration,
    /alter function if exists public\.set_updated_at\(\) set search_path = pg_catalog/
  );
  assert.match(schema, /language plpgsql\s+set search_path = pg_catalog/);
  assert.match(schema, /new\.updated_at = pg_catalog\.now\(\)/);
});
