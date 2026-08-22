# Qualification Proof Repair v1

Built against GitHub `main` commit `a18dcf405ac9a7ca6f2f8fb1e718b2d5d4ef0443`.

This is the next action after the Qualification Failure Microscope. It only refreshes recoverable proof gaps. It does not change the edge hypothesis or lower any gate.

Recoverable proof includes route identity, buy/sell quotes, quote freshness, executable depth, verified slippage, and explicit user-access evidence.

Known safety failures, identity conflicts, and confirmed regional restrictions are never repair targets.

The orchestrator reuses the repository's existing:
- `analyzeExecutionProofRecoveryBatch`
- `analyzeExecutionProofBatch`
- `analyzeRouteAccessibilityBatch`
- `analyzeFinalSelectionIntegrityBatch`

The diagnostic layer removes any default user-region assumption unless `USER_REGION` / `USER_STATE` are explicitly configured.

Outputs:
- `reports/qualification-proof-repair.json`
- `reports/report.proof-repaired.json`

The original `reports/report.json` is never overwritten. Any newly qualified candidate is diagnostic-only and has no ranking, scoring, trading, or production-promotion authority.

The package adds a manual GitHub Actions workflow instead of modifying the scheduled production scanner workflow. That makes installation additive and safe to preflight.
