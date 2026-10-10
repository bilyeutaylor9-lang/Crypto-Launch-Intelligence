# Creator recovery validation

Production run 38023660203 evaluated 500 deep candidates. Core coverage was 91%,
but 122 candidates (24.4%) lacked the deployer/creator/lifecycle required-any
group, so semantic health correctly returned DATA_DEGRADED.

## Confirmed acquisition defects

- Creator recovery tried Sourcify and Blockscout before cheap GoPlus evidence.
  An affected BSC contract had an exact creator record in GoPlus during the audit.
- Connectors converted HTTP failures to UNKNOWN. The recovery executor counted
  these as successful acquisitions, so provider circuit breakers did not open.
- Per-candidate field caps used value of information alone and could omit core
  evidence in favor of advisory fields.
- Cached Sourcify/Etherscan creator records were not reused (fixed earlier in
  this branch). Reused records must carry matching chain and contract identity.

## Repair

Use GoPlus first in the standard creator recovery path. Preserve explicitly
injected provider behavior. Mark transport failures so the existing chain-scoped
circuit breakers can act on them. A valid 404 lookup stays a healthy negative
response. Prioritize core fields within each candidate's recovery cap. Charge
the default Blockscout path for its two HTTP requests.
GoPlus normalization requires the exact returned contract key; another token's
record cannot provide creator or safety evidence for the requested contract.
Old GoPlus cache records without that response-identity proof are refreshed.
Creator and security recovery share the same exact record, and missing raw
safety flags cannot produce clean negative safety observations.

GoPlus's documented free quota is 30 requests/minute. All default creator and
security callers share 2.1-second pacing and a 61-second cooldown after rate
rejection. Queue waits occur before HTTP recovery timeouts and recheck the shared
request budget. Rate rejection remains UNKNOWN and does not permanently open a
provider circuit. The recovery-stage deadline is 25 minutes to fit paced calls;
final gates are unchanged. Scheduled and manual workflows pass GOPLUS_API_KEY
and GOPLUS_REQUEST_INTERVAL_MS (default 2100) through to the existing connector.
See https://docs.gopluslabs.io/reference/support.

Missing creator evidence stays unknown. These changes do not alter final
selection gates or convert a creator address into a favorable reputation.

## Live evidence

A bounded check against the saved production snapshot identified 99 unambiguous
candidate records by name, symbol, and chain, then queried providers using each
record's exact chain and contract address. One ambiguous snapshot association
was skipped. The initial pass returned creator observations for 21 candidates.
It preceded the stricter GoPlus response-key check; treat that count as a
preliminary acquisition observation, not independently reverified creator proof.
Each observation retained source, timestamp, confidence, verification status,
chain, contract address, and recovery marker.

A later strict, paced pass recovered only 6/99 before temporary rate responses
opened permanent circuits. This exposed the cooldown defect repaired afterward.
Provider availability is variable; neither pass establishes production recovery.
The second artifact is `/tmp/cli-creator-recovery-paced-validation-20261010.json`.

This is an acquisition check, not a replay of the complete 500-candidate scoring
pipeline. It does not establish a new production coverage figure or a tradable
edge. Full observation details are in the local generated artifact
`/tmp/cli-creator-recovery-validation-20261010.json`.

## Remaining limitations

Base B20 assets use native precompiles and a 0xef code stub. Ordinary EVM contract
creation APIs need not supply their issuer. The stub is not issuer verification,
and no creator is inferred from a name, stock symbol, or transaction sender.
See https://github.com/base/base-std/blob/main/docs/architecture.md.

Base's current Blockscout API requires a paid plan; this repository has no
Etherscan API key configured. These are external availability limits, and an API
key alone does not guarantee B20 issuer proof. See
https://github.com/blockscout/docs/blob/main/base-api.mdx.

## Checks

- 1,348 tests passed, including identity, cooldown, pacing,
  shared-budget, proof-reuse, and missing-safety-flag regressions.
- JavaScript syntax checks passed for 712 files after the report regressions were added.
- Typecheck and focused provider/recovery regression tests passed.
- The earlier bounded scanner smoke check passed in a separate checkout: 44 deep
  candidates, 18 deferred, 92% core coverage, 1 core-starved (2.27%), 2 verified
  routes, zero qualified candidates, and NO_EDGE_FOUND. Readiness and required
  report contracts passed. Reports do not race with test-runner isolation.

## Full-universe performance finding

The full-size local scan discovered 29,077 assets and selected 500 deep candidates.
Its readiness audit was CPU-bound in semantic alias normalization and field-path
conversion. A short CPU profile confirmed those pure string operations dominated
the samples. Their results are now memoized in bounded 4,096-entry caches; strings
longer than 1,024 characters are not retained. Only deterministic text conversions
are reused; provider observations and identity decisions are not reused by this
optimization.

A 200,000-iteration repeated-field benchmark took 640 ms before and 25 ms with the
cache, with the same checksum. This is not an end-to-end scan speedup claim.
Regression tests compare the original transformations with the cached outputs,
including empty inputs, Unicode normalization, eviction, and mutable objects.
The old full scan was stopped and restarted with this change for final validation.

## Full-size timeout and repair

The subsequent 500-deep-candidate scan failed in Active Evidence Recovery at its
25-minute outer deadline. No final coverage or qualification result is claimed
for that failed run. Its failure artifact is preserved locally at
`/tmp/cli-full-scan-timeout-20261010.json`.

Persistent exact creator records were still reached only through provider
scheduling, consuming quota waits and request allocation for cached proof. The
standard executor now checks the existing security cache before scheduling;
chain, contract, creator validity, freshness, and GoPlus response-identity proof
remain mandatory. Custom provider behavior and explicit cache bypass are retained.

