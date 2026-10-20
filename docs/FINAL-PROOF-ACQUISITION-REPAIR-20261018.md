# Final Proof Acquisition Repair

Follow-up to PR #56, based on `43aef77e8f9eb543d3e0f2981ed083444d0b86b5`.

## Reproduced Defects

- Remote restoration treated every short body page as missing history. A server
  cap of one row caused a three-record restore to fail despite all records
  existing. Body reads now query only outstanding IDs and validate every body
  against the complete remote index. Empty, corrupt, conflicting, duplicate,
  unexpected and errored responses still fail before local appends or uploads.
  Each successful read removes an ID; an original batch permits at most 50 reads.
- Final safety and transfer-tax gaps did not create raw acquisition requests
  when the engine-input manifest was already satisfied. Those gaps now schedule
  existing chain-applicable collectors, including undefined safety results.
  Existing request, time, wave, circuit-breaker and identity limits remain.
- Creator-only local/cache evidence returned before richer deployer sources
  could provide a requested creation transaction, block or timestamp. Recovery
  now merges exact observations and fetches only unresolved supported raw fields.
  Unsupported wallet-age/history requests do not spend provider requests.
- An unsuccessful Jupiter USDC attempt made a valid later SOL buy/sell pair
  appear to have three legs. Attestation now isolates the selected token pair
  while retaining exact request/response amounts, token and pool checks.
  Missing price-impact measurements remain unknown.
- A derived `finalContractAddress` unconditionally became verified on identity
  reentry. Also, string values such as `"false"` and `"UNKNOWN"` were coerced to
  true. Derived aliases no longer establish independent verification and only
  explicit boolean contract proof is accepted by canonical resolution.
- Unrelated same-ticker instruments on other chains demoted independently
  verified chain-contract identities. Exact proven instruments stay distinct;
  collision warnings remain and no issuer/bridge relationship is inferred.
  Unknown instruments and actual conflicting anchors remain unverified/blocked.
- Existing Solana mainnet mint-account evidence had no final identity consumer.
  Identity now validates exact mint aliases, mainnet genesis, token program,
  account slot, paired authority fields and the account's block timestamp.
  `SOLANA_MINT_ACCOUNT` is a scoped account identity, not issuer, source-code,
  utility, safety or profitability verification.
- Cached final identity flags could outlive that account attestation. Final
  selection rechecks its 300-second limit directly; report compaction preserves
  a finite proof projection and its scope without retaining unbounded RPC data.
  Aggregate adverse RugCheck findings remain adverse without invalidating the
  independently observed account identity. SECURITY changes rerun identity.

## Validation

- Regression failures were reproduced before each repair.
- Combined broad suite: 2,222 tests passed, zero failures or skips.
- Syntax checks: 968 JavaScript files passed; `npm run typecheck` passed.
- Fresh `npm ci`: 133 packages audited, zero reported vulnerabilities.
- Focused acquisition, paging, identity, stale-proof and report tests pass.
- Two existing fixtures were corrected: a pool-only test explicitly declares
  its completed synthetic safety check without increasing its five-request cap;
  a ticker-collision test now asserts distinct verified instrument IDs, retained
  collision diagnostics and unchanged rejection of actual contract conflicts.
- Live validation must run from a clean committed source version. Its metrics,
  immutable artifact receipt and provider limitations belong in the PR and
  saved run artifacts, not in this source-only audit as an unobserved claim.

## Operational Limits

The previous saved live run had 132 deep candidates, 92% core coverage, zero core
starvation, 126 unresolved final decision-proof rows and zero qualified picks.
Its four routes were historical at the scan cutoff, not current executable offers.

The October 18 production Edge Evidence Truth run `39169324945` independently
reported `exceed_egress_quota` on both restore and sync. The connected Supabase
organization is on the Free plan. ACTIVE_HEALTHY database metadata does not prove
that restricted Data API reads work. This patch does not change billing, spend
caps, credentials, schema, RLS, workflows' failure conditions or durable history.

No score threshold, risk threshold, identity requirement, quote lifetime,
liquidity minimum, security check, promotion gate or automatic-trading setting
was weakened. Zero qualifying candidates remains a valid outcome. No profitable
edge is established by these repairs or test results.

## 500-Candidate Follow-Up

The clean `f4d09e94` live run `scan_1792370383902` evaluated 500 deep
candidates, with 1,981 deferred separately. Core coverage was 89%, but 389
candidates remained core-starved. That larger run disproved the assumption that
the earlier 132-candidate result established production-scale evidence health.
It used 1,866 of 2,000 provider request units. No candidates qualified.

