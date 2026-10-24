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

## Persistent frozen-episode collector

`npm run outcomes:frozen -- --archive /absolute/persistent/archive` imports the complete original cohort and exact-observation ledgers without HTTP. Source byte indexes reproduce original whitespace, malformed records, blank lines and trailing-newline state. Every valid frozen horizon creates an immutable duty. The primary window uses the frozen evaluation policy; other windows retain explicit operational-only labels. Known late receipts and stale source clocks cannot fill an on-time duty. Genuine historical observations use separate reconciliation receipts, never backdated task completion.

Add `--collect` only on the reviewed persistent host. Each bounded cycle services at most 60 duties, within a persistent shared 60-request/hour budget and a 45-second absolute deadline. First attempts and retries/fallbacks share protected capacity; capacity unused by one class can be lent to the other. Gecko additionally retains its 6.1-second pacing across restarts. Primary and fallback each require an independent request reservation. Timeout termination is not represented as an HTTP receipt.

The collector awaits exact raw-body archival before parsing, including non-OK and malformed responses. Identity, provider, request, actual body receipt, independent source clock when supplied, and raw bytes remain bound. Generic metadata/creation/HTTP Date timestamps are not market clocks. Frozen duties require a deterministically replayable exact capture, not arbitrary bytes with positive-looking flags. Cancellation cannot later register a detached provider response as accepted.

On restart, saved original raw responses can be replayed without another HTTP request. Only the original admissible receipt/window can reconcile a duty. Local exact-ledger projection is append-only, fsynced and independently read back by observation ID/hash. A crash between append and receipt does not duplicate rows. Malformed history is preserved and blocks projection visibly; it does not erase previously admitted duties. A local projection receipt is not a remote synchronization acknowledgment.

Optional `--cohorts`, `--observations` and `--report` paths permit isolated validation. Existing collector locking is honored during migration. No daemon, launchd job, workflow migration, market discovery, new experimental selection, trading or promotion is activated by this command. Import-only and no-work results are not live collection acceptance.

## Shared exact captures and unchanged imports

A single verified provider response can reconcile multiple frozen duties only when every target has the same exact chain, token and known pool, and the original receipt and independent source clock satisfy each target's own window and clock policy. The capture retains its original task, raw response and observation hash. Shared reconciliation does not create extra independent observations, alter trial accounting, fill future windows or refresh timestamps. Anchor completion and compatible reconciliation are atomic; a storage failure rolls back completion and stops further provider traffic. The preserved raw receipt remains available for crash recovery.

Unchanged ledger imports still audit and count their sources and all duties, but skip immutable historical reconciliation writes already confirmed in the archive. A later valid observation can still resolve an outstanding duty. Polling cannot reset provider allowances or turn a missing historical outcome into an on-time capture.

## Preserved GitHub cache export

The manual `Exact Outcome Probe` workflow has a separate `export_forward_cache` mode. It restores a selected cache and exports original bytes, a manifest and a transport receipt without probing, synchronizing Supabase, saving a replacement cache or running the normal probe job. Exact-key requests require an exact cache hit. The default selection is restricted to the main cache prefix. Streaming copies, bounded size, exclusive files, source-change checks and hashes protect the export; malformed original records are not repaired or discarded.

The original export at commit `b60fab2f1e64ec21e39de2005bae96b9d6ba6136`, workflow run `39353513814`, recovered cache `forward-evidence-Linux-main-39344534021`. Local extraction verified these original files:

| File | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `production-market-observations.jsonl` | 86,359,569 | 50,181 | `5438302f3e79a3837e17321fda86a38a9fdd18e65d1948198f10c3d36a3fb12b` |
| `market-context-observations.jsonl` | 1,339,903 | 581 | `fe652ef1edb248198cb4bf46e5d4bec03dd34a8596584b2be5c275566e85cf6a` |
| `prospective-edge-cohorts.jsonl` | 9,600,338 | 1,757 | `e524ed24789d0be5721eba98066cdd84c0bc6cd49fa0fa4481e5d815db7ba462` |

These are raw line counts, not integrity-qualified observations or certified comparisons. Exporter commit/run provenance does not infer the original record producer or its capture time. The artifact has one-day retention and is temporary transport, not a permanent independent server backup. The retained local ZIP, archive, source files and receipts are recovery copies on this Mac; they are not evidence of remote synchronization or sustained collection.

## Still required

The existing collector has not been retired, and no always-on service or workflow has been enabled by this repair. The imported/replayed queue and provider integration require real-data restoration and sustained capture acceptance before migration. One reviewed persistent coordinator, independent backup and verified incremental remote synchronization remain release requirements.

Keep expired historical obligations and failed experiments in accounting. A meaningful decision-code or policy change requires a separately declared experiment with prior trials retained; keeping a fixed fingerprint while changing decision code is not acceptable. Do not start a fresh experiment to erase missing or unfavorable history.

Storage tests and synthetic captures are engineering evidence only. Production acceptance still requires the source-pinned 25/100/500 acquisition ladder and the declared continuity/restore checks. The original safety, identity, execution-cost, replication, capture, sample-size, uncertainty and certificate-integrity gates remain unchanged. Zero qualified picks can be a valid result; a profitable edge has not been established.
