# Final Evidence Evaluation Cost And Recovery Diagnostics

## Scope

This focused follow-up starts from reviewed security-transport head
`4c65bf0c0f3a57eb9f67ff3648cbf70ec90fb704` (PR #69), whose main ancestor is
`c2884004f8fdc14083f94fb38796f6ba272c4318`. It preserves those commits. The
feature branch also normally merges PR #68 for combined validation; neither
dependency's published commits are rewritten. Neither an offline replay nor green
code CI establishes live acquisition health or a profitable trading edge.

## Repairs

- `canonicalAliasResolver.js` bounds caches of immutable path splitting and
  string normalization to 4,096 strings of at most 1,024 characters per cache.
  Property values, getters, provenance and source timestamps are read anew.
  Alias indexes and public vocabulary arrays are not cached.
- `venueVocabularyRegistry.js` retains the frozen registry's entry order and
  live alias arrays. It caches only string normalization, at most 1,024 strings
  of at most 256 characters. Unknown venues, coercion and first-match collisions
  retain their previous behavior; no venue match or execution decision is cached.
- `dataStarvationRootCauseEngine.js` attributes scoped rate-limit/cooldown,
  phase request-budget and deadline outcomes to the existing
  `PROVIDER_RATE_LIMITED`, `PROVIDER_BUDGET_EXHAUSTED` and `ENRICHMENT_DEFERRED`
  vocabulary. They no longer fall through to a generic unknown response.
  Missing evidence still remains missing. Existing precedence, exact field
  scopes, core/advisory rules and deferred denominators remain unchanged.

A discarded alias-index prototype failed adversarial accessor-mutation tests.
Its cache was removed, not patched with further evidence-dependent caching.
Sparse deletion and accessor regressions remain as protection against its
reintroduction. That prototype was never published or used for a live scan.

## Why Timing Matters

The saved main scan at `c2884004` evaluated 500 candidates and deferred 3,500.
Its two short-lived quote pairs expired about 31.5 seconds before the final
cutoff. Existing code already acquires late quotes; it then performs seven
dependent rerank stages and the final readiness/root-cause audits. Deleting
audits, increasing quote TTLs, backdating the cutoff or promoting retained
positive flags would not repair that problem.

Repeated path and venue string transformations are measurable CPU work in that
path. Reducing them is a bounded improvement, not proof that every quote now
survives publication. Further source-pinned live acceptance remains required.

## Replay Contract

The local operator replay uses the preserved main report and candidate-input
projections, joined by exact project, chain, token, pool, symbol and name.
It retains all 500 deep candidates and all 3,500 deferred candidates, running
the actual staged wrappers and nine engine bodies from pinned source. Only
the resolver and venue modules are overlaid for the performance comparison;
the deliberate diagnostic vocabulary change is tested separately.

The report projections are not the original production heap. Providers,
filesystem access and persistence are denied inside the application sandbox.
Actual clocks continue to advance. Equivalence excludes only new wrapper
diagnostic receipts/durations, new `firstMissingAt` receipts and changed
numeric quote-age counters individually bounded by actual elapsed time.
Quote issue/expiry timestamps, freshness flags, scores, evidence, identities,
rankings and gate decisions must remain equal. Every expired historical route
must remain non-live. Deferred rows retain their original identity and position.

The first full comparison correctly stopped on a quote-age counter that had
advanced between runs. Its timing is not accepted as an equivalent replay.
The earlier 6.4% direct-audit prototype result is not a result for this final
string-only implementation.

Three alternating paired rounds passed full normalized output equivalence:

| Round | Baseline Seconds | Repaired Seconds |
| --- | ---: | ---: |
| 1 | 34.863 | 33.746 |
| 2 | 45.613 | 35.296 |
| 3 | 43.471 | 44.370 |
| Median | 43.471 | 35.296 |

The median saving is 8.175 seconds (18.8%), but the third pair regressed by
0.899 seconds. Shared-host/JIT/GC variability is substantial. This single local
projection replay does not establish a reliable production latency saving or
rescue main's expired quote pairs. All three rounds produced normalized output
SHA-256 `b0285f767802ec08146a9e1b4afab04814fb61d4a900c0cdf9c74660a9d5090d`.
Only two changed age counters per round needed elapsed-time normalization:
`candidateProofState.globalRoute.quoteAgeSeconds` on the two historical quoted
projects. No source quote timestamp, expiration, freshness flag or gate was
masked. Input hashes stayed unchanged; no application IO or failure-report
writes occurred. Source hashes for all 77 evaluated module variants and exact
pipeline source sections remain in the local replay receipt.

## Focused Validation At fe464966

- Node 24.22.0; clean `npm ci`: 132 packages installed, 133 audited, zero
  vulnerabilities. Existing native dependency install-script warnings were
  retained; native SQLite behavior was exercised by the canonical tests.
- Focused aliases, identity, vocabulary and recovery-diagnostic checks:
  114 passed, one opt-in timing benchmark skipped.
- Final canonical `npm test`: 3,024 passed, zero failed, one opt-in timing
  benchmark skipped (3,025 total). The earlier prototype suite is not used as
  final acceptance; the complete suite ran again after removing its index cache.
- `npm run typecheck` and `npm run lint`: passed; 1,036 JavaScript files checked.
- `npm run test:load`: 21 passed, including 500 deep / 3,500 deferred fixtures,
  unchanged provider budgets, Wave3 selection and zero forced picks.
- `npm run scan:smoke`: passed the real offline full-pipeline, report-contract,
  semantic-health, audit, readiness and manifest checks. TEST fixtures are not
  live-publishable and cannot establish acquisition health.
- The canonical wrapper restored its original data/report state. Independent
  verification confirmed all 1,183 source and 20 runtime file hashes before
  this documentation-only validation update. No application code changed after
  the final suite or replay.

The one-time local replay operator is `../cli-postquote-wrapper-cost-20261022.mjs`;
its SHA-256 is `cef607140413066e18eac1f189bd15cc520613a660bbd640972fa7e3f51d446b`.
The three-round result is `../cli-postquote-wrapper-cost-full-v3-20261022.ndjson`,
SHA-256 `2e93e9ba6548fd54fd5ef0c826f0dfc7bd6e1a81b2d7cabad87bf30afdef29c5`.
`../cli-postquote-wrapper-cost-preservation-20261022.json` verifies the original
report files and both proposed module hashes after the replay. These are
retained local operator artifacts, not an independent backup or a newly
installed scanner command.

## Combined Validation

Feature merge `e6779e0019497b9d44bc47e9341177a1a7930b00` adds PR #68 at its
unchanged `61fc106815910bccb8a7ba3a6a5153705933d245` head. This allows the
measured-wallet, semantic-ignore, recovery-diagnostic and transport repairs
to be tested together before landing. The focused results above remain
historical evidence for `fe464966`, not acceptance of this newly combined tree.
The combined resolver/venue metadata overlay was replayed against the same
pinned `4c65bf0c` wrappers and bodies, with the same 500 deep / 3,500 deferred
projection fixture and exclusions. Deliberate wallet and diagnostic behavior
changes remain outside this isolated performance comparison.

| Combined Round | Baseline Seconds | Combined Metadata Seconds |
| --- | ---: | ---: |
| 1 | 36.716 | 26.716 |
| 2 | 36.025 | 25.739 |
| 3 | 35.583 | 25.307 |
| Median | 36.025 | 25.739 |

All pairs improved; the median saving is 10.286 seconds (28.6%). All three
normalized output hashes equal the value above, with only the same two bounded
age-counter differences per pair. Deferred identities and original inputs
remain intact; application IO and expired-route promotions remain zero.
This is not a reconstruction of the full production heap or a live proof of
quote survival. The earlier 18.8% result is a separate local comparison and
must not be added to this saving.

Combined focused validation passed 177 tests, with one opt-in timing benchmark
skipped. The complete combined canonical suite at `e6779e0` passed 3,087 tests,
with zero failures and one opt-in timing benchmark skipped. Independent source
and runtime preservation checks passed for 1,188 source and 20 runtime files.
Main is unchanged; these results are not live acquisition acceptance.

## Newest Local Holder Evidence

Follow-up `c9371ec094a12c34cad6edf31dbe62525c1e12f7` repairs a separate acquisition
defect: the first eligible security holder sample could be stale under the
downstream field policy even when a newer valid sample was already present.
EVM GoPlus and Solana RugCheck now choose the newest eligible sample in a
linear scan, keeping first-input precedence for equal observation times.
Solana ordering uses the validated inner holder report's timestamp, not its
wrapper receipt. No snapshots are combined or input records mutated.

All existing identity, confidence, positive-balance, participant, original
timestamp and freshness checks remain. Empty, unknown, malformed, future and
foreign samples cannot replace eligible evidence. Results remain sampled
holders/owners, not complete holder coverage, buyers or smart-wallet labels.
All adverse security observations remain available to safety gates.

Six ordering failures were reproduced before the fix. Afterward 73 targeted
tests passed, including 41 new cases. The mocked raw WALLETS route changed from
two provider calls to zero, with zero request units and the original deadline
unchanged; adverse honeypot evidence was retained. This is deterministic cost
evidence, not a measured production savings claim.

Final complete validation including this follow-up passed 3,128 tests, with
zero failures and one opt-in timing benchmark skipped (3,129 total). Typecheck,
syntax checks across 1,042 JavaScript files, all 21 load tests and the offline
full-pipeline scanner smoke passed. The dependency lockfiles remain identical
to the audited `4c65bf0c` security-transport base. Independent verification
preserved 1,189 source and 20 original runtime file hashes before this final
documentation-only update. A separate static review found no new issue in the
holder selection change; it did not substitute for the executed tests.

The combined metadata replay and its post-run input/source verification remain
at `../cli-postquote-wrapper-cost-integrated-v4-20261022.ndjson` (SHA-256
`aeb2f0ec0974536c50fb852d71b5eaedd91d069fd3a7805a547271f1c3fa3361`)
and `../cli-postquote-wrapper-cost-integrated-preservation-20261022.json`.
The holder selector is not part of that isolated timing claim. Live acquisition,
production quote survival, remote restoration and a profitable edge remain
unverified; no safety or trading gate is relaxed.

## Safety And Remaining Acceptance

No provider allowance, wave limit, concurrency limit, timeout, quote lifetime,
identity/pool rule, safety/liquidity requirement or statistical gate changes.
No observations, smart-wallet labels, creator history or picks are fabricated.
Trading and automatic strategy promotion remain disabled.

The earlier isolated 25-deep real-provider diagnostic at `4c65bf0c` had 92%
average core coverage, zero core-starved candidates, two routes verified at its
cutoff and zero qualified picks. It still had 22 unresolved final decisions and
correctly reported `DATA_DEGRADED`. Its small universe, missing production
credentials/history and bounded early security cache priming prevent a causal
comparison with main's 500-candidate scan.

Production-scale acquisition, current tradability, independent backup, remote
restoration and sustained outcome-collection acceptance are not established by
this patch. A research edge still requires the original frozen treatment/control
comparisons, missingness and cost coverage, checkpoints, replication, uncertainty
bounds, safety and integrity checks. Faster scanning alone supplies none of them.
