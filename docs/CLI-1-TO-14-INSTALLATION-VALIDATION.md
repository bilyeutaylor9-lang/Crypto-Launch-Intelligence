# CLI 1.0–14.0 Installation Validation

Date: 2026-08-24

## Sources

- Base repository commit: `2e869b2`
- Hardened CLI 1.0–8.0 master package: `Crypto-Launch-Intelligence-MASTER-CODEX-PACKAGE.zip`
- CLI 1.0–8.0 master package SHA-256: `cf849a84d283e20bdbc77131cfa2c6fa84c615f7988aa92faa52dfa6f3544a3b`
- Embedded CLI 1.0–8.0 standalone package SHA-256: `7cff7dbf930c6f368f318b3c41149b98c4be40f3ab9d2f2d27b8dae12be4e9d7`
- Complete CLI 3.0–14.0 handoff: `Crypto-Launch-Intelligence-CLI-3-TO-14-COMPLETE-BUILD.zip`
- Complete handoff SHA-256: `4b45e48017c444cbc4f6f3cdcb9ca91beedc1d7274aa94f36859d436b03015a3`
- Embedded CLI 3.0–14.0 package SHA-256: `b6ee74351e72c1d8058a2597aab0d4ebea536b1698a8fda80d470cd57a3f99c8`

Every checksum in both authoritative handoffs passed before installation.

## Installation

The CLI 1.0–8.0 compatibility check proposed 106 changes and modified no files. The normal installation installed the complete payload, patched the host scripts and Edge Evidence Truth workflow, and left automatic trading disabled.

The CLI 3.0–14.0 compatibility check then reported 18 changes, 106 already-current payload files, and no warnings. Installation added the unified CLI 9.0–14.0 runtime, its scheduled workflow and roadmap tests, and patched the production scripts. Its immediate post-install check reported all 124 payload files current with zero remaining changes.

Pre-existing host states are preserved under:

- `.cli-master-backups/2026-08-24T03-53-04-771Z/`
- `.cli-master-backups/2026-08-24T04-12-18-045Z/`

The installer audit did not list patch-time backups, so the backup files were independently verified against the exact pre-patch Git objects. All three hashes match.

## Integration hardening

Host-wide validation found and repaired three integrity gaps:

1. The exact market-observation ledger was added to the restore and save lists in `pages-dashboard.yml`, `outcome-probe.yml`, and `edge-lab.yml` so the shared learning cache cannot drop forward truth when control moves between workflows.
2. The unified CLI 9.0–14.0 runtime, capital-destination matcher, Market Thesis Generator, and Alpha Memory Graph now quarantine candidates without exact chain/token identity. Future-dated market observations are also excluded at the runtime boundary. No symbol or name fallback can enter thesis ranking.
3. The production security audit now fails closed as `SECURITY_AUDIT_INCOMPLETE` when `npm audit` is unavailable, fails, or returns unparsable output. Missing dependency-audit evidence can no longer be reported as a pass.

Regression tests cover all three repairs.

## Validation evidence

- Active source syntax/lint validation: 668 files, 0 failures.
- GitHub Actions YAML parsing: 15 workflows, 0 failures.
- Required CLI/package test groups: 138/138 passed.
- Complete repository test runner: 1,159/1,159 passed.
- Unified CLI 9.0–14.0 smoke runtime: passed with an honest `INSUFFICIENT_THESIS_EVIDENCE` result on an empty evidence state.
- Reproducibility, local backup/restore, and fault-injection audits: passed.
- Exact symbol/name-only forward matching: blocked.
- Automatic model promotion and automatic trading: disabled.
- Final fail-closed security scan: 827 files scanned, no secret findings; dependency audit intentionally reported incomplete when `npm` was removed from the execution path.

A real networked dependency audit completed before the CLI 9.0–14.0 integration with zero high or critical vulnerabilities. The integration changed neither dependencies nor `package-lock.json`. GitHub CI must repeat the real audit for the final branch because the local sandbox does not grant registry network access.

## Honest runtime state

The code is installed and locally validated, but the system correctly remains `NOT_PRODUCTION_READY`. Current blockers are real external or forward-evidence requirements, including live RPC/provider and storage configuration, remote backup/PITR attestation, GitHub Actions behavior, matured exact forward outcomes, calibration, observability, challenger performance, and canary evidence.

No credentials, provider health, backup status, observations, calibration, or verified alpha were fabricated to clear those gates.
