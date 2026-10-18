# Provider Capability And Buyer Evidence Truth

## October 17 Repair And Independent Audit

The persistent repair checkout now restores the Solana full-report holder-owner
acquisition path, rather than relying on the removed temporary checkout.
It verifies exact mint/program identity, separates owner addresses from token
accounts, preserves original provider timestamps, and explicitly does not prove
fresh chain snapshots, daily buyers or smart-wallet labels. Existing security
payloads are reused before bounded provider requests. Solana wallet routing no
longer schedules EVM-only collectors. Non-mint RPC responses, malformed authority
fields and incomplete security reports cannot establish clean security. Raw
active mint/freeze authorities remain risks even without provider risk labels.

Discovery-ledger promotion now means deep-research selection, not final
qualification. Final qualification requires retained Final Selection Integrity
producer proof and passing invariants. Legacy discovery-only qualification flags
are excluded from current totals/report rows without rewriting old observations.

An independent specialist reproduced two additional bugs: retained live route
flags could override current negative execution proof, and healthy raw-input
coverage could disguise missing decision-critical proof as NO_EDGE_FOUND.
Shared readiness consumers now honor current nested quote, identity, freshness,
depth, slippage, safety, tax, authority and access proof. Producer recomputation
does not reuse its previous derived proof as the new readiness result. Real new
observations can therefore recover an earlier rejection. Null/partial tax
values and empty evidence objects cannot verify transfer taxes.

The canonical funnel separately reports healthyDecisionEvidence,
unresolvedDecisionEvidence, decisionProofMissingFields, decisionEvidenceComplete
and conclusivelyRejected. Input availability is not final decision proof.
Unresolved identity/safety/execution requirements yield DATA_DEGRADED; conclusive
rejections do not require irrelevant downstream proof, and optional advisory
gaps alone do not degrade complete decision evidence. Current negative proof
also prevents retained qualification flags from inflating the final pick count.

Before the shared execution/semantic fixes, live scan scan_1792282654230 had
62 standard / 46 deep / 16 deferred candidates, 91% core / 89% advisory input
coverage, 44 core-ready / 0 partial / 2 starved. Recovery attempted 30 candidates,
selected 22/30/0 wave candidates and used 48/2000 request units, without deadline
skips. Recovered fields were DEPLOYER82 / SECURITY111 / WALLETS78; unresolved
attempted fields DEPLOYER47 / WALLETS3. The discovery ledger correctly counted
94 promoted deep-queue entries and zero final-qualified entries.

That run's smoke passed under the old coverage-only health semantics, despite
zero routes/picks and first unknowns BUY_QUOTE24 / SAFETY14 / IDENTITY4 /
USER_ACCESS4. It is a baseline exposing the semantic defect, not evidence of a
production-ready scanner. Complete post-fix tests and fresh live proof coverage
must be inspected before any deployment claim. No profitable edge is established.

### Test Data Isolation And Clean Baseline

The original test runner restored reports but did not isolate data. A mocked
Solana security response was found in the live security cache. Both directories
are now isolated and restored on success and failure, with backups retained on
restoration error. The affected direct fixture explicitly disables its cache.
The new worktree's mixed generated data was preserved, not deleted, in sibling
directory cli-validation-mixed-data-20261017 before a clean-data live run.
The unrelated original user checkout was not modified. SHA-256 comparisons
confirmed all 25 genuine data files were restored byte-for-byte after a full run.

Clean scan scan_1792283690260 had 61 standard / 43 deep / 18 deferred candidates,
91% core / 89% advisory input coverage and 43 ready / 0 partial / 0 starved.
Recovery attempted 26 candidates, selected 14/26/0 waves, used 28/2000 request
units and had no deadline skips. Recovered fields: DEPLOYER59 / WALLETS64 /
SECURITY74; unresolved attempted fields: DEPLOYER28. It had zero verified routes,
zero qualified picks, one conclusive rejection and 42 unresolved decision-proof
cases. Missing proof counts overlap: BUY_QUOTE42 / SELL_QUOTE42 /
QUOTE_FRESHNESS42 / VERIFIED_SLIPPAGE31 / SAFETY18 / TOKEN_AUTHORITY12 /
IDENTITY2 / TRANSFER_TAX2. Report contracts passed and manifest completed, but
readiness refresh and scanner smoke correctly failed with DATA_DEGRADED.

### Budgeted Execution Acquisition

