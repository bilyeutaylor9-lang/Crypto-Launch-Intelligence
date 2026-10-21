# Persistent Remote Evidence Outage Circuit

## Confirmed Failure

An original GitHub artifact from run 39296507353 contains the platform error:
`Service for this project is restricted due to the following violations:
exceed_egress_quota.` The complete original artifact remains preserved locally.
The former command reported the failure but did not retain a cross-run circuit.
Legacy scan-memory bootstrap also retried its history reads on subsequent runs.

On 2026-10-21, [Exact Outcome Probe run 39655424278](https://github.com/bilyeutaylor9-lang/Crypto-Launch-Intelligence/actions/runs/39655424278),
source-pinned to main commit `deba6f06975e6a3631bd08820df3beed06e7f232`,
failed both restore and sync with the same full platform restriction envelope,
but with `exceed_db_size_quota`. Database-size restriction is a separate confirmed
provider condition, not evidence that egress quota was exceeded.

Storing an incident only in the scanner-state bundle was insufficient: that
bundle can fail to pack, and some workflows pack it before the later sync can
discover an outage. No archive, ledger, or learning-state limit is increased.

## Behavior

- A bounded, endpoint-scoped operational file is separate from learned evidence:
  `data/remote-operational-circuits.json` (16 KiB / 64 incident maximum).
- Only exact structured `exceed_egress_quota` / `exceed_db_size_quota` codes or
  their captured, complete single-violation platform message are recognized.
  Generic 403/auth/network failures, HTML, malformed JSON, bare substrings,
  truncated/extended envelopes and conflicting quota codes do not establish an
  outage. The egress classifier remains egress-only.
- Version-one egress snapshots and the existing egress APIs remain compatible.
  Database-size incidents use `REMOTE_DATABASE_SIZE_OUTAGE` with provider code
  `exceed_db_size_quota`, never `REMOTE_EGRESS_OUTAGE`.
- The forward-evidence SDK command and legacy REST history bootstrap share the
  circuit. Scanner and operator CLI entrypoints supply their workspace root.
  Library consumers must explicitly supply a root to persist operational state.
- A known incident skips later remote restore/sync/history work without deleting
  or acknowledging local observations. An unconfirmed quota hint still stops
  legacy egress credential retries without becoming a persisted declaration.
  REST persists confirmed restrictions immediately and checks the shared circuit
  before subsequent retry/key dispatches; the three already-dispatched table
  reads may finish. Both caller paths consult the same endpoint-scoped file.
- All 12 affected scan/state workflows restore a tiny operational cache before
  remote work and save it after the latest remote operation, independently of
  `state_pack` success or the presence of local evidence ledgers. Rerun attempts
  use distinct cache keys. This never publishes an empty evidence cache merely
  to carry an incident.
- A cleared snapshot remains present in the operational cache, so later runs do
  not fall back to an older open incident. Operational state is not included in
  the large scanner-state bundle.
- Corrupt state fails closed; size/count checks occur before replacing a valid
  incident file. Incident-write failures remain explicit failures.

## Explicit Service Verification

`npm run forward:evidence:verify` performs one indexed metadata read. It requires
the expected ledger, a usable bounded record ID, and a string SHA-256 hash.
Empty/malformed/coerced metadata cannot clear an incident. Verification against
another endpoint cannot clear the original endpoint's incident. Existing egress
recovery behavior is unchanged: this explicit scoped read can clear egress.
Neither quota type expires automatically. A later date, presumed billing-period
reset, changed credential, or ordinary restore/sync command is not recovery proof.

A successful egress result is `INDEXED_SERVICE_ADMISSION_ONLY`: it explicitly
does not claim archive restoration or remote synchronization acknowledgment.
Actual restore/sync and ID/hash acknowledgment must still succeed afterward.

Database-size restrictions may allow SELECT while rejecting writes. Even valid
indexed metadata therefore cannot clear a database-size incident. Verification
retains the circuit and reports `REMOTE_FORWARD_EVIDENCE_FAILED`,
`readAdmissionVerified: true`, `verificationIncomplete: true`,
`circuitRetained: true`, and `writeProofRequired: true`. Recovery remains unproven
until the affected write operation succeeds with its exact ID/hash acknowledgment.
This change does not implement such a write probe, create fake evidence, or enable
full-history retries to obtain proof. The incident remains active in the meantime.

Existing egress report states are unchanged. Database-size command reports retain
`state: REMOTE_FORWARD_EVIDENCE_FAILED` for existing CLI failure handling and add
`circuitState: REMOTE_DATABASE_SIZE_OUTAGE`, the exact `providerCode`, and the
original `detectedAt`; suppressed commands also carry `skipped: true`. Read-only
database-size verification is never reported as recovery or restore/sync success.
REST reports carry the precise incident in `remoteCircuit` and use database-size
wording rather than egress wording.

Known egress restore outages allow existing local collection to continue. Sync
outages and database-size command reports remain unsuccessful operational
results. Invalid/conflicting evidence is not made healthy, ignored, deleted, or
rehashed. Report paths respect the selected
workspace root. No statistical, identity, safety, liquidity, execution or quote
freshness requirement changes.

## Remaining Limits

This code is verified with temporary fixtures and mocked clients, including the
real SDK with an offline fetch implementation. Dispatch counts prove zero later
requests across SDK/REST caller paths after a confirmed scoped restriction, and
byte comparisons retain local ledgers and opaque pending/outbox fixtures. No live Supabase query
is needed to retest a confirmed restriction. Real Supabase service recovery,
independent server backup, and full local coordinator/archive migration remain
unverified or unfinished. GitHub operational caches are not permanent evidence backups.

[Supabase's egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
states that optimization reduces future usage; already-served egress cannot be
reduced retroactively. No plan upgrade, spend-cap change, credential change,
schema change, export bypass, subscription, or quota increase is performed here.
No database data is changed or removed, and no evidence, learning-state, or
operational-cache size/count limit is added or increased.

## Live Acceptance Context

The preceding source-pinned `b1851187` 25-deep scan reached 91% core coverage,
24 core-ready / 1 core-starved, with one verified route at the decision cutoff
and no qualified pick. All 447 recovered claims retained verified provenance.
It still had 23 unresolved final-decision candidates and `DATA_DEGRADED` status.
That smaller run is not proof that the prior 500-deep capacity is repaired.
It also precedes this circuit repair and is not a live test of it.
