# Crypto Launch Intelligence Repair Handoff

Saved: 2026-08-10 (America/Phoenix)

## Final State

- Repository: `bilyeutaylor9-lang/Crypto-Launch-Intelligence`
- Audited base commit: `f7bc7811ea6d9e53c7b64ae0902de5efa42f6fb5`
- Repair branch: `agent/repair-data-starvation`
- Repair implementation commit: `06c9957`
- Final live verification run: `scan_1786418421464`
- Operating verdict: scanner completed, report/dashboard contracts passed, and
  actionable research output was produced.
- Decision verdict: `NO_VALID_MOVE_TODAY_RESEARCH_ONLY`. No candidate had enough
  independent wallet, buyer, utility, safety, and execution evidence for a
  qualified trade. The repair did not lower gates to manufacture a pick.

The important distinction is now explicit: this is a completed scan with useful
watch and recovery results, not an empty or failed pipeline.

## Final Live Results

The bounded `debug100` scan produced:

- 100 accepted discoveries from 1,731 deduplicated candidates; discovery target
  met with zero shortfall.
- 66 standard candidates, 63 deep-evaluated candidates, and 3 candidates
  explicitly deferred before deep evaluation.
- 133 of 158 profile-enabled engine stages successful, with zero failures,
  partial failures, or no-data runtime failures.
- 175 of 175 engine modules executed successfully in the full engine audit.
- 26 current watchtower alerts, including 1 high-severity alert.
- 3 daily watch candidates, 2 candidates needing one more proof, and 10
  identity/route-quarantined research candidates.
- 50 ranked recovery actions with a next proof, resolver, and bounded source
  plan instead of an empty recovery report.
- 26 execution-recovery candidates attempted and 5 routes recovered.
- 1 active evidence recovery. The exact DexScreener match for `READY` recovered
  chain, token, pool, price, liquidity, volume, market cap, FDV, and transaction
  counts with provider provenance. Smart-wallet history remained unknown.
- 0 final qualified trades, 3 deterministic blocks, and 60 deep candidates with
  insufficient evidence.
- Average deep evidence coverage: 57 percent.

Final system status is `DEGRADED`, not failed:

- Scan: `SCAN_COMPLETED`
- Engines: `OK`
- Whole-engine audit/runtime/contract coverage: `PASS`
- Reports: `PASS`
- Dashboard inputs: `DASHBOARD_INPUTS_READY`
- Route subsystem: `OK`
- Recovery: `RECOVERY_ACTIONS_READY`
- Candidate promotion: `ROUTE_PENDING_RESEARCH_AVAILABLE`
- Scanner semantic health: `INSUFFICIENT_EVIDENCE`

## What Was Broken

1. Active Evidence Recovery only copied fields already present. It did not call
   providers, so recovery could report activity without fetching evidence.
2. Final selection ran before post-evidence rescoring and was not restricted to
   the deep-evaluated funnel.
3. Deferred candidates were counted as deep insufficient-data failures.
4. Readiness treated derived outputs as provider gaps and routed wallet and
   deployer fields to unrelated market providers.
5. Generic `researchOnly` flags from capital migration and starvation rescue
   overwrote identity meaning. Live contract-resolved tokens were later treated
   as contractless entities, emptying daily results and watchtower alerts.
6. Exact provider matches retained only the requested field and discarded
   companion chain, pool, and market evidence from the same response.
7. Discovery-time missing fields remained in recovery reports after later
   enrichment resolved them.
8. Final execution proof applied EVM tax/simulation requirements to Solana and
   CEX routes and did not model aggregator routes correctly.
9. Canonical alias traversal could learn aliases from provenance and diagnostic
   containers instead of source data.
10. Report compaction could cap priority fields and strip evidence needed by
    dashboards and diagnostics.
11. Supabase reads were all-or-nothing and did not handle optional table failure,
    transient JWT clock skew, or a separate server-key fallback cleanly.
12. GitHub Pages could evaluate health before publishing the current artifacts,
    leaving an old green dashboard after a current degraded scan.
13. Learning/native checkpoints were not restored and saved across ephemeral
    Actions runners.
14. Queue-only crawler and inactive native discovery could report misleadingly
    healthy states.
15. The EVM native factory connector passed an empty supplied-log array and
    silently suppressed live RPC polling.

## Repair Implemented

### Evidence and Funnel

- Added bounded asynchronous provider recovery with concurrency limits, request
  budgets, per-call timeouts, and per-scan circuit breakers.
- Added exact DexScreener token/pool lookup, strict one-identity symbol recovery,
  exact CoinGecko/CoinPaprika ID lookup, and free security recovery.
- Ambiguous symbol matches fail closed and cannot establish executable identity.
- Every recovered field carries source, source timestamp, confidence,
  verification status, and `recoveryRun: true`.
- Exact Dex matches retain all verified companion identity and market fields
  available in the response without spending another request.
- Recovered candidates rerun identity, source truth, liquidity, safety, route,
  execution proof, accessibility, provenance, sniper integrity, opportunity
  proof, and final scoring before final selection.
