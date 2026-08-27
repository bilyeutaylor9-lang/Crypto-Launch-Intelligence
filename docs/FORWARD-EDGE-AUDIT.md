# Forward Edge Audit and Operating Contract

Date: 2026-08-24

## Current verdict

The repository is capable of collecting evidence that could establish an edge, but the checked-in/local evidence does **not** currently establish one. The truthful state is `UNVERIFIED_NO_FROZEN_COHORTS` or `UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE` until real cohorts mature.

Feature count, historical fit, backtests, post-outcome control matching, and positive point estimates cannot produce the certificate.

## Audit finding repaired

The former generic CLI 1.0 verification path selected controls after outcomes were available. That is useful as an exploratory separation diagnostic, but it is not a credible prospective experiment and is no longer certificate-eligible.

The certificate now comes only from `FROZEN_PROSPECTIVE_MATCHED_COHORTS_V1`:

1. A fresh exact candidate universe is observed.
2. The current shadow strategy selects treatment candidates.
3. Same-chain controls come from the same scored opportunity set, are matched, and are frozen at the same decision time before any target-horizon outcome exists.
4. Treatment and control routes are collected through exact chain/token identity, retaining pool identity when known.
5. Fixed-horizon outcomes are graded net of execution-cost estimates frozen at decision time.
6. The current strategy fingerprint is evaluated without selecting the best historical strategy.
7. A certificate is possible only after sample, capture, cost, match-quality, replication, uncertainty, return, hit-rate, and catastrophic-loss gates pass.

The old path is retained as `reports/edge-verification-posthoc-diagnostic.json` with `certificateEligible: false`.

## Evidence artifacts

| Artifact | Purpose |
| --- | --- |
| `data/prospective-edge-cohorts.jsonl` | Append-only treatment and control decisions frozen before outcomes |
| `data/production-market-observations.jsonl` | Append-only exact future market observations |
| `reports/prospective-edge-cohort-capture.json` | Freshness, identity, matching, cooldown, and persistence audit for the newest cohort |
| `reports/prospective-edge-cohort-grade.json` | Strategy-isolated forward grade with clustered uncertainty and quality gates |
| `reports/edge-verification-program.json` | Authoritative prospective edge-verification report |
| `reports/edge-verification-certificate.json` | Compact readiness input; verified only when every forward gate passes |

The two append-only ledgers use their own `forward-evidence-*` workflow cache. Writer workflows share one concurrency group so unrelated model caches cannot overwrite forward truth. This cache is continuity support, not external backup or PITR evidence.

## Default certificate gates

| Gate | Default |
| --- | ---: |
| First resolved treatment/control checkpoint | 250 |
| Unique treatment projects | 80 |
| Independent decision cohorts | 30 |
| Replication windows | 3 |
| Resolved pairs per replication window | 10 |
| Treatment pair outcome capture | 95% |
| Mature episode outcome capture | 95% |
| Explicit frozen execution-cost coverage | 80% |
| Comparable point-in-time match features | 5 |
| Maximum control-match distance, p90 | 1.25 |
| Minimum net return edge | 3 percentage points |
| Minimum hit-rate edge | 3 percentage points |
| Maximum catastrophic-loss-rate delta | 2 percentage points |

Return, hit-rate, and catastrophic-loss decisions use the conservative envelope of identity-clustered and time-cohort-clustered bootstrap intervals. The lower confidence bounds—not only the point estimates—must clear the 3-point return and hit-rate thresholds. Positive estimates with weaker intervals do not verify edge.

Performance is analyzed only at prospectively declared doubling checkpoints (250, 500, 1,000, and so on), never after each convenient new result. A 5% family-wise error budget is spent across both strategy trials and checkpoint looks, so repeated strategy search and optional stopping make later certificates stricter rather than easier.

Between checkpoints, new outcomes may revoke a certificate through an interim safety check, but they can never grant one. This prevents a deteriorating live stream from being hidden behind an earlier passing checkpoint without turning convenient interim peeks into positive evidence.

Missingness is also stress-tested rather than assumed benign. Every mature treatment whose own outcome or full frozen control set is unresolved is treated as maximally adverse in a sensitivity bound (-200 point return edge, -100 point hit-rate edge, and +100 point catastrophic-loss delta). The bound must still clear the certificate thresholds.

## Integrity rules

