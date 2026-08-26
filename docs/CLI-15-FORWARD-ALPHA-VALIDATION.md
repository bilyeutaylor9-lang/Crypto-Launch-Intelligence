# CLI 15.0 — Forward Alpha Validation OS

## Purpose

CLI 15 answers one question:

> Using only information available at decision time, did the strategy outperform alternatives frozen before the outcome after realistic execution costs?

CLI 1–14 can generate sophisticated research, forecasts, and market theses. CLI 15 does not add another forecasting engine. It creates the control plane that can prove, reject, or revoke the claimed edge.

## What CLI 15 adds

### Immutable prediction contracts

Each new prospective treatment stores a tamper-evident contract inside the append-only prospective cohort ledger. The contract binds:

- exact `chain:tokenAddress` identity and pool route when known;
- decision and source-observation timestamps;
- signal price and predeclared horizons;
- frozen probability forecasts;
- selection, utility, evidence, and risk scores;
- thesis evidence and invalidation language when present;
- the complete frozen feature snapshot and its hash;
- strategy, code, model, feature-schema, and configuration versions;
- execution-cost notional and provenance through the parent episode;
- research-only, no-auto-trading, and no-auto-promotion governance.

Changing either the contract or the outer episode breaks an integrity hash and blocks certification.

### Multi-horizon forward maturation

New predictions predeclare these horizons:

| Horizon | Purpose |
|---:|---|
| 1 hour | Immediate signal quality and entry decay |
| 6 hours | Early ignition behavior |
| 24 hours | Primary forward-edge certificate horizon |
| 168 hours | Seven-day thesis follow-through |
| 720 hours | Thirty-day durability |

Only exact past-or-present observations with a valid integrity hash can mature an outcome. Symbol-only matching is prohibited. When both sides know the pool address, the pool must match.

### Execution-aware results

Returns are net of the execution cost frozen before the outcome. Explicit cost evidence requires:

- a round-trip cost estimate;
- a frozen reference notional;
- named provenance.

If explicit evidence is missing, the existing forward certificate applies a conservative cost policy and blocks promotion because explicit cost coverage is inadequate.

### Honest benchmarks

CLI 15 reports four benchmark families:

1. matched eligible unselected controls;
2. a deterministic random member of each pre-outcome frozen control pool;
3. the highest frozen-momentum member of each pre-outcome control pool;
4. an exact market-index comparison only when an exact horizon-aligned index price series exists.

The system never fabricates the market-index comparison from a current price or a mismatched trailing-return field.

### Evaluation and diagnostics

The report includes:

- forward certificate state and conservative confidence bounds;
- episode and matched-pair outcome-capture rates;
- mean and median net returns;
- net-return lift over frozen controls;
- +25% hit-rate lift and catastrophic-loss delta;
- precision at K for ranks 1, 5, 10, and 25;
- Brier score and expected calibration error where a probability was predeclared;
- maximum favorable/adverse excursion and drawdown summaries;
- chain, regime, narrative, and score-tier performance;
- edge-decay monitoring;
- champion-versus-challenger governance;
- executable paper-canary evidence;
- live data-source readiness.

The 24-hour certificate remains the statistical promotion anchor. Secondary horizons are descriptive safety monitors until their own forward samples mature.

## Verdict states

| Control-plane state | Meaning |
|---|---|
| `CLI15_COLLECTING_FORWARD_EVIDENCE` | The system is healthy enough to keep collecting, but one or more proof gates are incomplete. |
| `CLI15_INTEGRITY_BLOCKED` | A contract, cohort, identity, timestamp, or observation-ledger integrity rule failed. |
| `CLI15_EDGE_DEGRADED` | Mature evidence, decay monitoring, or the executable canary triggered a safety stop. |
| `CLI15_HUMAN_PROMOTION_REVIEW_ELIGIBLE` | Every required proof gate passed; the result may be reviewed by a human. |

The compact edge verdict is `PROVEN`, `UNPROVEN`, or `DEGRADED`.

## Promotion requirements

Human review eligibility requires all of the following:

- valid current CLI 15 prediction contracts;
- an intact prospective cohort and exact-observation ledger;
- `VERIFIED_FORWARD_EDGE` from the frozen 24-hour certificate;
- verified probability calibration;
- a passed executable paper canary;
- verified live health for required data-source families;
- a passed champion/challenger comparison;
- no interim, multi-horizon, catastrophic-loss, or edge-decay safety stop.

Automatic promotion is always disabled. Real-money trading is always unauthorized.

## Kill switch and rollback

The kill switch is permanently armed. Integrity failures and safety stops:

- block new challenger influence;
- block real-money execution;
- require rollback to the last verified champion;
- permit automatic rollback only inside the shadow-selection system;
- never create, cancel, or modify a real-money order.

## Commands

```bash
# Freeze new shadow selections and their matched controls
npm run production:shadow

# Collect exact due outcomes
npm run outcomes:probe

# Build all CLI 15 evidence and governance reports
npm run cli15:validate

# Inspect the main report and promotion verdict
npm run cli15:report
npm run cli15:promotion-gate
npm run cli15:multi-horizon

# Run CLI 15 tests
npm run test:cli15
```

## Generated reports

- `reports/forward-alpha-validation-os.json`
- `reports/cli15-promotion-gate.json`
- `reports/cli15-multi-horizon-evidence.json`

The main report contains the prediction-contract audit, forward certificate, horizon evidence, calibration, edge decay, benchmarks, segments, champion/challenger result, paper-canary result, source readiness, and final promotion gate.

## Required operating sequence

1. Run the production shadow cycle on fresh point-in-time candidates.
2. Persist the new prospective treatment/control contracts.
3. Collect exact observations as horizons become due.
4. Run CLI 15 validation on the append-only ledgers.
5. Treat `UNPROVEN` as the normal state until sufficient real evidence matures.
6. Investigate any `DEGRADED` or integrity-blocked state before generating new promotion claims.
7. Require human review even after a `PROVEN` verdict.

## What code cannot prove by itself

Passing tests proves that the contracts, math, gates, and fail-closed behavior work as implemented. It does not prove market edge. Market edge requires real frozen predictions, matured exact outcomes, healthy live providers, realistic executable quotes, repeated time windows, and sustained out-of-sample performance.