New root causes found in its actual evidence:

- Substring CEX detection matched `gate` inside `market-aggregate`. On-chain
  discovery metadata was incorrectly classified as the Gate exchange, preventing
  appropriate on-chain acquisition. CEX names now match whole normalized fields
  or actual exchange hostnames, never URL paths or lookalike substrings.
- Missing exact pools did not schedule market recovery when other engine-input
  groups were already satisfied. Cheap Wave 1 now requests a pool for exact,
  nonconflicting chain-contract identities without replacing supplied pools.
  Exact DexScreener companions include raw buy/sell counts, not unique buyers.
- `UNKNOWN` route types prevented quote acquisition even after exact pool
  recovery. The planner can select on-chain acquisition providers; only actual
  current two-leg proof can establish a recognized executable venue. The
  `market-aggregate` discovery placeholder obeys the same strict replacement
  rules as profile/boost labels, including expiry and conflicting-leg checks.
- Production recovery skipped hundreds of candidates during GoPlus cooldowns,
  then spent budget on fallback ladders. Bounded batch recovery now opts into
  the existing shared limiter's cooldown wait. Direct helpers remain nonblocking
  by default. Admission rechecks the absolute deadline, remaining budget and
  provider circuit after waiting; waiting reserves no request units.
- Mixed Wave 3 work aged early 30-second Raydium quotes behind slower providers.
  The priority-selected candidate set stays fixed; slower EVM acquisition drains
  before the selected Solana cohort. The same budget, deadline, concurrency and
  provider quotas apply. Quote lifetimes and final expiry demotion are unchanged.
  This reduces cross-provider waiting but cannot promise freshness if later work
  itself exceeds a quote's lifetime.

The primary report and metrics from that run are retained as the baseline.
Five debug JSON files were subsequently overwritten by an existing focused test
invocation; those diagnostics are not represented as pristine live evidence.
The next clean-source live run must regenerate them before final publication.
These new repairs require full-suite and production-scale revalidation.

## Hydration Scheduling Follow-Up

The next clean `ab2e354a` run `scan_1792372980783` evaluated 500 deep candidates
and kept 1,799 deferred candidates outside the recovery denominator. Core
coverage improved to 90%, but 273 candidates remained starved: 271 lacked the
wallet/holder required-any group and 111 lacked creator/lifecycle evidence.
Recovery used 1,125 of 2,000 request units, exhausted its 23-minute time window,
and made zero live quote HTTP calls. The real readiness and scanner smoke checks
correctly failed. These results do not establish production health.

All 5,362 recovered fields in the retained recovery report matched an exact
serialized chain-token-pool record with complete provenance. The full audit
changed only its declared outputs, and frozen JSON/HTML/ranking counters agreed.
The complete intermediate live state is archived separately, including failure
receipts. Main remains unmerged.

The next acquisition repairs address the measured scheduling failures:

- Core holder gaps can request only inexpensive existing GoPlus metadata in
  Wave 1. This tier cannot invoke explorer/RPC fallback or remote history.
  Deeper wallet work remains limited to the selected Wave 2 cohort. Advisory-only
  gaps do not create these requests. Exact identity, freshness, confidence,
  sample-only semantics and unknown smart-wallet labels remain unchanged.
- Cheap market/holder collection completes before creator/security fallback
  work. Each cohort's raw patches are merged before the next cohort dispatches,
  so companion creator/security observations can be reused without new calls.
  Valid adverse metadata is retained even when the holder sample is empty.
- The normal pipeline reserves three minutes of its existing recovery window
  for selected live proof, capped at one quarter of the remaining time and
  configurable with `ACTIVE_EVIDENCE_EXECUTION_RESERVE_MS`. Raw phase expiry is
  separate from terminal absolute expiry. No request allowance, circuit,
  absolute deadline or quote lifetime resets. Late responses remain unpromoted
  and deadline-driven cancellation does not blame the provider circuit.
- At dispatch, selected Solana execution candidates reuse or acquire a fresh
  exact paired mint-account/authority bundle before quoting. Missing, stale,
  foreign, unavailable or adverse proof cannot clear safety. SECURITY changes
  trigger existing identity and safety reruns. No RPC is added for nonselected,
  deferred, conflicting, CEX or unsafe candidates.
