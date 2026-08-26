-- Durable, append-only storage for point-in-time forward evidence.
-- GitHub Actions caches remain an acceleration layer, never the system of record.

create table if not exists public.forward_evidence_records (
  ledger_name text not null,
  record_id text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  record_json jsonb not null,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (ledger_name, record_id),
  unique (ledger_name, content_hash),
  constraint forward_evidence_ledger_name_check check (
    ledger_name in (
      'production-market-observations',
      'market-context-observations',
      'prospective-edge-cohorts'
    )
  )
);

create index if not exists idx_forward_evidence_ledger_observed
  on public.forward_evidence_records (ledger_name, observed_at, created_at);

alter table public.forward_evidence_records enable row level security;
revoke all on table public.forward_evidence_records from public, anon, authenticated;
grant select, insert on table public.forward_evidence_records to service_role;

create or replace function public.reject_forward_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'forward_evidence_records is append-only';
end;
$$;

revoke all on function public.reject_forward_evidence_mutation() from public, anon, authenticated;
grant execute on function public.reject_forward_evidence_mutation() to service_role;

drop trigger if exists reject_forward_evidence_update_or_delete on public.forward_evidence_records;
create trigger reject_forward_evidence_update_or_delete
before update or delete on public.forward_evidence_records
for each row execute function public.reject_forward_evidence_mutation();
