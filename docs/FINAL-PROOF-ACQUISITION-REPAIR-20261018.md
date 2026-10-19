# Final Proof Acquisition Repair

Follow-up to PR #56, based on `43aef77e8f9eb543d3e0f2981ed083444d0b86b5`.

## Reproduced Defects

- Remote restoration treated every short body page as missing history. A server
  cap of one row caused a three-record restore to fail despite all records
  existing. Body reads now query only outstanding IDs and validate every body
  against the complete remote index. Empty, corrupt, conflicting, duplicate,
  unexpected and errored responses still fail before local appends or uploads.
  Each successful read removes an ID; an original batch permits at most 50 reads.
- Final safety and transfer-tax gaps did not create raw acquisition requests
  when the engine-input manifest was already satisfied. Those gaps now schedule
  existing chain-applicable collectors, including undefined safety results.
  Existing request, time, wave, circuit-breaker and identity limits remain.
- Creator-only local/cache evidence returned before richer deployer sources
  could provide a requested creation transaction, block or timestamp. Recovery
  now merges exact observations and fetches only unresolved supported raw fields.
  Unsupported wallet-age/history requests do not spend provider requests.
- An unsuccessful Jupiter USDC attempt made a valid later SOL buy/sell pair
  appear to have three legs. Attestation now isolates the selected token pair
  while retaining exact request/response amounts, token and pool checks.
  Missing price-impact measurements remain unknown.
- A derived `finalContractAddress` unconditionally became verified on identity
  reentry. Also, string values such as `"false"` and `"UNKNOWN"` were coerced to
  true. Derived aliases no longer establish independent verification and only
  explicit boolean contract proof is accepted by canonical resolution.
- Unrelated same-ticker instruments on other chains demoted independently
  verified chain-contract identities. Exact proven instruments stay distinct;
  collision warnings remain and no issuer/bridge relationship is inferred.
  Unknown instruments and actual conflicting anchors remain unverified/blocked.
- Existing Solana mainnet mint-account evidence had no final identity consumer.
  Identity now validates exact mint aliases, mainnet genesis, token program,
  account slot, paired authority fields and the account's block timestamp.
  `SOLANA_MINT_ACCOUNT` is a scoped account identity, not issuer, source-code,
  utility, safety or profitability verification.
- Cached final identity flags could outlive that account attestation. Final
  selection rechecks its 300-second limit directly; report compaction preserves
  a finite proof projection and its scope without retaining unbounded RPC data.
  Aggregate adverse RugCheck findings remain adverse without invalidating the
  independently observed account identity. SECURITY changes rerun identity.

## Validation

- Regression failures were reproduced before each repair.
- Combined broad suite: 2,222 tests passed, zero failures or skips.
- Syntax checks: 968 JavaScript files passed; `npm run typecheck` passed.
- Fresh `npm ci`: 133 packages audited, zero reported vulnerabilities.
- Focused acquisition, paging, identity, stale-proof and report tests pass.
- Two existing fixtures were corrected: a pool-only test explicitly declares
  its completed synthetic safety check without increasing its five-request cap;
  a ticker-collision test now asserts distinct verified instrument IDs, retained
  collision diagnostics and unchanged rejection of actual contract conflicts.
- Live validation must run from a clean committed source version. Its metrics,
  immutable artifact receipt and provider limitations belong in the PR and
  saved run artifacts, not in this source-only audit as an unobserved claim.

## Operational Limits

The previous saved live run had 132 deep candidates, 92% core coverage, zero core
starvation, 126 unresolved final decision-proof rows and zero qualified picks.
Its four routes were historical at the scan cutoff, not current executable offers.

The October 18 production Edge Evidence Truth run `39169324945` independently
reported `exceed_egress_quota` on both restore and sync. The connected Supabase
organization is on the Free plan. ACTIVE_HEALTHY database metadata does not prove
that restricted Data API reads work. This patch does not change billing, spend
caps, credentials, schema, RLS, workflows' failure conditions or durable history.

No score threshold, risk threshold, identity requirement, quote lifetime,
liquidity minimum, security check, promotion gate or automatic-trading setting
was weakened. Zero qualifying candidates remains a valid outcome. No profitable
edge is established by these repairs or test results.