Recovery also has a default 23-minute internal acquisition budget, below the
unchanged 25-minute outer guard. Quota waits respect that deadline. Expired calls
are reported as TIME_BUDGET_EXHAUSTED and spend no requests; completed observations
are retained. Unresolved candidates stay in the deep denominator, and final
readiness and qualification gates still evaluate their missing evidence. A time
budget cannot manufacture CORE_EVIDENCE_READY or a qualified pick. The internal
budget can be configured with ACTIVE_EVIDENCE_RECOVERY_TIME_BUDGET_MS and must
remain below the pipeline stage deadline.

Final regressions also require case-sensitive Solana mint matching while keeping
EVM address matching case-insensitive, and reject zero-address creator proof.

## Safety consumer repair

Local security reuse previously promoted individual fields without rebuilding the
summary read by Contract Authority Risk. Recovery now rebuilds that summary for
cached proof, including when an external fallback fails. Exact GoPlus creator
records also forward their observed companion safety fields without another HTTP
request. Duplicate references are removed; missing flags are not manufactured.

Source verification alone cannot establish clean GoPlus contract safety. Missing
honeypot, owner/transfer controls, mint/proxy/blacklist checks, or buy/sell tax
observations remain explicit unknown checks. UNKNOWN and incomplete evidence
cannot receive a clean safety score; observed dangers retain blocking pressure.
Solana cache keys and local security reuse preserve case-sensitive mint identity.
Focused regression validation passed 68 tests after these final refinements.
The acquisition repair completed a live 500-deep scan before the final safety
consumer refinements: 29,076 discovered, 2,343 standard, 1,843 deep deferred,
481 core ready, 19 core starved (3.8%), 92% core coverage and 88% advisory
coverage. Recovery promoted evidence for 476 candidates. There were no failed
pipeline engines, zero verified routes, zero qualified candidates, and
NO_EDGE_FOUND. The saved production baseline was 122/500 core starved (24.4%)
and 91% core coverage. These are different live universes, not a controlled
same-token comparison. Artifacts are retained in
`/tmp/cli-recovery-smoke-20261010/reports`.

All required report contracts and the full engine audit passed. The local run
did not initially stamp a code SHA, so the provenance firewall correctly refused
live publication; refreshing it as a TEST artifact passed. The final validation
run stamps the actual checked-out Git SHA rather than weakening this firewall.
The final safety consumer changes require a separate full scan before an updated
final-head coverage claim can be made.

Alias resolution now creates exact and normalized alias lookup sets once per
field resolution instead of normalizing the same registry repeatedly for every
candidate path. The sets are local to the call, so registry mutations cannot
reuse stale lookups. Regression coverage compares the original classification
rules across exact, nested, punctuation-normalized, and provider aliases.

Recovery report builders now retain the engine's batch-level hydration counters:
selected wave counts, request budget/usage, deadline skips, and recovered and
unresolved fields by family. Missing measurements stay null, not invented zero
request costs, and deferred candidates cannot supply a batch summary.

The completed acquisition run also exposed a reporting disagreement: final
readiness counted 19 core-starved candidates, while root-cause diagnostics counted
42. The latter allowed a null alias resolution to shadow observed raw zeros and
called any missing core group starvation even when the engine had partial inputs.
Root-cause classification now retains measured direct inputs and uses the same
required-group readiness threshold as the readiness engine. Missing groups remain
visible in CORE_EVIDENCE_PARTIAL; no trading gate or positive score is relaxed.
Regression tests compare both audits for measured zero, partial and missing core
evidence. Final full-scan agreement is checked separately below when available.

## Final acquisition scan and publication trace finding

The SHA-stamped e6aabacc scan completed with 29,075 discovered, 2,341 standard,
500 deep evaluated, 1,841 deferred, 486 core ready, 14 core starved (2.8%),
92% core coverage and 91% advisory coverage. Both readiness and root-cause audits
counted exactly 14 core-starved candidates. There were 13 deterministic blocks,
zero verified routes and zero qualified candidates: NO_EDGE_FOUND, not a pick.
The 14 remaining core gaps were the creator/deployer/lifecycle required-any group.

Hydration attempted 495 candidates, charged 539/2,000 request-budget units,
and did not expire its deadline. Wave selections were 495 cheap, 150 VOI and
zero execution-proof candidates. Recovered fields by family: DEPLOYER 1,977,
SECURITY 2,243, WALLETS 468. Unresolved: DEPLOYER 328, WALLETS 600. The recovery
report counted 494 recovered candidates. These counters are measurements from
`/tmp/cli-final-validation-20261010/reports/starvation-recovery-results.json`.
The production baseline had 3,816 standard, 3,316 deferred, 500 deep, 378 core
ready, 122 core starved, 4 verified routes and zero qualified candidates. Its
remote memory and RPC/provider availability differed from this local scan;
route counts and runtime are not controlled same-environment comparisons.

The publication firewall refused the local artifact because a safety trace put
entire GoPlus provider records under testedChecks. NEXO's raw holder list includes
addresses with repeated 1/2/3 digits used by test fixtures. A fresh exact-contract
GoPlus lookup at 2026-10-10T08:06:23Z returned those same real holder records;
this was not local test data. Raw evidence stays in the security cache. Safety
traces now contain only named checks and source provenance, not raw provider
payloads masquerading as checks. The fixture firewall itself is unchanged.
Candidate safety also retains unknown contract checks: an Instant Safety PASS
cannot override incomplete contract proof. Regressions cover both cases and keep
actual fixture candidate identities rejected. Follow-up validation is required
before claiming a publishable final artifact.
