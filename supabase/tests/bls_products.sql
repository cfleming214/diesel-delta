-- Assertions for BLS products and the catalog link to them. Run by scripts/check-migrations.sh.
-- Cleans up what it writes, so later test files see empty items and stores.
\set ON_ERROR_STOP on

insert into public.bls_products
  (item_code, item_name, display_name, category, unit_qty, unit, unit_label, base_qty,
   base_dimension, current, latest_month, regions_current)
values
  ('FJ1101', 'Milk, fresh, low-fat, reduced fat, skim, per gal. (3.8 lit)', 'Low-fat milk', 'Dairy',
   1, 'gal', 'per gal', 3785.4118, 'volume_ml', true, '2026-09-01', '{nat,northeast,south}'),
  ('72610', 'Electricity per KWH', 'Electricity', 'Fuel', 1, 'kwh', 'per kWh', 1, 'energy_kwh',
   true, '2026-09-01', '{nat,northeast,midwest,south,west}');

insert into public.items
  (id, name, category, size_qty, size_unit, priced_by, size_tolerance, brand_policy, ref_price,
   bls_series_id)
values
  ('milk2', '2% milk', 'Dairy', 1, 'gal', 'package', 0.05, 'cheapest_comparable', 3.79,
   'APU0000FJ1101'),
  ('milk_skim', 'Skim milk', 'Dairy', 1, 'gal', 'package', 0.05, 'cheapest_comparable', 3.69,
   'APU0000FJ1101'),
  ('electricity', 'Electricity', 'Fuel', 1, 'each', 'package', 0, 'cheapest_comparable', 0.2,
   'APU000072610'),
  ('tortillas', 'Flour tortillas', 'Bakery', 10, 'ct', 'package', 0, 'cheapest_comparable', 2.99,
   null);

insert into public.stores (retailer_id, external_id, name, zip, state, padd)
values ('kroger', 'test-tx', 'Kroger Houston', '77002', 'TX', 'gulf'),
       ('kroger', 'test-oh', 'Kroger Cincinnati', '45202', 'OH', 'mid');

do $$
declare
  n integer;
  r text;
begin
  -- The catalog link: the item code after APU0000, null without a mapping.
  select bls_item_code into r from public.items where id = 'milk2';
  assert r = 'FJ1101', format('milk2 should map to FJ1101, got %s', r);
  select bls_item_code into r from public.items where id = 'electricity';
  assert r = '72610', format('five-character fuel codes keep all five, got %s', r);
  select count(*) into n from public.items where id = 'tortillas' and bls_item_code is null;
  assert n = 1, 'an unmapped item has no BLS product';

  -- Retailer specs under a product: both milks, and no Fuel item.
  select count(*) into n from public.bls_product_items where item_code = 'FJ1101';
  assert n = 2, format('FJ1101 should have 2 retailer specs, got %s', n);
  select count(*) into n from public.bls_product_items where item_code = '72610';
  assert n = 0, 'fuel items are BLS benchmarks only';

  -- Census regions: every state and DC, nothing else.
  select count(*) into n from (
    select unnest(array[
      'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
      'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
      'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ]) as st
  ) s where public.census_region(st) is not null;
  assert n = 51, format('all 50 states and DC should have a region, got %s', n);
  assert public.census_region('PR') is null, 'territories have no Census region';
  assert public.census_region('TX') = 'south';
  assert public.census_region('DC') = 'south';
  assert public.census_region('PA') = 'northeast';
  assert public.census_region('OH') = 'midwest';
  assert public.census_region('NM') = 'west';

  select census_region into r from public.stores where external_id = 'test-tx';
  assert r = 'south', format('a Texas store is in the South, got %s', r);
  select census_region into r from public.stores where external_id = 'test-oh';
  assert r = 'midwest', format('an Ohio store is in the Midwest, got %s', r);

  begin
    insert into public.bls_products (item_code, item_name, display_name, category, unit_label,
      current, regions_current)
    values ('701111', 'Flour', 'Flour', 'Pantry', 'per lb', true, '{nat,pacific}');
    raise exception 'regions are nat or a Census region';
  exception when check_violation then null;
  end;
end $$;

-- Public read, no client writes.
set role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.bls_products;
  assert n = 2, 'anon should read BLS products';
  select count(*) into n from public.bls_product_items;
  assert n = 2, 'anon should read the retailer specs under BLS products';
  begin
    update public.bls_products set display_name = 'x';
    raise exception 'anon should not write BLS products';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

delete from public.stores where external_id like 'test-%';
-- Later test files expect the first store they insert to get id 1.
select setval(pg_get_serial_sequence('public.stores', 'id'), 1, false);
delete from public.items;
delete from public.bls_products;

select 'BLS product assertions passed' as result;