- The dispatch-time adverse-evidence check scopes raw records to the exact
  chain and mint and rebuilds mixed-identity summaries from those records.
  Another mint's risk cannot veto a verified local proof. Exact adverse raw
  evidence and legacy adverse summaries without underlying records still block.

New offline regressions exercise 500 cheap core-holder gaps under 500 requests,
deeper-cohort limits, phase/absolute deadlines, cancellation, immutable budgets,
17-minute snapshot expiry, fresh-proof reuse and adverse-evidence precedence.
Validation on 2026-10-19 passed 2,286 tests, syntax checks across 975 JavaScript
files, typecheck, all 21 load tests and the network-denied scanner smoke chain.
The suite preserved all 236 saved data/report/doc files byte-for-byte. An
interrupted earlier run's verified artifact backup was restored before testing;
generated test artifacts were quarantined separately rather than discarded.
Another clean-source live validation is still required before landing. The
`ab2e354a` measurements above are the prior baseline, not results for this layer.
The latest inspected main evidence workflow also still fails because Supabase
denies production reads with `exceed_egress_quota`; no billing settings changed.

## Supabase Egress Follow-Up

The separate scanner-memory reader still requested five unused project columns
and ten unused receipt columns. Its projections now include only consumed
fields, retaining exact project identity, health-row filtering, ordering,
limits, historical counts and existing memory output.

An HTTP 402 or explicit `exceed_egress_quota` now stops that table's complete
retry/credential loop. With two configured keys, injected 402 responses require
three table requests instead of six. Genuine authentication fallback,
clock-skew recovery and transient retries remain intact. FAILED/DEGRADED states
and the original restriction reason remain visible; unavailable memory cannot
become historical evidence.

This is prevention, not service restoration. The connected organization was
confirmed on Free, and its latest inspected production workflow still denied
Data API reads. For a Free organization, the documented recovery is an
owner-approved Pro upgrade or the next billing-cycle quota refill. Changing a
Pro spend cap is not the recovery action for this Free organization. Pausing
and restoring a project does not clear usage already recorded in the cycle.
No connected tool can make the billing change; dashboard sign-in and the owner
decision remain external requirements. No billing, RLS, schema, credentials or
stored observations were changed, and no alternate data-export path was used.

The focused injected regressions verify minimal projections, identical memory
and exact identities, quota short-circuiting, error visibility, transient retry
and legitimate credential fallback. A fresh full-suite run is retained
separately. The in-flight 500-deep scanner validation remains pinned to
`2533c592`; these isolated memory-reader edits do not alter that checkout.

Official references:
- https://supabase.com/docs/guides/platform/manage-your-usage/egress#optimize-usage
- https://supabase.com/docs/guides/platform/billing-faq#how-can-i-remove-restrictions-applied-from-the-fair-use-policy

## Measured Raw-Wave Follow-Up, 2026-10-19

The completed clean-source `2533c592` live run evaluated 500 of 2,482 standard
candidates and deferred 1,982. Core/advisory input coverage was 89%/89%, but
296 deep candidates remained core-starved: 284 lacked wallet/holder evidence
and 282 lacked creator/lifecycle evidence. Recovery consumed only 478 of 2,000
request units while 1,902 attempts missed the raw phase deadline. The cheap
GoPlus cohort monopolized that window, including thirteen rate-limit responses.
Creator alternatives and selected deeper wallet work were therefore skipped.

Unlike the prior run, 45 live quote HTTP requests actually ran: 40 LI.FI and
five Raydium. One exact paired Raydium quote was recovered, but its 30-second
expiry preceded the final publication cutoff. Zero routes were verified at that
cutoff; zero candidates qualified. Missing pool attestations and missing safety
proof were not promoted. Readiness and scanner smoke correctly failed with
`DATA_DEGRADED`. These measurements are not a profitable-edge claim.

All 3,973 reported recovered fields joined exact serialized candidates and had
provenance. No deferred candidate was counted as starved. The fixture engine
audit, report contracts and frozen artifact consistency checks passed, but those
checks do not override the failed live acceptance. The complete source-pinned
runtime, diagnostic receipts and failed readiness reports were archived before
further code changes. The SHA-256 of that archive is
`3ce0b5842ff27f5c9e0749c9e40325900cbc58a15820a0152e35da0a21b5b716`.

