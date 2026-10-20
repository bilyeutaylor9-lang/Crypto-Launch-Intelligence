# Complete Source Syntax Validation

The canonical `npm run lint` scanner recursively excluded every directory named
`data`, `reports` or `docs`, including production modules within its `src` and
`test` roots. Therefore a green check did not cover the evidence connectors or
report publishers. The preceding wallet-history repair separately checked all
source files rather than relying on that incomplete check.

Keep runtime artifacts outside the existing source roots, and exclude only
dependency and Git metadata directories inside those roots. The canonical check
now includes nested data, report and documentation JavaScript modules.

Two regression tests exercise the actual checker from an isolated fixture tree:

- Invalid provider and report modules must produce FAILED with both file paths.
- Valid nested source modules must be checked while root-level runtime artifacts,
  vendored dependencies and Git metadata remain excluded.

Both tests failed against the old implementation and pass after the repair.
Full suite: 1377 tests passed. Canonical lint: 881 JavaScript files checked,
zero syntax failures. Typecheck and `git diff --check` passed. This branch is
based on current main, independently of the pending wallet-history repair.
This strengthens validation; it does not alter scanner evidence, safety gates,
ranking or provider request costs. No production coverage improvement or
profitable edge is claimed from a syntax-checking change.
