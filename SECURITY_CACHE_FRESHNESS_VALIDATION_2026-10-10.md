# Security Cache Freshness

The cache previously accepted malformed and future cache timestamps because
arithmetic comparisons against NaN or negative ages did not reject them.
Invalid lifetimes could also make evidence effectively immortal. A JSON null
cache root crashed lookup instead of leaving evidence unknown.

Require a finite positive numeric cache timestamp no later than now, a finite
positive numeric lifetime, and a well-formed object record. Require a valid
provider observation timestamp within that same lifetime. A recent cache write
must not refresh an old or unproven observation. Reject malformed root/record
types without aborting candidate recovery. Default six-hour lifetime is unchanged.
Reads do not rewrite timestamps, confidence, identity, UNKNOWN status or bytes.

Five isolated regressions cover malformed/future timestamps, expiry boundaries,
invalid lifetimes, unchanged UNKNOWN evidence and exact cache identity, stale
provider observations with fresh cache writes, and malformed cache structures.
The initial regression run reproduced three failures on the old reader.
The final focused security/lifecycle/cooldown suite passed all 40 tests.
The final full suite passed 1380 tests; 20 load tests passed. Typecheck and diff
checks passed. Canonical lint checked 716 files; the changed data module and
new test were separately syntax-checked while PR52 remains unmerged.

Production-cache replay from completed run 38069766550 inspected 456 entries.
All have valid source observation timestamps. At the replay time immediately
after the latest original cache write, both old and repaired readers retained
456 fresh observations; zero values changed, file bytes stayed identical, and
zero provider requests were made. This is a deterministic replay, not a new
live scan or a coverage/financial-edge improvement claim.

Existing provider budgets, circuits, safety, identity and qualification gates
are unchanged. Rejected stale/malformed cache entries remain unavailable until
their normal bounded provider recovery succeeds; no positive evidence is inferred.

## Remaining Audit Work

The 3,652,776-byte production cache is read and parsed in full on every lookup.
A separate invalidation-safe read-cache optimization needs mutation-isolation,
file replacement/deletion, and cache-write tests before it can be trusted.
Qualification proof preservation already exists in open PR42; do not duplicate
that repair. Production still has real creator and wallet evidence gaps, and
no fully qualified candidate or demonstrated profitable edge.

## Live Smoke Validation

`npm run scan:smoke` completed, including engine audit, readiness refresh and
scanner smoke. Subsequent `results:health`, `system:readiness:refresh` (TEST class)
and `smoke:scanner` passed. An initial health check correctly rejected the
incomplete local generated report set before this scan rebuilt it.

The small live universe had 57 standard candidates, 41 deep evaluated and
16 deferred. Core coverage was 92%, advisory coverage 89%, core ready 40,
core starved one (2.44%), verified routes zero and qualified candidates zero.
Hydration attempted 41 candidates, used 89/2000 provider units, selected
22/41/0 across its three waves, and had no deadline skips. Recovered fields:
DEPLOYER 85, SECURITY 123, WALLETS 21. Remaining fields: DEPLOYER 46, WALLETS 164.
The remaining core creator/deployer gap was a BSC candidate. The healthy-core
outcome was NO_EDGE_FOUND. This smoke universe does not replace the required
500-candidate production validation and is not a controlled before/after study.