- Missing, future, or stale source timestamps reject cohort capture. Production cohorts require an explicit fresh market timestamp on every treatment and control; regenerating a universe file cannot relabel stale candidate data as fresh.
- Symbol/name-only rows never enter cohort capture or grading.
- A known pool cannot be resolved by an observation from another known pool.
- Treatment cooldown prevents repeated scans of one token from inflating the sample.
- Strategy definitions include the immutable code version and are hashed; the current strategy is evaluated even when an older strategy looked better. Unversioned runs cannot enter the evidence ledger.
- Every frozen episode and exact market observation carries a content-integrity hash. Malformed JSONL lines surface as integrity failures instead of disappearing silently.
- Control-parent, cohort, timestamp, chain, match-policy, and control-reuse topology is validated before certification.
- Identities used in earlier cohorts are excluded from later control pools for the same strategy, preventing silent control reuse from inflating independence.
- An execution-cost number counts as explicit only when its reference notional and provenance were frozen with it; applied round-trip cost is floored at 100 bps. Missing/incomplete cost evidence uses a 200 bps conservative estimate for research output, but insufficient explicit coverage still blocks verification.
- Any loaded cohort-ledger integrity failure is fail-closed, including damage attributed to an older strategy; exact-observation integrity is also required on the production certificate path.
- Alpha Lab challengers require exact post-freeze decisions, fresh point-in-time inputs, post-decision outcomes, experiment-definition integrity, a forward permutation test, and Benjamini-Hochberg correction across prospective validations.
- Automatic trading and automatic model promotion remain disabled.
- A challenger cannot become canary-eligible from point estimates alone. It
  requires frozen forward-only cohorts, ledger integrity, 250 resolved samples,
  80 unique projects, 30 independent cohorts, 95% outcome capture, distinct
  immutable strategy fingerprints, and conservative return, hit-rate, and
  catastrophic-loss confidence bounds. Champion eligibility additionally
  requires a hashed canary evidence receipt bound to the challenger strategy
  fingerprint; release remains governed and never automatic.
- Dashboard-critical reports are covered by a live artifact provenance firewall.
  Test/demo fixtures, missing run identity, missing commit identity, stale or
  future cutoffs, cross-commit artifacts, and known fixture identities make the
  manifest non-publishable as live data. The public fallback is a truthful
  `NO_LIVE_DATA_PUBLISHED` page, not stale results.

## Operating commands

```bash
npm run production:shadow
npm run outcomes:probe
npm run outcomes:hourly
npm run production:grade
npm run edge:verify
```

Expected early-stage behavior:

- `production:shadow` freezes a cohort only when the candidate universe is no more than 90 minutes old and matchable controls exist.
- Run cohort capture from a clean Git checkout. GitHub supplies `GITHUB_SHA`; an immutable packaged deployment must supply its build identifier through `EDGE_CODE_VERSION`. Dirty or unversioned code is rejected from the evidence ledger.
- `outcomes:probe` prioritizes prospective treatments and controls and dual-writes exact observations.
- `outcomes:hourly` is the lightweight, one-shot scheduler target. It checks all due
  1h/24h/168h/720h frozen outcomes, appends only exact chain/token (and known-pool)
  observations, and never runs discovery, cohort selection, grading, ranking, promotion,
  or trading. It shares a lock with scan-time probing and safely skips if a scan is
  already collecting outcomes. The optional `npm run outcomes:hourly:daemon` keeps a
  process-local schedule at minute 7 of each hour; it does not install or modify launchd.
- `production:grade` writes an unverified report while cohorts are immature.
- `edge:verify` exits non-zero until a real forward certificate is justified. That non-zero state is an integrity gate, not a workflow defect.

Run the focused verification suite with:

```bash
npm run test:production-platform
node --test test/outcomeProbe.test.js test/edgeEvidenceTruth.test.js test/workflowHardening.test.js
```

## What still must happen live

Code cannot manufacture the remaining evidence. Production readiness still requires working providers/RPCs, durable external storage, backup/PITR attestation, successful scheduled workflows, matured exact observations, sufficient independent cohorts, calibration, forward challenger performance, and canary evidence.

The system may say it has verified edge only when it can support this statement from unseen evidence:

> When this setup was identified before the move, projects subsequently outperformed prospectively frozen comparable controls, net of estimated execution costs, by a measurable amount with a credible uncertainty interval.

For the methodological reason that repeated strategy searches and in-sample backtests require stricter evidence than a single attractive result, see Campbell R. Harvey and Yan Liu, [Backtesting](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF).