Further inspection found that the active executor had no EXECUTION handler,
and contract-input completeness left Wave3 empty despite missing quote proof.
It now reuses the existing quote-recovery adapters with a shared-budget wrapper
around every actual HTTP request, including BUY, SELL and quote-token lookup.
Promotion verifies exact response chain, contract and the known pool on both
legs, or an explicit CEX venue market. Unattested pools, incomplete responses,
unknown measurements and failed providers remain unresolved. Every promoted raw
observation retains provenance; no final readiness or qualification is forged.

Normal pipeline quote collection is deferred to Wave3 instead of occurring
before hydration or through unbudgeted post-recovery retries. Missing quote,
freshness, depth and slippage proof seeds fresh raw recovery for the top execution
candidates. Already-complete quotes, conclusive rejections and deferred projects
do not receive unnecessary plans. The registry advertises implemented adapters
only, with chain/route applicability and configured-key requirements.
Candidate-specific 400/404/422 no-quote responses do not trip a shared provider
outage circuit; authentication, rate-limit, timeout and service failures retain
their safeguards. Recovery reporting reconciles the budgeted work without
rewriting the original deferral record or treating raw quotes as final approval.

Cached quote ages now increase with their actual timestamp. A stored zero age
cannot make an old quote permanently fresh; future/invalid timestamps remain
unknown, and market-data update time is not quote time. Negative labels such as
UNVERIFIED, NOT_VERIFIED and NOT_READY cannot match positive status substrings.

The deterministic scale replay covers 500 deep plus 3500 deferred fixtures,
50 selected Wave3 candidates, a hard 60 mocked HTTP request budget and 30 exact
two-way raw route recoveries. Deferred entries are not attempted or counted as
starved. Missing final proof still yields zero qualified picks and DATA_DEGRADED.
The official load command passes 21 tests. This is component/load validation,
not live 500-candidate or full-pipeline evidence of a trading edge.

The first four repair commits through 053c2bc1 were pushed normally to
codex/evidence-recovery-audit-20261014; PR55 and main remain unchanged.
Local and repository secret-name checks found no configured JUPITER_API_KEY,
ZEROX_API_KEY or LIFI_API_KEY. BASE_RPC_URL is configured in Actions but absent
locally. No secret values were read or printed. Solana keyed quote acquisition
cannot be claimed working until its credential is configured. Keyless EVM and
public CEX paths remain available subject to actual provider proof/quotas.

The pre-diagnostics checkpoint code suite passed 1523 tests with zero failures, skips or
cancellations; syntax passes all 899 JavaScript files, typecheck's entrypoint
syntax check passes, and the load command passes 21 tests. Execution acquisition
is committed at d9f5b172 and freshness/status truth at 08c4c57f. The larger live
production-style validation remains required; unit and component evidence must
not be represented as proof that all 500 real candidates can be hydrated.

### Larger Live Validation And Current External Blockers

Live scan scan_1792287637331 completed at source revision 6dd0ffe4. It targeted
2000 discovery / 1000 standard / 500 deep candidates but actually produced
291 standard / 124 deep / 167 deferred. Eligibility rules were not relaxed to
fill the requested universe. This is not a completed live 500-deep validation.

Core input coverage was 90%, advisory coverage 89%, with 103 core-ready,
zero partial and 21 core-starved candidates (16.94% of deep). The remaining
core gaps were wallet/holder evidence in 21 and creator/lifecycle evidence in
13 overlapping candidates. All 105 selected Wave2 candidates were within its
150-candidate limit; selected waves were 51 / 105 / 50. Recovery used 301 of
2000 request units with no deadline skips. Recovered field counts by family:
IDENTITY3 / MARKET3 / WALLETS191 / DEPLOYER169 / SECURITY126. Unresolved attempted
fields: MARKET2 / DEPLOYER127 / EXECUTION200 / WALLETS42. These are field counts,
not unique candidate counts or a controlled provider-cost benchmark.

The requested aggregate core-input targets were met on this observed universe,
but final decision proof was not: zero verified routes, zero fully qualified,
one conclusive rejection and 123 unresolved decision-proof cases. Missing proof
counts overlap: BUY_QUOTE123 / SELL_QUOTE123 / QUOTE_FRESHNESS123 /
VERIFIED_SLIPPAGE101 / SAFETY94 / TOKEN_AUTHORITY55 / TRANSFER_TAX31 / IDENTITY11 /
ROUTE_DEPTH4. DATA_DEGRADED is correct, not NO_EDGE_FOUND. Report contracts passed,
artifact manifest completed and engine audit exited successfully; readiness
refresh and scanner smoke failed. No final gate was lowered to change this.