- Final scoring now precedes final selection. Readiness, starvation, value of
  information, and rescue are recomputed after the final decision state.
- Stable progressive identities preserve stage membership when recovery adds an
  address. Every candidate is marked `DEEP_EVALUATED` or
  `DEFERRED_BEFORE_DEEP`.

### Truth and Routing

- Added authoritative live-token/entity classification so scoped research flags
  cannot demote a resolved token into entity-only research.
- Capital-migration and starvation-rescue research states are now namespaced and
  do not overwrite route/identity truth in the pipeline.
- Wallet, deployer, identity, security, route, and market field families route to
  their real producer/source families. Derived gaps request recomputation, not a
  fake provider fetch.
- Stale discovery gaps are filtered against current evidence before generating
  daily recovery actions.
- Buyer acceleration routes to buyer evidence sources; it is no longer mistaken
  for a buy-quote request.
- Canonical alias resolution ignores provenance, audits, readiness plans, model
  diagnostics, and internal evidence containers.

### Route Safety

- EVM routes require verified transfer-tax evidence but no synthetic duplicate
  sell-simulation flag when a fresh verified sell quote exists.
- Solana routes use verified mint/freeze authority evidence and do not require
  EVM taxes.
- CEX routes use venue, market, access, and order-book evidence without requiring
  a token contract or pool.
- Aggregator routes can pass without a direct pool when the exact quote path is
  verified.
- Route readiness and final project readiness are separate; a recovered global
  route cannot bypass project safety or user-access review.

### Reports, Memory, and Operations

- Priority report fields are preserved before bounded nonpriority compaction.
- Source Truth, Alpha Dashboard, Scanner vNext, progressive diagnostics, and
  Watchtower receive full project truth where required.
- Active recovery receipts now populate `starvation-recovery-results.json` and
  agree with scanner semantic health.
- Daily capital and recovery reports expose live watches, proof-needed rows,
  quarantines, and exact next actions instead of classifying all live tokens as
  entities.
- Supabase memory supports table-level degraded reads, bounded JWT retry with
  jitter, separate server-key fallback, and nonsecret status summaries.
- The Pages workflow restores/saves bounded learning state, native events, and
  checkpoints; continues report publication after scan degradation; and applies
  the final truthful health verdict after deployment.
- Native adapters run with bounded concurrency, persist events/checkpoints, poll
  incrementally, and distinguish `INACTIVE` from successful event collection.
- Queue-only crawler reports `QUEUE_ONLY / NO_EVIDENCE_COLLECTED`.

## Verification

All final checks passed:

- `npm test`: 664 passed, 0 failed
- `npm run typecheck`: PASS
- `npm run lint`: PASS, 413 files checked
- `npm run engine:audit:full`: 175 engines executed, 0 unclassified modules,
  0 active stages missing contracts
- `npm run results:health`: PASS, 61 required report contracts checked
- `npm run smoke:scanner`: PASS, no findings
- `npm run scan:debug100`: PASS, live run completed
- `npm run system:readiness:refresh`: manifest `COMPLETE`, report contracts
  `PASS`, truthful readiness `DEGRADED`
- `git diff --check`: run again before commit/push

## Remaining External Limits

These are explicit evidence limitations, not hidden software failures:

- 10 of 27 registered source capabilities were available in the final report;
  9 working sources were free. Scanner blindness risk was `LOW`, while
  route-promotion blindness risk was `MEDIUM`.
- Wallet-history and qualified smart-wallet flow are still absent for most deep
  candidates. They require a wallet-history store, chain RPC indexing, or an
  equivalent verified wallet data source.
- Birdeye, Etherscan V2, Solscan, and 0x keys would improve Solana wallet data,
  EVM deployer/source proof, authority verification, and live EVM quotes.
- Binance and Bybit were region-blocked in this environment during verification.
- Supabase is optional and was disabled. Current-scan truth is unaffected, but
  remote learning continuity is unavailable until configured.
- Native discovery was `INACTIVE / NO_EVENTS_COLLECTED`: public RPC adapters were
  configured, but no qualifying events were collected in this bounded run and
  no private RPC endpoints were configured.
- The crawler intentionally stayed `QUEUE_ONLY / NO_EVIDENCE_COLLECTED`; 100+
  trusted URLs were queued for explicit controlled crawl commands.
- No candidate had enough independent evidence to justify a qualified trade.
  `NO_VALID_MOVE_TODAY` is therefore the correct result, while watchlists,
  alerts, recovered routes, and recovery actions remain useful outputs.

## Safety Invariants

- Unknown evidence remains unknown; missing values are never converted to zero
  or invented facts.
- No ambiguous symbol-only match can promote identity or execution readiness.
- Identity, honeypot, liquidity, safety, route, evidence-family, and final
  integrity gates remain fail-closed.
- Historical labels use only future observations relative to the prediction.
- No scanner score is converted into a synthetic outcome or backtest winner.
- Automatic trading remains disabled.
