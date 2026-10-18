# Provider Capability And Buyer Evidence Truth

## October 18 Wide-Report Proof Priority

The first clean wide run at 519ed0da, scan_1792307803689, reached 10000
discovery candidates and evaluated 1420 standard / 135 deep candidates,
with 1285 deferred before deep. It measured 92% core / 90% advisory coverage,
zero core-starved/partial and 135 advisory-gap candidates. Final proof remained
DATA_DEGRADED: 134 unresolved, zero verified routes/qualified, 23 safety gaps,
seven tax gaps and one authority gap. The previous smaller 53c110a7 run had
50 authority gaps across 112 deep candidates. These are different live
universes, not a controlled before/after profitability comparison.

The wide run exposed a further report-only defect: at the 22535-character
per-project budget, report.json retained verbose derived output but omitted
the real AGENT wallet sample/proof and recovery batch summary. The earlier
writer regression used a small universe and did not exercise this budget.
JSON serialization now puts exact identities, final states, raw proof and
provenance before verbose derived output, with batchSummary first within a
recovery receipt. Existing depth, key, node, string, total and per-project
limits remain unchanged, and truncation remains explicit. A 1420-project
regression using the actual budget fails before repair and passes after it,
including source/event times, UNKNOWN/false semantics, nonmutation and batch
metrics. No absent raw observation is synthesized.

During test development, the new harness initially supplied reportsDir in
the wrong writer argument, and a subsequent direct run exposed two existing
JSON tests that also defaulted to the live report directory. Only the report
file they overwrote was restored from the already completed wide-run archive,
not relabeled or regenerated. Its archive/restored SHA-256 matches exactly:
50dbfe9c9409a28b9a91944e338df50595bffb047da3579f44f0f5be8f1355b0.
The harness and both older tests now use disposable OS directories. The
incidents and both regression logs are preserved; subsequent validation must
prove that live artifacts remain unchanged. Full tests continue through the
canonical artifact-isolating wrapper.

The local quote diagnostic spent the last reserved LI.FI request of the
existing allowance and returned HTTP429, with provider retryAt
2026-10-18T08:37:33.361Z. Local accounting conservatively permits no further
quote requests until 2026-10-18T08:39:19.615Z; no reset or alternate egress was
used. All missing pool/quote proof remains UNKNOWN. This reporting repair
does not make the scanner deploy-ready or establish profitable edge.

The repaired wide-report layer passes 1810 full tests with zero failures,
skips or cancellations, 929 JavaScript syntax checks, entrypoint typecheck,
21 load tests and 15 focused report tests. All 217 runtime files retain their
hashes and file set after the full suite and load command, including the
restored wide report. Source-pinned production proof retention must still be
checked at the real wide-run size, rather than inferred from small reports.

## October 18 Final Decision Acquisition Repair

The next audit found two concrete acquisition defects beyond raw core-input
coverage. First, standalone quote recovery treated LI.FI's successful two-way
quotes as ROUTE_RECOVERED even without the required pool attestation. That
stopped adapter fallback before the stricter active-evidence layer rejected
the route. Unattested pools now remain explicitly unverified, do not increment
recovered-route counts or overwrite canonical proof, and allow the next
configured adapter to run within the same budget. An exactly attested first
adapter still avoids unnecessary fallback. 0x can no longer copy the requested
pool into its output as if the provider observed it; both responses must
attest it. Shared direct-quote validation independently checks Jupiter/0x
token identities, chain compatibility and bounded positive atomic quantities.
Input quantities cannot substitute for missing output quantities. Existing
positive Jupiter fixtures now carry the actual requested mint/amount fields.
Missing, malformed or underflowed impacts remain UNKNOWN in standalone and
active paths; the two measured 0x leg impacts are conservatively combined,
not replaced by their maximum. This is not an all-in fee or profit claim.

Second, the completed 53c110a7 scan still had 50 TOKEN_AUTHORITY gaps, but all
50 affected Solana candidates requested only wallet/holder fields. The planner
now schedules a fresh raw mint-authority request with an explicit paired-proof
requirement, using the existing chain RPC collector, bounded selected Wave2
candidates and shared budgets. Current conclusive rejections, conflicting
identities, deferred candidates and inapplicable EVM semantics do not create
these requests. A lone scalar, incomplete pair or RugCheck-only report cannot
satisfy this request. Actual changed security patches trigger dependent
reruns even when no requested scalar can be proven; unchanged patches do not.
No derived safety status or pass flag is recovered from an external provider.

