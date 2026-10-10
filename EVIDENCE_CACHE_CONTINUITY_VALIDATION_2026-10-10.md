# Evidence Cache Continuity

## Root Cause

The canonical scanner state bundle did not include
`data/security-evidence-cache.json`. Existing exact provider evidence was therefore
lost when Actions restored scanner state on another runner. The dashboard and
evidence workflows already restore and pack this same canonical bundle; no new
workflow or provider is needed.

## Repair

Include the existing provider cache in the canonical state allowlist. Preserve
the exact file bytes, provider identity keys, observation timestamps and cache
timestamps. Do not extend the security cache's six-hour default TTL or change
identity, safety, execution or qualification gates.

## Regression Evidence

The new pack/delete/restore test failed before the allowlist repair: zero files
were restored. After the repair it restores the cache and checks its bytes.
The test invokes the actual security cache reader from an isolated working
directory and proves:

- Fresh exact Base provider proof survives with its original observation time.
- Evidence older than the supplied six-hour TTL remains unavailable.
- The same address on another chain cannot reuse Base evidence.
- Cached UNKNOWN evidence remains UNKNOWN with zero confidence.

Focused scanner-state and security-evidence validation: 30 tests passed.
Full-suite and CI results are recorded in the accompanying pull request.

## Cost And Limits

The repair adds no provider requests. Existing fresh cache hits can avoid repeated
acquisition; production savings have not yet been measured. The cache is subject
to the bundle's existing integrity and size limits. A six-hour scan interval can
legitimately exceed the six-hour TTL, so this does not promise fresh evidence on
every scheduled scan. Missing or stale creator/security proof must still be
recovered or remain UNKNOWN. This change does not implement durable wallet
history or prove that the full production universe is no longer starved.
