create table if not exists public.projects (
  canonical_project_id text primary key,
  name text,
  symbol text,
  chain_id text,
  token_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create table if not exists public.project_identities (
  identity_key text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  identity_type text not null,
  identity_value text not null,
  source text,
  confidence numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  evidence_json jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_project_identities_type_value
  on public.project_identities(identity_type, identity_value);

create table if not exists public.pools (
  pool_key text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  chain_id text not null,
  token_address text,
  pool_address text not null,
  quote_token_address text,
  venue text,
  created_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_pools_chain_pool
  on public.pools(chain_id, pool_address);

create table if not exists public.market_observations (
  observation_key text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  chain_id text,
  token_address text,
  pool_address text,
  source text not null,
  observed_at timestamptz not null,
  source_timestamp timestamptz,
  price_usd numeric,
  circulating_market_cap_usd numeric,
  fully_diluted_value_usd numeric,
  dex_liquidity_usd numeric,
  dex_volume_usd numeric,
  field_provenance_json jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists idx_market_observations_project_time
  on public.market_observations(canonical_project_id, observed_at);

create table if not exists public.capital_flow_observations (
  observation_key text primary key,
  observed_at timestamptz not null,
  source_timestamp timestamptz,
  source text not null,
  canonical_project_id text references public.projects(canonical_project_id),
  chain_id text,
  token_address text,
  pool_address text,
  quote_token_address text,
  venue text,
  price_usd numeric,
  circulating_market_cap_usd numeric,
  fully_diluted_value_usd numeric,
  dex_liquidity_usd numeric,
  stable_exit_liquidity_usd numeric,
  dex_volume_usd numeric,
  buy_volume_usd numeric,
  sell_volume_usd numeric,
  net_flow_usd numeric,
  buy_transactions integer,
  sell_transactions integer,
  unique_buyers integer,
  unique_sellers integer,
  new_buyers integer,
  repeat_buyers integer,
  liquidity_added_usd numeric,
  liquidity_removed_usd numeric,
  holder_count integer,
  largest_buy_share_pct numeric,
  largest_wallet_flow_share_pct numeric,
  wallet_concentration_pct numeric,
  data_confidence numeric,
  missing_fields_json jsonb not null default '[]'::jsonb,
  field_provenance_json jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists idx_capital_flow_project_time
  on public.capital_flow_observations(canonical_project_id, observed_at);

create index if not exists idx_capital_flow_pool_time
  on public.capital_flow_observations(chain_id, pool_address, observed_at);

create index if not exists idx_capital_flow_source_time
  on public.capital_flow_observations(source, source_timestamp, observed_at);

create table if not exists public.wallet_observations (
  observation_key text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  wallet_address text,
  wallet_cluster_id text,
  observed_at timestamptz not null,
  source text not null,
  net_flow_usd numeric,
  buy_volume_usd numeric,
  sell_volume_usd numeric,
  evidence_json jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create table if not exists public.wallet_performance (
  wallet_key text primary key,
  wallet_address text,
  wallet_cluster_id text,
  resolved_trades integer,
  wins integer,
  losses integer,
  posterior_mean numeric,
  credible_interval_lower numeric,
  credible_interval_upper numeric,
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb
);

create table if not exists public.execution_quotes (
  quote_key text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  chain_id text,
  token_address text,
  pool_address text,
  venue text,
  route_type text,
  quote_timestamp timestamptz,
  buy_route_available boolean,
  sell_route_available boolean,
  minimum_received numeric,
  price_impact_pct numeric,
  slippage_pct numeric,
  route_hops_json jsonb not null default '[]'::jsonb,
  transfer_tax_evidence text,
  sell_simulation_result text,
  payload_json jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create table if not exists public.engine_runs (
  run_id text not null,
  engine_name text not null,
  status text not null,
  projects_received integer,
  projects_processed integer,
  projects_succeeded integer,
  projects_failed integer,
  input_coverage_pct numeric,
  output_coverage_pct numeric,
  duration_ms integer,
  failure_reason text,
  missing_input_families_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  primary key (run_id, engine_name)
);

create table if not exists public.predictions (
  prediction_id text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  predicted_at timestamptz not null,
  model_version text,
  score numeric,
  decision_state text,
  entry_price_usd numeric,
  entry_liquidity_usd numeric,
  route_status text,
  feature_vector_json jsonb not null default '{}'::jsonb,
  score_breakdown_json jsonb not null default '{}'::jsonb
);

create table if not exists public.prediction_outcomes (
  outcome_key text primary key,
  prediction_id text references public.predictions(prediction_id),
  horizon text not null,
  target_timestamp timestamptz not null,
  observed_timestamp timestamptz,
  forward_return_pct numeric,
  maximum_favorable_excursion_pct numeric,
  maximum_adverse_excursion_pct numeric,
  liquidity_survival boolean,
  route_survival boolean,
  rug_event boolean,
  honeypot_event boolean,
  pool_disappearance boolean,
  delisting_event boolean,
  payload_json jsonb not null default '{}'::jsonb
);

create table if not exists public.source_health (
  source_key text primary key,
  source text not null,
  observed_at timestamptz not null,
  status text not null,
  candidate_count integer,
  duration_ms integer,
  error_code text,
  error_message text,
  payload_json jsonb not null default '{}'::jsonb
);

create table if not exists public.alerts (
  alert_id text primary key,
  canonical_project_id text references public.projects(canonical_project_id),
  lifecycle_state text not null,
  severity text,
  alert_type text,
  message text,
  changed_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb
);

create table if not exists public.report_runs (
  report_key text primary key,
  run_id text not null,
  report_name text not null,
  report_path text,
  generated_at timestamptz not null default now(),
  validation_status text,
  payload_json jsonb not null default '{}'::jsonb
);

-- This warehouse is scanner-owned and is not a client-facing Supabase API.
-- The service role bypasses RLS; anon/authenticated receive no direct access.
alter table public.projects enable row level security;
alter table public.project_identities enable row level security;
alter table public.pools enable row level security;
alter table public.market_observations enable row level security;
alter table public.capital_flow_observations enable row level security;
alter table public.wallet_observations enable row level security;
alter table public.wallet_performance enable row level security;
alter table public.execution_quotes enable row level security;
alter table public.engine_runs enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_outcomes enable row level security;
alter table public.source_health enable row level security;
alter table public.alerts enable row level security;
alter table public.report_runs enable row level security;

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
