# Crypto Launch Intelligence Scan Results - Debug100

Local run date: 2026-08-10 America/Phoenix  
Artifact timestamps: 2026-08-11 UTC  
Repository commit scanned: `f7bc7811ea6d9e53c7b64ae0902de5efa42f6fb5`

## Validation Commands

| Command | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS: 412 files checked, 0 failures |
| `npm test` | PASS: 641 tests passed, 0 failed |
| `npm run scan:debug100` | COMPLETED |
| `npm run engine:audit:full` | PASS: 175 engines executed |
| `npm run results:health` | PASS: 61 required report contracts checked |
| `npm run smoke:scanner` | PASS with readiness warning |

## Scan Outcome

- Projects discovered for debug run: 100
- Projects scanned by intelligence pipeline: 67
- Raw discovery candidates: 1,873
- Deduped discovery candidates: 1,786
- Discovery target: 100
- Discovery shortfall: 0
- Final qualified candidates: 0
- Final blocked candidates: 2
- Final insufficient-data candidates: 65
- Guarded result: `NO_VALID_MOVE_TODAY`
- Data-recovery queue: 65 candidates
- Scanner semantic health: `INSUFFICIENT_EVIDENCE`
- Average evidence coverage: 54%
- Master system readiness: `FAIL`

## Provider / Environment Notes

- Supabase memory was skipped because Supabase is disabled locally.
- Birdeye was skipped because `BIRDEYE_API_KEY` is missing.
- CoinCap was skipped because `COINCAP_API_KEY` is required for CoinCap V3.
- Binance returned HTTP 451.
- Bybit returned HTTP 403.
- CoinGecko exceeded the configured 20 second scan budget.
- 0x route recovery was skipped for affected routes because `ZEROX_API_KEY` is missing.

## Report Health

Report contract validation initially failed because `whole-engine-audit.json` and `engine-value-ledger.json` were not produced by `scan:debug100` alone. After running `npm run engine:audit:full`, `npm run results:health` passed with all 61 required report files present and valid.

## Confirmed Remaining Issues

- The scanner completed, but master readiness remains red due to report/readiness dimensions including sources, candidate lanes, op mode, guarded live ranking, and scanner semantic health.
- The run did not produce a pick. This is expected under the current evidence policy because no candidate passed final measured-evidence requirements.
- The repair bundle's production audit findings remain relevant for full repair work, especially around final-selection ordering, stage-aware semantic health, active evidence recovery, provider routing, and publishing current red-truth dashboards.

