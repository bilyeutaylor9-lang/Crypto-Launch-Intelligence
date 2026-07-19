import fs from "fs";
import path from "path";

const ENGINE_DIR = path.resolve("src/engines");
const PIPELINE_FILE = path.resolve("src/intelligencePipeline.js");

function read(filePath = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function engineCategory(file = "") {
  const name = file.toLowerCase();

  if (name.includes("discovery")) return "discovery";
  if (name.includes("risk") || name.includes("trap") || name.includes("red")) return "risk";
  if (name.includes("learning") || name.includes("outcome") || name.includes("pattern") || name.includes("alpha")) return "learning";
  if (name.includes("ai") || name.includes("quantum") || name.includes("world") || name.includes("scientist") || name.includes("research")) return "ai";
  if (name.includes("wallet") || name.includes("whale") || name.includes("money")) return "wallet-flow";
  if (name.includes("liquidity") || name.includes("capital") || name.includes("buy") || name.includes("sell")) return "market-flow";
  if (name.includes("narrative") || name.includes("catalyst") || name.includes("launch")) return "narrative-launch";
  return "intelligence";
}

function exportedFunctions(source = "") {
  const direct = [...source.matchAll(/export function\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const exportedConst = [...source.matchAll(/export const\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const exportedAsync = [...source.matchAll(/export async function\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]);

  return [...new Set([...direct, ...exportedConst, ...exportedAsync])];
}

export function buildEngineAudit() {
  const pipeline = read(PIPELINE_FILE);
  const files = fs.existsSync(ENGINE_DIR)
    ? fs.readdirSync(ENGINE_DIR).filter((file) => file.endsWith("Engine.js")).sort()
    : [];
  const engines = files.map((file) => {
    const source = read(path.join(ENGINE_DIR, file));
    const exports = exportedFunctions(source);
    const hasBatch = exports.some((name) => /Batch$/.test(name));
    const hasAnalyzer = exports.some((name) => /^analyze|Engine$|Detection/.test(name));
    const wiredInPipeline = pipeline.includes(`./engines/${file}`);
    const advancedSignals = [
      /evidence/i.test(source),
      /confidence/i.test(source),
      /risk/i.test(source),
      /summary/i.test(source),
      /score/i.test(source),
      /reasons/i.test(source),
    ].filter(Boolean).length;
    const implementationCompletenessScore = Math.round(
      Math.min(
        100,
        exports.length * 10 +
          (hasBatch ? 20 : 0) +
          (hasAnalyzer ? 15 : 0) +
          (wiredInPipeline ? 25 : 0) +
          advancedSignals * 5
      )
    );

    return {
      file,
      category: engineCategory(file),
      exports,
      hasBatch,
      hasAnalyzer,
      wiredInPipeline,
      advancedSignals,
      implementationCompletenessScore,
      readinessScore: implementationCompletenessScore,
      status: implementationCompletenessScore >= 75 ? "implementation-complete" : implementationCompletenessScore >= 50 ? "usable" : "needs-upgrade",
    };
  });
  const categoryCounts = engines.reduce((counts, engine) => {
    counts[engine.category] = (counts[engine.category] || 0) + 1;
    return counts;
  }, {});
  const wiredCount = engines.filter((engine) => engine.wiredInPipeline).length;
  const implementationCompleteCount = engines.filter((engine) => engine.status === "implementation-complete").length;

  return {
    generatedAt: new Date().toISOString(),
    auditName: "Engine Implementation Completeness Audit",
    caveat:
      "This audit measures wiring, exports, batch support, and code-shape completeness. It does not prove prediction accuracy or profitable edge.",
    totalEngines: engines.length,
    wiredIntoPipeline: wiredCount,
    implementationComplete: implementationCompleteCount,
    stateOfArtReady: implementationCompleteCount,
    implementationCompletenessScore:
      engines.length === 0
        ? 0
        : Math.round(engines.reduce((sum, engine) => sum + engine.implementationCompletenessScore, 0) / engines.length),
    readinessScore:
      engines.length === 0
        ? 0
        : Math.round(engines.reduce((sum, engine) => sum + engine.readinessScore, 0) / engines.length),
    categoryCounts,
    topEngines: [...engines].sort((a, b) => b.implementationCompletenessScore - a.implementationCompletenessScore).slice(0, 20),
    needsUpgrade: engines.filter((engine) => engine.status === "needs-upgrade"),
    engines,
    recommendation:
      implementationCompleteCount >= Math.round(engines.length * 0.65)
        ? "Engine stack is broadly implemented; validate predictive edge with outcome tracking before marketing production accuracy."
        : "Engine stack is broad; continue moving older discovery/risk engines to batch/evidence conventions.",
  };
}

export function writeEngineAuditReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildEngineAudit();
  const filePath = path.join(reportsDir, "engine-audit.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
