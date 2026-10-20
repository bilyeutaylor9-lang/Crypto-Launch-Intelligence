# Final Audit Latency Follow-up

## Observed Bottleneck

The source-pinned `94892e09` scan (`scan_1792341732341`) recovered four
paired routes, but only one was still fresh at its final cutoff and none was
fresh at report generation. The timing trace recorded 4.005 seconds for FINAL
readiness and 4.668 seconds for root-cause analysis after late quote recovery.
Quote TTLs must not be extended to hide this latency.

CPU profiling of the saved 133-row deep cohort confirmed repeated alias
collection. A multi-field alias resolution independently re-resolved the same
chain context for every non-chain field. The repair resolves that context once
inside each call. It does not cache project values across calls, skip fields,
remove provenance, change conflict ordering, or alter normalization policy.

## Validation Evidence

An offline replay used the same saved input and a clock frozen at its recorded
cutoff solely to make full output comparison deterministic. No providers were
called. The complete readiness and root-cause outputs were deep-equal to the
unmodified `94892e09` implementation, including every input field, audit record,
conflict, missing-field classification and recovery plan. Input objects were
unchanged.

The shared output SHA-256 was
`f201abf7bada19ef44645a5c21aedcca8340e7ed45c04e89d367b9b9982ef7bd`.
Three uncontended replay samples had median combined audit times of 2.413
seconds before and 1.581 seconds after. Median root-cause time was 1.546 versus
0.777 seconds. These are saved-cohort replay measurements, not a live-scan
speedup or evidence of additional qualifying candidates.

The regression reproduces five chain lookups for five fields before the repair
and requires one afterward. Additional cases compare the independent legacy
collector across changed chain/provenance, explicit contexts, explicitly null
contexts, missing evidence, conflicts, case-sensitive addresses and all current
canonical contract fields. No threshold, identity check, quote TTL, request
allowance, freshness check or final safety gate is changed.

## Remaining Limits

This removes avoidable work, not the need for fresh quotes. Provider identity
attestation, missing keys, inaccessible sources and Supabase egress restrictions
remain external limitations. The bounded three-wave hydration policy remains
unchanged. No profitable edge, guaranteed pick, automatic trading or strategy
promotion is established by a performance optimization.
