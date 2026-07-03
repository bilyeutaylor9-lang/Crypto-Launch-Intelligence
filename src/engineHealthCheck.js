import fs from "fs";
import path from "path";

const ENGINE_DIR = path.resolve("src/engines");

export async function runEngineHealthCheck(sampleProject = {}) {
  const files = fs.readdirSync(ENGINE_DIR)
    .filter(f => f.endsWith("Engine.js"));

  const results = [];

  for (const file of files) {
    const fullPath = path.join(ENGINE_DIR, file);

    try {
      const mod = await import(`./engines/${file}`);

      const functions = Object.entries(mod)
        .filter(([_, v]) => typeof v === "function");

      if (functions.length === 0) {
        results.push({
          engine: file,
          status: "FAIL",
          issue: "No exported function found"
        });
        continue;
      }

      results.push({
        engine: file,
        status: "OK",
        exports: functions.map(([name]) => name)
      });

    } catch (err) {
      results.push({
        engine: file,
        status: "FAIL",
        issue: err.message
      });
    }
  }

  return results;
}

if (process.argv[1].includes("engineHealthCheck.js")) {
  const results = await runEngineHealthCheck();

  console.table(results.map(r => ({
    engine: r.engine,
    status: r.status,
    issue: r.issue || "",
    exports: r.exports?.join(", ") || ""
  })));

  const failed = results.filter(r => r.status === "FAIL");

  if (failed.length > 0) {
    console.log(`\n❌ ${failed.length} engines failed.`);
    process.exit(1);
  }

  console.log(`\n✅ All ${results.length} engines loaded successfully.`);
}
