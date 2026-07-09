# Crypto Launch Intelligence

## v0.5.0 - Watchtower Alpha

Institutional-style crypto launch intelligence for discovering early momentum, launch catalysts, smart-money accumulation, narrative strength, and watchlist changes before they become obvious.

Crypto Launch Intelligence is not a price prediction tool. It is a research system that scans crypto projects, scores them across many independent signals, remembers what it has seen before, and builds a continuously improving watchlist.

## What It Does

- Discovers crypto projects from live market and launch sources.
- Scores projects across narrative, liquidity, momentum, developer, community, catalyst, smart-wallet, whale, and market-rank signals.
- Detects launch, staking, restaking, TGE, mainnet, airdrop, and listing setups.
- Adds X/social and institutional-attention intelligence from available social/project text.
- Builds proof-backed explanations showing why a project scored well or why it should be avoided.
- Maintains persistent scan memory and project watch history.
- Tracks whether watched projects are improving, fading, or stable.
- Produces ranked reports, watchlists, research checklists, risk flags, and opportunity theses.
- Runs an autonomous Watchtower layer for high-conviction alerts and daily briefs.
- Connects external X/news intelligence when API keys are available.
- Adds AI analyst review, institutional vNext scoring, pre-pump pattern matching, and data confidence.

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

### Watchtower Alpha

The Watchtower layer monitors projects over time and surfaces alerts when the scanner detects meaningful changes.

It can flag:

- New priority candidates
- Score spikes or deterioration
- Watchlist priority escalation
- Social/X and news acceleration
- Liquidity migration
- Pre-breakout pattern matches
- Smart-money conviction
- Vesting, unlock, external, or AI analyst risk escalation
- AI thesis changes

Watchtower outputs:

- `reports/alerts.json`
- `reports/daily-brief.json`
- `data/watchtower-alerts.json`
- `data/watchtower-brief.json`

Run once:

```bash
npm run watchtower
```

Run continuously:

```bash
npm run watchtower:daemon
```

Default daemon schedule is every 30 minutes. Override it with:

```bash
WATCHTOWER_CRON="*/10 * * * *" npm run watchtower:daemon
```

### Proof Engine

The Proof Engine turns raw scanner scores into a readable evidence trail for each project.

It produces:

- `proofScore`
- `proofStrength`
- `proofVerdict`
- `topEvidence`
- `topRisks`
- `scoreBreakdown`
- `whyThisMatters`

This makes each high score easier to audit. Instead of only showing that a token ranked highly, the reports explain which signals supported the ranking and which risks still need manual review.

### AI and External Intelligence

When connected, the scanner can use X/news intelligence to strengthen social, catalyst, and risk detection.

Optional keys:

```bash
export X_BEARER_TOKEN="your_x_bearer_token"
export CRYPTOPANIC_API_KEY="your_cryptopanic_key"
```

Without these keys, the scanner still runs in safe fallback mode using local project text and existing signal data.

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
- `externalSignalScore`
- `externalRiskScore`
- `aiAnalystScore`
- `aiDecision`
- `aiThesis`
- `institutionalVNextScore`
- `institutionalConfidenceScore`
- `prePumpPatternMatchPct`
- `trapPatternMatchPct`
- `dataConfidence`

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
- `reports/alerts.json`
- `reports/daily-brief.json`
- `reports/quantum-field.json`
- `reports/outcome-calibration.json`
- `reports/pre-pump-patterns.json`
- `reports/institutional-vnext.json`
- `reports/watchlist.json`
- `reports/summary.txt`

## Live GitHub Dashboard

This repo includes a GitHub Pages workflow that publishes a public dashboard people can view in a browser.

The workflow:

- Runs the scanner on every push to `main`.
- Runs again every 6 hours.
- Can be started manually from the GitHub Actions tab.
- Publishes `reports/report.html` plus JSON, alerts, watchlist, Watchtower performance, and summary files to GitHub Pages.

After pushing this version to GitHub:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set the source to `GitHub Actions`.
4. Go to `Actions` -> `Live Dashboard`.
5. Run the workflow or wait for the next scheduled run.

Your public dashboard URL will look like:

```txt
https://bilyeutaylor9-lang.github.io/Crypto-Launch-Intelligence/
```

Local dashboard publishing:

```bash
npm run scan
npm run publish:dashboard
open docs/index.html
```

Optional GitHub repository secrets:

```txt
BIRDEYE_API_KEY
X_BEARER_TOKEN
CRYPTOPANIC_API_KEY
```

The dashboard still publishes without these keys, but paid or authenticated data sources may be skipped.

Persistent learning files are saved under:

- `data/scan-history.json`
- `data/project-watchlist.json`
- `data/outcome-snapshots.json`
- `data/outcome-calibration.json`
- `data/pre-pump-patterns.json`
- `data/watchtower-alerts.json`
- `data/watchtower-brief.json`

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
npm run alerts
npm run brief
```

Run tests:

```bash
npm test
```

Run learning and pattern updates:

```bash
npm run calibrate
npm run patterns
```

Run Watchtower:

```bash
npm run watchtower
npm run watchtower:daemon
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
