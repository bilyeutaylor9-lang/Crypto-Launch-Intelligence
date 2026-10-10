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

Missing creator evidence stays unknown. These changes do not alter final
selection gates or convert a creator address into a favorable reputation.

## Live evidence

A bounded check against the saved production snapshot identified 99 unambiguous
candidate records by name, symbol, and chain, then queried providers using each
record's exact chain and contract address. One ambiguous snapshot association
was skipped. Exact creator observations were recovered for 21 candidates.
Each observation retained source, timestamp, confidence, verification status,
chain, contract address, and recovery marker.

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

- 1,322 tests passed.
- 710 JavaScript files passed syntax checks.
- Typecheck and focused provider/recovery regression tests passed.
- The bounded scanner smoke check runs in a separate checkout so generated
  reports cannot race with the test runner's report-directory isolation.