A subsequent bounded five-candidate quote probe used seven actual HTTP calls
and recovered no accepted raw route. LI.FI returned candidate-specific 404s,
one two-way response lacking required exact-pool attestation, then HTTP429 with
a declared two-hour cooldown. Further calls in that probe respected cooldown.
No new keyless probe should ignore that declared limit. Quote diagnostics now
retain adapter statuses, missing-key names, budget/cooldown reasons and actual
HTTP counts separately from unrelated wallet/deployer requests. A provider's
unattested route cannot be reported as an accepted recovery.

GitHub scheduled runs on main still fail independently of these local repairs.
Run39086599464 (Edge Evidence Truth) explicitly reports Supabase
exceed_egress_quota during durable forward-evidence restore. Run39086741674
(Autonomous Alpha OS) also fails restore and sync. This is a restricted external
service, not missing Git write permission. Billing, spend caps and project
configuration were not changed; failures and promotion guards remain enforced.
The current restriction needs account-side resolution or the provider's quota
reset. Repeated full-ledger downloads have been repaired to reduce future egress,
not represented as a way to clear an already applied service restriction.

Forward-evidence restore/sync now pages the immutable ID/hash index using the
existing composite primary key. Exact locally validated bodies are reused;
only missing bodies are downloaded in batches capped at 50 IDs and a
conservative 6000-byte request budget. Historical/undated additions are not
skipped through a time-window shortcut. Conflicts, corrupt/missing bodies,
malformed pages and provider query failures still fail closed before appending
or uploading. Public restore/sync counts remain intact. Thirty-two focused tests
include real Supabase SDK request encoding through an injected offline transport.
No live database success is claimed while the service remains restricted.

The larger scan also selected 12 Wave3 candidates that its executor then rejected
for missing/conflicting fixed identity. Wave allocation now shares that exact
identity check, preserves visible identity-deferral counts/reasons and refreshes
later waves after earlier hydration. A pool recovered in Wave1 can therefore
become eligible in Wave3 without relaxing identity. An explicit CEX route cannot
fall back to DEX probes when its supported venue/market is missing. Regression
fixtures prove invalid identities do not consume a capped execution slot and
newly hydrated exact pools do receive the subsequent bounded quote requests.
These allocation changes are deterministic regression proof, not a newer live
production result replacing scan_1792287637331.

Final integrated source validation through 6626873e passes 1569 tests with zero
failures, skips or cancellations, syntax checks across all 900 JavaScript files,
the entrypoint syntax/typecheck and 21 load tests. The combined focused repair
suite passes 84 tests. SHA-256 comparison after the full isolated suite confirmed
all 214 protected live data/report files restored byte-for-byte with the same
scan ID. Live report contracts still pass. The quote/wave repairs are committed
at 5a08e65e and low-egress immutable sync at 6626873e. Fresh GitHub checks are
required for publication; no prior PR's green checks authorize this new head.

PR56 was published at 9e5479aa without merging main. Its first GitHub observation
passed Node22 and Production Verification, while Node24 failed the live scanner
readiness step with report contracts PASS and manifest COMPLETE. This is an
observed decision-evidence failure, not a unit-test failure to hide or skip.

A subsequent CEX dispatch regression reproduced an unnecessary LI.FI call before
an exact Coinbase market request when the candidate retained on-chain aliases.
Explicit CEX recovery now uses only the supported exchange-market path; absent
venue/market identity cannot fall back to DEX probes. Its focused test fails on
the prior behavior and passes with one Coinbase request and no DEX requests.

The targeted execution-recovery report test also wrote fixture audit reports to
the checkout when invoked directly outside npm test. It now uses a temporary
working directory with cleanup. The primary scan report and raw data stayed
unchanged, but 23 secondary reports were identified as test outputs and must not
be presented as fresh production evidence. Those report artifacts will be
preserved separately and regenerated from a real scanner run. The earlier
214-file full-suite restoration result remains specific to that checkpoint,
not a guarantee about later unisolated test commands. The report writer captures
its directory at import time, so that test now loads it after entering its
temporary directory. A sequential SHA-256 before/after probe across all 214
runtime files confirms the focused test changes none of them.

