# Crypto Launch Intelligence

## v0.5.0 - Watchtower Alpha

Institutional-style crypto launch intelligence for discovering early momentum, launch catalysts, smart-money accumulation, narrative strength, and watchlist changes before they become obvious.

Crypto Launch Intelligence is not a price prediction tool. It is a research system that scans crypto projects, scores them across many independent signals, remembers what it has seen before, and builds a continuously improving watchlist.

## What It Does

- Discovers crypto projects from live market and launch sources.
- Pulls from DexScreener, GeckoTerminal, CoinGecko, Birdeye, CoinPaprika, DeFiLlama, Binance, KuCoin, Coinbase, Kraken, CoinCap, CoinLore, CryptoCompare, DeFiLlama yields/stablecoins, narrative DexScreener search, OKX, Bybit, Gate.io, MEXC, Bitget, HTX, Bitfinex, Bitstamp, and Gemini.
- Researches public internet sources including crypto RSS feeds, Google News RSS search, and project pages, then saves research memory for future scans.
- Uses research seed fallback candidates when every live source returns zero results, so local/offline scans still exercise the intelligence pipeline.
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
- Adds a state-of-art ranking layer with narrative heat, source reliability, project-change detection, trap-risk scoring, and confidence-adjusted institutional rank.
- Adds an autonomous web research agent that budgets free web/RSS/Google News searches toward the highest-priority candidates.
- Adds an AI ecosystem council where specialist agents debate narrative, quant, flow, research quality, learning memory, and risk before assigning a final verdict.
- Adds agent performance memory so the AI council can track agent behavior and adjust weights over time.
- Adds a Research OS layer with multi-timeframe intelligence, scenario planning, autonomous research tasks, red-team review, disagreement detection, and strong-buy lifecycle tracking.
- Adds an Autonomous Alpha Lab that discovers strategy matches, paper-tests them against memory, and lets the meta-council decide whether they should influence live scoring.
- Adds a Quantum Reasoning Brain that tracks bull/base/bear/black-swan probabilities, entropy, signal entanglement, and collapse triggers.
- Adds a World Model Brain that builds project/narrative/chain/source relationship graphs and applies market-regime reasoning.
- Adds an Autonomous Market Scientist that performs causal hypotheses, counterfactual analysis, false-positive autopsy, alpha-decay checks, and preference-fit scoring.

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

### State-of-Art Scanner Layer

This layer is designed to separate real opportunity from noisy hype.

It adds:

- Narrative Heat Index: detects whether a project sits inside a hot market narrative.
- Project Change Detector: compares the latest scan against prior memory to catch improving or fading projects.
- Source Reliability Engine: scores whether a candidate came from historically useful discovery sources.
- Trap Risk Engine: flags thin liquidity, noisy social signals, sell pressure, weak proof, and trap-pattern behavior.
- Confidence-Adjusted Ranking: produces a second ranking that blends opportunity, confidence, proof, source quality, narrative heat, improvement, and trap risk.

The goal is not just to find high scores. The goal is to find high scores that deserve trust.

### AI Ecosystem Council

The AI council is a deterministic multi-agent layer. It does not need a paid model key to run.

Specialists include:

- Narrative Scout
- Quant Forecaster
- Flow Analyst
- Research Analyst
- Learning Engine
- Risk Officer

Each specialist scores the project and contributes a short message. The council then assigns:

- `AI Strong Buy`
- `Best Available Strong Buy Candidate`
- `AI Priority Watch`
- `AI Watchlist`
- `AI Pass For Now`
- `Rejected By AI Council`

If a scan has no true strong-buy setup, the council still names the best available candidate, but adds a caveat so the dashboard never confuses weak data with confirmed conviction.

The council also includes:

- Agent performance memory
- Performance-aware agent weights
- Bull/bear debate transcript
- Strong-buy evidence gate
- Why-now explanation
- Final moderator summary

Strong-buy gate checks include council score, agent agreement, data confidence, proof score, confidence-adjusted score, trap risk, and risk-officer clearance.

### 10,000-Project Wide Scan

The wide scan is built as a staged funnel:

- Collect up to 10,000 candidates from free/no-key market, DEX, CEX, DeFi, Google News, and research-seed sources.
- Deduplicate and cheap-rank the full candidate pool.
- Spend web research only on the highest-priority slice using `WEB_RESEARCH_AGENT_LIMIT`.
- Run the full scoring stack and produce confidence-adjusted rankings.
- Save internet research memory so future scans can compare what was found before.

