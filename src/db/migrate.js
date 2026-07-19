import fs from "fs";
import path from "path";

import { openSqliteFallbackStore } from "./sqliteFallbackStore.js";

export function listMigrations() {
  const migrationsDir = path.resolve("supabase/migrations");
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      path: path.join(migrationsDir, file),
    }));
}

export function runLocalMigrations(options = {}) {
  const store = openSqliteFallbackStore(options);
  const status = store.status();
  store.close();
  return {
    generatedAt: new Date().toISOString(),
    status: "OK",
    mode: "local-sqlite-fallback",
    migrationFiles: listMigrations().map((migration) => migration.file),
    sqlite: status,
    note:
      "Remote Supabase migrations are SQL files under supabase/migrations. Apply them with `npx supabase db push` after linking the project.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runLocalMigrations(), null, 2));
}