The final code suite through cfed59ee passes 1570 tests without failures, skips
or cancellations, and the canonical syntax command passes all 900 JavaScript
files. Exchange dispatch is fixed at 07377034; direct report-test isolation is
fixed at cfed59ee. The larger full-provider scan above remains source-pinned to
6dd0ffe4. Any subsequent live regeneration must explicitly respect LI.FI's
declared local cooldown, without presenting a disabled quote adapter as working
execution proof. Subsequent regenerated-report and exact-head CI observations
are recorded in PR56 as well as the durable local validation logs.

## October 14 Handoff Reconciliation

The former `/tmp/cli-scanner-health-20261009` checkout no longer exists.
The saved remote checkpoint remains
`b4b218bfaf9e5fd8fdfacaa0853d30ca93b5c968`. A clean persistent repair
checkout was restored on `codex/evidence-recovery-audit-20261014` without
modifying the unrelated original checkout.

GitHub currently reports PR55 OPEN at
`1b255c97a9d8fa17b34968b805fe54a59b61bf11`,
with the three original build/verify checks successful and optional preview
skipped. Main remains `994dcd64e95e0ffe4cfd264699eadaf73f6061ab`.
Repository permissions report push access; git remote reads and authenticated
API reads succeeded. Actual write transport has not been retested here.
The branch-protection endpoint returned "Branch not protected" (404), and
the repository ruleset listing was empty. No protection was changed.

The supplied handoff's commit `7d10373` is absent from this local object
database. Its named ZIP was not found in Downloads or Documents/Codex.
Its test and load-test claims have not been reproduced. Prior uncommitted
Solana holder fixes and their temporary test logs are not present in the
restored checkpoint; they must be recovered from an artifact or reimplemented
and revalidated. Do not claim those changes are pushed or deployed.

Exact verified PR55 head:
`1b255c97a9d8fa17b34968b805fe54a59b61bf11`.
PR55 remains unmerged. Full live 500-candidate acquisition, current final-gate
proof coverage, fresh CI for subsequent fixes and a profitable edge remain
unproven. Preserve UNKNOWN evidence and all safety/identity/execution gates.

## Scope

This follow-up is based on PR55 head
`1b255c97a9d8fa17b34968b805fe54a59b61bf11`. It does not change that published
head or claim that the repairs are deployed. Safety, exact identity, liquidity,
execution and final qualification gates remain mandatory.

## Root Causes

- Source routing returned every provider in an evidence family regardless of
  the actual field. Transfer collectors advertised buyer, swap and smart-wallet
  facts they could not establish.
- Market transaction counts were routed to wallet recovery instead of the
  existing exact DexScreener path. Derived outputs could also consume request
  budget through stale plans.
- Buyer engines inferred independently funded buyers from unknown categories
  and emitted positive baseline scores without classification evidence.
- Producer contracts could count their own derived scores as raw inputs.
- Recovery dependency maps omitted lifecycle buyer evidence and wallet-graph
  consumers.
- Verified security responses already contained exact holder samples, but
  downstream wallet acquisition discarded them.
- Fresh security recovery did not independently enforce response identity at
  the promotion boundary.
- Semantic alias matching treated raw `txns.h24.buys` as distinct buyers. Holder
  quality also directly used transaction counts as unique buyers.

## Repairs

Field-specific capabilities now control routing. Unsupported wallet trade and
smart-label requests remain visible as unavailable, with zero provider budget.
Market buy/sell counts use the exact market connector; those counts are not
independent buyers. Derived fields remain recomputation work.

Buyer classifier, wallet cluster, wallet graph and organic firewall retain null
for unknown buyer categories and unsupported positive scores. Explicit zero
does not fall through to another positive source. Classified counts exceeding
the total population cannot support a positive classification. Observed harmful
clustering remains reportable even when other categories are unknown.

Fresh, exact GoPlus holder samples now flow from existing security evidence,
creator companions and new security responses. Every promoted sample retains
its original timestamp, source, confidence, chain/token identity and partial
coverage metadata. No complete holder universe, daily buyer count, independently
funded buyer, EOA identity or smart-wallet label is inferred. Known token/pool
contracts are excluded from the generic wallet sample. Existing nonempty wallet
observations are preserved.

Creator holder companions avoid a redundant wallet RPC. Fresh security responses
with wrong or absent identity cannot promote safety or holder facts. UNKNOWN
provider diagnostics remain visible, including identity-free cooldown records;
explicitly foreign diagnostics are not attached to the requested token.

