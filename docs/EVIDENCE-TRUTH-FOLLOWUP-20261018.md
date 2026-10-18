# Evidence Truth Follow-up

## Baseline, Not A Trading Claim

The source-pinned baseline is `5e493257948d856f81a845799c98cf42c0ea07bd`,
scan `scan_1792336404190`, cutoff `2026-10-18T15:17:23.109Z`.
It evaluated 126 deep candidates, deferred 1,291, measured 92% core and 90%
advisory coverage, found zero core-starved rows, and verified four routes at
the cutoff. No candidate qualified. All four quotes expired before report
generation. Operational decision health remained `DATA_DEGRADED`.

Independent qualification failures were real: utility remained unknown or weak,
opportunity scores were below the existing threshold, AGENT's stable exit
liquidity was below the scalp minimum, and the SOL-labeled candidate had high
recorded risk. Correcting false metadata must not turn these into good picks.

## Proven Follow-up Defects

- A duplicate-ignore upload acknowledgement could report remote evidence as
  synced despite a conflicting concurrent insert or no persisted row. Offline
  regressions reproduced both false-success cases before the repair.
- Provider quota could be reserved before the executor rejected a request
  without HTTP dispatch. Explicit admission proof must distinguish this from
  real HTTP failures, rate limits and timeouts, which remain charged.
- Discovery labels such as `token-profile` could override a recovered venue.
  A venue upgrade requires exact current paired token/pool evidence, not an
  arbitrary nested venue name or stale/foreign proof.
- A same-chain SOL ticker could acquire native benchmark identity without
  proving its mint. Tickers and stale cached labels are not native-asset proof.
- Guarded scores and states could be published alongside unlabeled reasons
  from an earlier scoring pass. Current decisions need current explanations;
  original canonical diagnostics must remain visible with their provenance.
- Large-row compaction dropped rejection-driving scalar fields and venue
  labels. Essential decision facts must survive bounded serialization so a
  report does not tell a different story from its fuller input.
- Bare selection labels or unknown-derived low scores could discharge missing
  proof and falsely report healthy no-edge evidence. Selection denial remains
  fail-closed, but evidence health needs typed conclusive negative facts or
  complete decision proof; blocker prose is not a measured safety observation.

## Persistence And Cost Boundaries

The local forward ledgers contained 5,430 unique records during the audit:
3,549 production observations, 18 market-context observations and 1,863
prospective cohorts. There were no duplicate or conflicting keys. This local
check does not attest the restricted remote database.

The pending cumulative repair already reuses local bodies when remote hashes
agree. Upload verification adds only exact ID/hash reads for new upload batches:
at most 50 IDs and a 6,000-byte encoded request per metadata query, with the
existing 500-record upload batch retained. Lower API row caps are paged through
the strictly shrinking unverified set. A failed check stops later uploads and
cannot report `SYNCED`; local immutable records are retained.

Supabase currently reports `exceed_egress_quota` to scheduled main jobs. Code
must not hide that failure, treat an Actions cache as the durable system of
record, silently discard history, or change billing/spend caps. No database
schema, grants, RLS, secrets or billing settings are changed by these repairs.

Supabase documents that upserts return no rows by default and that duplicate
handling depends on `ignoreDuplicates`: [official upsert reference](https://supabase.com/docs/reference/javascript/upsert).
The verification uses the existing SDK and is exercised through its actual
request encoding with an injected offline transport.

## Next Evidence Experiments

1. Measure paired-route survival from observation to the final decision, including
   original expiry and frozen execution cost. Improve avoidable latency before
   increasing request allowances; never extend TTLs to manufacture readiness.
2. In the existing prospective shadow loop, compare value-of-information routing
   with a utility/identity/safety-complete research cohort. Freeze treatment and
   matched controls before outcomes; do not alter final selection thresholds.
3. Investigate capital arrival versus seller replenishment only from exact-pool
   trade evidence and independently timestamped balances. Transfers alone are
   not buys, smart-wallet labels or positive net flow.

Use the existing multi-horizon outcome collection and evidence-health governor.
Missing observations remain unknown, not losses or zero costs. These are research
experiments, not established edges or permission to enable trading or promotion.