This keeps the scanner free-friendly. It can look across a huge market without trying to run expensive web searches against every single project.

Useful wide-scan controls:

```bash
npm run scan:wide
WEB_RESEARCH_AGENT_LIMIT=250 npm run scan:wide
DISCOVERY_SCAN_LIMIT=10000 WIDE_SCAN_LIMIT=10000 npm run scan
```

### Research OS and Alpha Lab

The Research OS turns each scan into a lifecycle-managed research workflow.

It adds:

- Multi-timeframe intelligence across `1h`, `24h`, `7d`, `30d`, and `90d`
- Bull/base/bear scenario planning
- Autonomous research tasks
- Red-team thesis attack
- AI disagreement scoring
- Strong-buy promotion ladder
- Alpha Lab strategy matching
- Meta-council strategy recommendations

Lifecycle stages:

- `Candidate`
- `Watch`
- `Priority Watch`
- `Pre-Strong Buy`
- `AI Strong Buy`
- `Invalidated`

The Alpha Lab treats strategies as hypotheses first. Cold-start strategies stay in research mode, paper-tested strategies are watched, and promoted strategies can influence live scoring after enough memory exists.

### Quantum Brain, World Model, and Market Scientist

The scanner now models uncertainty and market structure instead of relying on one flat score.

The Quantum Brain adds:

- Bull/base/bear/black-swan probabilities
- Conviction entropy
- Entangled signal pairs
- Collapse triggers
- Quantum decision state

The World Model adds:

- Project-to-chain relationships
- Project-to-narrative relationships
- Related-project contagion maps
- Narrative rotation state
- Market-regime governor

The Autonomous Market Scientist adds:

- Causal hypotheses
- Counterfactual analysis
- False-positive autopsy
- Alpha-decay detector
- Human preference fit

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
- `confidenceAdjustedRank`
- `confidenceAdjustedScore`
- `narrativeHeatScore`
- `projectChangeScore`
- `sourceReliabilityScore`
- `trapRiskScore`
- `webResearchPriority`
- `webResearchStatus`
- `internetResearchScore`
- `internetResearchRiskScore`
- `aiEcosystemScore`
- `aiEcosystemVerdict`
- `aiEcosystemCouncil`
- `strongBuyEvidenceGate`
- `aiDebate`
- `whyNow`
- `strongBuyLifecycleStage`
- `multiTimeframeIntelligence`
- `scenarioPlan`
- `autonomousResearchTasks`
- `redTeamReview`
- `aiDisagreement`
- `alphaLabScore`
- `alphaLabStrategies`
- `quantumBrainScore`
- `quantumReasoningBrain`
- `worldModelScore`
- `knowledgeGraph`
- `marketScientistScore`
- `autonomousMarketScientist`

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
- `reports/state-of-art-signals.json`
- `reports/ai-council.json`
- `reports/agent-performance.json`
- `reports/research-os.json`
- `reports/alpha-lab.json`
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
- `data/agent-performance-memory.json`

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

Wide free-source scan:

```bash
npm run scan:wide
```

`scan:wide` targets up to 10,000 ranked free candidates using the no-key source pack. It still ranks candidates before the heavy intelligence pipeline runs, so the best discovered projects are scanned first.

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
npm run state-signals
npm run ai-council
npm run agent-performance
npm run agent-memory
npm run research-os
npm run alpha-lab
```

Inspect expanded source candidates:

```bash
npm run sources:expanded
npm run sources:seeds
npm run research:internet
npm run research:memory
npm run discover:wide
```

Discovery tuning:

```bash
FREE_SOURCE_LIMIT=200 EXPANDED_SOURCE_LIMIT=200 npm run scan
INTERNET_RESEARCH_PROJECT_LIMIT=50 npm run scan
DISCOVERY_SCAN_LIMIT=1500 npm run scan
WIDE_SCAN=true WIDE_SCAN_LIMIT=10000 DISCOVERY_SCAN_LIMIT=10000 npm run scan
COINGECKO_PER_PAGE=100 COINGECKO_PAGES=1 COINGECKO_CATEGORY_LIMIT=4 COINGECKO_DELAY_MS=3500 npm run scan
DISABLE_RESEARCH_SEEDS=true npm run scan
```

If CoinGecko returns `429`, the scanner pauses that source for the rest of the run and continues with the other providers. This is expected on free public endpoints.

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
