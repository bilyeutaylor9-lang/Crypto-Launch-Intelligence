import { writeAtomicJson } from "./atomicArtifactStore.js";

function exact(row = {}) {
  const chain = String(row.chain || "").trim().toLowerCase();
  const token = String(row.tokenAddress || row.contractAddress || "").trim();
  const pool = String(row.poolAddress || row.pairAddress || "").trim();
  if (!chain || !token) return false;
  if (chain === "base" || chain === "ethereum" || chain === "arbitrum" || chain === "optimism") {
    if (!/^0x[0-9a-f]{40}$/i.test(token)) return false;
    if (pool && !/^0x[0-9a-f]{40}$/i.test(pool)) return false;
  }
  return true;
}

export function buildExactIdentityHealth(candidates = [], options = {}) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const exactCount = rows.filter(exact).length;
  const rate = rows.length ? exactCount / rows.length : null;
  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    candidates: rows.length,
    exactIdentities: exactCount,
    exactIdentityRate: rate,
    state:
      rate === null
        ? "NO_CANDIDATES"
        : rate >= Number(options.minimumRate || 0.99)
          ? "PASS"
          : "FAIL",
  };
  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/exact-identity-health.json",
      report
    );
  }
  return report;
}
