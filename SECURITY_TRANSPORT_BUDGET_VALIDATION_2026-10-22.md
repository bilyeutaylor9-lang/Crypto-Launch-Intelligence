# Native Security Transport Budget Repair

## Reproduced Defects

The EVM free-security composite previously reserved four request units before
running its connectors. A configured Etherscan adapter can issue three requests,
Blockscout two, and GoPlus and Sourcify one each. The cold native collection can
therefore dispatch seven requests while charging four. Conversely, a cache-only
repeat dispatched zero requests but still charged four and reserved a GoPlus slot.

The new native collection reuses the Solana per-transport admission pattern.
Each native HTTP attempt passes the existing shared allowance, phase reserve,
deadline, timeout and provider-circuit checks. No limits or provider entitlements
were increased. Already-admitted sibling requests settle before reporting.

| Deterministic native fixture | Before | Repaired |
| --- | --- | --- |
| Seven cold HTTP attempts, Etherscan configured | 4 units charged | 7 units charged |
| Four-unit cap, Etherscan configured | 7 attempts dispatched | At most 4 dispatched |
| Cache-only repeat | 4 units and GoPlus slot | 0 units, no GoPlus slot |
| Cold collection, Etherscan key absent | 4 units | 4 units |

These are mocked-transport regressions, not live provider-cost measurements.
Custom security providers retain their existing explicit aggregate-cost contract;
this change does not claim to instrument arbitrary custom adapter internals.

## Compatibility And Truth Guarantees

- New connector hooks are security-scoped. Existing wallet and execution JSON
  transport options do not silently become EVM security transports.
- Native per-request timeouts also honor shorter connector-specific timeouts.
- HTTP 429 retains its status and Retry-After cooldown. Other providers can still
  supply independent evidence. Cooldown timestamps remain serializable.
- GoPlus, Sourcify and Blockscout retain their existing non-outage 404 behavior.
  Etherscan and Solana/RugCheck failures receive no blanket 404 exemption.
- Zero dispatched requests and no usable cached evidence do not manufacture a
  changed security family merely from budget/configuration UNKNOWN wrappers.
- Cached proof keeps its original observation time. Missing source, creator,
  honeypot, wallet labels or execution evidence remains UNKNOWN.
- Sourcify creation block normalization separately rejects null, blank, boolean,
  fractional and unsafe values instead of converting them to block zero.
- The Fastify lockfile-only patch addresses GHSA-389g-gv7q-r4x8 without changing
  the declared dependency range or unrelated dependency entries.

The first full validation exposed transport-option and tiny-fixture coupling.
The phase-only fixture now explicitly mocks its unrelated security provider;
its budget, history, ordering and quote assertions are unchanged. The subsequent
focused run passed all 58 tests. Final full-suite and report-command evidence is
recorded in the PR and preserved operator logs rather than inferred here.

## Production Acceptance Still Required

The last source-pinned main audit (c2884004, run 39815536696) still had 500 deeply
evaluated candidates, 3500 deferred, 358 core-starved, zero verified routes and
zero qualified candidates. Average field coverage of 89% did not mean candidates
were decision-complete. No after-repair live comparison has yet been established.

Live acceptance must measure actual acquisition, original quote expiry, missing
raw fields and provider cost at the reviewed source. The database-size outage,
oversized legacy restart bundle, independent backup and persistent collector
acceptance are separate unresolved operational requirements. Tests cannot certify
profitability. Trading, automatic strategy promotion and safety gates are unchanged.
