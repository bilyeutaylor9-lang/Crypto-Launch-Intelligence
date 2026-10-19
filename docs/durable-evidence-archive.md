# Durable local evidence archive (R2 foundation)

`src/archive/durableEvidenceArchive.js` is an opt-in local archive. It is not wired to collectors, state bundles, Supabase, selection, or scoring.

Call `admitPrediction` only with the original provider bytes and the obligations already frozen by the admission contract. It gzip-compresses those bytes into a content-addressed segment plus a hash/record/obligation manifest, fsyncs both, then atomically creates the immutable record, future obligations, and admission outbox entry in SQLite. A crash after the segment write leaves an audited orphan; evidence is never deleted as cleanup.

Mutable task state (pending, leased, retryable, budget-deferred, expired, completed), leases, and receipts are separate from immutable content. Leases are short SQL transactions and no method performs network work while holding one. Outbox acknowledgement requires matching `outboxId`, `recordId`, and `contentHash`.

Use `backup(destination)` for snapshots: it calls better-sqlite3's SQLite Online Backup API. Do not copy a live SQLite file. `audit()` makes missing or corrupt segments/manifests visible and intentionally does not rehash/rewrite them. `exportArchive(destination)` creates a portable export; `restoreDurableEvidenceArchive({source, root})` rebuilds an empty local archive, including immutable bytes and mutable task/outbox state. `rebuildIndex()` repopulates an empty index from manifests (and intentionally restores only immutable pending obligations). This is still not wired into active restart state.
