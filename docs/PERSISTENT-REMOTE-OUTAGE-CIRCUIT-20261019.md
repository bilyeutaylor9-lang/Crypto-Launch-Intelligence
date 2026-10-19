# Persistent Remote Evidence Outage Circuit

## Confirmed Failure

An original GitHub artifact from run 39296507353 contains the platform error:
`Service for this project is restricted due to the following violations:
exceed_egress_quota.` The complete original artifact remains preserved locally.
The former command reported the failure but did not retain a cross-run circuit.
Legacy scan-memory bootstrap also retried its history reads on subsequent runs.

Storing an incident only in the scanner-state bundle was insufficient: that
bundle can fail to pack, and some workflows pack it before the later sync can
discover an outage. No archive, ledger, or learning-state limit is increased.

## Behavior

- A bounded, endpoint-scoped operational file is separate from learned evidence:
  `data/remote-operational-circuits.json` (16 KiB / 64 incident maximum).
- Exact structured quota codes and the captured platform restriction envelope
  are recognized. Generic 403/auth/network failures do not establish this outage.
- The forward-evidence SDK command and legacy REST history bootstrap share the
  circuit. Scanner and operator CLI entrypoints supply their workspace root.
  Library consumers must explicitly supply a root to persist operational state.
- A known incident skips later remote restore/sync/history work without deleting
  or acknowledging local observations. An unconfirmed quota hint still stops
  within-request credential retries without becoming a persisted declaration.
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
another endpoint cannot clear the original endpoint's incident.

A successful result is `INDEXED_SERVICE_ADMISSION_ONLY`: it explicitly does not
claim archive restoration or remote synchronization acknowledgment. Actual
restore/sync and ID/hash acknowledgment must still succeed afterward.

Known restore outages allow existing local collection to continue. Sync outages
remain unsuccessful operational results. Invalid/conflicting evidence is not
made healthy, ignored, deleted, or rehashed. Report paths respect the selected
workspace root. No statistical, identity, safety, liquidity, execution or quote
freshness requirement changes.

## Remaining Limits

This code is verified with temporary fixtures and mocked clients. Real Supabase
service recovery, the organization's actual billing-cycle reset date, independent
server backup, and full local coordinator/archive migration remain unverified or
unfinished. GitHub operational caches are not permanent evidence backups.

[Supabase's egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
states that optimization reduces future usage; already-served egress cannot be
reduced retroactively. No plan upgrade, spend-cap change, credential change,
schema change, export bypass, subscription, or quota increase is performed here.

## Live Acceptance Context

The preceding source-pinned `b1851187` 25-deep scan reached 91% core coverage,
24 core-ready / 1 core-starved, with one verified route at the decision cutoff
and no qualified pick. All 447 recovered claims retained verified provenance.
It still had 23 unresolved final-decision candidates and `DATA_DEGRADED` status.
That smaller run is not proof that the prior 500-deep capacity is repaired.
It also precedes this circuit repair and is not a live test of it.
