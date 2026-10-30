-- Assertions for the price bot tables. Run by scripts/check-migrations.sh.
\set ON_ERROR_STOP on

insert into public.items
  (id, name, category, size_qty, size_unit, priced_by, size_tolerance, brand_policy, brand, ref_price)
values
  ('ketchup', 'Heinz ketchup', 'Pantry', 32, 'oz', 'package', 0.05, 'national', 'Heinz', 4.79),
  ('milk', 'Whole milk', 'Dairy', 1, 'gal', 'package', 0.05, 'cheapest_comparable', null, 3.89);
insert into public.stores (retailer_id, external_id, name, zip, state, padd)
  values ('kroger', '01400376', 'Kroger Houston', '77002', 'TX', 'gulf');
insert into public.sources (id, retailer_id, kind, scope, enabled)
  values ('mock-kroger', 'kroger', 'mock', 'store', true);
insert into public.ingest_runs (job) values ('price-bot');
insert into public.item_identifiers (item_id, retailer_id, retailer_sku, gtin, status, matched_by, confidence)
values
  ('ketchup', 'kroger', 'K-1', '0001300000046', 'approved', 'gtin', 1),
  ('milk', 'kroger', 'K-2', null, 'pending', 'spec', 0.7);

do $$
declare
  n integer;
  r record;
begin
  -- Observations: re-running a day upserts, including online rows where store_id is null.
  for i in 1..2 loop
    insert into public.price_observations
      (item_id, retailer_id, store_id, source_id, run_id, day, captured_at, regular_price, size_qty,
       size_unit, unit_price, retailer_sku, match_confidence)
    values
      ('ketchup', 'kroger', 1, 'mock-kroger', 1, '2026-10-30', now(), 4.79 + i, 32, 'oz', 0.005, 'K-1', 1),
      ('ketchup', 'kroger', null, 'mock-kroger', 1, '2026-10-30', now(), 4.59 + i, 32, 'oz', 0.005, 'K-1', 1)
    on conflict (item_id, retailer_id, store_id, day, source_id)
      do update set regular_price = excluded.regular_price;
  end loop;
  select count(*) into n from public.price_observations;
  assert n = 2, format('expected 2 observations after re-running a day, got %s', n);
  select regular_price into r from public.price_observations where store_id is null;
  assert r.regular_price = 6.59, 'the rerun should update the online row';

  -- A promo price must be below the regular price.
  begin
    insert into public.price_observations
      (item_id, retailer_id, store_id, source_id, day, captured_at, regular_price, promo_price,
       size_qty, size_unit, unit_price, retailer_sku, match_confidence)
    values ('milk', 'kroger', 1, 'mock-kroger', '2026-10-30', now(), 3.89, 4.50, 1, 'gal', 0.001, 'K-2', 1);
    raise exception 'promo above regular should fail';
  exception when check_violation then null;
  end;

  -- Page sources cannot be enabled before legal sign-off.
  begin
    update public.sources set enabled = true where id = 'walmart-page';
    raise exception 'enabling a page source without legal sign-off should fail';
  exception when check_violation then null;
  end;
  update public.sources set legal_approved_at = now(), enabled = true where id = 'walmart-page';

  -- National brand items need a brand.
  begin
    insert into public.items
      (id, name, category, size_qty, size_unit, priced_by, size_tolerance, brand_policy, ref_price)
    values ('cola', 'Cola', 'Beverages', 12, 'ct', 'package', 0, 'national', 8.99);
    raise exception 'national item without a brand should fail';
  exception when check_violation then null;
  end;

  -- Contributions carry a 3-digit ZIP prefix only.
  begin
    insert into public.contributed_prices (item_id, retailer_id, zip3, purchased_on, price)
      values ('milk', 'target', '77002', '2026-10-29', 3.99);
    raise exception 'full ZIP should fail';
  exception when check_violation then null;
  end;
end $$;

-- The task queue: claims are exclusive, ordered, and count attempts.
insert into public.price_tasks (run_id, source_id, host, payload)
  select 1, 'mock-kroger', 'mock', jsonb_build_object('n', g) from generate_series(1, 5) g;
insert into public.price_tasks (run_id, source_id, host, payload, not_before)
  values (1, 'mock-kroger', 'mock', '{"n": 6}', now() + interval '1 hour');

do $$
declare
  n integer;
  first_n integer;
begin
  select count(*), min((payload->>'n')::int) into n, first_n from public.claim_price_tasks(1, 3);
  assert n = 3 and first_n = 1, format('first claim should get tasks 1-3, got %s from %s', n, first_n);
  select count(*), min((payload->>'n')::int) into n, first_n from public.claim_price_tasks(1, 10);
  assert n = 2 and first_n = 4, format('second claim should get tasks 4-5, got %s from %s', n, first_n);
  select count(*) into n from public.claim_price_tasks(1, 10);
  assert n = 0, 'deferred and running tasks should not be claimed';
  select count(*) into n from public.price_tasks where state = 'running' and attempts = 1;
  assert n = 5, 'claimed tasks should be running with one attempt';
end $$;

-- Clients read market data and approved identifiers only.
set role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.price_observations;
  assert n = 2, 'anon should read prices';
  select count(*) into n from public.items;
  assert n = 2, 'anon should read items';
  select count(*) into n from public.item_identifiers;
  assert n = 1, format('anon should see approved identifiers only, got %s', n);
  begin
    perform 1 from public.sources;
    raise exception 'anon should not read sources';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.price_tasks;
    raise exception 'anon should not read price_tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.contributed_prices;
    raise exception 'anon should not read contributed_prices';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.contributed_prices (item_id, retailer_id, zip3, purchased_on, price)
      values ('milk', 'target', '770', '2026-10-29', 3.99);
    raise exception 'anon should not insert contributions directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.claim_price_tasks(1, 1);
    raise exception 'anon should not claim tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.price_observations
      (item_id, retailer_id, source_id, day, captured_at, regular_price, size_qty, size_unit,
       unit_price, retailer_sku, match_confidence)
    values ('milk', 'kroger', 'mock-kroger', '2026-10-31', now(), 1, 1, 'gal', 0.001, 'K-2', 1);
    raise exception 'anon should not write prices';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'price bot assertions passed' as result;
