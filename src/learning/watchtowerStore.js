import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const ALERT_FILE = path.join(DATA_DIR, "watchtower-alerts.json");
const BRIEF_FILE = path.join(DATA_DIR, "watchtower-brief.json");
const MAX_ALERTS = Number(process.env.MAX_WATCHTOWER_ALERTS || 5000);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDataDir();

  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function alertFingerprint(alert = {}) {
  return [
    alert.projectId,
    alert.type,
    alert.severity,
    alert.message,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

const POSITIVE_OPPORTUNITY_ALERT_PATTERN =
  /armed|pre-breakout|score spike|priority|smart money|liquidity|social/i;

export function watchtowerAlertRetentionEligible(alert = {}) {
  if (!POSITIVE_OPPORTUNITY_ALERT_PATTERN.test(String(alert.type || ""))) return true;
  return alert.opportunityPolicyEligible === true;
}

export function watchtowerAlertPublicEligible(alert = {}) {
  return Boolean(
    alert.opportunityPolicyEligible === true &&
    alert.tokenAddress &&
    alert.chain &&
    String(alert.chain).toLowerCase() !== "unknown"
  );
}

export function loadWatchtowerAlerts() {
  const parsed = readJson(ALERT_FILE, {
    version: 1,
    updatedAt: null,
    alerts: [],
  });

  return {
    version: 1,
    updatedAt: parsed.updatedAt || null,
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
  };
}

export function saveWatchtowerAlerts(alerts = []) {
  const existing = loadWatchtowerAlerts();
  const seen = new Set();
  const merged = [...existing.alerts, ...(Array.isArray(alerts) ? alerts : [])]
    .reverse()
    .filter(watchtowerAlertRetentionEligible)
    .filter((alert) => {
      const fingerprint = alertFingerprint(alert);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    })
    .reverse()
    .slice(-MAX_ALERTS);

  const store = {
    version: 1,
    updatedAt: new Date().toISOString(),
    alerts: merged,
  };

  writeJson(ALERT_FILE, store);

  return {
    file: ALERT_FILE,
    saved: Array.isArray(alerts) ? alerts.length : 0,
    totalAlerts: merged.length,
  };
}

export function loadWatchtowerBrief() {
  return readJson(BRIEF_FILE, {
    version: 1,
    generatedAt: null,
    brief: null,
  });
}

export function saveWatchtowerBrief(brief = {}) {
  const store = {
    version: 1,
    generatedAt: new Date().toISOString(),
    brief,
  };

  writeJson(BRIEF_FILE, store);

  return {
    file: BRIEF_FILE,
    brief: store,
  };
}

export function summarizeWatchtower() {
  const alerts = loadWatchtowerAlerts().alerts;
  const brief = loadWatchtowerBrief().brief;
  const openAlerts = alerts.filter((alert) => alert.status !== "archived");

  return {
    alertFile: ALERT_FILE,
    briefFile: BRIEF_FILE,
    totalAlerts: alerts.length,
    openAlerts: openAlerts.length,
    criticalAlerts: openAlerts.filter((alert) => alert.severity === "Critical").length,
    highAlerts: openAlerts.filter((alert) => alert.severity === "High").length,
    latestBriefGeneratedAt: brief?.generatedAt || null,
  };
}
