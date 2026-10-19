# Execution Request Reserve And Receipt Retention

## Measured Failure

The completed source-pinned live scan `scan_1792438897389` at
`c3adc485839d9bf6651cb3ed119740f70838221c` evaluated 500 candidates.
It reported 90% core coverage, but 270 candidates remained core-starved,
with zero verified routes and zero qualified candidates. Readiness and
scanner smoke failed with `DATA_DEGRADED`; this is not production acceptance.

Raw recovery spent all 2,000 shared request units before the final quote
stage. The existing time reservation did not reserve request capacity.
Zero quote HTTP requests were dispatched. No higher provider allowance is
needed to reproduce or repair this allocation defect.

The serialized report also lost four reported recovered fields/provenance
entries on one exact Base identity: `nativeLifecycle`, `wallets`,
`walletTransactions`, and `walletParticipationHistory`. Bounded projections
could prioritize verbose derived fields ahead of these observed receipts.
Old report bytes remain unchanged; the repair does not reconstruct them.

## Repair

- Raw acquisition receives a cumulative request ceiling below the unchanged
  absolute allowance, leaving selected final Wave 3 proof work capacity.
- The default request reserve is `min(200, wave3Max * 4)`, never above one
  quarter of the remaining shared allowance. An explicit
  `ACTIVE_EVIDENCE_EXECUTION_RESERVE_REQUESTS` can reduce it to zero.
- Both pre-dispatch and post-limiter admission checks enforce the phase cap.
  Deferred work does not spend a request or open a provider circuit.
- The resumed quote stage uses the same request counter, absolute deadline,
  cooldowns and circuit state. Nothing resets or expands provider quota.
- Phase-skipped counts, reserved request units and the raw cumulative cap
  remain visible in the recovery summary.
- Both report projections prioritize observed recovery receipts after the
  finite decision/identity/risk scalar projection, before verbose derived
  fields. Native/wallet provenance entries receive corresponding priority.
- Existing payload, depth, node, array and string limits remain intact.
  An oversized receipt cannot displace a negative decision scalar.

## Regression Scope

Focused fixtures exercise concurrent raw collectors, paired quote dispatch
using the remaining allowance, queued limiter races, disabled/zero reserves,
tighter caller caps, expired deadlines, malformed limits, two-pass native
receipt retention and oversized samples alongside negative final flags.
They use mocked providers and temporary outputs, not live observations.

## Still Required

Passing deterministic checks does not establish healthy live acquisition,
current tradability or a profitable edge. Rerun source-pinned acceptance in
the declared 25/100/500 ladder, stopping escalation on an invariant failure.
Keep missing evidence UNKNOWN and all original safety, identity, quote TTL,
execution and frozen statistical gates unchanged. Independent server backup,
durable collection migration and Supabase service recovery remain separate
unfinished requirements.
