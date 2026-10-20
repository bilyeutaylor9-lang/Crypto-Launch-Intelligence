# Certificate Integrity Veto

## Reproduction

R1 uses 252 fully matched synthetic treatment/control pairs across 36 independent
cohorts. The fixture passes the original 250-pair checkpoint, project, capture,
execution-cost, replication, uncertainty, interim-safety and missingness gates.
Its valid final certificate is positive. This is a software fixture, not a live
trading result or profitable-edge claim.

Before repair, seven adversarial cases still produced a positive final
certificate: a corrupted required observation, malformed observations or
historical episodes, mismatched observation identity, a future observation,
non-legacy historical corruption, and disabled required observation integrity.
The retained failing test receipt records the actual final certificate defect.

## Repair

- Current-partition validity cannot override non-legacy historical corruption
  or observation-ledger integrity failure.
- The existing legacy order-sensitive exception list is unchanged. Only that
  narrowly classified historical damage can remain quarantined; duplicate IDs,
  topology defects and other corruption still veto certification.
- Malformed inputs, null records, contradictory identity bindings, future
  observations and duplicate observation keys remain visible and fail closed.
- Required observation integrity cannot be disabled to obtain a certificate.
- The final certificate writer independently checks explicit integrity audit
  results, rejected observations, duplicates, topology and historical scope.
  Missing or non-boolean passing checks do not count as passing.
- Both certificate booleans are false on veto and the specific blocker remains.
  Grading does not modify, delete, repair or regenerate hashes in input evidence.

No frozen statistical policy, strategy threshold, checkpoint, horizon, sample
minimum, execution-cost requirement or uncertainty criterion changed. Future
production freezes continue to bind their actual code commit and strategy
definition; old experiments are not rewritten or discarded.

## Preservation And Operations

R0 inventories accessible original files and GitHub artifact metadata before
collection migration. Local recovery copies and restore drills are not an
independent backup. An existing server or separate device must be supplied and
its capacity, transfer hashes and restore behavior verified before that gate can
pass. Supabase quota restoration and its actual billing-cycle reset remain
unverified. The existing collection path has not been retired.

The separate PR #56 live scan remains pinned to `c3adc485`; these certificate
repairs do not modify its source checkout, provider allowance or observations.
Full regression and exact-head CI receipts are retained separately before merge.
