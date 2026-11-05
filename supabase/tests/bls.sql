-- Assertions for the BLS benchmark tables. Run by scripts/check-migrations.sh.
-- Writes no items or ingest runs, so the other test files see the tables they expect.
\set ON_ERROR_STOP on

insert into public.bls_series
  (id, item_code, area_code, region, item_name, unit_qty, unit, begin_month, end_month)
values
  ('APU0000709112', '709112', '0000', 'nat', 'Milk, fresh, whole, fortified, per gal. (3.8 lit)',
   1, 'gal', '1995-07-01', '2026-09-01');

do $$
declare
  n integer;
  p numeric;
  enabled boolean;
begin
  select s.enabled into enabled from public.sources s where id = 'bls-ap';
  assert enabled, 'bls-ap should start enabled';

  -- Re-running a month upserts.
  for i in 1..2 loop
    insert into public.bls_prices (series_id, month, price)
      values ('APU0000709112', '2026-09-01', 4.000 + i * 0.1)
    on conflict (series_id, month) do update set price = excluded.price;
  end loop;
  select count(*), max(price) into n, p from public.bls_prices;
  assert n = 1 and p = 4.2, format('expected one upserted price of 4.2, got %s rows, %s', n, p);

  begin
    insert into public.bls_prices (series_id, month, price)
      values ('APU0000709112', '2026-09-15', 4.1);
    raise exception 'a month that is not the first day should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.bls_series
      (id, item_code, area_code, region, item_name, begin_month, end_month)
    values ('APUS49A709112', '709112', 'S49A', 'west', 'Milk', '1995-07-01', '2026-09-01');
    raise exception 'metro areas are not loaded';
  exception when check_violation then null;
  end;
end $$;

-- Public read, no client writes.
set role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.bls_prices;
  assert n = 1, 'anon should read BLS prices';
  select count(*) into n from public.bls_series;
  assert n = 1, 'anon should read BLS series';
  begin
    insert into public.bls_prices (series_id, month, price) values ('APU0000709112', '2026-08-01', 4);
    raise exception 'anon should not write BLS prices';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'BLS assertions passed' as result;
