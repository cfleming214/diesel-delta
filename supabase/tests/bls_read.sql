-- Assertions for the BLS product read path (bls_product_list, bls_product_monthly,
-- product_retailer_weekly). Run by scripts/check-migrations.sh. Cleans up what it writes.
\set ON_ERROR_STOP on

insert into public.bls_products
  (item_code, item_name, display_name, category, unit_qty, unit, unit_label, base_qty,
   base_dimension, current, latest_month, regions_current)
values
  ('709112', 'Milk, fresh, whole, fortified, per gal. (3.8 lit)', 'Whole milk', 'Dairy', 1, 'gal',
   'per gal', 3785.4118, 'volume_ml', true, '2026-09-01', '{nat,south}'),
  ('708111', 'Eggs, grade A, large, per doz.', 'Large eggs', 'Dairy', 12, 'ct', 'per dozen', 12,
   'count', true, '2026-09-01', '{nat}'),
  ('701311', 'Rice, white, long grain, precooked', 'Instant rice', 'Pantry', 1, 'lb', 'per lb',
   453.5924, 'mass_g', false, '1981-12-01', '{}');

insert into public.bls_series
  (id, item_code, area_code, region, item_name, unit_qty, unit, begin_month, end_month)
values
  ('APU0000709112', '709112', '0000', 'nat', 'Milk', 1, 'gal', '1995-07-01', '2026-09-01'),
  ('APU0300709112', '709112', '0300', 'south', 'Milk', 1, 'gal', '1995-07-01', '2026-09-01'),
  ('APU0200709112', '709112', '0200', 'midwest', 'Milk', 1, 'gal', '1995-07-01', '2025-09-01'),
  ('APU0000708111', '708111', '0000', 'nat', 'Eggs', 12, 'ct', '1980-01-01', '2026-09-01');

insert into public.bls_prices (series_id, month, price) values
  ('APU0000709112', '2026-08-01', 4.05), ('APU0000709112', '2026-09-01', 4.10),
  ('APU0300709112', '2025-09-01', 4.00), ('APU0300709112', '2026-06-01', 4.10),
  ('APU0300709112', '2026-08-01', 4.15), ('APU0300709112', '2026-09-01', 4.20),
  ('APU0200709112', '2025-09-01', 3.80),
  -- Eggs skip August, so the 1-month change is unknown.
  ('APU0000708111', '2026-06-01', 2.90), ('APU0000708111', '2026-09-01', 3.00);

insert into public.items
  (id, name, category, size_qty, size_unit, priced_by, size_tolerance, brand_policy, ref_price,
   bls_series_id)
values
  ('milk', 'Whole milk', 'Dairy', 1, 'gal', 'package', 0.05, 'cheapest_comparable', 3.89,
   'APU0000709112'),
  ('milk_half', 'Whole milk, half gallon', 'Dairy', 0.5, 'gal', 'package', 0.05,
   'cheapest_comparable', 2.39, 'APU0000709112'),
  ('eggs', 'Large eggs', 'Dairy', 12, 'ct', 'package', 0, 'cheapest_comparable', 3.24,
   'APU0000708111');

insert into public.stores (retailer_id, external_id, name, zip, state, padd)
values ('kroger', 'read-tx', 'Kroger Houston', '77002', 'TX', 'gulf'),
       ('kroger', 'read-oh', 'Kroger Cincinnati', '45202', 'OH', 'mid');

insert into public.sources (id, retailer_id, kind, scope, enabled)
values ('mock-kroger', 'kroger', 'mock', 'store', true),
       ('mock-amazon', 'amazon', 'mock', 'online', true);

-- Sample prices this week, in each item's own package; unit_price is per ml or per egg.
insert into public.price_observations
  (item_id, retailer_id, store_id, source_id, day, captured_at, regular_price, promo_price,
   size_qty, size_unit, unit_price, retailer_sku, match_confidence)
select o.item_id, o.retailer_id,
       (select id from public.stores where external_id = o.store), o.source_id,
       current_date - 3, now(), o.regular, o.promo, o.qty, o.unit, o.unit_price, o.sku, 1
from (values
  -- Kroger, South: $4.00 a gallon, and $2.40 a half gallon = $4.80 a gallon.
  ('milk', 'kroger', 'read-tx', 'mock-kroger', 4.00, null::numeric, 1, 'gal', 4.00 / 3785.411784, 'K1'),
  ('milk_half', 'kroger', 'read-tx', 'mock-kroger', 2.40, null, 0.5, 'gal', 2.40 / 1892.705892, 'K2'),
  -- Kroger, Midwest: only in the national view.
  ('milk', 'kroger', 'read-oh', 'mock-kroger', 3.60, null, 1, 'gal', 3.60 / 3785.411784, 'K1'),
  -- Amazon online: $4.20 on sale for $3.99, so $3.99 counts.
  ('milk', 'amazon', null, 'mock-amazon', 4.20, 3.99, 1, 'gal', 4.20 / 3785.411784, 'A1'),
  -- A dozen eggs at $3.60: 30 cents an egg.
  ('eggs', 'kroger', 'read-tx', 'mock-kroger', 3.60, null, 12, 'ct', 0.30, 'K3')
) as o(item_id, retailer_id, store, source_id, regular, promo, qty, unit, unit_price, sku);

do $$
declare
  r record;
  n integer;
