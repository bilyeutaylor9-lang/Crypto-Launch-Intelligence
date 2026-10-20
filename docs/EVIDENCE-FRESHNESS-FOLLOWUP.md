# Evidence Freshness Follow-up

## Observed Problems

The source-pinned `76bea653109e6022bd2706755d827f0e457a27b0` live scan
(`scan_1792332641516`) evaluated 130 deep candidates and deferred 1,276.
Core coverage was 92%, advisory coverage was 90%, and three candidates were
truly core-starved. No candidate qualified. Three paired quote observations
expired before the final publication cutoff and were correctly demoted.
Operational readiness remained `DATA_DEGRADED`; this is not a profitable-edge claim.

- Execution-only recovery replayed known holder companions as new wallet changes.
  Older provider samples could overwrite newer RPC-derived wallet arrays.
- The GoPlus cooldown check preceded a usable local cache lookup. Aged exact
  holder addresses could not seed fresh bounded RPC balance verification.
- Canonical IDs lowercased Solana mints, which are case-sensitive. Consumers
  could deduplicate distinct mint identities or mismatch historical evidence.
- Saved recovery attempts omitted cumulative versus phase-local evidence changes.

## Repair Guarantees

- Existing wallet arrays and provenance survive execution-only recovery. Valid
  missing companions remain recoverable without extra HTTP requests.
- Current exact cached observations keep their original source timestamps.
  Aged cached addresses are query seeds only. Positive canonical-block balances
  are required for fresh holder observations; failed or zero balances stay unknown.
- Shared deadlines, provider circuits, request budgets and RPC probe caps still apply.
- Solana canonical IDs preserve mint case. EVM address normalization is unchanged.
  Historical migration requires agreeing independent chain and address fields;
  ambiguous records remain quarantined and cannot support bullish conclusions.
- Recovery reports retain cumulative and phase-local changes separately. Missing
  legacy measurements are null; observed empty arrays remain empty arrays.
- These repairs do not extend quote TTLs, force picks, grant smart-wallet labels,
  change trading permissions, or weaken final identity, safety and execution gates.

## Remaining Validation Boundary

The above live measurements belong to the baseline commit, not this follow-up.
Focused regressions and the full validation results are recorded in the follow-up
pull request. A new production-style scan must be tied to its actual source commit.
Provider throttling, missing credentials and unobserved creator evidence remain
external limitations until fresh exact observations are available.
