# Exact quote evidence repair

## Scope and root causes

Based on main d6d74406ce3f06ea9a090708b9f6b3a94245c13e. The separate
wallet recovery PR #45 is not included in this branch.

The legacy LI.FI recovery path accepted foreign-chain/token responses when
they contained the expected pool. The forward path could inherit a requested
chain when returned token metadata lacked chain proof. The two paths also
consumed separate request allowances. Missing fee observations became zero;
missing quote USD prices could be replaced by reference prices or a dollar peg.

Both paths now require exact returned same-chain token contracts, valid
decimals, and the requested atomic input amount. Contradictory action/estimate
amounts are rejected. Buy and sell proofs are independently checked. Dynamic
token metadata must explicitly attest its chain. Expected pool presence cannot
override identity failure.

## Provider cost and safety

Legacy and forward quote acquisition share the existing process-local keyless
allowance (default 70 requests per two-hour window). Both honor Retry-After or
the provider's explicit retry interval, expose retryAt, and suppress HTTP calls
during cooldown. Authenticated callers retain cooldowns scoped to a hashed key.
Injected transports receive timeout and abort signals. No new paid service,
transaction submission, automatic trading, safety exception, or forced pick
was introduced. The allowance is not a distributed cross-process rate limiter.

Missing or malformed gas/fee observations and unobserved USD amounts remain
null. Explicit empty fee lists can represent observed zero; absence cannot.
All-in execution costs require observed fee and gas data. A reference price
remains contextual metadata, not an observed execution value.

## Regression coverage

Thirteen new tests cover valid exact quotes, foreign/missing/conflicting
identity, wrong input amounts, independent sell proof, explicit action-chain
proof, shared allowance, Retry-After, injected HTTP 429, provider retry messages,
epoch-zero budgets, abort/timeout propagation, dynamic token metadata, unknown
fees, and unobserved USD values. Existing valid-quote fixtures now include the
complete identity returned by a legitimate provider.

Final validation: npm ci completed with zero vulnerabilities; typecheck passed;
36 focused tests passed; the complete isolated suite passed 1,370 tests with
zero failures/skips; syntax checks passed all 714 JavaScript files; 20 load
tests passed. Dependency installation and the final full test run were
sequential. An earlier overlapping installation/test attempt failed because
better-sqlite3 was temporarily removed; the clean final rerun passed.

## Live evidence and bounded scan

The saved read-only Base WETH quote probe returned HTTP 429. No execution-ready
route or qualifying candidate is claimed. It is deliberately not repeated
during provider cooldown.

A bounded scan of an earlier quote-repair snapshot completed scan:smoke and
results:health (61 report contracts passed): 60 standard candidates, 43 deep
evaluated, 17 deferred, 41 core-ready, 2 core-starved, 92% core coverage, 89%
advisory coverage, zero verified routes and zero qualified candidates. It used
58/200 recovery request units and reached its 90-second hydration deadline,
leaving 17 deadline skips. Recovered fields: DEPLOYER 83, SECURITY 110,
WALLETS 20. Unresolved: DEPLOYER 48, WALLETS 172. Execution readiness remained
DEGRADED. These are not full-universe production metrics and do not validate
the subsequent cost/metadata changes; final regressions and CI do that.

The live main workflow 38061677547 at d6d74406 was still scanning at the last
observation. Its eventual report must be inspected separately. Green tests,
core coverage, and zero picks alone do not establish complete evidence health
or a profitable edge. Persistent wallet readback and remaining acquisition
gaps remain separate audit work.