begin
  -- Region rule: the requested region only where BLS still publishes it.
  assert public.bls_region_used('709112', 'south') = 'south';
  assert public.bls_region_used('709112', 'midwest') = 'nat', 'Midwest milk stopped in 2025';
  assert public.bls_region_used('708111', 'south') = 'nat', 'eggs are national only';
  assert public.bls_region_used('709112', 'nat') = 'nat';

  -- Weekly retailer prices in BLS's unit, South: both milks pooled, the Ohio store left out.
  select * into r from public.product_retailer_weekly('709112', 'south')
  where retailer_id = 'kroger';
  assert abs(r.price - 4.40) < 0.01, format('Kroger South median should be $4.40/gal, got %s', r.price);
  assert r.items = 2 and r.stores = 1 and r.observations = 2,
    format('Kroger South pools 2 items at 1 store, got %s items %s stores', r.items, r.stores);
  assert r.sample and not r.online;
  assert r.week = date_trunc('week', current_date - 3)::date;

  select * into r from public.product_retailer_weekly('709112', 'south')
  where retailer_id = 'amazon';
  assert abs(r.price - 3.99) < 0.01, format('Amazon counts its sale price, got %s', r.price);
  assert r.online and r.sample, 'Amazon is online sample data, shown in every region';

  -- National: every store.
  select * into r from public.product_retailer_weekly('709112', 'nat') where retailer_id = 'kroger';
  assert r.stores = 2 and abs(r.price - 4.00) < 0.01,
    format('Kroger national median of 3.60, 4.00, 4.80 is 4.00, got %s', r.price);

  -- Eggs: 30 cents an egg is $3.60 a dozen.
  select * into r from public.product_retailer_weekly('708111', 'nat');
  assert abs(r.price - 3.60) < 0.001, format('eggs should be $3.60/dozen, got %s', r.price);

  -- The list: South milk, with changes against 1, 3 and 12 months earlier.
  select * into r from public.bls_product_list('south') where item_code = '709112';
  assert r.region_used = 'south' and r.series_id = 'APU0300709112';
  assert r.month = '2026-09-01' and r.price = 4.20;
  assert r.change_1m = 1.20 and r.change_3m = 2.44 and r.change_12m = 5.00,
    format('changes %s / %s / %s', r.change_1m, r.change_3m, r.change_12m);
  assert r.retailers = 2 and r.sample, format('2 sample retailers, got %s', r.retailers);
  assert r.item_ids = array['milk', 'milk_half'];

  select * into r from public.bls_product_list('south') where item_code = '708111';
  assert r.region_used = 'nat', 'eggs fall back to the U.S. average';
  assert r.change_1m is null, 'August is missing, so the 1-month change is unknown';
  assert round(r.change_3m, 2) = round((3.00 / 2.90 - 1) * 100, 2);

  select count(*) into n from public.bls_product_list('nat');
  assert n = 2, 'products BLS no longer publishes are not listed';

  -- Monthly: the region used plus the U.S. average.
  select count(*) into n from public.bls_product_monthly('709112', 'south') where region = 'south';
  assert n = 4;
  select count(*) into n from public.bls_product_monthly('709112', 'south') where region = 'nat';
  assert n = 2;
  select count(*) into n from public.bls_product_monthly('709112', 'nat') where region <> 'nat';
  assert n = 0;
  select count(*) into n from public.bls_product_monthly('709112', 'south', '2026-08-01');
  assert n = 4, 'p_from trims both lines';
end $$;

-- A real Kroger source replaces Kroger's sample line; Amazon stays sample.
insert into public.price_observations
  (item_id, retailer_id, store_id, source_id, day, captured_at, regular_price, size_qty,
   size_unit, unit_price, retailer_sku, match_confidence)
values ('milk', 'kroger', (select id from public.stores where external_id = 'read-tx'),
        'kroger-api', current_date - 2, now(), 4.50, 1, 'gal', 4.50 / 3785.411784, 'K1', 1);

do $$
declare
  r record;
begin
  select * into r from public.product_retailer_weekly('709112', 'south')
  where retailer_id = 'kroger';
  assert abs(r.price - 4.50) < 0.01 and not r.sample and r.observations = 1,
    format('real Kroger data replaces its sample rows, got %s from %s rows', r.price, r.observations);
  select * into r from public.product_retailer_weekly('709112', 'south')
  where retailer_id = 'amazon';
  assert r.sample, 'Amazon has no real source yet';
end $$;

-- Clients may call the RPCs but not read sources or the internal helper.
set role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.bls_product_list('south');
  assert n = 2, 'anon should list BLS products';
  select count(*) into n from public.product_retailer_weekly('709112', 'south');
  assert n = 2, 'anon should read retailer lines';
  select count(*) into n from public.bls_product_monthly('709112', 'south');
  assert n = 6, 'anon should read the monthly series';
  begin
    perform * from public.bls_retailer_prices('709112', 'south', current_date - 30);
    raise exception 'anon should not call bls_retailer_prices';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.sources;
    raise exception 'anon should not read sources';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

delete from public.price_observations;
delete from public.sources where id in ('mock-kroger', 'mock-amazon');
delete from public.stores where external_id like 'read-%';
delete from public.items;
delete from public.bls_prices where series_id in
  ('APU0000709112', 'APU0300709112', 'APU0200709112', 'APU0000708111');
delete from public.bls_series where item_code in ('709112', '708111');
delete from public.bls_products;
select setval(pg_get_serial_sequence('public.stores', 'id'), 1, false);
select setval(pg_get_serial_sequence('public.price_observations', 'id'), 1, false);

select 'BLS read assertions passed' as result;
