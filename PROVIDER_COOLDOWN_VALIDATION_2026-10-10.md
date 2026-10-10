# Provider cooldown fallback repair

## Production evidence

Main scan 38061677547 (d6d74406) finished with 500 deep evaluated, 212
core-starved (42.4%), 91% core coverage, 89% advisory coverage, four verified
routes and zero qualified candidates. Hydration used 327/2,000 request units
but exhausted its 23-minute deadline and skipped 774 calls. Its readiness and
semantic-health failures were real; scanner, report contracts and deployment
completed. Top creator/deployer gaps affected 221 candidates.

The shared GoPlus limiter queued callers through a 61-second rate cooldown.
Active recovery waited for that slot before trying independent explorer
fallbacks, consuming its bounded candidate workers and global time window.
A deterministic three-caller diagnostic spent 65,200 simulated milliseconds
waiting before fallback. This diagnostic is not live provider evidence.

## Repair

The existing limiter now supports waitForCooldown=false. Active creator
recovery reports PROVIDER_COOLDOWN without HTTP or quota consumption and
continues to Sourcify/Blockscout/Etherscan paths already present. Retry time is
visible. Normal pacing, shared quota, deadlines and circuits remain enforced.

Security recovery preserves the independent providers in its combined
collector. Only the GoPlus observation becomes UNKNOWN during cooldown;
valid cached GoPlus proof can still be reused. No absence is made safe or
positive, and no new API, paid service, identity exception or forced pick was
introduced. Other callers retain the original waiting behavior by default.

## Verification

Five new regressions cover nonblocking cooldown and subsequent pacing, exact
creator fallback within a short deadline and one-unit budget, deadline
precedence, preservation of independent security proof, and the active
security executor's combined-collector wiring. Focused recovery and security
suite: 76 passed. Final full suite: 1,375 passed with zero failures/skips;
typecheck passed and 20 load tests passed. Final syntax audit passed all 715
JavaScript files. The whole-engine audit passed across 205 engine files with
zero runtime failures, missing outputs, dependency gaps or miswired engines.

A deterministic 500-candidate creator-recovery component diagnostic recovered
500 exact fixture identities with 500 independent-provider units, zero
cooldown sleeps and no exhausted deadline, in approximately 487 ms. These are
injected fixture providers, not 500 live discoveries or financial proof.

## Bounded live smoke result

The corrected isolated scan:smoke passed, as did results:health (61 report
contracts). It produced 59 standard / 43 deep / 16 deferred / 42 core-ready /
one core-starved candidate, 92% core coverage, 89% advisory coverage, one
verified route, zero qualified candidates and NO_EDGE_FOUND. Hydration
attempted 43 candidates, used 92/200 units, and had no deadline exhaustion or
skipped calls. Recovered DEPLOYER 89 / SECURITY 119 / WALLETS 21; unresolved
DEPLOYER 48 / WALLETS 172. Limits were 90 seconds and 200 request units.

The remaining core gap was the exact BSC VERTEX contract
0x167315be60caafde69183d35b3f1501ea5677777: creator metadata was unavailable
from explorer fallbacks, GoPlus was rate-limited, and no Etherscan key was
configured. It stays unknown and blocked. Advisory wallet-history gaps remain
visible, not positive alpha. This small live sample is not a controlled
before/after comparison or proof of restored 500-candidate production health.

Two initial smoke setup attempts failed because a copy filter excluded
src/data; the filter was corrected before the successful isolated run. No
scanner source change was required for that setup error.

## Remaining verification

A fresh full production artifact after landing is required to measure actual
core/advisory coverage, starvation, provider cost and unresolved fields. The
active main scan 38067094420 is based on 4c599ac3 and does not contain this
repair. Do not interpret passing regressions as restored live provider
availability. Wallet persistence/history, the separately published wallet
recovery PR #45, and genuine unavailable creator/security proof remain visible
follow-up work. Unknown evidence cannot be fabricated to reach coverage goals.
