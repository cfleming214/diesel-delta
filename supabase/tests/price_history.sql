-- Assertions for item_prices_on() and basket_daily(). Run by scripts/check-migrations.sh after
-- price_bot.sql, which leaves Kroger ketchup prices on 2026-10-30 (store 1 and online).
\set ON_ERROR_STOP on

insert into public.stores (retailer_id, external_id, name, zip, state, padd)
  values ('kroger', '02', 'Kroger Dallas', '75201', 'TX', 'gulf'),
         ('kroger', '03', 'Kroger Denver', '80202', 'CO', 'rocky');
insert into public.price_observations
  (item_id, retailer_id, store_id, source_id, day, captured_at, regular_price, size_qty, size_unit,
   unit_price, retailer_sku, match_confidence)
select i, 'kroger', s, 'mock-kroger', d::date, now(), p, 1, 'gal', 0.001, 'K', 1
from (values
  ('milk', 1, '2026-10-01', 3.00), ('milk', 2, '2026-10-01', 3.20), ('milk', 3, '2026-10-01', 3.90),
  ('milk', 1, '2026-10-02', 3.10), ('milk', 2, '2026-10-02', 3.30),
  ('ketchup', 1, '2026-10-01', 4.00),
  ('ketchup', 1, '2026-10-02', 4.20)
) v(i, s, d, p);

do $$
declare
  n integer;
  p numeric;
  r record;
begin
  -- Median across stores: 3.00, 3.20, 3.90 → 3.20; two stores average the middle pair.
  select price, stores into r from public.item_prices_on(array['2026-10-01'::date])
    where item_id = 'milk' and retailer_id = 'kroger';
  assert r.price = 3.2 and r.stores = 3, format('milk on 10-01: %s from %s stores', r.price, r.stores);
  select price into p from public.item_prices_on(array['2026-10-02'::date]) where item_id = 'milk';
  assert p = 3.2, format('milk on 10-02 should be the mean of 3.10 and 3.30, got %s', p);
  select count(*) into n from public.item_prices_on(array['2026-10-01'::date, '2026-10-02'::date]);
  assert n = 4, format('expected 4 item-days, got %s', n);
  select count(*) into n from public.item_prices_on(array['2025-01-01'::date]);
  assert n = 0, 'a day without data returns nothing';

  -- Basket = milk + ketchup.
  select cost, items into r from public.basket_daily('2026-10-01', '2026-10-02', array['milk', 'ketchup'], 'kroger')
    where day = '2026-10-01';
  assert r.cost = 7.2 and r.items = 2, format('basket on 10-01: %s (%s items)', r.cost, r.items);
  select cost into p from public.basket_daily('2026-10-01', '2026-10-02', array['milk', 'ketchup'], 'kroger')
    where day = '2026-10-02';
  assert p = 7.4, format('basket on 10-02 should be 3.20 + 4.20, got %s', p);
  select count(*) into n from public.basket_daily('2026-10-01', '2026-10-02', array['milk'], 'walmart');
  assert n = 0, 'another retailer has no rows';
end $$;

-- Market summaries are public.
set role anon;
do $$
declare n integer;
begin
  select count(*) into n from public.item_prices_on(array['2026-10-01'::date]);
  assert n = 2, 'anon should call item_prices_on';
  select count(*) into n from public.basket_daily('2026-10-01', '2026-10-02', array['milk'], 'kroger');
  assert n = 2, 'anon should call basket_daily';
end $$;
reset role;

select 'price history assertions passed' as result;
