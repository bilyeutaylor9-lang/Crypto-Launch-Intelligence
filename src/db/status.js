import { createStorageAdapter } from "./storageAdapter.js";
import { listMigrations } from "./migrate.js";

export function databaseStatus(options = {}) {
  const adapter = createStorageAdapter(options);
  const status = adapter.status();
  adapter.close?.();
  return {
    generatedAt: new Date().toISOString(),
    status: "OK",
    migrations: listMigrations().map((migration) => migration.file),
    storage: status,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(databaseStatus(), null, 2));
}
