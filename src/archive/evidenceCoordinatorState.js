import crypto from "node:crypto";

export const COORDINATOR_TABLES = ["writer_coordination", "provider_windows", "provider_requests", "task_schedule"];

function exact(value, name) {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > 4096 || /[\x00-\x1f]/.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}

function iso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError("Coordinator clock requires an ISO timestamp with timezone");
  return new Date(value).toISOString();
}

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError("Invalid coordinator limit or duration");
  return value;
}

export function createEvidenceCoordinatorState(db, options = {}) {
  const clock = options.clock || (() => new Date().toISOString());
  const at = value => iso(value ?? clock());
  let token = options.writerToken || null;
  db.exec(`
    CREATE TABLE IF NOT EXISTS writer_coordination (
      name TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL,
      acquired_at TEXT NOT NULL, lease_until TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_windows (
      provider TEXT PRIMARY KEY, window_start TEXT NOT NULL, window_ms INTEGER NOT NULL,
      request_limit INTEGER NOT NULL, used INTEGER NOT NULL, cooldown_until TEXT,
      consecutive_failures INTEGER NOT NULL, circuit_until TEXT
    );
    CREATE TABLE IF NOT EXISTS provider_requests (
      request_id TEXT PRIMARY KEY, provider TEXT NOT NULL REFERENCES provider_windows(provider),
      window_start TEXT NOT NULL, units INTEGER NOT NULL, state TEXT NOT NULL,
      coordinator_token TEXT NOT NULL, reserved_at TEXT NOT NULL, dispatched_at TEXT,
      received_at TEXT, status_code INTEGER, task_id TEXT REFERENCES obligations(task_id),
      budget_group TEXT REFERENCES provider_windows(provider), group_window_start TEXT
    );
    CREATE TABLE IF NOT EXISTS task_schedule (
      task_id TEXT PRIMARY KEY REFERENCES obligations(task_id), next_attempt_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL, last_lease_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_provider_requests_window ON provider_requests(provider, window_start);
    CREATE INDEX IF NOT EXISTS idx_provider_requests_group ON provider_requests(budget_group, group_window_start);
  `);
  const writer = () => db.prepare("SELECT * FROM writer_coordination WHERE name='evidence'").get();

  function assertWrite(nowAt) {
    const current = writer();
    if (!current) return;
    const time = at(nowAt);
    if (!token || current.token !== token || current.lease_until <= time || current.last_seen_at > time) throw new Error("EVIDENCE_WRITER_NOT_OWNED");
    db.prepare("UPDATE writer_coordination SET last_seen_at=? WHERE name='evidence' AND token=?").run(time, token);
  }

  function assertOwned(nowAt) {
    if (!writer()) throw new Error("EVIDENCE_WRITER_NOT_CLAIMED");
    assertWrite(nowAt);
  }

  function claimWriter({ owner, nowAt, leaseMs = 120000 } = {}) {
    exact(owner, "writer owner"); integer(leaseMs, 1);
    const time = at(nowAt), until = new Date(Date.parse(time) + leaseMs).toISOString();
    return db.transaction(() => {
      const current = writer();
      if (current?.last_seen_at > time) throw new Error("EVIDENCE_COORDINATOR_CLOCK_REVERSED");
      if (current && current.lease_until > time) return null;
      const next = crypto.randomUUID();
      db.prepare("INSERT INTO writer_coordination VALUES ('evidence',?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,token=excluded.token,acquired_at=excluded.acquired_at,lease_until=excluded.lease_until,last_seen_at=excluded.last_seen_at").run(owner, next, time, until, time);
      token = next;
      return { owner, writerToken: next, leaseUntil: until };
    }).immediate();
  }

  function renewWriter({ nowAt, leaseMs = 120000 } = {}) {
    integer(leaseMs, 1); const time = at(nowAt);
    return db.transaction(() => {
      assertOwned(time);
      const until = new Date(Date.parse(time) + leaseMs).toISOString();
      db.prepare("UPDATE writer_coordination SET lease_until=?,last_seen_at=? WHERE name='evidence' AND token=?").run(until, time, token);
      return { leaseUntil: until };
    }).immediate();
  }

  function releaseWriter({ nowAt } = {}) {
    const time = at(nowAt);
    return db.transaction(() => {
      const current = writer();
      if (!token || current?.token !== token || current.last_seen_at > time) return false;
      const changed = db.prepare("UPDATE writer_coordination SET lease_until=?,last_seen_at=? WHERE name='evidence' AND token=?").run(time, time, token).changes;
      token = null;
      return changed === 1;
    }).immediate();
  }

  function reserveProviderRequest({ provider, windowMs, requestLimit, units = 1, taskId = null, globalBudget = null, nowAt } = {}) {
    exact(provider, "provider"); integer(windowMs, 1); integer(requestLimit); integer(units, 1);
    if (globalBudget) {
      exact(globalBudget.provider, "global provider budget"); integer(globalBudget.windowMs, 1); integer(globalBudget.requestLimit);
      if (globalBudget.provider === provider) throw new TypeError("Global budget must be separate from the provider");
    }
    const time = at(nowAt);
    return db.transaction(() => {
      assertOwned(time);
      const budgets = [ensureBudget(provider, windowMs, requestLimit, time)];
      if (globalBudget) budgets.push(ensureBudget(globalBudget.provider, globalBudget.windowMs, globalBudget.requestLimit, time));
      for (const budget of budgets) {
        const blockedUntil = [budget.cooldown_until, budget.circuit_until].filter(value => value && value > time).sort().at(-1);
        if (blockedUntil) return { reserved: false, reason: "PROVIDER_COOLDOWN", retryAt: blockedUntil };
        if (budget.used + units > budget.request_limit) return { reserved: false, reason: "PROVIDER_BUDGET_EXHAUSTED", retryAt: new Date(Date.parse(budget.window_start) + budget.window_ms).toISOString() };
      }
      const [budget, group] = budgets;
      const requestId = crypto.randomUUID();
      for (const scope of budgets) db.prepare("UPDATE provider_windows SET used=used+? WHERE provider=?").run(units, scope.provider);
      db.prepare("INSERT INTO provider_requests VALUES (?,?,?,?, 'reserved',?,?,NULL,NULL,NULL,?,?,?)").run(requestId, provider, budget.window_start, units, token, time, taskId, group?.provider || null, group?.window_start || null);
      return { reserved: true, requestId, provider, units, reservedAt: time };
    }).immediate();
  }

  function ensureBudget(provider, windowMs, requestLimit, time) {
      const budget = db.prepare("SELECT * FROM provider_windows WHERE provider=?").get(provider);
      if (budget) {
        const charged = db.prepare("SELECT COALESCE(SUM(units),0) AS used FROM provider_requests WHERE (provider=? AND window_start=?) OR (budget_group=? AND group_window_start=?)").get(provider, budget.window_start, provider, budget.window_start).used;
        if (charged !== budget.used || !Number.isSafeInteger(budget.used) || budget.used < 0 || budget.used > budget.request_limit) throw new Error("ARCHIVE_PROVIDER_BUDGET_CORRUPT");
      }
      if (budget && budget.window_start > time) throw new Error("EVIDENCE_PROVIDER_CLOCK_REVERSED");
      if (!budget) {
        db.prepare("INSERT INTO provider_windows VALUES (?,?,?,?,0,NULL,0,NULL)").run(provider, time, windowMs, requestLimit);
      } else if (Date.parse(time) >= Date.parse(budget.window_start) + budget.window_ms) {
        const elapsed = Math.floor((Date.parse(time) - Date.parse(budget.window_start)) / budget.window_ms);
        const start = windowMs === budget.window_ms ? new Date(Date.parse(budget.window_start) + elapsed * budget.window_ms).toISOString() : time;
        db.prepare("UPDATE provider_windows SET window_start=?,window_ms=?,request_limit=?,used=0 WHERE provider=?").run(start, windowMs, requestLimit, provider);
      } else if (budget.window_ms !== windowMs || budget.request_limit !== requestLimit) throw new Error("ACTIVE_PROVIDER_BUDGET_POLICY_CONFLICT");
      return db.prepare("SELECT * FROM provider_windows WHERE provider=?").get(provider);
  }

  function markProviderDispatched({ requestId, nowAt } = {}) {
    const time = at(nowAt);
    return db.transaction(() => {
      assertOwned(time);
      return db.prepare("UPDATE provider_requests SET state='dispatched',dispatched_at=? WHERE request_id=? AND coordinator_token=? AND state='reserved' AND reserved_at<=?").run(time, requestId, token, time).changes === 1;
    }).immediate();
  }

  function finishProviderRequest({ requestId, success, statusCode = null, retryAfterMs = null, circuitThreshold = 3, circuitMs = 60000, nowAt } = {}) {
    if (typeof success !== "boolean" || (statusCode !== null && (!Number.isSafeInteger(statusCode) || statusCode < 100 || statusCode > 599))) throw new TypeError("Invalid provider receipt");
    integer(circuitThreshold, 1); integer(circuitMs, 1); if (retryAfterMs !== null) integer(retryAfterMs);
    const time = at(nowAt);
    return db.transaction(() => {
      assertOwned(time);
      const request = db.prepare("SELECT * FROM provider_requests WHERE request_id=?").get(requestId);
      if (!request || request.coordinator_token !== token || request.state !== "dispatched" || request.dispatched_at > time) return false;
      db.prepare("UPDATE provider_requests SET state=?,received_at=?,status_code=? WHERE request_id=?").run(success ? "succeeded" : "failed", time, statusCode, requestId);
      const budget = db.prepare("SELECT * FROM provider_windows WHERE provider=?").get(request.provider);
      const providerFailure = !success && (statusCode === null || statusCode >= 500);
      const failures = success ? 0 : budget.consecutive_failures + Number(providerFailure);
      const cooldown = retryAfterMs !== null ? new Date(Date.parse(time) + retryAfterMs).toISOString() : null;
      const circuit = providerFailure && failures >= circuitThreshold ? new Date(Date.parse(time) + circuitMs).toISOString() : null;
      db.prepare("UPDATE provider_windows SET consecutive_failures=?,cooldown_until=?,circuit_until=? WHERE provider=?").run(failures,
        [budget.cooldown_until, cooldown].filter(Boolean).sort().at(-1) || null,
        [budget.circuit_until, circuit].filter(Boolean).sort().at(-1) || null, request.provider);
      return true;
    }).immediate();
  }

  function noteTaskLease(taskId, time) {
    db.prepare("INSERT INTO task_schedule VALUES (?,?,1,?) ON CONFLICT(task_id) DO UPDATE SET attempt_count=attempt_count+1,last_lease_at=excluded.last_lease_at").run(taskId, time, time);
  }

  function scheduleTask(taskId, retryAt, nowAt) {
    const time = at(nowAt), next = at(retryAt);
    if (next < time) throw new Error("TASK_RETRY_BACKDATED");
    db.prepare("INSERT INTO task_schedule VALUES (?,?,0,NULL) ON CONFLICT(task_id) DO UPDATE SET next_attempt_at=excluded.next_attempt_at").run(taskId, next);
  }

  function coordinationStatus(nowAt) {
    const time = at(nowAt), current = writer();
    return { writerEnforced: Boolean(current), writer: current ? { owner: current.owner, acquiredAt: current.acquired_at, leaseUntil: current.lease_until, active: current.lease_until > time } : null,
      providers: db.prepare("SELECT * FROM provider_windows ORDER BY provider").all(),
      requests: db.prepare("SELECT state,COUNT(*) AS count,SUM(units) AS units FROM provider_requests GROUP BY state ORDER BY state").all() };
  }

  function integrityErrors() {
    const errors = [];
    const validTime = value => { try { return iso(value) === value; } catch { return false; } };
    for (const row of db.prepare("SELECT * FROM writer_coordination").all()) {
      if (row.name !== "evidence" || !row.owner || !row.token || ![row.acquired_at, row.lease_until, row.last_seen_at].every(validTime) || row.acquired_at > row.last_seen_at || row.acquired_at > row.lease_until) errors.push("ARCHIVE_COORDINATOR_STATE_CORRUPT");
    }
    for (const row of db.prepare("SELECT * FROM provider_windows").all()) {
      if (!validTime(row.window_start) || [row.cooldown_until, row.circuit_until].some(value => value !== null && !validTime(value)) ||
        ![row.window_ms, row.request_limit, row.used, row.consecutive_failures].every(Number.isSafeInteger)) errors.push("ARCHIVE_PROVIDER_BUDGET_CORRUPT");
    }
    for (const row of db.prepare("SELECT * FROM provider_requests").all()) {
      if (![row.reserved_at, row.window_start].every(validTime) || [row.dispatched_at, row.received_at, row.group_window_start].some(value => value !== null && !validTime(value)) ||
        row.window_start > row.reserved_at || (row.group_window_start && row.group_window_start > row.reserved_at) || !Number.isSafeInteger(row.units)) errors.push("ARCHIVE_PROVIDER_REQUEST_CORRUPT");
    }
    for (const row of db.prepare("SELECT * FROM task_schedule").all()) {
      if (!validTime(row.next_attempt_at) || (row.last_lease_at !== null && !validTime(row.last_lease_at)) || !Number.isSafeInteger(row.attempt_count)) errors.push("ARCHIVE_TASK_SCHEDULE_CORRUPT");
    }
    const invalidBudgets = db.prepare("SELECT provider FROM provider_windows b WHERE window_ms<=0 OR request_limit<0 OR used<0 OR used>request_limit OR consecutive_failures<0 OR used != (SELECT COALESCE(SUM(units),0) FROM provider_requests r WHERE (r.provider=b.provider AND r.window_start=b.window_start) OR (r.budget_group=b.provider AND r.group_window_start=b.window_start))").all();
    if (invalidBudgets.length) errors.push("ARCHIVE_PROVIDER_BUDGET_CORRUPT");
    const invalidRequests = db.prepare("SELECT request_id FROM provider_requests WHERE units<=0 OR state NOT IN ('reserved','dispatched','succeeded','failed') OR (state='reserved' AND (dispatched_at IS NOT NULL OR received_at IS NOT NULL)) OR (state!='reserved' AND (dispatched_at IS NULL OR dispatched_at<reserved_at)) OR (state IN ('succeeded','failed') AND (received_at IS NULL OR received_at<dispatched_at)) OR (state='dispatched' AND received_at IS NOT NULL) OR budget_group=provider OR (budget_group IS NULL)!=(group_window_start IS NULL)").all();
    if (invalidRequests.length) errors.push("ARCHIVE_PROVIDER_REQUEST_CORRUPT");
    if (db.prepare("SELECT task_id FROM task_schedule WHERE attempt_count<0 OR (attempt_count>0 AND last_lease_at IS NULL)").all().length) errors.push("ARCHIVE_TASK_SCHEDULE_CORRUPT");
    return errors;
  }

  return { assertWrite, claimWriter, renewWriter, releaseWriter, reserveProviderRequest, markProviderDispatched, finishProviderRequest, noteTaskLease, scheduleTask, coordinationStatus, integrityErrors };
}
