# Wallet novelty evidence truth

## Reproduced bug

A wallet with sample size 20 and hit rate 60, but no risk or funding-cluster
evidence, was counted as qualified. Its address substituted for a measured
funding cluster, producing 100% independence and 100% coverage. An unrelated
accumulation score increased its novelty score. Missing lead time was reported
as null even while coverage claimed all fields were measured.

## Repair

Qualification now requires observed sample size, hit rate, rug exposure and a
nonempty measured funding-cluster label. Missing risk cannot mean zero risk;
different addresses cannot mean unrelated funding clusters. No qualified
wallet means null novelty score and null independence, even when other project
scores are positive. Coverage is counted from validated raw fields for every
wallet, and explicit zero observations remain measured. Negative/out-of-range
percentages, fractional sample counts and boolean cluster labels are missing.

On base d6d74406: four new regressions plus existing semantics/asymmetry tests
passed (17 tests); the full isolated suite passed 1,361 tests with zero failures
or skips; syntax checks passed 714 JavaScript files; typecheck passed. Any
subsequent base update requires a fresh validation run before publishing.

## New production acquisition evidence

Main run 38061677547 at d6d74406 finished with failed readiness/semantic checks;
scanner, report contracts, evidence sync and deployment succeeded. Its saved
artifact has 3,660 standard / 500 deep / 3,160 deferred / 288 core-ready / 212
core-starved (42.4%), 91% core / 89% advisory coverage, 4 verified routes and
zero qualified candidates. Average coverage alone cannot represent health.

Hydration attempted 480 candidates, selected 150 wave-2 candidates, consumed
327/2,000 units, reached its 23-minute time limit, and skipped 774 calls.
Recovered DEPLOYER 996 / SECURITY 1,132 / WALLETS 229; unresolved MARKET 28 /
WALLETS 600 / DEPLOYER 710. Main top missing creator/deployer fields occur in
221 candidates; wallet history remains advisory but visible.

Further root-cause work must inspect GoPlus cooldown queue occupancy and
fallback scheduling: waiting for one provider must not prevent available
independent providers from hydrating the rest of the universe. Do not repair
this by hiding failed health checks, lowering gates, or fabricating outcomes.
This acquisition issue is not fixed by the novelty repair. PR #45 wallet
recovery remains separately published and awaits its own approval. PR #46
exact quote evidence was approved and merged at ee15e06af300df05ab14cd210f6683d20821bc6a.
