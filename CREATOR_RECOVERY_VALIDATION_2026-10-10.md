# Creator recovery validation

Production run 38023660203 evaluated 500 deep candidates. Core coverage was 91%,
but 122 candidates (24.4%) lacked the deployer/creator/lifecycle required-any
group, so semantic health correctly returned DATA_DEGRADED.

## Confirmed acquisition defects

- Creator recovery tried Sourcify and Blockscout before cheap GoPlus evidence.
  An affected BSC contract had an exact creator record in GoPlus during the audit.
- Connectors converted HTTP failures to UNKNOWN. The recovery executor counted
  these as successful acquisitions, so provider circuit breakers did not open.
- Per-candidate field caps used value of information alone and could omit core
  evidence in favor of advisory fields.
- Cached Sourcify/Etherscan creator records were not reused (fixed earlier in
  this branch). Reused records must carry matching chain and contract identity.

## Repair

Use GoPlus first in the standard creator recovery path. Preserve explicitly
injected provider behavior. Mark transport failures so the existing chain-scoped
circuit breakers can act on them. A valid 404 lookup stays a healthy negative
response. Prioritize core fields within each candidate's recovery cap. Charge
the default Blockscout path for its two HTTP requests.
GoPlus normalization requires the exact returned contract key; another token's
record cannot provide creator or safety evidence for the requested contract.
Old GoPlus cache records without that response-identity proof are refreshed.
Creator and security recovery share the same exact record, and missing raw
safety flags cannot produce clean negative safety observations.

GoPlus's documented free quota is 30 requests/minute. All default creator and
security callers share 2.1-second pacing and a 61-second cooldown after rate
rejection. Queue waits occur before HTTP recovery timeouts and recheck the shared
request budget. Rate rejection remains UNKNOWN and does not permanently open a
provider circuit. The recovery-stage deadline is 25 minutes to fit paced calls;
final gates are unchanged. Scheduled and manual workflows pass GOPLUS_API_KEY
and GOPLUS_REQUEST_INTERVAL_MS (default 2100) through to the existing connector.
See https://docs.gopluslabs.io/reference/support.

Missing creator evidence stays unknown. These changes do not alter final
selection gates or convert a creator address into a favorable reputation.

## Live evidence

A bounded check against the saved production snapshot identified 99 unambiguous
candidate records by name, symbol, and chain, then queried providers using each
record's exact chain and contract address. One ambiguous snapshot association
was skipped. The initial pass returned creator observations for 21 candidates.
It preceded the stricter GoPlus response-key check; treat that count as a
preliminary acquisition observation, not independently reverified creator proof.
Each observation retained source, timestamp, confidence, verification status,
chain, contract address, and recovery marker.

A later strict, paced pass recovered only 6/99 before temporary rate responses
opened permanent circuits. This exposed the cooldown defect repaired afterward.
Provider availability is variable; neither pass establishes production recovery.
The second artifact is `/tmp/cli-creator-recovery-paced-validation-20261010.json`.

This is an acquisition check, not a replay of the complete 500-candidate scoring
pipeline. It does not establish a new production coverage figure or a tradable
edge. Full observation details are in the local generated artifact
`/tmp/cli-creator-recovery-validation-20261010.json`.

## Remaining limitations

Base B20 assets use native precompiles and a 0xef code stub. Ordinary EVM contract
creation APIs need not supply their issuer. The stub is not issuer verification,
and no creator is inferred from a name, stock symbol, or transaction sender.
See https://github.com/base/base-std/blob/main/docs/architecture.md.

Base's current Blockscout API requires a paid plan; this repository has no
Etherscan API key configured. These are external availability limits, and an API
key alone does not guarantee B20 issuer proof. See
https://github.com/blockscout/docs/blob/main/base-api.mdx.

## Checks

- 1,331 tests passed on the final code, including identity, cooldown, pacing,
  shared-budget, proof-reuse, and missing-safety-flag regressions.
- JavaScript syntax checks are rerun after the final limiter module is added.
- Typecheck and focused provider/recovery regression tests passed.
- The bounded scanner smoke check passed in a separate checkout: 45 deep
  candidates, 18 deferred, 92% core coverage, 5 core-starved (11.11%), 5 verified
  routes, zero qualified candidates, and NO_EDGE_FOUND. Readiness and required
  report contracts passed. Reports do not race with test-runner isolation.
