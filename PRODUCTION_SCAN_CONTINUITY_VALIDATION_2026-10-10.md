# Production Scan Continuity

## Observed Failure

Live Dashboard run `38069083796`, source
`994dcd64e95e0ffe4cfd264699eadaf73f6061ab`, was cancelled while the scanner was
still executing. Scheduled replacement `38069766550` was subsequently observed
running at the same source revision. The interrupted run uploaded diagnostics,
but its artifact manifest is INCOMPLETE, with only one of eleven dashboard
artifacts ready and no valid data cutoff. It cannot be used as a completed
production coverage comparison.

The workflow used `cancel-in-progress: true` in the shared scanner-state
concurrency group. The manual scan could also preempt that group. This allowed
new triggers to discard ongoing acquisition and prevented complete reports and
state packing. Separately, dashboard upload was unconditional and deployment
only checked upload success: an old checked-in docs directory could be uploaded
after the fresh dashboard build failed.

## Repair

- Preserve the existing shared concurrency group and single running writer.
- Set both full-scan workflows to `cancel-in-progress: false`.
- Set `queue: max` across all eleven shared scanner-state workflows. GitHub's
  default single pending slot otherwise replaces queued evidence work.
- Require successful scanner, report contracts and fresh dashboard build before
  uploading the Pages artifact, and require those same outputs at deployment.
- Keep diagnostic upload unconditional and final health checks unchanged.

GitHub documents the bounded queue (up to 100 pending runs) here:
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency

## Validation

The new non-preemption and stale-dashboard regressions failed before repair.
After repair all 17 workflow-hardening tests pass. Structured YAML parsing checks
all eleven shared workflows for non-preemption and the bounded queue. Full-suite,
syntax and CI results are recorded in the pull request.

## Costs And Remaining Limits

No per-run request limit, timeout, cadence, security gate, identity rule or
qualification threshold changes. Work that previously got cancelled can now
complete, so total Actions/provider usage may increase; no measured savings or
production coverage gain is claimed. Pending jobs can be delayed, and the
documented queue capacity is finite. Genuine acquisition/report failures still
fail health and block invalid dashboard deployment. A truthful completed but
data-degraded dashboard may still publish; these guards do not suppress its
readiness failure. This repair does not implement wallet-history recovery or
make missing creator proof positive.
