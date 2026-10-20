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
      budget_group TEXT REFERENCES provider_windows(provider), group_window_start TEXT,
      attempt_kind TEXT NOT NULL DEFAULT 'LEGACY_UNCLASSIFIED', finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS task_schedule (
      task_id TEXT PRIMARY KEY REFERENCES obligations(task_id), next_attempt_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL, last_lease_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_provider_requests_window ON provider_requests(provider, window_start);
    CREATE INDEX IF NOT EXISTS idx_provider_requests_group ON provider_requests(budget_group, group_window_start);
    CREATE INDEX IF NOT EXISTS idx_provider_requests_task ON provider_requests(task_id);
  `);
  if (!db.pragma("table_info(provider_requests)").some(column => column.name === "attempt_kind")) db.exec("ALTER TABLE provider_requests ADD COLUMN attempt_kind TEXT NOT NULL DEFAULT 'LEGACY_UNCLASSIFIED'");
  if (!db.pragma("table_info(provider_requests)").some(column => column.name === "finished_at")) {
    db.exec("ALTER TABLE provider_requests ADD COLUMN finished_at TEXT");
    db.exec("UPDATE provider_requests SET finished_at=received_at WHERE state IN ('succeeded','failed')");
  }
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
      const role = taskId && !db.prepare("SELECT 1 FROM provider_requests WHERE task_id=? LIMIT 1").get(taskId) ? "first" : "retry";
      if (taskId && group && globalBudget.balanceOutcomeAttempts === true) {
        const pending = db.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM provider_requests r WHERE r.task_id=o.task_id) THEN 'retry' ELSE 'first' END AS role,COUNT(*) AS n
          FROM obligations o LEFT JOIN task_schedule s USING(task_id)
          WHERE o.state IN ('pending','leased','retryable','budget-deferred') AND o.due_at<=? AND o.expires_at>=?
            AND (s.next_attempt_at IS NULL OR s.next_attempt_at<=?)
            AND NOT EXISTS (SELECT 1 FROM historical_reconciliations h WHERE h.task_id=o.task_id)
          GROUP BY 1`).all(time, time, time);
        const used = db.prepare(`SELECT CASE WHEN r.attempt_kind='FIRST_ATTEMPT' THEN 'first' ELSE 'retry' END AS role,SUM(r.units) AS n
          FROM provider_requests r WHERE r.budget_group=? AND r.group_window_start=? AND r.task_id IS NOT NULL GROUP BY 1`).all(group.provider, group.window_start);
        const other = role === "first" ? "retry" : "first";
        const reservedShare = other === "first" ? Math.ceil(group.request_limit / 2) : Math.floor(group.request_limit / 2);
        const protectedUnits = Math.min(pending.find(row => row.role === other)?.n || 0, Math.max(0, reservedShare - (used.find(row => row.role === other)?.n || 0)));
        if (group.used + units > group.request_limit - protectedUnits) return { reserved: false, reason: "OUTCOME_ATTEMPT_CAPACITY_RESERVED",
          retryAt: new Date(Math.min(Date.parse(group.window_start) + group.window_ms, Date.parse(time) + 60000)).toISOString() };
      }
      const requestId = crypto.randomUUID();
      for (const scope of budgets) db.prepare("UPDATE provider_windows SET used=used+? WHERE provider=?").run(units, scope.provider);
      db.prepare("INSERT INTO provider_requests VALUES (?,?,?,?, 'reserved',?,?,NULL,NULL,NULL,?,?,?,?,NULL)").run(requestId, provider, budget.window_start, units, token, time, taskId, group?.provider || null, group?.window_start || null, role === "first" ? "FIRST_ATTEMPT" : "RETRY_OR_FALLBACK");
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

  function finishProviderRequest({ requestId, success, statusCode = null, receivedAt, retryAfterMs = null, minimumIntervalMs = 0, circuitThreshold = 3, circuitMs = 60000, nowAt } = {}) {
    if (typeof success !== "boolean" || (statusCode !== null && (!Number.isSafeInteger(statusCode) || statusCode < 100 || statusCode > 599))) throw new TypeError("Invalid provider receipt");
    integer(circuitThreshold, 1); integer(circuitMs, 1); integer(minimumIntervalMs); if (retryAfterMs !== null) integer(retryAfterMs);
    const time = at(nowAt), receiptTime = receivedAt === null ? null : receivedAt === undefined ? time : at(receivedAt);
    if (receiptTime && receiptTime > time) throw new Error("PROVIDER_RECEIPT_IN_FUTURE");
    if (success && !receiptTime) throw new Error("SUCCESSFUL_PROVIDER_RECEIPT_REQUIRED");
    return db.transaction(() => {
      assertOwned(time);
      const request = db.prepare("SELECT * FROM provider_requests WHERE request_id=?").get(requestId);
      if (!request || request.coordinator_token !== token || request.state !== "dispatched" || request.dispatched_at > time || (receiptTime && request.dispatched_at > receiptTime)) return false;
      db.prepare("UPDATE provider_requests SET state=?,received_at=?,status_code=?,finished_at=? WHERE request_id=?").run(success ? "succeeded" : "failed", receiptTime, statusCode, time, requestId);
      const budget = db.prepare("SELECT * FROM provider_windows WHERE provider=?").get(request.provider);
      const providerFailure = !success && (statusCode === null || statusCode >= 500);
      const failures = success ? 0 : budget.consecutive_failures + Number(providerFailure);
      const pause = Math.max(minimumIntervalMs, retryAfterMs ?? 0);
      const cooldown = pause ? new Date(Date.parse(receiptTime || time) + pause).toISOString() : null;
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
      if (![row.reserved_at, row.window_start].every(validTime) || [row.dispatched_at, row.received_at, row.finished_at, row.group_window_start].some(value => value !== null && !validTime(value)) ||
        row.window_start > row.reserved_at || (row.group_window_start && row.group_window_start > row.reserved_at) || !Number.isSafeInteger(row.units) ||
        !["FIRST_ATTEMPT", "RETRY_OR_FALLBACK", "LEGACY_UNCLASSIFIED"].includes(row.attempt_kind)) errors.push("ARCHIVE_PROVIDER_REQUEST_CORRUPT");
    }
    for (const row of db.prepare("SELECT * FROM task_schedule").all()) {
      if (!validTime(row.next_attempt_at) || (row.last_lease_at !== null && !validTime(row.last_lease_at)) || !Number.isSafeInteger(row.attempt_count)) errors.push("ARCHIVE_TASK_SCHEDULE_CORRUPT");
    }
    const invalidBudgets = db.prepare("SELECT provider FROM provider_windows b WHERE window_ms<=0 OR request_limit<0 OR used<0 OR used>request_limit OR consecutive_failures<0 OR used != (SELECT COALESCE(SUM(units),0) FROM provider_requests r WHERE (r.provider=b.provider AND r.window_start=b.window_start) OR (r.budget_group=b.provider AND r.group_window_start=b.window_start))").all();
    if (invalidBudgets.length) errors.push("ARCHIVE_PROVIDER_BUDGET_CORRUPT");
    const invalidRequests = db.prepare("SELECT request_id FROM provider_requests WHERE units<=0 OR state NOT IN ('reserved','dispatched','succeeded','failed') OR (state='reserved' AND (dispatched_at IS NOT NULL OR received_at IS NOT NULL OR finished_at IS NOT NULL)) OR (state!='reserved' AND (dispatched_at IS NULL OR dispatched_at<reserved_at)) OR (state IN ('succeeded','failed') AND (finished_at IS NULL OR finished_at<dispatched_at)) OR (state='succeeded' AND received_at IS NULL) OR (received_at IS NOT NULL AND (received_at<dispatched_at OR received_at>finished_at)) OR (state='dispatched' AND (received_at IS NOT NULL OR finished_at IS NOT NULL)) OR budget_group=provider OR (budget_group IS NULL)!=(group_window_start IS NULL)").all();
    if (invalidRequests.length) errors.push("ARCHIVE_PROVIDER_REQUEST_CORRUPT");
    if (db.prepare("SELECT task_id FROM task_schedule WHERE attempt_count<0 OR (attempt_count>0 AND last_lease_at IS NULL)").all().length) errors.push("ARCHIVE_TASK_SCHEDULE_CORRUPT");
    return errors;
  }

  return { assertWrite, claimWriter, renewWriter, releaseWriter, reserveProviderRequest, markProviderDispatched, finishProviderRequest, noteTaskLease, scheduleTask, coordinationStatus, integrityErrors };
}