The next scheduling layer partitions the existing raw allowance instead of
extending it. `ACTIVE_EVIDENCE_WAVE2_RESERVE_MS` defaults to 240,000 ms and is
capped at one third of remaining raw time when both waves have work.
`ACTIVE_EVIDENCE_CHEAP_METADATA_TIME_BUDGET_MS` defaults to 600,000 ms and is
capped at half of Wave 1 time when creator/security fallback also needs time.
Unused cohorts reserve nothing. Absolute deadlines, request admission, provider
circuits, cooldowns, exact identity, UNKNOWN semantics and quote expiry remain
unchanged. A new live validation is required after implementation and tests.

The implementation also removes already-satisfied raw demands before field and
candidate caps, rechecks contract-generated required-any alternatives, and
retains independent transaction/history requests and explicit fresh-proof
requirements. Derived work waiting for its producer remains visible without a
premature FINAL audit. Existing nested observations are promoted locally with
their original provenance and changed families, using no external wave slots
or request budget. Quote-only resumption does not replay old wallet inputs or
traverse raw recovery plans.
Dependency reruns use the actual current-phase changed families, not the
presence of an external wave marker. Local-only recoveries therefore rerun their
consumers, while cleared historical markers and deferred candidates do not.

Cheap wallet acquisition now reuses validated project/cache payloads first,
then queries the existing Blockscout holder and token-metadata endpoints, then
uses GoPlus for unresolved observations. The new tier cannot request transfers,
RPC history, buyer classification or smart-wallet alpha. A Blockscout pair costs
two request units; a sufficient cached sample costs zero. A shared 440 ms
admission interval for production metadata pairs keeps this new path below the
documented anonymous default of 300 requests/minute. The interval does not
alter GoPlus quotas or any evidence freshness rule. See
[Blockscout requests and limits](https://github.com/blockscout/docs/blob/4eeb59ce584cb67706868b5eb7e11ec4726aa967/devs/apis/requests-and-limits.mdx).

Default creator acquisition likewise reuses exact local/cache evidence before
independent Sourcify/Blockscout metadata and GoPlus network fallback. Creator and
selected deeper-wallet cohorts can skip an active GoPlus cooldown to use their
independent alternatives; explicit caller waiting and single injected security
providers retain their waiting behavior. UNKNOWN responses still produce no
creator, no wallet label, no verified safety and no final qualification.

The original 236 saved data/report/doc files remained byte-for-byte unchanged
through the first full-suite, syntax, load and isolated smoke passes. Fresh
complete validation and another source-pinned live run are required for this
final scheduling revision. Results belong in the PR's current validation record;
the failed live metrics above remain the retained before-repair measurement.

## Sourcify Response Identity Hardening

An additional offline adversarial probe reproduced a pre-existing boundary
defect: a Sourcify response explicitly naming a different chain and contract
could be normalized using the requested identity and contribute creator proof.
Contradictory or malformed declared bindings now remain UNKNOWN at the fresh
provider, cache, creator-recovery and security-summary boundaries. Valid
endpoint-scoped metadata without redundant identifiers remains supported.

Retaining rejected raw metadata also exposed a second path: semantic aliases
could rediscover its nested deployment address. Alias candidates under UNKNOWN,
contradictory or foreign Sourcify envelopes are now rejected, while the raw audit
response is retained. Valid bound creator observations still resolve normally.
Foreign flags cannot clear genuine local adverse evidence or supply another
contract's risk. Cached observations are neither deleted nor timestamp-refreshed
by validation. New regressions cover fresh, cached, injected and retained raw
responses, malformed declarations, semantic alias replay and adverse precedence.
Canonical/final/raw/market/route identity forms and source-only or provider-less
known-supplier records receive the same checks.

## Metadata Is Not A Honeypot Test

A further executable probe showed that source-verification metadata and generic
absence-of-risk flags could become `honeypotDetected: false` through aliases.
Sourcify, Blockscout and Etherscan do not perform that test; their unassessed
honeypot field is now null. A clean Solana mint likewise does not manufacture an
EVM-style negative honeypot test. GoPlus preserves strict true/false/null based
on its actual `is_honeypot` response, including null for omitted/invalid values.

Security summaries retain genuine adverse flags but no longer turn an absence
of findings into a negative test. Verified negatives carry the actual source,
chain, token, observation timestamp and confidence. Alias consumers require a
matching current observation, reject metadata-only or foreign negatives and
quarantine unsupported flattened legacy aliases. Current verified observations
are not overridden by older alias provenance. Cache reads sanitize legacy
absence flags without rewriting stored records or refreshing timestamps.
The added regressions cover these distinctions before another live validation;
the coverage target cannot be met by manufacturing benign safety evidence.
