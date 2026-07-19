-- Crypto Launch Intelligence Supabase schema
-- Run this in Supabase SQL Editor before enabling SUPABASE_ENABLED=true.
-- Use SUPABASE_SERVICE_ROLE_KEY for server-side scanner sync. Never expose it in public frontend code.

create table if not exists public.scan_runs (
  run_id text primary key,
  started_at timestamptz,
  completed_at timestamptz,
  platform text default 'Crypto Launch Intelligence',
  status text default 'COMPLETED',
  discovery_count integer default 0,
  scanned_count integer default 0,
  synced_project_count integer default 0,
  qualified_count integer default 0,
  blocked_count integer default 0,
  strong_watchlist_count integer default 0,
  best_project text,
  best_symbol text,
  best_chain text,
  best_score numeric default 0,
  market_regime text,
  scoring_model text,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_projects (
  id bigserial primary key,
  run_id text not null references public.scan_runs(run_id) on delete cascade,
  project_key text not null,
  rank integer,
  name text,
  symbol text,
  chain text,
  score numeric default 0,
  tier text,
  confidence text,
  final_state text,
  final_qualified boolean default false,
  risk_score numeric default 0,
  liquidity_usd numeric default 0,
  volume_24h numeric default 0,
  market_cap_usd numeric default 0,
  source text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, project_key)
);

create table if not exists public.scan_reports (
  id bigserial primary key,
  run_id text not null references public.scan_runs(run_id) on delete cascade,
  report_name text not null,
  report_path text not null,
  created_at timestamptz not null default now(),
  unique (run_id, report_name)
);

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

create index if not exists idx_scan_runs_completed_at
  on public.scan_runs(completed_at desc);

create index if not exists idx_scan_projects_run_rank
  on public.scan_projects(run_id, rank);

create index if not exists idx_scan_projects_symbol_chain
  on public.scan_projects(symbol, chain);

create index if not exists idx_scan_projects_final_state
  on public.scan_projects(final_state);

create index if not exists idx_scan_reports_run
  on public.scan_reports(run_id);

create index if not exists idx_alpha_truth_receipts_run_rank
  on public.alpha_truth_receipts(run_id, rank);

create index if not exists idx_alpha_truth_receipts_project
  on public.alpha_truth_receipts(project_key, decision_at desc);

create index if not exists idx_alpha_truth_receipts_truth_status
  on public.alpha_truth_receipts(truth_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_scan_runs_updated_at on public.scan_runs;
create trigger set_scan_runs_updated_at
before update on public.scan_runs
for each row execute function public.set_updated_at();

drop trigger if exists set_scan_projects_updated_at on public.scan_projects;
create trigger set_scan_projects_updated_at
before update on public.scan_projects
for each row execute function public.set_updated_at();

alter table public.scan_runs enable row level security;
alter table public.scan_projects enable row level security;
alter table public.scan_reports enable row level security;
alter table public.alpha_truth_receipts enable row level security;

-- The service-role key bypasses RLS and can write from the scanner.
-- For a public read-only dashboard, create narrow SELECT policies intentionally.
-- Example, only if you want anonymous read access:
--
-- create policy "public read scan runs"
-- on public.scan_runs for select
-- using (true);
--
-- create policy "public read scan projects"
-- on public.scan_projects for select
-- using (true);
--
-- create policy "public read scan reports"
-- on public.scan_reports for select
-- using (true);
--
-- create policy "public read alpha truth receipts"
-- on public.alpha_truth_receipts for select
-- using (true);
