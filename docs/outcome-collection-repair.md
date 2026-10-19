# Frozen outcome collection repair

## Historical baseline

A read-only local-ledger reconciliation at `2026-10-19T23:20:56.769Z`, using source `2077b8af4d1d1324828af2efb85c38d4592cf202`, inspected all original records rather than a bounded tail:

| Quantity | Result |
| --- | ---: |
| Frozen episodes | 1,613 |
| Treatments / matched controls | 480 / 1,133 |
| Exact observation records | 3,074 |
| Malformed records or failed integrity checks in these inputs | 0 |
| Episodes with an exact observation inside the original primary window | 0 |
| Expired missing primary outcomes | 1,613 |

Episode file SHA-256: `35de644527e1db6f09fb5778638d22c7573916a6192a9a97ad6aa89f48ea0b59`.
Observation file SHA-256: `08b8c4d71e33d99c2ffc1610f373f3a511b5ffec022994d674105cf23badfbbc`.

The join required valid hashes, exact token identity, exact pool when frozen, valid positive prices, and the original primary-horizon window. It is a local-ledger preflight, not a claim that every possible external archive was recovered, not a complete certification run, and not evidence of 1,613 losing trades. No original row was changed. Current prices cannot replace observations that were never captured in those windows.

All preserved episodes declare `[1, 6, 24, 168, 720]`. Their versioned frozen evaluation policy governs the primary horizon and its tolerance. Non-primary collection windows in later operational code must not be presented as originally frozen statistical policy.

## Repaired failure paths

- An explicit frozen horizon list is no longer intersected with global defaults, which omitted six-hour work. Missing, mixed malformed, empty, or duplicate frozen horizon lists remain explicit invalid contracts, not substitute defaults or healthy empty queues.
- Primary tolerance comes from `PROSPECTIVE_EDGE_CERTIFICATE_V1`, not a conflicting generic tolerance. Non-primary operational tolerances are labeled non-certificate.
- A primary exception, timeout, or invalid source clock may use the independently timed, budgeted existing Gecko fallback. Exact known pools cannot be resolved by pool-less observations.
- Each provider attempt retains request and receipt times. Independent market-source time remains null when unavailable. Known future or contradictory clocks cannot become accepted observations. A later receipt cannot legitimize source evidence after an earlier declared capture.
- Due, selected, deferred, observed, persisted/resolved, and unresolved obligations are separate. Receiving one price cannot hide another due horizon that expired during the request. Candidate caps apply after the complete due denominator is counted.
- Rejected or unconfirmed exact-ledger admission produces `CAPTURE_STORAGE_DEGRADED`. Existing acknowledged duplicates may satisfy persistence without duplicate writes. Explicit zero budgets do not fall back to nonzero defaults.

## Durable scheduling foundation

The opt-in archive coordinator persists writer ownership, fenced task leases, retry dates, provider/total request charges, dispatches, receipts, cooldowns and circuits. Polling or restarting does not reset allowances. Network waits happen outside SQLite write transactions. Late response bytes remain retained while expired obligations remain missing. Portable exports retain operational state and use a file catalog captured with their SQL snapshot.

See [durable-evidence-archive.md](durable-evidence-archive.md) for the API, backup/restore behavior and explicit clock-policy binding. A receipt-capture policy is an admitted task property, not permission to modify the original frozen experiment or retroactively remove another task's source-clock requirement.

## Still required

The existing collector has not been retired, and no always-on service or workflow has been enabled by this repair. Finish exact frozen-episode import, historical observation reconciliation, raw provider-response integration, first-attempt/fallback capacity allocation, one reviewed persistent coordinator, independent backup, verified incremental remote synchronization, and sustained collection acceptance before migration.

Keep expired historical obligations and failed experiments in accounting. A meaningful decision-code or policy change requires a separately declared experiment with prior trials retained; keeping a fixed fingerprint while changing decision code is not acceptable. Do not start a fresh experiment to erase missing or unfavorable history.

Storage tests and synthetic captures are engineering evidence only. Production acceptance still requires the source-pinned 25/100/500 acquisition ladder and the declared continuity/restore checks. The original safety, identity, execution-cost, replication, capture, sample-size, uncertainty and certificate-integrity gates remain unchanged. Zero qualified picks can be a valid result; a profitable edge has not been established.
