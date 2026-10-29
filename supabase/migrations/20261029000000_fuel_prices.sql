-- Fuel price data from the U.S. EIA weekly retail series.
-- Weekly observations are stored as published; the app reads a daily, forward-filled view.

create type public.fuel_kind as enum ('diesel', 'gas');

-- Every EIA series the app can request. `area` is the EIA duoarea code (NUS, R10, R1X, SCA, ...),
-- matching FuelArea in src/data/geo.
create table public.fuel_series (
  area text not null,
  kind public.fuel_kind not null,
  eia_series_id text not null unique,
  name text not null,
  primary key (area, kind)
);

comment on table public.fuel_series is 'EIA weekly retail price series ingested by ingest-eia.';

create table public.fuel_prices_weekly (
  area text not null,
  kind public.fuel_kind not null,
  -- The week's EIA observation date (Mondays).
  period date not null,
  price_usd_per_gal numeric(6, 3) not null check (price_usd_per_gal > 0),
  fetched_at timestamptz not null default now(),
  primary key (area, kind, period),
  foreign key (area, kind) references public.fuel_series (area, kind)
);

comment on table public.fuel_prices_weekly is 'Weekly EIA retail prices, one row per series per week.';

create table public.ingest_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  rows_upserted integer not null default 0,
  detail jsonb
);

comment on table public.ingest_runs is 'Audit log of ingest jobs; not exposed to clients.';

-- Daily series for the last `p_days` days ending on the latest observation, each day carrying the
-- most recent weekly price on or before it. Returns no rows if the series has no data.
create function public.fuel_series_daily(p_area text, p_kind public.fuel_kind, p_days integer)
returns table (day date, price_usd_per_gal numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select max(period) as last_day
    from public.fuel_prices_weekly
    where area = p_area and kind = p_kind
  ),
  days as (
    select generate_series(b.last_day - (p_days - 1), b.last_day, interval '1 day')::date as day
    from bounds b
    where b.last_day is not null
  )
  select d.day, w.price_usd_per_gal
  from days d
  cross join lateral (
    select f.price_usd_per_gal
    from public.fuel_prices_weekly f
    where f.area = p_area and f.kind = p_kind and f.period <= d.day
    order by f.period desc
    limit 1
  ) w
  order by d.day;
$$;

comment on function public.fuel_series_daily is
  'Forward-filled daily prices for one series. Days before the first observation are omitted.';

-- Row-level security: market data is public read-only; writes happen only with the service role
-- (which bypasses RLS) from the ingest Edge Function.
alter table public.fuel_series enable row level security;
alter table public.fuel_prices_weekly enable row level security;
alter table public.ingest_runs enable row level security;

create policy "Fuel series are public" on public.fuel_series
  for select to anon, authenticated using (true);

create policy "Fuel prices are public" on public.fuel_prices_weekly
  for select to anon, authenticated using (true);

-- No policies on ingest_runs: clients cannot read or write it.

revoke all on public.ingest_runs from anon, authenticated;
grant select on public.fuel_series, public.fuel_prices_weekly to anon, authenticated;
grant execute on function public.fuel_series_daily(text, public.fuel_kind, integer) to anon, authenticated;
