# Base B20 lifecycle recovery validation

## Root cause

The completed local 500-deep scan from source 7cf498b0 reported 14 core-starved
candidates. All 14 were exact Base B20 token identities missing the existing
deployer/creator/deployerHistory/nativeLifecycle required-any group. Ordinary
explorer creation metadata did not recover this native-token evidence.

The manifest already accepts nativeLifecycle; no readiness contract, identity
requirement, selection gate, or safety threshold is changed by this repair.

## Recovery

Use the existing configured Base RPC resolver and public fallback policy. An
exact Base B20 address prefix only selects a recovery route; it is not proof.
Before promotion, require all of these read-only RPC observations:

- eth_chainId identifies Base (8453).
- eth_blockNumber provides a valid observation block.
- eth_getCode for the exact token at that block returns the native 0xef stub.
- eth_call to the exact B20 factory proves isB20Initialized for that token at
  the same block.

Each candidate reserves four provider-budget units before RPC begins. The
existing chain-scoped circuit breaker, time budget and candidate wave limits
apply. Exact fresh cached proof is reused without issuing provider requests.
Unknown initialization falls back to the existing explorer/creator routes;
errors and unmet budgets stay visible. Empty cache entries cannot crash recovery.

Native lifecycle observations retain chain, token address, factory address,
observation block, source, timestamp, confidence, verification status and recovery
provenance. Creator, deployer, creation block/time and creation transaction remain
null. Factory initialization is not issuer identity, historical reputation,
source verification or clean contract safety. The deployer reputation score is
unchanged when this evidence alone is added.

Primary source references:

- https://github.com/base/base-std/blob/main/src/interfaces/IB20Factory.sol
- https://github.com/base/base-std/blob/main/src/StdPrecompiles.sol
- https://github.com/base/base-std/blob/main/docs/architecture.md

## Live acquisition validation

Read-only mainnet Base RPC calls recovered exact native lifecycle proof for all
14 affected saved identities. Total provider budget consumed: 56 units. The
existing deployer contract's readiness changes from core-starved to ready for
each tested identity, without manufacturing creator aliases or VERIFIED_SAFE.
Observation blocks and complete provenance are retained in the local artifact
`/tmp/cli-b20-live-evidence-20261010.json`.

This is an acquisition plus single-contract readiness validation, not a new
500-candidate full scan. It does not establish zero production starvation, a
tradable edge, or an increase in final qualified candidates.

## Baseline and remaining gaps

The saved full scan evaluated 500 deep candidates and excluded 1,841 deferred
candidates from recovery/starvation denominators. Core coverage was 92%, advisory
coverage 91%, 486 core ready and 14 core starved (2.8%). Verified routes and fully
qualified candidates were both zero. Recovery attempted 495 candidates, used
517/2,000 provider-budget units and recovered DEPLOYER 1,977, SECURITY 2,243 and
WALLETS 468 field observations. Unresolved counts were DEPLOYER 328 and WALLETS
600; a missing-field count is not a count of missing candidates.

Wallet labels and historical performance still require actual observed evidence.
RPC initialization cannot fill those fields. Live execution quotes remain
provider-dependent; the observed LI.FI free-provider rate rejection cannot be
replaced with a synthetic executable quote. UNKNOWN remains UNKNOWN, zero picks
remain allowed, and the no-starvation objective is not declared complete here.

## Regression checks

Eight new tests cover exact identity and chain applicability, pinned-block RPC
proof, unknown/uninitialized/malformed responses, cold-cache behavior, promotion
provenance, unchanged reputation/safety, foreign response identity rejection,
zero-cost cached reuse and four-unit request-budget enforcement. The promotion
test also exercises the existing manifest's nativeLifecycle alternative through
the actual readiness engine.

All 1,357 tests passed after the final changes, with zero failures or skips.
Syntax checks passed for 713 JavaScript files, typecheck passed, and the 20
discovery/load tests passed. The separate bounded scanner smoke validation is
recorded in the pull request when its report and health checks complete.
