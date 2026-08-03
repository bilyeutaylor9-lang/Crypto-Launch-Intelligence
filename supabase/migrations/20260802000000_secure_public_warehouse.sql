-- Repair existing deployments created before warehouse RLS was added.
-- These tables contain scanner research memory and are not a client-facing API.

alter table if exists public.projects enable row level security;
alter table if exists public.project_identities enable row level security;
alter table if exists public.pools enable row level security;
alter table if exists public.market_observations enable row level security;
alter table if exists public.capital_flow_observations enable row level security;
alter table if exists public.wallet_observations enable row level security;
alter table if exists public.wallet_performance enable row level security;
alter table if exists public.execution_quotes enable row level security;
alter table if exists public.engine_runs enable row level security;
alter table if exists public.predictions enable row level security;
alter table if exists public.prediction_outcomes enable row level security;
alter table if exists public.source_health enable row level security;
alter table if exists public.alerts enable row level security;
alter table if exists public.report_runs enable row level security;

revoke all on table
  public.projects,
  public.project_identities,
  public.pools,
  public.market_observations,
  public.capital_flow_observations,
  public.wallet_observations,
  public.wallet_performance,
  public.execution_quotes,
  public.engine_runs,
  public.predictions,
  public.prediction_outcomes,
  public.source_health,
  public.alerts,
  public.report_runs
from public, anon, authenticated;

grant all on table
  public.projects,
  public.project_identities,
  public.pools,
  public.market_observations,
  public.capital_flow_observations,
  public.wallet_observations,
  public.wallet_performance,
  public.execution_quotes,
  public.engine_runs,
  public.predictions,
  public.prediction_outcomes,
  public.source_health,
  public.alerts,
  public.report_runs
to service_role;

-- The trigger function must not inherit a caller-controlled search path.
alter function if exists public.set_updated_at() set search_path = pg_catalog;
