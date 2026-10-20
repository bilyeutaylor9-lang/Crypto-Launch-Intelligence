# Final Risk Evidence Retention

Manual inspection of source-pinned scan `scan_1792343084057` at `62537429`
found a row with root `riskScore: 0` and a current risk-78 final blocker.
The final risk aggregate and its contributing inputs were absent from that
serialized row. A lower root score is not the final gate's maximum risk.

The final gate itself was correct. It evaluates the maximum of twelve risk
inputs, including `signalProfile.risk`, and three trap-risk inputs. The bounded
JSON and generic report writers protected the ordinary root score but not all
of those inputs or the final aggregates. The Top10 input projection also omitted
some contributing fields. Existing saved rows cannot recover these lost facts
from blocker prose; no historical facts are fabricated by this repair.

A shared finite scalar projection now retains all final-gate risk and trap
inputs plus both published aggregates. Nested profile risk is prioritized within
existing key budgets. The Top10 projection copies only its risk scalar, not an
unbounded profile graph. HTML displays the available final aggregate rather than
an unrelated lower root score.

Regressions reproduce aggregate loss before the repair through raw and bounded
writers at 8,000 and 22,582 characters. Expanded tests cover every contributing
input through raw, bounded and Top10-to-JSON paths, with nested risk placed after
100 unrelated keys. They recompute the same gate risk after serialization even
when saved aggregate diagnostics are replaced with zero. Unknown components stay
null. Final gates, risk formulas, thresholds, quote TTLs and payload budgets are
unchanged; report retention cannot qualify a previously blocked project.
