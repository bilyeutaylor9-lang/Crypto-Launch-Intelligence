# Three-Clock Edge architecture

## Purpose

Three-Clock Edge is a **shadow-only temporal evidence sensor**.  It looks for a
specific ordering rather than adding another ranking score:

1. observable project change accelerates;
2. observable capital formation follows; and
3. broad attention and price have not yet caught up.

It is not an execution signal, a wallet-labeling system, or a claim that a
move will occur.  `rankingInfluence` is always `false` and `shadowOnly` is
always `true`.

## Canonical inputs

The layer incorporates the original `three-clock-edge-v1` package's explicit
liquidity-topography and non-executable pressure-twin diagnostics, together
with the available Ignition Twin V1–V14 research stack. It replaces the
packages' stale installer assumptions and loose promotion conditions. It reads
existing project, capital, and attention evidence without rewriting it. Its
three clocks deliberately keep these categories separate:

| Clock | Uses | Does not claim |
| --- | --- | --- |
| Project | developer/repository activity, releases, verified catalysts, adoption and protocol change | a future release or an unverified catalyst |
| Capital | observed deployed flow, explicit target-proximity capital, committed/staged capital, and probability-weighted inferred capital | inferred or committed capital is deployed capital |
| Attention | social/narrative/coverage, holder and volume acceleration, and price extension | missing attention is low attention |

Capital fields are emitted independently.  The engine never adds an inferred
capital estimate to observed deployed capital and never treats an absent field
as zero.

## Sequence and decay

`THREE_CLOCK_PRE_CONSENSUS` is possible only with adequate own-history for all
three clocks, project and capital acceleration, quiet/early attention, and a
non-extended price.  The engine otherwise emits a non-qualifying sequence
state such as `INSUFFICIENT_HISTORY`, `PROJECT_LEADS`, or
`ATTENTION_CATCHING_UP`.

Historical clock crossings are used to calculate event-time compression when
there is enough observed timing.  A qualifying setup is subsequently marked
`FRESH`, `AGING`, `DECAYING`, or `EXPIRED`; attention acceleration or material
price extension prevents it from remaining early indefinitely.

## Data contracts and validation

Point-in-time snapshots are stored in the bounded
`data/three-clock-canonical-observations.jsonl` store.  Each record has identity,
timestamp, clock evidence, history sufficiency, sequence/freshness state,
market context, ignition/capital context, coverage, and provenance.

`src/learning/threeClockOutcomeLab.js` evaluates frozen qualifying observations
only against later observations.  It reports fixed-horizon outcomes,
MFE/MAE, path-dependent +25% before -15% and +50% before -20% outcomes,
ablation slices, and contemporaneous matching diagnostics.  The lab reports
`COLLECTING` until enough frozen observations mature; it never manufactures a
positive result from missing future data.

The older Pre-Consensus Breakout Hunter and Pre-Breakout Radar remain their
own engines. Three-Clock consumes their evidence where helpful but does not
change their score, lane, safety gate, identity handling, or execution logic.
The installed Ignition Twin, capital-commitment, replication, execution-reality,
and paper-canary tools likewise remain shadow/research-only and must pass their
separate governors before the Base-only paper-canary policy can be frozen.

## History bootstrap

Run `npm run edge:three-clock:backfill` once to hydrate the canonical store
from dated records already present in `data/scan-history.json`. The bootstrap
only maps recorded source values, skips identities with fewer than five dated
observations, and is idempotent. Runtime observation files stay local by
design; the reproducible backfill command, rather than a generated data dump,
is versioned.
