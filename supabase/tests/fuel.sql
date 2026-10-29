-- Assertions for the fuel migrations. Run by scripts/check-migrations.sh against a scratch database.
\set ON_ERROR_STOP on

insert into public.fuel_prices_weekly (area, kind, period, price_usd_per_gal) values
  ('R30', 'diesel', '2026-10-12', 3.500),
  ('R30', 'diesel', '2026-10-19', 3.450),
  ('R30', 'diesel', '2026-10-26', 3.410);

do $$
declare
  n integer;
  first_day date;
  p numeric;
begin
  -- 10 days ending on the latest observation, forward-filled.
  select count(*), min(day) into n, first_day from public.fuel_series_daily('R30', 'diesel', 10);
  assert n = 10, format('expected 10 days, got %s', n);
  assert first_day = '2026-10-17', format('expected window to start 2026-10-17, got %s', first_day);
  select price_usd_per_gal into p from public.fuel_series_daily('R30', 'diesel', 10) where day = '2026-10-25';
  assert p = 3.450, format('2026-10-25 should carry the 10-19 price, got %s', p);
  select price_usd_per_gal into p from public.fuel_series_daily('R30', 'diesel', 10) where day = '2026-10-26';
  assert p = 3.410, format('2026-10-26 should be the latest price, got %s', p);
  -- Days before the first observation are omitted.
  select count(*) into n from public.fuel_series_daily('R30', 'diesel', 30);
  assert n = 15, format('expected 15 days from 2026-10-12, got %s', n);
  -- Unknown or empty series return nothing.
  select count(*) into n from public.fuel_series_daily('SCA', 'diesel', 30);
  assert n = 0, 'empty series should return no rows';
  -- The seed covers every series.
  select count(*) into n from public.fuel_series;
  assert n = 30, format('expected 30 seeded series, got %s', n);
end $$;

-- Clients can read prices and call the function, but not write or see the ingest log.
set role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.fuel_prices_weekly;
  assert n = 3, 'anon should read prices';
  select count(*) into n from public.fuel_series_daily('R30', 'diesel', 10);
  assert n = 10, 'anon should call fuel_series_daily';
  begin
    insert into public.fuel_prices_weekly (area, kind, period, price_usd_per_gal)
      values ('R30', 'diesel', '2026-11-02', 1.000);
    raise exception 'anon insert should have failed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ingest_runs;
    raise exception 'anon should not read ingest_runs';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Price must be positive; series must exist.
do $$
begin
  begin
    insert into public.fuel_prices_weekly (area, kind, period, price_usd_per_gal)
      values ('R30', 'diesel', '2026-11-02', 0);
    raise exception 'zero price should fail';
  exception when check_violation then null;
  end;
  begin
    insert into public.fuel_prices_weekly (area, kind, period, price_usd_per_gal)
      values ('XYZ', 'diesel', '2026-11-02', 3.0);
    raise exception 'unknown series should fail';
  exception when foreign_key_violation then null;
  end;
end $$;

select 'fuel assertions passed' as result;