Unique buyer/seller alias promotion now rejects transaction, swap and trade
counts. Repeated canonicalization removes a legacy participant field when its
retained provenance proves it came from transactions. Actual distinct-buyer
fields remain usable. Holder quality no longer uses a trade count as buyer count.

## Validation

The focused buyer/security/recovery/cooldown suite passes 107 tests. Canonical
syntax validation passes all 892 JavaScript files; changed executor syntax was
checked again after the cooldown diagnostic repair. The typecheck command
passes; it is an entrypoint syntax check, not a static type-system proof.

A deterministic 500-candidate holder/buyer component replay used exact injected
GoPlus samples and disabled network access. All 500 retained wallet samples and
their original provenance, all 500 satisfied the wallet raw-input contract,
none produced a positive organic-buyer or wallet-cluster score, and zero network
requests were made. This is not full-pipeline or live acquisition coverage.

Before the alias repair, the complete suite passed 1,457 tests with no failures
or skips. Live scan `scan_1791663269124` completed 57 standard / 41 deep / 16
deferred candidates, 92% core / 89% advisory contract-input coverage, 41 core-ready
and zero core-starved candidates. It attempted recovery for 19 candidates,
selected 19 / 19 / 0 wave candidates and used one of 2,000 request units without
deadline skips. Recovered fields were DEPLOYER 77, SECURITY 110 and WALLETS 54;
unresolved attempted fields were DEPLOYER 38. Unsupported wallet requests are
reported separately rather than counted as attempted provider recovery.

FULL_SCAN diagnostics reported zero verified routes and zero qualified picks.
Overall system readiness remained DEGRADED by route-identity/quote coverage;
semantic selection was NO_EDGE_FOUND. Report contracts and scanner smoke passed.
The request reduction from the preceding 87-unit smoke is not a controlled cost
benchmark: universe, cache and provider conditions differed.

Manual inspection then exposed the transaction/unique-buyer alias bug. Thus
that 92% input-coverage result does not prove truthful distinct-buyer availability.
The repaired alias path passes its 37-test focused regression. The subsequent
full suite passes 1,459 tests without failures or skips; syntax passes all 892
files. Fresh live scan `scan_1791663701309` completed 58 standard / 42 deep / 16
deferred candidates with 90% core / 89% advisory input coverage. It exposed 22
genuinely core-starved candidates, all on Solana, and only 20 core-ready candidates.
Thus the true starvation rate is 52.38%, above the requested target. The present
EVM-only wallet recovery does not hydrate Solana holder/wallet inputs.

A single-mint capability probe against the two already-configured public Solana
RPC fallbacks returned mainnet genesis identity from both. The actual
getTokenLargestAccounts request failed with HTTP 403 at publicnode and HTTP 429
at api.mainnet-beta.solana.com. Those errors establish no holder observations;
they require bounded acquisition/fallback work rather than fabricated samples.

All 42 recovery records were retained; selected waves were 20 / 42 / 0, provider
cost was 5 / 2,000 with no deadline skips. Recovered fields were DEPLOYER 81,
SECURITY 117 and WALLETS 59; unresolved attempted fields were DEPLOYER 40 and
WALLETS 44. The manifest completed and report contracts passed, but system
readiness FAIL and semantic DATA_DEGRADED correctly made scan:smoke exit 1.
Verified routes and fully qualified picks remained zero. This is not a repaired
production scanner, and this layer is not ready to merge as a completed fix.

Passing unit tests alone does not prove that external providers can hydrate the complete
500-candidate universe or that any candidate has a profitable edge.

## External Limits

Generic transfer and holder sources still do not prove daily independent buyers,
smart-wallet trades or smart-wallet profitability. Those fields stay UNKNOWN
until supported by actual trade/classification evidence. No new API was added
and no RPC fanout across the entire deep universe was introduced.

Core contract-input availability is distinct from supported classification,
verified execution and final qualification. Zero picks remain valid when final
gates do not pass. Full live 500-candidate acquisition validation, strict execution
proof recovery and prospective edge measurement remain outstanding.

Discovery universe-ledger reporting also labels selected deep-queue entries
`finalQualified` without actual final-selection proof. This separately confirmed
reporting defect is outstanding; discovery promotion must not be interpreted as
final qualification. The canonical final funnel and FULL_SCAN microscope remain
the decision counters, not that discovery-only ledger field.
