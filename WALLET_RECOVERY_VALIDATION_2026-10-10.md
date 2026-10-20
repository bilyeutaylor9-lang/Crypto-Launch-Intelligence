# Wallet raw evidence recovery validation

## Confirmed defects

- Active wallet recovery executed only Blockscout despite registry support for
  existing chain RPC endpoints.
- A missing transfer response plus available holder evidence produced zero daily
  buyer/buy/sell counts. Missing observations are not measured zero activity.
- A paginated transfer sample was presented as complete 24-hour activity.
- Current token price multiplied by transfer amount was presented as measured
  historical USD trade volume.
- Explorer transport failures were not exposed to the provider circuit breaker.
- Recovered raw companion fields were discarded when the request targeted a
  wallet label or another field.

## Repairs and invariants

Missing, malformed, future-dated, wrong-token or incomplete transfer coverage
leaves daily activity unknown. A complete successful empty response remains
distinct from missing evidence and can prove zero observed activity. Current USD
valuation is explicitly estimated; historical trade volume remains null without
actual transaction price proof. Missing decimals cannot imply zero decimals.

The existing RPC resolver and JSON-RPC/ABI utilities now provide a fallback for
selected EVM candidates. Each invocation reserves three shared provider-budget
units and performs chain identity, latest block identity and bounded exact-token
Transfer log collection. Default lookback is 256 blocks, capped at 1,000 blocks;
responses above 5,000 logs are rejected. Wrong-chain, wrong-token, malformed or
out-of-range observations cannot be promoted. Removed logs are ignored and
duplicate transaction/log identities are deduplicated.

Actual raw wallet addresses, transaction hashes, block numbers, raw token amounts
and participation records retain source, timestamp, chain, contract, verification
status and observation-range provenance. The exact known pool, token and zero
address are excluded from RPC wallet participants. Other participants remain
unclassified; they are not certified independent humans or EOAs. Event timestamps
remain null where not observed. Transfers are not certified buys/sells, smart
wallets, complete daily totals or a holder census.

Fresh explorer participation avoids redundant RPC calls. Holder-only evidence
does not suppress a requested transaction recovery. Existing observed explorer
fields are preserved, rather than overwritten with a smaller RPC sample. Provider
failures remain visible and use existing chain-scoped circuit breakers. Custom
provider injection is retained. Recovery waves, shared budgets, timeouts,
dependent-engine reruns, identity and final qualification gates are unchanged.

## Live proof

The existing mainnet.base.org endpoint returned HTTP 429 for the first read-only
probe. It was not retried. The resolver's existing default Base public endpoint
returned exact raw transfers. The full default active provider executor then
recovered three raw field families for exact Base token
0xd5a09d20652b58872a2e0f302de6ad2326db3b84 and exact pool
0x5fc1e90123785930ded018ab9da95e4411ef4144 after Blockscout transport failure.
The executor consumed six budget units (three explorer plus three RPC) and
promoted four transfer records and four non-excluded participant addresses with
VERIFIED_PROVIDER_OBSERVATION provenance. Smart-wallet labels and daily totals
were not manufactured. This single-token acquisition proof does not establish
full-universe coverage or a tradable edge.

Local artifacts:

- /tmp/cli-wallet-rpc-live-20261010.json (rate rejection)
- /tmp/cli-wallet-rpc-default-live-20261010.json (initial default endpoint probe)
- /tmp/cli-wallet-executor-live-20261010.json (default executor recovery)

## Validation

All 1,369 tests passed, zero failures/skips. Syntax checks passed for 714 JavaScript
files; typecheck and 20 discovery/load tests passed. Twelve focused regressions
cover missing versus empty data, pagination/timestamps, historical-volume truth,
transport failures, exact bounded RPC proof, malformed and foreign responses,
actual invocation/provenance, budget enforcement, circuit breakers, redundant
request avoidance and preservation of existing holder/wallet evidence.

An isolated early implementation snapshot completed scanner smoke and all 61
required report contracts: 61 standard, 44 deep, 17 deferred excluded, 41 core
ready, three core starved, 92% core and 89% advisory coverage, zero verified routes
and zero qualified candidates. Its intentionally shortened 90-second recovery
budget expired: 27/200 units consumed, 63 calls deferred by the deadline. This is
not proof of completed wallet hydration. Reported recovered fields were DEPLOYER
81, SECURITY 115 and WALLETS 21; unresolved DEPLOYER 56 and WALLETS 176. System
readiness remained DEGRADED for execution coverage. Source refinements afterward
added infrastructure-address exclusion, complete-empty status and holder-only
transaction fallback; final-source CI independently validates the final commit.

## Still incomplete

Persistent wallet labels and historical performance need actual historical
observations; transfer participation alone cannot establish quality. Long-term
wallet-history persistence and read-back still need auditing. Fresh live execution
quotes remain provider-dependent. The three bounded-scan core gaps were ordinary
creator/lifecycle observations, not wallet alpha. Full production metrics must be
inspected on the deployed source before the no-starvation goal is complete.
