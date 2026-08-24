# Data Source Readiness

The source inventory is now split into three different truths:

1. **Code coverage** — an executable connector, exact ledger, or sensor exists.
2. **Configuration** — required RPC and storage settings are present.
3. **Live health** — a recent point-in-time run actually returned evidence.

An API key by itself never counts as source health. Run:

```bash
npm run sources:readiness
```

The command writes `reports/data-source-readiness.json`. It exits with code `1`
when critical implementation is missing and code `2` when code exists but live
configuration or health is not verified. CI syntax/integration validation can use:

```bash
npm run sources:readiness:code
```

## Point-in-time market context

`npm run market:context` captures a global context snapshot in:

```text
data/market-context-observations.jsonl
```

The capture uses the existing CoinGecko market source, DeFiLlama stablecoin
source, Hyperliquid public derivatives context, and exact prior route
observations. It records provenance for:

- BTC and ETH trailing returns;
- a labeled BTC high/low range volatility proxy;
- stablecoin supply and change since the last valid snapshot;
- BTC perpetual funding and open interest change;
- exact-route sample breadth, DEX volume change, and liquidity change.

No prior snapshot means no change measurement; the field remains `null`.
Aggregate bridge flow and liquidation notional also remain `null` until a
verified point-in-time source supplies them. Missing fields are not converted to
zero and do not silently create a neutral liquidity signal.

The scheduled CLI 9–14 workflow refreshes this context independently of the
outcome probe and preserves it with the append-only forward evidence cache.

## Solana program collection

The Solana native adapter now has a bounded live RPC path using confirmed
program signatures and parsed transactions. It accepts events only when a
structured instruction exposes an exact base58 token mint. Pool identity is
retained when structured evidence supplies it. It does not guess token or pool
roles from raw account order, and it preserves case-sensitive Solana identities.

## Declared-only providers

Provider names with no executable connector are reported as
`DECLARED_ONLY_NO_EXECUTOR` and cannot appear in the enabled execution plan even
when an environment key is present. They remain optional future integrations;
they are not counted as working data sources.

## Forward execution-cost evidence

Routine scans can capture a bounded paired BUY→SELL quote only when
`IGNITION_EXECUTABLE_QUOTE_ENDPOINT` is explicitly configured. Each accepted
pair must have exact chain/token/pool identity, a recorded provider, fresh
timestamps, a common reference notional, and explicit all-in costs for both
sides. The resulting round-trip cost and quote provenance are frozen for
shadow prospective cohorts only; missing or failed quotes remain `null` and do
not affect ranking, promotion, or order creation.

## Production gate

Production readiness now has separate gates for critical data-source code and
real live source health. This does not claim verified market edge. Edge remains
blocked until prospective cohorts mature and pass the forward verification
certificate gates.
