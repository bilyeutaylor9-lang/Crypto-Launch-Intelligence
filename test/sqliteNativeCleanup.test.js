import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("SQLite statements survive allocation-driven native cleanup during a live connection", () => {
  // Keep the connection alive while temporary statements become collectible.
  // Node 24.19-24.21 could abort here before JS could report an error.
  const result = spawnSync(process.execPath, ["--max-old-space-size=64", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import Database from "better-sqlite3";
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE observations (value INTEGER NOT NULL)");
      db.prepare("INSERT INTO observations VALUES (?)").run(7);
      for (let round = 0; round < 40; round += 1) {
        for (let i = 0; i < 1000; i += 1) {
          assert.equal(db.prepare("SELECT value FROM observations").get().value, 7);
        }
        const pressure = Array.from({ length: 25000 }, (_, i) => ({ i, round, payload: "x".repeat(128) }));
        assert.equal(pressure[24999].round, round);
      }
      assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
      console.log("SQLITE_NATIVE_CLEANUP_OK");
    } finally {
      db.close();
    }
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SQLITE_NATIVE_CLEANUP_OK/);
});
