# Durable local evidence archive (R2 foundation)

`src/archive/durableEvidenceArchive.js` is an opt-in local archive. It is not wired to collectors, state bundles, Supabase, selection, or scoring.

Call `admitPrediction` only with the original provider bytes and the obligations already frozen by the admission contract. Every obligation requires an exact ID, `dueAt`, and `expiresAt` with explicit timezones. Contract-declared horizons must exactly match queued horizons; the module does not invent horizon lists or collection tolerances. It preserves original bytes, including malformed input, in content-addressed gzip segments. A separate per-record manifest binds all frozen metadata and obligations. Segment and manifest publication uses fsynced, no-replace hard links, followed by transactional SQLite admission of the record, obligations, and outbox entry. Crashes leave visible orphan bytes instead of silently losing obligations. No cleanup deletes damaged or unindexed evidence.

Mutable task state (pending, leased, retryable, budget-deferred, expired, completed), leases, and receipts are separate from immutable content. Obligation labels are scoped to records; distinct episodes may share exact provider bytes without sharing tasks. A duplicate record must match the entire frozen admission, not merely its raw hash. Existing compressed bytes are verified and reused, never repaired by recompressing. Solana address case and other passed identities are preserved exactly.

Leases require the returned unique `leaseToken` for subsequent transitions, including when the same worker reacquires expired work. Expired obligations remain in due denominators, which are counted before selection caps. Workers cannot declare early expiry or complete work without linked evidence. `completeWithEvidence` admits original observation bytes and completes its leased obligation in the same SQL transaction. The observation contract must bind `observationOf.recordId`, `taskId`, `horizonHours`, `requestedAt`, `receivedAt`, and `marketObservedAt`; unknown, future, late, mismatched, or case-changed observations cannot complete work. Caller-side provider/identity validation is still required. Task completion is not a certified return, execution proof, or an edge claim. There are no network calls under the SQL lock.

`listOutbox` exposes pending admission receipts. `acknowledgeOutbox` requires exact record/raw/manifest hashes from a supplied `readBack`; an HTTP success alone is insufficient. A future remote adapter must obtain that read-back independently. This module does not implement or claim remote synchronization.

Use `backup(destination)` for an index snapshot: it reserves a new destination and calls SQLite's Online Backup API. This index alone is not a complete evidence backup. `exportArchive(destination)` takes one consistent SQL snapshot and copies compressed segments and manifests, including unindexed/quarantined bytes, without creating a base64 copy of all raw history. A file catalog and hash-bound export index verify the complete package. Restore requires an empty directory, rejects unsafe paths before writing, verifies original compressed bytes, and rolls back SQL admission on integrity failure. Restored orphans remain visibly unindexed; they are not promoted into valid observations. A backup on the same disk is not independent.

`audit()` checks frozen manifests, task scheduling fields, completion evidence, lease state, outbox bindings, foreign keys, missing segments, and physical or recorded orphan evidence. `rebuildIndex()` can rebuild immutable records and pending obligations from valid manifests, but reports `mutableTaskHistoryRestored: false` and `IMMUTABLE_INDEX_REBUILT_RECONCILIATION_REQUIRED`. It is not a substitute for restoring queue/receipt history. Pre-v2 draft databases are rejected with an explicit preservation error, not silently migrated.

The final audit also validates stored acknowledgment kind and receipt read-back hashes, not merely the acknowledgment flag. The public restore helper validates in a sibling staging directory and publishes only after a successful integrity check. Invalid input leaves the requested destination untouched. Publication preserves an existing empty destination's identity and permissions, refuses a raced destination, and uses no-replace links with the closed SQLite index published last. A publication failure retains the complete verified staging archive on the error's recovery path; no raced files are overwritten or deleted. A recovery can use that retained directory without deleting evidence. Newly created archive indexes and evidence files are private.

## Archive-backed restart state

The existing state commands support an explicit local archive mode:

```sh
SCANNER_STATE_ARCHIVE_ROOT=/persistent/evidence npm run state:pack
SCANNER_STATE_ARCHIVE_ROOT=/persistent/evidence npm run state:inspect
SCANNER_STATE_ARCHIVE_ROOT=/persistent/evidence npm run state:restore
```

Without this setting, the existing V2 bundle remains the default, and V1/V2 restoration is supported. No workflow is switched automatically. Do not enable this mode on ephemeral runners that cannot access the permanent archive.

V3 keeps the latest exact candidate universe and working caches inside the restart bundle. It archives flat JSONL ledgers, growing scan/universe/outcome histories, and native discovery histories separately, including frozen cohort and observation ledgers outside the old bundle pattern set. Original malformed/quarantined bytes are not parsed away, and no source file is deleted. Immutable file snapshots get distinct IDs when their bytes change; older snapshots remain available.

The complete decompressed V3 restart bundle, including reference metadata, must fit within 128 MiB. The existing 768 MiB ceiling is not raised. A smaller test/operator target may tighten this budget; it cannot enlarge it. Excess hot state fails explicitly instead of truncating history or replacing the previous valid bundle.

The bundle contains exact file paths, lengths, raw hashes, immutable archive IDs, and admission hashes, not an embedded absolute archive location. Restore and inspection require an available matching archive. Missing, corrupt, stale, duplicate, mismatched, or unsafe references fail before any hot file is restored. Restore the permanent archive itself first, using its supported export/backup procedures, when recovering onto an empty host.

Restoration stages and verifies all hot/cold bytes before publication. It never overwrites conflicting local files; identical files are left untouched, including their mtimes. Publication uses no-replace hard links and is recoverable after interruption by replaying the same verified bundle. Failed staging is retained on the error's recovery path. Source files are hash-checked during packing, but single-writer coordination is still required for a cross-file decision-cutoff snapshot.

Bundle creation/restore times are operational timestamps, not market observations. Source bytes, embedded source times, UNKNOWN values, exact identities, and confidence values remain unchanged. File-snapshot admission does not create episode outcome obligations or activate a collector. Reports explicitly retain `archiveTaskQueueMigrated: false`.

## Quarantine-preserving recovery

Normal portable export and restore reject an archive with unindexed physical evidence. Explicit raw-preservation operations may use `exportArchive(destination, { preserveQuarantinedEvidence: true })` and `restoreDurableEvidenceArchive({ source, root, preserveQuarantinedEvidence: true })`. This copies verifiable quarantined/orphan bytes without indexing or promoting them. The restored audit remains `ok: false`. Corrupt/missing indexed evidence, missing orphan bytes, forged receipts, and invalid SQL state still fail, even with this option. The option is not a scanner-health, scoring, or certification override.

Remaining acceptance work: production migration, episode-to-obligation reconciliation under the original frozen timing policy, crash/restart coordinator integration, provider retry/cooldown scheduling, independent backup destination, real remote read-back/restore, and production collection acceptance. The current collector has not been replaced. Storage restore tests do not establish sustained collection continuity or a profitable strategy.
