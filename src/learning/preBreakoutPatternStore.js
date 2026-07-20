import fs from "fs";
import path from "path";

const DEFAULT_PATH = path.resolve("data", "pre-breakout-patterns-v2.json");

function readJson(filePath = DEFAULT_PATH) {
  if (!fs.existsSync(filePath)) return { version: "pre-breakout-pattern-store-v1", patterns: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { version: "pre-breakout-pattern-store-v1", patterns: [] };
  }
}

export function savePreBreakoutPattern(pattern = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_PATH;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const store = readJson(filePath);
  const next = {
    ...store,
    patterns: [
      ...(store.patterns || []),
      {
        recordedAt: new Date().toISOString(),
        ...pattern,
      },
    ].slice(-5000),
  };
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function loadPreBreakoutPatterns(options = {}) {
  return readJson(options.filePath || DEFAULT_PATH);
}

export function matchPreBreakoutPattern(project = {}, options = {}) {
  const store = options.patterns ? { patterns: options.patterns } : loadPreBreakoutPatterns(options);
  const target = project.earlyAsymmetryComponents || {};
  const rows = (store.patterns || []).map((pattern) => {
    const components = pattern.components || {};
    const keys = Object.keys(target).filter((key) => Number.isFinite(Number(target[key])) && Number.isFinite(Number(components[key])));
    const distance = keys.length
      ? keys.reduce((sum, key) => sum + Math.abs(Number(target[key]) - Number(components[key])), 0) / keys.length
      : 100;
    return {
      patternId: pattern.patternId || pattern.symbol || pattern.recordedAt,
      similarityPct: Math.max(0, Math.round(100 - distance)),
      sampleOutcome: pattern.outcome || null,
    };
  });
  return rows.sort((a, b) => b.similarityPct - a.similarityPct).slice(0, 10);
}
