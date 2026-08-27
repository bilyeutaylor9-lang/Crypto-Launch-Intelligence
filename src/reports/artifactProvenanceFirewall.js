import crypto from "node:crypto";

export const ARTIFACT_CLASSES = Object.freeze({
  LIVE_SHADOW: "LIVE_SHADOW",
  PRODUCTION: "PRODUCTION",
  DEMO: "DEMO",
  TEST: "TEST",
  UNKNOWN: "UNKNOWN",
});

const LIVE_CLASSES = new Set([
  ARTIFACT_CLASSES.LIVE_SHADOW,
  ARTIFACT_CLASSES.PRODUCTION,
]);

const FIXTURE_ADDRESSES = new Set([
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
]);

function text(value) {
  return String(value || "").trim();
}

function normalizedClass(value = "") {
  const candidate = text(value).toUpperCase().replace(/[ -]+/g, "_");
  if (["SHADOW", "PRODUCTION_SHADOW", "LIVE_RESEARCH"].includes(candidate)) {
    return ARTIFACT_CLASSES.LIVE_SHADOW;
  }
  return Object.values(ARTIFACT_CLASSES).includes(candidate)
    ? candidate
    : ARTIFACT_CLASSES.UNKNOWN;
}

export function classifyArtifactClass(meta = {}, env = process.env) {
  const explicit = normalizedClass(
    meta.artifactClass || meta.environmentClass || env.ARTIFACT_CLASS || env.SCAN_ARTIFACT_CLASS,
  );
  if (explicit !== ARTIFACT_CLASSES.UNKNOWN) return explicit;

  const scanRunId = text(meta.scanRunId || meta.runId || env.SCAN_RUN_ID || env.GITHUB_RUN_ID);
  const codeCommitSha = text(meta.codeCommitSha || env.GITHUB_SHA);
  if (/^demo[_-]/i.test(scanRunId)) return ARTIFACT_CLASSES.DEMO;
  if (/test|fixture|engine[_ -]?audit/i.test(scanRunId) || /^test(?:-|_)/i.test(codeCommitSha)) {
    return ARTIFACT_CLASSES.TEST;
  }
  if (/^scan[_-]/i.test(scanRunId) || (env.GITHUB_ACTIONS === "true" && scanRunId)) {
    return ARTIFACT_CLASSES.LIVE_SHADOW;
  }
  return ARTIFACT_CLASSES.UNKNOWN;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableObject(value[key])]),
  );
}

function artifactCommit(report = {}) {
  return report.codeCommitSha || report.commitSha || report.meta?.codeCommitSha || null;
}

function artifactCutoff(report = {}) {
  return report.dataCutoffTimestamp || report.meta?.dataCutoffTimestamp || null;
}

function explicitArtifactClass(report = {}) {
  return normalizedClass(report.artifactClass || report.meta?.artifactClass);
}

function collectFixtureFindings(value, location = "root", findings = [], budget = { remaining: 50_000 }) {
  if (budget.remaining <= 0) return findings;
  budget.remaining -= 1;
  if (typeof value === "string") {
    const candidate = value.trim();
    const lower = candidate.toLowerCase();
    if (FIXTURE_ADDRESSES.has(lower)) findings.push(`${location}: fixture address ${candidate}`);
    if (/^(repair candidate|engine audit sample)$/i.test(candidate)) {
      findings.push(`${location}: fixture identity ${candidate}`);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFixtureFindings(item, `${location}[${index}]`, findings, budget));
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectFixtureFindings(nested, `${location}.${key}`, findings, budget);
      if (findings.length >= 25 || budget.remaining <= 0) break;
    }
  }
  return findings;
}

