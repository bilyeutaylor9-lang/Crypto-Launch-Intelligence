# Deep acquisition repair: source-pinned findings

## Production baseline, not a post-repair result

Main `6aaed814f4e51d604731fe682c6ab019f995fd2c`, Live Dashboard run
[39681510624](https://github.com/bilyeutaylor9-lang/Crypto-Launch-Intelligence/actions/runs/39681510624):

| Metric | Frozen result |
| --- | ---: |
| Standard / deep evaluated / deep deferred | 4,000 / 500 / 3,500 |
| Core-ready / core-starved | 138 / 362 |
| Average core / advisory field coverage | 89% / 88% |
| Advisory gaps | 461 candidates |
| Current verified routes / fully qualified | 0 / 0 |
| Charged provider units | 1,890 / 2,000 |
| DexScreener phase-deadline skips | 330 |
| GeckoTerminal missing-pool non-applicable outcomes | 365 |

Field coverage is not candidate completeness. The 3,500 deferred candidates are
not in the 500-candidate starvation denominator. These metrics describe unhealthy
acquisition, not a healthy negative opportunity result.

## Repairs and invariants

- Hydrate selected exact identity/market entries before paced holder metadata.
  Both remain inside the original cheap window; creator fallback, selected Wave2,
  execution reserves, concurrency, absolute deadlines, circuits and caps are
  unchanged. Entries are not retried by later holder/creator cohorts.
- Give the existing Gecko fallback a real missing-pool route: one first token-pools
  page, exact chain/base-token/resource identities, valid pool and quote-token
  identities, and exactly one unambiguous result. Full/continued pages, conflicting
  claims, multiple pools, symbol-only identity and wrong token sides remain UNKNOWN.
  An explicitly supplied pool is never replaced by discovery.
- Apply the same exact response-identity checks to known-pool refreshes, including
  resource IDs and base/quote chain claims. Check canonical aliases for conflicts.
- Preserve absent/malformed market measurements as UNKNOWN in both refresh and
  discovery. Explicit numeric zero remains an observation; invented normalizer
  zeros do not become evidence.
- Promote measured buy/sell transaction counts from the already fetched response.
  Counts are nonnegative safe integers, not unique buyers, wallet labels, smart
  money, or proof of execution. Every promoted observation retains provenance.

The official [token-pools reference](https://docs.coingecko.com/reference/top-pools-contract-address)
documents 20 results per page and pool transaction counts. The public keyless
transport uses the existing GeckoTerminal v2 API; it adds no subscription or key.

## Provider cost

Discovery costs one charged request, only for unrecovered requested market fields.
It shares the same provider circuit, request ceiling, phase deadline and abort
signal as the known-pool fallback. There is no pagination or hidden retry. Measured
transaction companions require no additional request. Reordering admission does
not reset a quota or enroll additional candidates. Live cost/benefit remains to be
measured; a newly usable fallback can consume previously unused allowed units.

## Verification status

- Three scheduling regressions failed before the ordering repair; all ten new
  scheduling tests now pass with the existing phase/reserve/holder suites.
- Four focused follow-up cases failed before fixing alias conflicts, absent market
  measurements and unused transaction counts. They now pass.
- Acquisition integration at c45b9fdf: 126 tests pass, including the existing starvation
  contract, shared budget/deadline/circuit and selected-wave tests.
- The first broad local run was intentionally interrupted and is NOT a pass. Its
  generated files were preserved outside the checkout and all 1,168 source / 20
  pre-test runtime-file hashes were verified before further edits.
- At c45b9fdf, the completed local suite and both Node 22/24 CI jobs each passed
  2,847 tests. Typecheck, syntax checks across 1,026 JavaScript files, 21 load tests,
  scanner smoke and isolated report health/readiness checks passed. The offline
  report was explicitly TEST/OFFLINE_FIXTURE, not production acceptance.
- PRs #65 and #67 were normally merged at their approved exact heads. Live
  acceptance remains pending; no improved production coverage, qualifying pick,
  or profitable edge is claimed from deterministic fixtures.

## Measured wallet follow-up (2026-10-22)

The follow-up retains a strict boundary between complete, qualified daily swap
evidence and bounded observed swap samples. Transfers and generic transport
metadata do not establish smart-wallet qualification. No existing acquisition
adapter is claimed to produce qualified daily aggregates or complete multi-day
history. Supplied positive receipt fixtures test an input contract, not a live
provider. Daily totals and accumulation days remain unknown without their proof.

Rejected declared receipts and bounded samples are retained under diagnostic
namespaces rather than left as numeric fallbacks for capital-flow/rotation
consumers. Default canonical scanning excludes the entire measuredWalletFlow
diagnostic subtree. Custom ignore lists still replace the defaults and must
retain that boundary themselves.

Derived field metadata carries the exact token identity, the original source
window clock and a separate computation time. It does not invent confidence.
Recomputation cannot refresh an expired source observation. A successful wallet
producer can report its unavailable raw prerequisites instead of a false
PIPELINE_OUTPUT_MISSING diagnosis; failed/skipped/missing producer stages and
manifest core/advisory semantics remain unchanged. Derived fields still consume
no external recovery request budget.

Ninety focused integration tests passed before the final broad validation. Two
new provenance regressions failed before the clock propagation repair. A compiled
default semantic-ignore matcher also passed equivalence checks, including 500
deep and 3,500 deferred rows. These are local correctness/performance observations,
not a guarantee that production quotes will remain fresh. Full follow-up check
results are recorded with the final published PR head.

## Remaining evidence work

Production acquisition still needs proven qualified daily swaps and complete
history; repeatedly rerunning a consumer cannot create them. Unknown history
must not become accumulation days or a bullish score.

The one paired production quote expired 15.491 seconds before cutoff. Actual job
timestamps show about 15.3 seconds in final readiness/root-cause auditing after
quote acquisition, in addition to dependent scoring and publication work. The
boundary correctly demotes it. Optimizing this path requires equivalent decisions,
not a longer TTL, backdating, a frozen clock, or revival of old positive flags.

Durable collector activation, independent backup, original production SQLite
recovery, actual remote acknowledgment, sustained capture and the 25/100/500 live
acceptance ladder remain separate unfinished gates. Automatic trading and model
promotion remain disabled. Frozen statistical proof thresholds are unchanged.
