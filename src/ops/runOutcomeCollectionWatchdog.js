import { writeAtomicJson } from "../production/atomicArtifactStore.js";

const DEFAULT_MAXIMUM_AGE_MINUTES = 180;

function parsedTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildOutcomeCollectionWatchdog(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const nowMs = parsedTime(now);
  const runs = Array.isArray(options.runs) ? options.runs : [];
  const branch = options.branch || "main";
  const maximumAgeMinutes = Math.max(1, Number(options.maximumAgeMinutes || DEFAULT_MAXIMUM_AGE_MINUTES));
  const latest = runs
    .filter((run) => run?.conclusion === "success" && run?.head_branch === branch)
    .sort((left, right) => parsedTime(right.updated_at || right.created_at) - parsedTime(left.updated_at || left.created_at))[0] || null;
  const completedAt = latest?.updated_at || latest?.created_at || null;
  const completedMs = parsedTime(completedAt);
  const ageMinutes = completedMs === null || nowMs === null
    ? null
    : Number(Math.max(0, (nowMs - completedMs) / 60_000).toFixed(2));
  const state = !latest || ageMinutes === null || ageMinutes > maximumAgeMinutes
    ? "OUTCOME_COLLECTION_STALE"
    : "OUTCOME_COLLECTION_HEALTHY";
  return {
    schemaVersion: 1,
    generatedAt: now,
    state,
    maximumAgeMinutes,
    latestSuccessfulProbe: latest
      ? {
          runId: latest.id || null,
          headSha: latest.head_sha || null,
          completedAt,
          ageMinutes,
        }
      : null,
    rankingInfluence: false,
    automaticTrading: false,
  };
}

export async function runOutcomeCollectionWatchdog(options = {}) {
  const env = options.env || process.env;
  const repository = options.repository || env.GITHUB_REPOSITORY;
  const token = options.token || env.GITHUB_TOKEN;
  const fetchImpl = options.fetch || globalThis.fetch;
  const reportFile = options.reportFile || "reports/outcome-collection-watchdog.json";
  let report;
  try {
    if (!repository || !token || typeof fetchImpl !== "function") {
      throw new Error("GitHub repository, token, and fetch implementation are required for the outcome watchdog.");
    }
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/workflows/outcome-probe.yml/runs?status=success&per_page=20`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": "crypto-launch-intelligence-outcome-watchdog",
        },
      },
    );
    if (!response.ok) throw new Error(`GitHub outcome-probe history request failed: HTTP ${response.status}`);
    const payload = await response.json();
    report = buildOutcomeCollectionWatchdog({
      now: options.now,
      runs: payload.workflow_runs,
      branch: options.branch || env.OUTCOME_PROBE_BRANCH || "main",
      maximumAgeMinutes: options.maximumAgeMinutes || env.OUTCOME_PROBE_MAX_AGE_MINUTES,
    });
  } catch (error) {
    report = {
      schemaVersion: 1,
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      state: "OUTCOME_COLLECTION_INVALID",
      error: error?.message || String(error),
      rankingInfluence: false,
      automaticTrading: false,
    };
  }
  if (options.writeReport !== false) writeAtomicJson(reportFile, report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runOutcomeCollectionWatchdog();
  console.log(JSON.stringify(report, null, 2));
  if (report.state !== "OUTCOME_COLLECTION_HEALTHY") process.exitCode = 2;
}
