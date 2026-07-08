# Crypto Launch Intelligence

Institutional-style crypto launch intelligence for discovering early momentum, launch catalysts, smart-money accumulation, narrative strength, and watchlist changes before they become obvious.

Crypto Launch Intelligence is not a price prediction tool. It is a research system that scans crypto projects, scores them across many independent signals, remembers what it has seen before, and builds a continuously improving watchlist.

## What It Does

- Discovers crypto projects from live market and launch sources.
- Scores projects across narrative, liquidity, momentum, developer, community, catalyst, smart-wallet, whale, and market-rank signals.
- Detects launch, staking, restaking, TGE, mainnet, airdrop, and listing setups.
- Adds X/social and institutional-attention intelligence from available social/project text.
- Maintains persistent scan memory and project watch history.
- Tracks whether watched projects are improving, fading, or stable.
- Produces ranked reports, watchlists, research checklists, risk flags, and opportunity theses.

## Core Idea

Most scanners answer:

> What is trending now?

This project is designed to answer:

> What is quietly improving before the market fully notices?

The platform ranks projects using a layered intelligence pipeline instead of a single metric. A strong candidate usually needs several confirming signals, such as improving liquidity, strong narrative alignment, catalyst timing, smart-money activity, and low risk.

## Intelligence Layers

### Discovery Layer

- New token discovery
- Upcoming launch discovery
- Presale discovery
- Launchpad discovery
- Ecosystem discovery
- Testnet discovery
- Live market discovery

### Narrative and Launch Layer

- Narrative intelligence
- Narrative forecasting
- Infrastructure narrative scoring
- Launch readiness
- Staking and restaking momentum
- Staking risk detection
- Catalyst calendar scoring

### Market and Momentum Layer

- Market rank
- Rich token intelligence
- Baseline activity
- Velocity
- Acceleration
- Trend change
- Momentum compression
- Momentum shift
- Early breakout detection
- Volatility expansion
- Liquidity expansion

### Flow and Wallet Layer

- Capital flow
- Buy pressure
- Sell pressure
- Relative strength
- Whale activity
- Smart-wallet activity
- Smart-wallet performance
- Smart-money accumulation
- Smart-money rotation

### Quality and Fundamentals Layer

- Developer activity
- GitHub quality
- Community growth
- Social acceleration
- Holder growth
- Tokenomics
- Funding/backers
- Partnerships
- Ecosystem integrations

### Self-Learning Layer

The system saves scan history and project watch history so future scans can compare against previous behavior.

It tracks:

- Prior project scores
- Score direction
- Conviction changes
- Allocation bucket changes
- Watchlist priority
- Previous opportunity thesis
- Social signal changes
- Learning edge score

This gives the pipeline memory. A project can be marked as improving, fading, stable, or newly watched.

## Advanced Outputs

Each project can receive:

- `pipelineScore`
- `rawPipelineScore`
- `marketAdjustedScore`
- `pipelineRank`
- `pipelinePercentile`
- `conviction`
- `allocationBucket`
- `watchlistPriority`
- `alphaTags`
- `riskFlags`
- `researchChecklist`
- `invalidationSignals`
- `opportunityThesis`
- `xSocialScore`
- `institutionalWatchScore`
- `learningEdgeScore`

Example allocation buckets:

- `Core Watch`
- `Priority Research`
- `Starter Watch`
- `Speculative Lab`
- `Ignore`
- `Avoid`

## Reports Generated

Running the scanner creates:

- `reports/report.html`
- `reports/report.json`
- `reports/opportunities.csv`
- `reports/watchlist.json`
- `reports/summary.txt`

Persistent learning files are saved under:

- `data/scan-history.json`
- `data/project-watchlist.json`

These files are local runtime memory and should usually not be committed.

## Installation

Requires Node.js 20 or newer.

```bash
npm install
```

## Run

```bash
npm start
```

Equivalent commands:

```bash
npm run scan
npm run scan:full
npm run report
```

Open the dashboard after a run:

```bash
npm run dashboard
```

View generated outputs:

```bash
npm run summary
npm run json
npm run watchlist
```

## Optional API Keys

Some live data sources may work better with API keys.

Example:

```bash
export BIRDEYE_API_KEY="your_key_here"
```

Without keys, the scanner can still run, but some providers may be skipped or rate-limited.

## Common Runtime Notes

You may see warnings such as:

- CoinGecko `429` rate limits
- Birdeye skipped because `BIRDEYE_API_KEY` is missing
- Binance unavailable from a region or environment

These are data-source limitations, not necessarily application failures.

## Development

Run syntax checks:

```bash
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

Run in watch mode:

```bash
npm run dev
```

Check current changes:

```bash
git status
```

Recommended files to avoid committing:

```txt
node_modules/
reports/
data/
```

## Project Structure

```txt
src/
  data/                  Data connectors and source orchestration
  engines/               Intelligence engines
  intelligence/          Higher-level intelligence layers
  learning/              Scan memory and self-learning stores
  reports/               HTML, JSON, CSV, watchlist, and summary reports
  storage/               Local database utilities
  index.js               Main scanner entrypoint
  intelligencePipeline.js
```

## Current Status

Active development.

The platform already runs full scans, generates reports, stores learning memory, and maintains a persistent project watchlist. The long-term goal is to evolve into a self-improving institutional research assistant for early crypto launch intelligence.

## Disclaimer

This software is for research and educational use only. It does not provide financial advice, does not guarantee returns, and should not be used as the sole basis for trading or investment decisions.
