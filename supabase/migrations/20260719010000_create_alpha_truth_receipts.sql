-- Alpha Truth Kernel proof receipts
-- Stores immutable point-in-time decision receipts for public track-record and learning.

create table if not exists public.alpha_truth_receipts (
  receipt_id text primary key,
  run_id text not null references public.scan_runs(run_id) on delete cascade,
  project_key text not null,
  decision_at timestamptz not null,
  name text,
  symbol text,
  chain text,
  contract_address text,
  pool_address text,
  rank integer,
  final_state text,
  final_qualified boolean default false,
  score numeric default 0,
  confidence text,
  truth_status text,
  effective_independent_evidence_count numeric default 0,
  evidence_families_json jsonb not null default '[]'::jsonb,
  required_proof_json jsonb not null default '{}'::jsonb,
  execution_snapshot_json jsonb not null default '{}'::jsonb,
  market_snapshot_json jsonb not null default '{}'::jsonb,
  receipt_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alpha_truth_receipts_run_rank
  on public.alpha_truth_receipts(run_id, rank);

create index if not exists idx_alpha_truth_receipts_project
  on public.alpha_truth_receipts(project_key, decision_at desc);

create index if not exists idx_alpha_truth_receipts_truth_status
  on public.alpha_truth_receipts(truth_status);

alter table public.alpha_truth_receipts enable row level security;

-- The service-role key bypasses RLS and can write receipts from the scanner.
-- Add a narrow SELECT policy only if you intentionally want public dashboard reads.
