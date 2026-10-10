# Evidence Recovery Integration Validation

## Scope

The cumulative integration branch preserves the published commits from repair
PRs 42, 45, 47, 49, 50, 51, 52, 53 and 54 through normal merge commits. It is
based on production main `994dcd64e95e0ffe4cfd264699eadaf73f6061ab`.
Local integration is not evidence of deployment or a profitable trading edge.

## Root Causes Addressed

- Qualification diagnostics read compacted reports instead of the full proof
  state. Full-scan diagnostics must be generated before report compaction.
- Raw wallet fallback and persistent participation history were not integrated.
  Exact RPC transfers now persist and replay without inventing timestamps,
  daily buyers, trade directions, USD amounts or smart-wallet labels.
- Wallet novelty and quality scores treated unknown evidence as support.
- Provider security cache state did not survive workflow restoration.
- Concurrent evidence workflows could cancel full scans or shared-state work.
- Security cache freshness accepted malformed or future times and could refresh
  old provider observations merely by rewriting the cache.
- Canonical syntax validation skipped source files under data/report directories.
- Recovery artifacts omitted failed attempts. Watchlist counters also allowed
  deferred candidates and deduplicated unrelated contracts by symbol.

## Integration Checks

The first complete combined suite passed 1,426 tests with no failures or skips.
After the reporting correction the refreshed full suite passed 1,428 tests,
again with no failures or skips. Canonical syntax validation passed all 888
JavaScript files. Dependency installation reported zero vulnerabilities.
The combined wallet/history suite passed 35 tests; the recovery suite passed 54;
the cache/state/security suite passed 39.

The RPC-to-history regression exercises the actual executor and connector with
injected transport: six provider request units on the initial fallback, zero on
the historical replay, pinned block identity and unchanged raw observations.
It does not establish live smart-wallet performance or independent buyers.

The security-cache optimization was replayed against the 3,652,776-byte cache
from completed production run 38069766550. Twenty identical lookups returned
identical observations. File reads fell from 20 to one, bytes read from
73,055,520 to 3,652,776, and local elapsed time from 535.76 to 57.97 milliseconds.
Neither replay made provider requests. Timing is a local measurement, not a CI
or production latency guarantee. TTL checks still run on every lookup; returned
proofs are mutation-isolated and file changes invalidate the parsed snapshot.

## Production Baseline

Completed production run 38069766550 used main, not this integration branch:

| Metric | Observed |
| --- | ---: |
| Standard candidates | 3,669 |
| Deep evaluated | 500 |
| Deferred before deep | 3,169 |
| Core evidence coverage | 92% |
| Advisory evidence coverage | 88% |
| Core ready | 428 |
| Core partial | 0 |
| Core starved | 72 (14.4%) |
| Verified execution routes | 5 |
| Fully qualified | 0 |
| Recovery candidates attempted | 480 |
| Provider request units | 1,207 / 2,000 |

The healthy-core result was `NO_EDGE_FOUND`, not a forced pick. The 72 remaining
creator/deployer gaps comprised 56 BSC, nine Arbitrum and seven Base candidates.
These are actual external evidence limitations, not permission to infer a
creator from unrelated senders. The earlier recovery artifact omitted 86 failed
attempts; their missing records cannot be retrospectively reconstructed.

## Combined-Branch Live Smoke

Live scan `scan_1791656849309` completed on the combined working tree with 56
standard candidates, 39 deep evaluated and 17 deferred. Core coverage was 92%,
advisory coverage 89%, with 38 core-ready and one genuinely core-starved candidate
(2.56%). No route or final candidate was verified. This smaller, different live
universe is not a controlled before/after comparison with production's 500.

All 39 recovery attempts were published: 18 partially successful and 21 with no
recovery. Provider cost was 85 units out of a 2,000-unit budget, with no deadline
skips. Recovered fields by family were DEPLOYER 69, SECURITY 99 and WALLETS 38;
unresolved fields were DEPLOYER 38 and WALLETS 156. Qualification diagnostics
used `FULL_SCAN`, not the compacted report, for the same scan identity.

The remaining starved candidate lacked provable BSC creator evidence during a
provider circuit outage. Scanner semantic health was `NO_EDGE_FOUND`, but the
separate system-readiness gate correctly remained `DEGRADED`: all 35 execution
recovery attempts failed or were unavailable, with zero quote sources available.
Report-contract validation, scanner smoke and whole-engine runtime audits
passed. A green command exit does not turn this external execution gap into PASS.

## Remaining Validation

- Complete full-pipeline deterministic validation at the deep-universe limit;
  the existing injected 500-candidate history check is component-level only.
- Continue investigating the network-disabled 500-candidate sparse replay's
  expensive default readiness alias audit. Smaller smoke results do not prove
  full-universe throughput or complete execution-provider health.
- Obtain green GitHub checks and exact-head landing approval for the cumulative
  PR; do not claim the integration is deployed before observing its merge.

Safety, exact identity, liquidity, execution and contract verification gates
remain unchanged. Unknown evidence remains unknown. Historical participation is
not fresh daily activity, and evidence coverage is not evidence of profitability.
