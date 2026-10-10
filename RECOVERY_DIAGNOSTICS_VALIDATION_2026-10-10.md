# Complete Recovery Diagnostics

The completed production run 38069766550 reports 480 recovery candidates
attempted but serializes only 394 candidate-level results: 298 RECOVERED and
96 PARTIAL_RECOVERY. NO_RECOVERY candidates were filtered out. Its root-cause
candidate records also omit exact token and pool identities, preventing reliable
provider triage from that report alone.

Publish all three attempted statuses, including NO_RECOVERY, with original
attempted/recovered/unresolved fields, wave names and provider failure details.
Do not include deferred-before-deep or nonselected candidates. Recovery success
counters and opportunity promotion remain unchanged: a failed attempt is not a
recovered opportunity. Add existing token, pool and canonical identities plus
core missing fields to the root-cause report without inventing missing identity.

Five regressions cover failed attempts, deferred/nonselected exclusion,
symbol-only identity, exact root-cause identity and actual published JSON files.
Validation: 1380 full-suite tests passed in the final serialized run; eight
focused tests passed. Typecheck and diff checks passed. Canonical lint checked
716 files; both changed report modules and the new test were separately checked
because the independent complete-source-checker repair is still pending in PR52.
Replaying the available production success records retains all 394. The old
artifact does not contain the omitted 86 records; this repair cannot reconstruct
them, and a fresh deployed scan must supply those diagnostics.

This is an observability repair, not an acquisition success or financial-edge
claim. Provider costs, evidence confidence, safety gates and qualification logic
are unchanged. UNKNOWN evidence remains UNKNOWN.

## Remaining Audit Finding

A separate isolated cache probe reproduced acceptance of both a nonnumeric
`cachedAtMs` and a timestamp one day in the future by the current security cache
reader. Neither is evidence of freshness. That fail-closed cache repair remains
pending and is not claimed as part of this reporting change.
