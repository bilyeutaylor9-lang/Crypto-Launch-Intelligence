# Provider Capability And Buyer Evidence Truth

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