export function auditArtifactProvenance(meta = {}, artifacts = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const nowMs = timestamp(now) ?? Date.now();
  const artifactClass = classifyArtifactClass(meta, options.env || process.env);
  const liveClass = LIVE_CLASSES.has(artifactClass);
  const scanRunId = text(meta.scanRunId || meta.runId) || null;
  const codeCommitSha = text(meta.codeCommitSha) || null;
  const dataCutoffTimestamp = text(meta.dataCutoffTimestamp || meta.completedAt) || null;
  const cutoffMs = timestamp(dataCutoffTimestamp);
  const maximumLiveArtifactAgeHours = Math.max(
    1,
    Number(options.maximumLiveArtifactAgeHours || process.env.DASHBOARD_MAX_ARTIFACT_AGE_HOURS || 12),
  );
  const errors = [];
  const warnings = [];
  const fixtureFindings = [];

  if (!scanRunId) errors.push("scanRunId missing");
  if (artifactClass === ARTIFACT_CLASSES.UNKNOWN) warnings.push("artifact class is UNKNOWN");
  if (liveClass && !/^[0-9a-f]{7,64}$/i.test(codeCommitSha || "")) {
    errors.push("live artifact requires an immutable hexadecimal codeCommitSha");
  }
  if (liveClass && cutoffMs === null) errors.push("live artifact requires a valid dataCutoffTimestamp");
  if (liveClass && cutoffMs !== null && cutoffMs > nowMs + 5 * 60_000) {
    errors.push("live artifact dataCutoffTimestamp is from the future");
  }
  if (liveClass && cutoffMs !== null && nowMs - cutoffMs > maximumLiveArtifactAgeHours * 3_600_000) {
    errors.push(`live artifact is older than ${maximumLiveArtifactAgeHours} hours`);
  }

  for (const artifact of artifacts) {
    if (!artifact?.parsed) continue;
    const reportCommit = artifactCommit(artifact.parsed);
    const reportCutoff = artifactCutoff(artifact.parsed);
    const reportClass = explicitArtifactClass(artifact.parsed);
    const fileName = artifact.fileName || "unknown-artifact";
    if (liveClass && !reportCommit) errors.push(`${fileName}: codeCommitSha missing`);
    if (liveClass && reportCommit && codeCommitSha && reportCommit !== codeCommitSha) {
      errors.push(`${fileName}: codeCommitSha does not match manifest`);
    }
    if (liveClass && timestamp(reportCutoff) === null) {
      errors.push(`${fileName}: dataCutoffTimestamp missing or invalid`);
    }
    if (liveClass && reportCutoff && dataCutoffTimestamp && reportCutoff !== dataCutoffTimestamp) {
      errors.push(`${fileName}: dataCutoffTimestamp does not match manifest`);
    }
    if (liveClass && reportClass !== ARTIFACT_CLASSES.UNKNOWN && reportClass !== artifactClass) {
      errors.push(`${fileName}: artifactClass ${reportClass} does not match ${artifactClass}`);
    }
    fixtureFindings.push(
      ...collectFixtureFindings(artifact.parsed, fileName, [], { remaining: 50_000 }),
    );
  }

  const uniqueFixtureFindings = [...new Set(fixtureFindings)].slice(0, 25);
  if (liveClass && uniqueFixtureFindings.length) {
    errors.push(...uniqueFixtureFindings.map((finding) => `fixture contamination: ${finding}`));
  } else if (uniqueFixtureFindings.length) {
    warnings.push(...uniqueFixtureFindings.map((finding) => `fixture data present: ${finding}`));
  }

  const fingerprintPayload = stableObject({
    artifactClass,
    scanRunId,
    codeCommitSha,
    dataCutoffTimestamp,
    artifacts: artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      scanRunId: artifact.scanRunId || null,
      sha256: artifact.sha256 || null,
    })),
  });

  return {
    schemaVersion: 1,
    artifactClass,
    liveClass,
    livePublishable: liveClass && errors.length === 0,
    demoPublishable: artifactClass === ARTIFACT_CLASSES.DEMO && errors.length === 0,
    testArtifact: artifactClass === ARTIFACT_CLASSES.TEST,
    provenanceFingerprint: sha256(JSON.stringify(fingerprintPayload)),
    maximumLiveArtifactAgeHours,
    fixtureFindingCount: uniqueFixtureFindings.length,
    fixtureFindings: uniqueFixtureFindings,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    policy: {
      testArtifactsMayPublishAsLive: false,
      demoArtifactsMayClaimLiveEvidence: false,
      unknownArtifactsMayPublishAsLive: false,
      automaticTrading: false,
    },
  };
}