The reused Solana collector now independently verifies mainnet genesis and an
initialized parsed SPL mint, including both explicit authorities, then checks
the time of that account's confirmed context slot on the same endpoint. It
tries at most two existing configured/public endpoints, never mixes their
proofs, and rejects missing/stale/future time, malformed supplied identities,
wrong clusters and incomplete authorities. Source time is the observed slot
time, not the fetch receipt. The RPC contracts are documented in the official
[account reference](https://solana.com/docs/rpc/http/getaccountinfo),
[block time reference](https://solana.com/docs/rpc/http/getblocktime), and
[cluster genesis reference](https://solana.com/docs/rpc/http/getgenesishash).
Each actual RPC/HTTP method uses the active budget and endpoint circuit;
partial provider success cannot conceal the RPC's failure circuit. Expired
queued work cannot begin a new HTTP request. Unreported security booleans no
longer become clean false values merely because a provider family is capable.

A real, non-production executor probe for exact mint
3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL used four actual requests:
getGenesisHash, getAccountInfo, getBlockTime, and the existing RugCheck report.
At confirmed slot 458346827 / 2026-10-18T07:10:47Z, the SPL Token-2022 mint
and freeze authorities were both explicitly null. The normalized observation
retained that timestamp and mainnet provenance; no quote, buyer, smart-wallet,
execution-ready or final-qualified result was inferred. This probe ran on
uncommitted repairs based on 53c110a7, so it is acquisition evidence, not a
clean source-pinned production scan. New live scanning must validate the
scanner-wide result independently and preserve UNKNOWN for failed reads.

Six of seven new adapter regressions failed before the repair, all four new
snapshot cases failed before the collector repair, and the two additional
deadline/impact regressions also reproduced failures. The final focused
recovery/security/quote set passes 91 tests. The first integrated run passed
1807 tests; the final integrated run, syntax checks and load validation are
recorded below after the last guards. No provider or safety gate was waived.

Final integrated validation passes 1809 tests with zero failures, skips or
cancellations; all 929 JavaScript files pass syntax checks and the entrypoint
typecheck passes. The last two guard edits were followed by direct syntax
checks of all four affected files and the final full suite. The focused set
passes 91 tests and the load command passes 21, including the existing
500-deep / 3500-deferred deterministic fixture. All 217 runtime files preserve
their hashes and original set after both full test runs, the no-cache live
probe and load validation. Fresh production scanning and exact-head GitHub CI
must still be evaluated independently; no deploy-readiness claim is made.

For edge research, this layer removes a selection/measurement blind spot; it
does not establish alpha. The existing frozen arrival/vacuum and seller
replenishment comparisons still need exact executable cost observations and
matched out-of-sample outcomes. Authority completeness must be measured as
a coverage variable, never converted into a bullish signal or a required pick.

## October 18 Field-Level Source Attribution

The completed live run scan_1792305291363 at d9022267 records matching start/end
commit identities and SOURCE_VERSION_STABLE. It discovered 2000 candidates,
evaluated 276 standard / 117 deep, deferred 159 before deep, and measured 91%
core / 90% advisory coverage with zero core-starved candidates. All 117 still
have advisory gaps. Recovery selected 48/102/35 candidates across the three
waves and used 114/2000 provider request units without deadline exhaustion.
It recovered 252 wallet, 186 deployer, 255 security, three identity and three
market fields. The engine audit executed all 205 engines (51 standalone) and
changed only its four intended outputs; all 212 other runtime files retained
their hashes. Report contracts passed, but final readiness and scanner smoke
failed honestly: 115 candidates still lack conclusive final proof, with zero
verified routes or qualified candidates. This is DATA_DEGRADED, not NO_EDGE_FOUND.

LI.FI was enabled for this run: 69 actual requests, 62 HTTP successes, no rate
limits or budget overrun. Twenty-eight candidate quote pairs did not attest
the required exact pool; seven candidates had no usable provider route.
Successful chain/token quotes are not exact-pool execution proof. No router
address or requested pool was substituted for provider attestation. Current-head
Node22 and Production Verification passed; Node24 passed install, syntax and
unit tests but failed its live readiness smoke. These findings do not justify
waiving a gate or a claim of deploy readiness or profitable edge.

The actual AGENT report now retains the exact Solana mint/pool, wallet sample,
normalized transaction, original 2026-10-17T09:45:01Z event, separately pinned
2026-10-18T06:37:30Z sample head and currentHoldingVerified:false. Manual
inspection exposed another real defect: raw field provenance correctly named
solana-rpc-wallets, but canonical alias provenance credited the project's
DexScreener discovery source. Alias candidate attribution now uses its own
field-level observation source before discovery/provider defaults, and applies
that provider's existing semantic validation. This also prevents protocol TVL
from inheriting a market provider's liquidity semantics. Four of five new
regressions failed before repair; the repaired focused alias set passes 26.
Missing/malformed source metadata still uses the existing fallback. No wallet
classification, safety gate or positive observation is manufactured.

Integrated validation of the field-source repair passes 1776 tests with no
failures/skips/cancellations, 925 JavaScript syntax checks, entrypoint syntax
and 21 load tests. The final five source-attribution regressions also pass
after strengthening the explicit rejected-TVL assertion. The d9022267 live
reports are preserved outside the checkout as cli-d902-live-reports-20261018.tar.gz
(SHA-256 f9544b5c4b6659944776c22f9742970d2352faffaba3a43cf65f3936a1d6d73f).

## October 18 Quote Money And Proof Retention

The next audit reproduced a genuine quote-money defect without provider calls:
coercible arrays/booleans could become zero gas, positive notional, or one
decimal. Five of six new numeric regression cases failed before repair.
LI.FI now accepts only finite decimal numbers/text for money and decimal
metadata, rejects nonzero decimal strings that underflow to zero, and requires
bounded unsigned uint256 decimal strings for atomic quote quantities. Both
legacy recovery and forward quote capture share this identity/amount validator.
An optional estimate input must agree with the actual action input; malformed
output quantities cannot attest a quote. A positive notional rounding to zero
atomic units cannot initiate a quote. Explicit observed zero and existing
empty observed fee lists retain their meaning; unknown fees remain unknown.
No quote, fee, route, pool, safety or qualification gate is weakened.

The generic report compactor previously discarded the recovered Solana wallet
list, alias provenance and raw normalized RPC proof while retaining names of
recovered fields. It now retains bounded normalized wallet samples and
provenance across the existing wallet sources, including exact mint/pool,
original observation/event timestamps, confidence, validation status, sampled
coverage and UNKNOWN/false semantics. Shared sample references no longer
erase a later proof branch. Existing absolute depth, string, array and object
bounds remain; unbounded raw provider bodies are not admitted. Tests cover
the real executor shape, key pressure, enormous samples, nonmutation, conflicts,
and the actual JSON writer after both serialization passes. A historical owner
whose final balance is zero remains historical participation, not a current
holder, buyer, EOA, smart wallet or execution proof.

The local codeCommitSha:null finding was reclassified after source inspection:
the existing resolver deliberately refuses a dirty checkout, and preserved
untracked generated folders made it dirty. That safeguard is retained. The
215 original preserved file hashes were unchanged; a distinct additional
universe-ledger copy had materialized. Both directories, all 216 files and a
fresh preservation manifest were retained outside the Git checkout at
../cli-preserved-runtime-copies-20261018-0612, with identical before/after
hashes. Nothing was discarded or merged into live memory. The initial archive
attempt stopped without changes when the extra file was detected. Existing
canonical data/reports were untouched. Old null headers were not retroactively
relabeled with a commit.

Provenance lookup now supports isolated cwd/environment testing without
changing its dirty/untracked/no-Git policy. The scanner also records source
state at start and end: codeCommitSha is present only when both resolved
versions match. A source change, dirty state or unavailable identity cannot
label the run with a later commit; explicit diagnostic start/end/status fields
explain the uncertainty. Real temporary-Git tests cover clean, dirty,
untracked, unavailable and commit-changed-during-run cases. No bypass of the
clean-source requirement was added.

Integrated validation passes 1771 tests without failures, skips or cancellations,
924 JavaScript syntax checks and entrypoint syntax/typecheck; 21 load tests
pass, including the 500-deep / 3500-deferred deterministic fixture. The final
focused cost/provenance/report set passes 29 tests and the provenance-only
wording follow-up passes five. Fresh npm ci reports zero vulnerabilities.
All 216 canonical runtime files retain identical hashes and file sets after
the full tests/load sequence. These are code/integrity checks, not evidence
of profitable edge or successful live pool-attested execution.

The prior run scan_1792302847311 used tracked source at b6ae9e17 and achieved
0/113 core-starved, 91% core / 90% advisory coverage, but its strict artifact
commit metadata remained null and final health remained DATA_DEGRADED. It is
not retroactively claimed as provenance-complete or a profitable edge.

## October 18 Solana Transaction-Owner Recovery

Fresh exact-token inspection of the last Solana wallet gap confirmed that
RugCheck lists seven accounts, but only the pool-owned account has positive
balance. Six zero-balance accounts are not current holder proof. Largest-account
RPC calls were unavailable, but that did not mean every existing RPC method
was unavailable: both configured public endpoints returned exact pool
signatures. Reading one listed transaction with maxSupportedTransactionVersion
0 failed -32015; the same transaction was returned with version 1.
The current [official Solana version guide](https://solana.com/docs/core/transactions/versioned-transactions)
requires integer 1 for v1 transaction reads. The existing native program
collector's version ceiling is now updated too, preserving exact parsed
instruction identity rather than guessing mint/pool account order.

The wallet executor now has a selected, bounded Solana RPC fallback after
usable RugCheck owner samples are exhausted. Each endpoint independently
verifies mainnet genesis, a confirmed slot and its fresh nonfuture block time,
then requests at most four signatures by default (hard cap six). Every actual
RPC method uses the shared request budget, deadline and endpoint circuit;
transaction requests opt into v1. Unknown/failed/foreign transactions,
conflicting or malformed identities, duplicate account indices, missing
balances, mismatched owners and programs, future/old events and stale heads
cannot create observations. A proven pool-owned exact-mint balance change
and a separate nonzero owner balance change are both required.

Raw output is wallets / walletTransactions / walletParticipationHistory with
per-event slot, signature, original timestamp, mint, pool, token account,
owner and exact before/after raw amounts. The sample observation timestamp
is its freshly verified confirmed head; each historical event keeps its own
older timestamp. Provenance explicitly distinguishes the sample head from
individual trade time and does not claim current holdings, EOAs, buyers,
swaps, USD flows, smart labels, creator roles or execution proof. Missing
balances are never assumed zero. Historical nonzero change into a zero final
balance is participation evidence, not a claim of a positive current holder.
The EVM-only persistent transfer ledger is no longer advertised on Solana
or allowed to strip this newly collected Solana history from executor output.
No new external provider or dependency is added.

An actual executor probe for exact mint
3HLhtXNCVh1VbCrpwACoZWwHoNeoCB7hRAPcYN2jjUiL and pool
DN5Eq6ELcvUcC69VNbNW5pNbnt3bvtVGfHpBWb8pAcoF used seven request units
(one RugCheck plus six RPC methods). It recovered one transaction-owner
sample, preserving its original 2026-10-17T09:45:01Z event time and a separately
verified 2026-10-18T05:45:04Z sample head. Organic-buyer, wallet-cluster and
smart-wallet scores all remained null. This probe ran on the dirty working
tree based on 021bb529, not a clean source-pinned scanner run; it does not by
itself establish scanner-wide zero starvation or final qualification.

The other prior gap, BSC RWA, recovered real holders in one existing GoPlus
request after the actual cooldown expired. It also reported sell restrictions,
blacklist controls and mint risk; hydration is not approval of the token.
That real sample exposed a conventional dead-address entry leaking into
generic wallets. A shared conservative EVM participant filter now excludes
zero/dead sinks and token/pool contracts across GoPlus, Blockscout and RPC.
Raw holder inventory and transfer endpoints are retained. Zero or unproven
transfer amounts cannot invent participants, and explorer raw amounts remain
exact independently of display-decimal availability. These changes strengthen
truthfulness rather than count unknown evidence as favorable.

Integrated validation passes 1749 tests with no failures/skips/cancellations,
921 JavaScript syntax checks (with changed files rechecked after the final
edits), entrypoint syntax/typecheck, and 21 load tests. The focused final
Solana/buyer/participant set passes 69 tests. All 215 live runtime files retain
their hashes and original file set after full tests/load. The first full run
exposed an old generic source-list expectation; it now explicitly verifies
unchanged EVM providers and the new chain-specific Solana RPC capability,
including rejection of the unavailable Solana persistent ledger. No check was
disabled. Clean production-style validation and fresh CI are still required.

## October 18 Native CI Runtime Repair

CI run 39099424362 at 5503ece9597338ba85f1feb80062cd671dbd0a1c
passed unit tests but aborted inside better-sqlite3 Statement cleanup during
the scanner's Capital Flow Observation stage. This was before the isolated
engine audit, not an audit-worker shutdown. The runner selected cached Node
24.21.0 despite Node 24.22.0 having been released on October 14.

The upstream ObjectWrap cleanup regression is documented in
[Node issue 65446](https://github.com/nodejs/node/issues/65446). The released
[Node 24.22.0](https://github.com/nodejs/node/releases/tag/v24.22.0) contains
cleanup registry fix abe1b673e9b12588abcb6d74b0facedf6a3136dd; GitHub's
commit comparison confirms it is an ancestor of that release. Every workflow
using Node 24 now requires ^24.22.0 and resolves the latest matching release,
rather than accepting the runner's older cached runtime. Node22/24 CI check
names, both test matrix entries, scanner smoke, and live readiness gates are
unchanged. No dependency or test gate is removed. An allocation-driven native
SQLite cleanup regression test keeps the connection alive while 40,000
temporary statements become collectible and then checks database integrity.
Workflow contracts guard the runtime floor and unchanged smoke invocation.

Independent reproduction used official macOS x64 Node 24.21.0 and 24.22.0
archives, each verified against its official distribution SHA256 listing.
The fixture addon was rebuilt against 24.21.0 headers (build/config.gypi
confirmed that header directory). The same addon and test aborted on 24.21.0
with RemoveEnvironmentCleanupHook's env-null assertion, then passed on
24.22.0 without rebuilding or changing the test. The first prebuilt-addon
attempt did not reproduce the bug; the affected-header rebuild did. This is
an actual before/after runtime reproduction, not a claim based only on retry.
The full isolated project suite passes 1717 tests, all 917 JavaScript files
pass syntax checks, entrypoint syntax/typecheck passes, and the load suite
passes 21 tests; all 17 workflow YAML files parse. All 215 runtime files remain byte-for-byte
unchanged after full tests/load. Fresh remote CI is still required and live
readiness remains an independent, unchanged gate.

## October 18 GoPlus Live Validation

The clean production-style scan scan_1792300021876 at
5503ece9597338ba85f1feb80062cd671dbd0a1c accepted 2000 discovered candidates,
with 277 standard / 116 deep / 161 deferred. It achieved 91% core / 90%
advisory coverage, 114 core-ready / zero partial / two core-starved (1.72%).
Before this layer, six of 117 deep candidates were core-starved (5.13%).
These are separate live universes, not a controlled benchmark.

Recovery attempted 98 candidates and recovered fields for 97, with wave
counts 47/98/34 and 26 of 2000 request units used. Recovered field counts:
IDENTITY3 / MARKET3 / WALLETS235 / DEPLOYER203 / SECURITY236. Unresolved
attempted fields: MARKET2 / DEPLOYER93 / EXECUTION136 / WALLETS4. No request
was skipped because of the shared deadline. The two remaining core wallet
gaps are an unresolvable Solana owner sample and a BSC GoPlus cooldown;
neither was converted to positive evidence. Deferred candidates are excluded.

Verified routes and fully qualified candidates both remain zero. LI.FI was
explicitly disabled for this local run because its prior real 70-request
keyless allowance was still cooling down; 0x lacked its optional key. Thus
this scan made zero quote HTTP requests and is not execution verification.
Report contracts passed and the engine manifest is COMPLETE. The full audit
passed 205 engines (51 standalone) while all 211 non-audit live artifacts
retained their hashes. The three previously contaminated advisory reports
each analyzed 277 real inputs. Readiness refresh and scanner smoke still
failed DATA_DEGRADED because final decision proof was missing. No edge or
deployment readiness is claimed by improved core input coverage alone.

## October 18 GoPlus Wallet Acquisition

Inspection of scan_1792298173233 at 467c081d9c8aad4c3d0d7912e3f9edc6588c5429
found another genuine acquisition omission: wallet-only gaps went to explorer
and RPC recovery but never requested the already-supported GoPlus holder
payload when creator/source evidence was already known. A quiet BSC token had
no participants in either the 256-block scanner window or a bounded 1000-block
probe, but a fresh exact-token GoPlus request returned 7269 reported holders
and ten listed holder addresses. The unchanged zero-seed balance probe was not
proof that the token had no holders.

The wallet source registry and executor now offer GoPlus for raw EVM wallet/
holder addresses on its seven already-supported chains. The cheap one-request
holder path precedes explorer/RPC recovery for selected hydration candidates.
Exact identity, response verification, original timestamp, confidence and
sample-coverage gates are reused. Sufficient local or newly acquired evidence
avoids redundant later requests. Unsupported transaction/smart-label requests
and Solana/unsupported EVM chains do not use this path. Every actual GoPlus
operation shares the existing request budget, global limiter/cooldown, deadline
and provider circuit. Explicit GoPlus wallet opt-out and custom wallet/RPC
provider injection remain usable.

Holder acquisition completes before dependent security recovery so genuine
risks in the same payload survive into security recomputation and do not get
overwritten by an older source-only summary. It never sets final execution or
qualification. Raw owner samples are explicitly provider-reported, not fresh
chain snapshots or proven EOAs; transaction counts, independent buyers and
smart-wallet labels are not manufactured.

A specialist repaired zero/negative/malformed holder-balance acceptance while
preserving optional provider-listed-holder semantics. Integrating safety
companions also exposed unsafe numeric/boolean coercion: nonprimitive flags
and malformed taxes/counts could become favorable false/zero values. GoPlus
now requires binary flags, nonnegative decimal tax fractions within [0,1],
safe integer holder counts and consistent raw/normalized companion values.
Missing or invalid safety checks remain unknown. Explicit observed zero tax
and 0.01 -> 1% conversion remain supported. These integrity changes are not
relaxed gates or positive defaults.

The initial wallet-only regression set failed six of eight tests on the old
code. The integrated wallet/security/limiter/RPC focused suite passes 87 tests.
A bounded actual-executor capability probe of one exact previously starved BSC
contract recovered ten holder addresses and nine non-pool participant addresses
in one request, including applicable raw safety companions. It used cache-off
and history-off settings, persisted nothing, and did not prove scanner-wide
coverage or an edge. An independent indexed sample supplied two address query
seeds; five real existing-RPC methods proved positive balanceOf values for both
at one exact canonical block hash. No indexer profit/buy/sell tags were promoted,
and no new paid/indexer dependency was added to the production scanner.

The remaining Solana sample reports only the pool itself as a holder owner,
which is correctly excluded from generic wallets. Fresh capability probes
verified mainnet genesis at both existing public endpoints, but actual holder
enumeration still failed HTTP403/429. This limitation is not repaired by symbol
matching or EVM-style creator/tax inference. The method returns token accounts,
not automatically wallet owners: [Solana getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts).

Final integrated code validation: 1715/1715 tests pass with zero failures or
skips, 916 JavaScript files pass syntax checks, entrypoint syntax/typecheck and
21 load tests pass. Fresh npm ci reports zero vulnerabilities. All 215 live
runtime files retain their original hashes and identical file set after the
full suite and separate load command. This does not prove complete live
acquisition, exact execution routes, profitable edge, or deployment readiness.

## October 18 Bounded Wallet Endpoint Recovery

The latest clean production-style scan before this layer is
scan_1792296821703 at c34132799e076a1171c528b8921ca7180c936ddf. It evaluated
277 standard / 115 deep / 162 deferred candidates, with 91% core / 89% advisory
input coverage, 109 core-ready / zero partial / six core-starved candidates.
Recovery attempted 96 candidates, selected 48/96/36 waves and spent 124/2000
request units without deadline skips. Recovered fields were DEPLOYER211 /
SECURITY188 / WALLETS215; unresolved attempted fields DEPLOYER97 /
EXECUTION144 / WALLETS12. It made 70 actual execution HTTP requests and accepted
zero routes. LI.FI reported 28 identity/pool-unattested outcomes and eight
provider failures; its 70-request local keyless allowance was respected.
The 0x fallback reported eight missing-key outcomes. One candidate was
conclusively rejected and 114 retained unresolved final-decision proof.

Each of the three previously contaminated advisory reports was regenerated
from 277 real pipeline inputs, without the synthetic Engine Audit Sample.
The repaired full audit passed all 205 engines (51 standalone), and a full
before/after digest found all 211 non-audit data/report files unchanged.
Only the four intended audit summaries were excluded. Report contracts passed,
manifest COMPLETE; readiness refresh and scanner smoke still failed correctly
with DATA_DEGRADED. Exact-head CI passed Node22 and Production Verification,
but Node24 failed at live readiness. This is not deployment or edge proof.

The new wallet recovery layer fixes an unused existing capability: the
connector selected only the first configured RPC URL, even though native
configuration already supplies a secondary Base endpoint. It now tries at
most two distinct configured/existing endpoints, after transport failure or an
unhealthy stale head.
Each attempt re-verifies the exact chain and restarts the complete pinned
observation; results from different endpoints are never combined. Empty logs,
malformed observations and proven zero balances do not trigger opportunistic
sampling. Failed balance transports may retry a new complete observation, but
cannot manufacture ownership. Explicit endpoints and public-fallback opt-out
are preserved. Every real method remains charged to the shared request budget
and deadline, with endpoint-scoped circuits for multi-endpoint recovery.
Endpoint provenance uses a SHA-256 identifier, not a credential-bearing URL.

A further offline reproduction accepted a node head dated 1970 as current
EVIDENCE_AVAILABLE. Wallet snapshots now require a valid observation clock and
a head no more than 300 seconds old by default (the positive safe-integer
`walletRpcMaxHeadAgeSeconds` option can set the bound). Stale heads are rejected
before transfer or balance requests and may use the existing fresh fallback.
Historical fixture heads were made current while preserving the exact block,
balance, request-budget and original provenance assertions. The dedicated
regression proves stale heads cannot promote wallets; source timestamps are
never refreshed to conceal old observations. The integrated wallet/history
suite now passes 82 tests after this repair.

Final integrated validation for this layer: npm ci succeeds with zero reported
vulnerabilities; all 1693 tests pass without failures or skips, all 913
JavaScript files pass syntax validation, the entrypoint syntax/typecheck passes,
and all 21 load tests pass. Hashes and file sets for all 215 runtime artifacts
remain unchanged after the complete suite and the separate load command.
These checks do not establish final live proof or authorize a red PR to merge.

The initial nine endpoint regressions failed eight assertions on the old code.
The repaired endpoint/holder suite passes 28 tests, including independent
fallback chain verification, pinned balance hashes, strict two-endpoint caps,
global budgets, circuit independence and deadline exhaustion. A bounded live
capability probe of one previously starved exact Base token recovered raw
participation from two addresses in three RPC calls. The primary endpoint had
recovered by probe time, so this establishes current source capability, not
live failover or full-scanner improvement. It persisted no evidence and
verified no daily buyers, smart wallets, final execution or profitable edge.

The wallet-evidence specialist also reproduced unsafe explorer normalization:
missing/conflicting transfer token identities, invalid holder addresses or
reported balances, coerced amounts/counts, invalid/future times and malformed
pagination could survive as usable observations. The connector now rejects
conflicting identities and malformed rows, uses strict unsigned-unit/count
parsing, leaves unknown quantities null, and requires valid ordered coverage
before reporting a complete day. Twenty-four new offline regressions pass.
Transfers remain transfers, not swaps, independently funded buyers or smart
wallets. This integrity repair may correctly remove malformed evidence rather
than cosmetically raise availability. The integrated explorer/RPC suite passes
65 tests with no failures or skips.

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

### Quiet-Token Holders And Native Creator Receipts

The remaining core-starved live tokens had real deployed code but no observed
transfers in the bounded recent RPC window. A quiet window does not prove that
a token has no holders. RPC recovery now optionally checks at most two known
account seeds (hard maximum three), using exact-token balanceOf at the pinned
block. Only positive, well-formed balances become raw holder samples. Address
labels alone, zero balances, malformed responses and failed calls prove nothing.
Samples preserve block number/hash/time and raw integer balances, with account
type and role UNKNOWN. They do not establish a holder census, trade activity,
daily buyers, smart-wallet labels or bullish scores. Invalid lookback settings
are rejected before RPC rather than accidentally expanding to genesis.

Default wallet recovery now accounts for each actual chain/block/log/balance RPC
method against the shared request budget, deadline and chain circuit. Explicitly
injecting that same default connector cannot bypass accounting. Response time
does not replace the pinned block's source time. A one-block capability probe,
explicitly not a production scan, verified a positive Base BASE-token holder
sample at block 52750865 using seven total provider request units. It recovered
only wallets and holderAddresses; it did not qualify the token.
A second live capability probe at block 52751411 used four actual RPC methods
and verified the same positive balance with canonical block-hash pinning.
Missing or invalid hashes prevent balance probing; there is no silent fallback
to an unpinned call. A separate two-block live deployment probe completed four
requests with no creations, a valid empty observation rather than fabricated
creator evidence. Neither probe persisted data or established full-scan coverage.

The configured RPC-only generic deployment lane previously used a factory-log
adapter that required an absent factory/topic. A dedicated bounded full-block
and receipt collector now records only successful exact top-level creations.
Defaults cap collection at four blocks, sixteen receipts, thirty-two requests
and eight seconds. Chain, transaction, receipt, block and sender identities must
agree; incomplete blocks cannot advance checkpoints. Factory/internal CREATE
senders are not inferred. Generic CONTRACT_DEPLOYED records remain quarantined,
unfinalized raw evidence, never token/pool candidates or verified safety proof.
Stored exact receipts can hydrate creator aliases and deployment metadata with
zero network budget. Missing, conflicting, foreign or future metadata is rejected.
No wallet age, prior deployment count, token certification or safety is invented.

Native evidence storage now fails closed on corrupt or wrong-shaped existing
JSON instead of silently replacing it with an empty ledger. Writes use the
existing atomic replacement helper; failed replacement preserves prior bytes.
Unrelated user checkouts, existing records, safety gates and trading settings
are not changed. These repairs do not clear external provider quotas or establish
working two-way quotes. Full integrated validation and a fresh source-pinned
production-style scan must be evaluated separately from capability probes.

The integrated repair suite passes 1620 tests with zero failures, skips or
cancellations. All 905 JavaScript files pass the canonical syntax command;
the entrypoint syntax/typecheck and 21 load tests pass. Fifty focused new-layer
tests cover canonical hash pinning, per-method budgets, quiet-token UNKNOWN
semantics, exact creator reuse, bounded receipt collection and evidence-store
integrity. The specialist's independent scoped review found no further blocker
in the generic collector/helper. These code results are not production readiness
or proof that external services can supply missing final decision evidence.

Fresh production-style scan scan_1792292524266 at exact code revision
86e9b9272027f0b232cd0de9acb61a01097838e8 targeted 2000 discovery, 1000 standard
and 500 deep candidates. Its observed universe was 283 standard / 119 deep /
164 deferred, not live 500-deep proof. Core/advisory input coverage was 91%/89%,
with 113 core-ready / 0 partial / 6 core-starved (5.04%). The preceding clean
523c72a7 run had 117 deep / 163 deferred, 91%/89% coverage and 9 core-starved
(7.69%). Different universes, cache warmth and provider conditions preclude a
controlled performance or cost attribution. All six remaining severe core gaps
were wallet/holder raw inputs; the new probe cannot invent addresses or trades.

Recovery attempted 101 candidates, selected waves 49/101/36 and used 69/2000
provider request units without deadline skips. Recovered field counts were
IDENTITY3 / MARKET3 / WALLETS225 / DEPLOYER211 / SECURITY188; unresolved attempted
fields were MARKET2 / DEPLOYER97 / EXECUTION144 / WALLETS12. Twelve fixed-identity
deferrals remained visible. LI.FI was disabled only locally to respect its prior
cooldown, and 0x reported its missing optional key for all 36 execution plans.
Zero quote HTTP requests, zero accepted routes and zero qualified picks were
reported honestly. One candidate was conclusively rejected; 118 still lacked
final decision proof. Overlapping gaps were BUY_QUOTE118 / SELL_QUOTE118 /
QUOTE_FRESHNESS118 / VERIFIED_SLIPPAGE84 / SAFETY85 / TOKEN_AUTHORITY53 /
TRANSFER_TAX21 / IDENTITY11 / ROUTE_DEPTH7. DATA_DEGRADED remains correct.

The full engine audit and report contracts passed; artifact manifest COMPLETE.
Readiness refresh and scanner smoke failed. The smaller canonical scan:smoke
also failed at readiness despite 42 deep candidates with zero core starvation.
The real pipeline trace confirms Utility Quality before FINAL readiness and
affected-family reruns, including Wallet Cluster100 and Deployer Reputation48.
Fresh GitHub checks at 86e9b927 passed build22 and Production Verification but
build24 failed live readiness (run39092048939). No unresolved review threads were
reported. PR56 remains open and unmerged; no failing check was weakened or skipped.

The subsequent documentation-only head ff280d9c exposed a real Node22 timer race
in an existing execution deadline regression. The HTTP signal was aborted, but
wall-clock rounding could leave timeBudgetExceeded false. A frozen-clock
regression reproduces this deterministically on the old code. Deadline-owned
timers now close the shared budget explicitly; later requests and in-flight
quote results cannot bypass that closed budget. Ordinary provider timeouts do
not masquerade as a shared deadline. Both new regressions preserve the original
real-time abort assertion rather than loosening it. The focused 47-test
execution/holder/starvation suite passes. The complete suite now passes 1622
tests with zero failures, skips or cancellations; all 905 JavaScript files pass
syntax checks, the entrypoint syntax/typecheck passes and 21 load tests pass.
The preceding live metrics remain pinned to 86e9b927, not this timer repair.
Subsequent exact-source live results and exact-head CI observations are retained
in PR56; a passing code suite does not clear its external readiness blockers.

### Audit Artifact Integrity And Research Experiments

A subsequent audit found another contamination path in engine:audit:full, not
the isolated test runner. The audit executed the synthetic Engine Audit Sample
and restored raw data, but replaced three live advisory reports with AUDIT rows:
asymmetric-edge-suite.json, ignition-twin.json and three-clock-edge.json. The
full pre-repair report directory is preserved in sibling directory
cli-engine-audit-contaminated-reports-20261018. Passing schemas and a complete
manifest did not detect those synthetic advisory rows. Earlier canonical funnel
measurements remain source-pinned, but these overwritten reports cannot be used
as evidence of real market coverage or a trading edge.

The public engine audit API and CLI now execute fixtures in a disposable worker
before engine imports capture data/report paths. Low-level fixture execution is
guarded against use in a live caller directory. API callers receive results
without fixture writes; the CLI builds only the three intended audit summaries
(including the whole-audit Markdown rendering) against real caller reports.
Worker failures retain diagnostics without replacing live evidence. Focused
tests preserve caller file hashes and reject accidental direct fixture execution.
The local HTML report now uses the canonical deep funnel for recovery counts,
separates verified routes from qualified picks, and rejects stale qualification
flags over current negative proof. Deferred and merely selected projects cannot
inflate recovery, route or qualification counts.

Research validity review reproduced duplicate-sample inflation, self-controls
through conflicting identity aliases, future observations, null-as-zero control
matching, stale same-scan controls and negative/unproven modeled costs. These
are synthetic counterexamples, not real profitable results. Missing or warming
evidence health must not permit a nominal verified label to advance research.
Sparse horizon snapshots do not prove intraperiod stop/target-touch order.
Frozen-cost returns are research estimates, not realized trading P&L.

The repaired research path deduplicates at storage and consumption boundaries,
rejects conflicting immutable content, canonicalizes supported chain identities,
and keeps Base-only episode applicability explicit. Symbol-only control fixtures
were replaced with deterministic exact contract identities; statistical,
purging, age, version and replication assertions remain active. Future and
invalid observations cannot inflate coverage. New episodes record actual
freeze time; materially delayed or legacy freezes and unproven/negative costs
cannot certify net evidence. Existing history is retained, not rewritten into
prospective proof. Sparse checkpoints have separate diagnostics; they cannot
establish actual stop/target-touch ordering. Nominal verified labels cannot
override UNKNOWN, warming or blocked health in research consumers.

Fresh npm ci passed with zero reported vulnerabilities. The integrated source
suite passes 1656 tests with zero failures, skips or cancellations; all 911
JavaScript files pass syntax validation, the entrypoint syntax/typecheck passes,
and 21 load tests pass. SHA-256 comparisons across all 215 protected runtime
files confirm the complete suite and direct load command leave original data
and reports byte-for-byte unchanged. Targeted integrated research/report/audit
tests pass 129 cases, with an additional malformed-price coverage regression
also passing. A preview generated from the actual saved 119-deep universe shows
118 recovery candidates, 164 deferred, 6 core-starved and zero verified routes;
it is not another production scan. Browser rendering of the local file was
unavailable under the tool URL policy, so no visual screenshot proof is claimed.
Clean production regeneration and exact-head CI observations are recorded in
PR56 separately; no passing code test establishes a profitable edge.

Three proposed experiments use existing frozen fields and remain research-only:

1. Arrival plus vacuum: test sixHourExpectedArrivalToIgnitionRatio >= 1 only
   when supplyVacuumSupported is actually true. Match same-window controls with
   observed weaker arrival and the same vacuum state. Primary outcome: matched
   24h return; falsify if held-out lift is nonpositive or the no-vacuum placebo
   performs equally well. Funding/approval/actual-buy evidence must remain
   distinct; missing arrival is not a negative observation.
2. Exhaustion plus replacement: test sellerExhaustionScore >= 60 jointly with
   buyerReplacementScore >= 60 against each mechanism alone, stratified by
   observed marginalSellerInventoryBurnPct. Primary outcome: incremental
   matched 72h return; falsify if the conjunction adds no held-out value.
   Transfer counts cannot stand in for resolved buyers or confirmed sells.
3. Pressure release plus convexity: test pressureWithoutMovement across
   predeclared liquidityConvexityIndex strata, matching liquidity, volume,
   regime and prior price change. Primary outcome: matched 24h return;
   falsify if the apparent lift disappears after those controls or costs.

Before collecting outcomes, freeze each definition, exact chain/token/pool,
entry time, exclusions, control recipe, primary horizon and all attempted variants.
Retain 6h/24h/72h/168h observations; missing observations stay UNKNOWN. Use unique
canonical projects and project-clustered uncertainty, then an untouched
chronological confirmation cohort. Costs without usable evidence permit gross
research only. Existing production gates and minimum verification requirements
are not lowered, and no strategy is automatically promoted. Record the complete
search history: choosing the best of many backtests can create false discoveries,
and an extensively reused holdout is not independent confirmation. See the
authors' [Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf).

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
