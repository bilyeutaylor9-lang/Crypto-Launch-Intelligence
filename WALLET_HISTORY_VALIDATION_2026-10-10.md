# Raw Wallet History Recovery

## Root Causes And Repair

The source registry advertised wallet-history recovery, but the executor had no
durable readback. Its source-name matching also missed `wallet-history database`
because it only recognized the unhyphenated spelling.

Use the existing bounded append-only memory helper to retain exact EVM provider
transfer observations in `data/wallet-participation-history.jsonl`. Load the
bounded history once per recovery execution state, expose exact historical
participation through the actual wallet route, and preserve it in canonical
scanner state. History-only requests consume zero provider units. Fresh-count
requests still require their existing live evidence path.

Accepted observations require known provider, EVIDENCE_AVAILABLE status, exact
chain/token identity, valid transaction hash, addresses and original timestamps
or a validated RPC block range. RPC logs may retain null transaction timestamps;
the observation timestamp is never substituted for transaction time. Raw atomic
amounts and reported amounts are retained without asserting verified token units.
Unknown, mismatched, unsupported, malformed and future observations remain
unavailable. Stored transfers never manufacture swap classification, historical
USD value or smart-wallet labels. Duplicate observations retain their earliest
source time. Lower provider confidence is preserved, never increased by recovery.
Storage failure is reported without discarding valid live evidence.
The EVM store does not invent Solana evidence or creator semantics.

The registry now advertises only participation history from this source, not
qualified smart-wallet labels it cannot supply.

## Validation

- Full suite: 1389 tests passed; focused recovery suite: 75 tests passed.
- Fourteen new history regressions include restart readback, canonical bundle
  round-trip, identity rejection, unknown/future evidence, I/O failure and no
  fabricated fresh counts or labels.
- Twenty load tests passed; typecheck and diff checks passed.
- Canonical lint passed. An additional explicit syntax pass checked all 882
  source/test JavaScript files: zero failures. The canonical checker currently
  skips src/data and src/reports; that separate audit repair remains pending.

The 500-candidate deterministic component validation used injected raw histories,
not live market observations. Wave 2 selected exactly the top 150 VOI candidates;
all 150 recovered participation history and tracked WALLETS dependency changes.
External calls and provider units were zero; no fresh counts or bullish scores
were created. This is not a financial-edge or whole-scanner production claim.

A three-unit real Blockscout lookup for an exact Base token/pool from the
production artifact returned UNKNOWN. Zero history rows were persisted or
promoted, and no successful live-provider recovery is claimed from that sample.

## Completed Production Baseline

Live Dashboard run 38069766550 succeeded at main source
994dcd64e95e0ffe4cfd264699eadaf73f6061ab. Its COMPLETE artifact manifest and
system-readiness PASS were inspected. This source does not contain this new
history repair. It establishes the next production baseline:

| Metric | Value |
| --- | ---: |
| Standard candidates | 3669 |
| Deep evaluated | 500 |
| Deep deferred | 3169 |
| Core coverage | 92% |
| Advisory coverage | 88% |
| Core ready / partial / starved | 428 / 0 / 72 |
| Core-starved percentage | 14.4% |
| Advisory-gap candidates | 491 |
| Verified routes / fully qualified | 5 / 0 |
| Recovery attempted | 480 |
| Wave 1 / 2 / 3 selections | 480 / 150 / 0 |
| Provider units / budget | 1207 / 2000 |
| Deadline skips | 0 |
| Recovered DEPLOYER / SECURITY / WALLETS fields | 2233 / 120 / 26 |
| Unresolved DEPLOYER / WALLETS / MARKET fields | 430 / 600 / 28 |

Outcome: NO_EDGE_FOUND, with NO_FULLY_QUALIFIED_MOVE displayed rather than falsely
claiming no verified routes. The 72 core gaps all concern creator/deployer inputs:
56 BSC, nine Arbitrum and seven Base candidates.

Earlier completed production run 38061677547 had 212/500 core-starved candidates,
91% core coverage, 327 provider units used and 774 deadline skips. This is a
longitudinal comparison across different live universes and source revisions,
not a controlled attribution experiment. No production benefit from this new
history code is claimed before deployment and a fresh scan.

## Bounds And Remaining Limits

32 MiB append-only file retention; an 8 MiB / 5000-record read window; at most
200 transfers per snapshot and 1000 deduplicated historical events per candidate.
Existing scan waves, request caps, circuits and qualification gates are unchanged.
Historical participation is not fresh 24-hour demand, verified swaps, wallet
performance, finalized-chain proof or deployer reputation. Durable smart labels,
external creator gaps, live quote availability and the syntax-checker blind spot
remain separate audit work. Unknown evidence stays unknown; no picks are forced.
