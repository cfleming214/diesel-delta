-- Price history summaries for reports and the app, so callers don't page through raw rows.
-- A "national price" is the median of one day's shelf (regular) prices across a retailer's
-- sampled stores, or its online price.

-- National price per item × retailer on each requested day. Days without data return no rows.
create function public.item_prices_on(p_days date[])
returns table (day date, item_id text, retailer_id text, price numeric, stores integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.day, o.item_id, o.retailer_id,
         round((percentile_cont(0.5) within group (order by o.regular_price))::numeric, 4),
         count(*)::integer
  from public.price_observations o
  where o.day = any(p_days)
  group by o.day, o.item_id, o.retailer_id
  order by o.day, o.item_id, o.retailer_id;
$$;

comment on function public.item_prices_on is
  'National (median across stores) shelf price per item and retailer on each requested day.';

-- Daily cost of a basket at one retailer: the sum of national prices of p_items. `items` says how
-- many of them were priced that day; a day is complete when it equals the basket size.
create function public.basket_daily(p_from date, p_to date, p_items text[], p_retailer text)
returns table (day date, cost numeric, items integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with prices as (
    select o.day, o.item_id,
           percentile_cont(0.5) within group (order by o.regular_price) as price
    from public.price_observations o
    where o.day between p_from and p_to
      and o.retailer_id = p_retailer
      and o.item_id = any(p_items)
    group by o.day, o.item_id
  )
  select p.day, round(sum(p.price)::numeric, 4), count(*)::integer
  from prices p
  group by p.day
  order by p.day;
$$;

comment on function public.basket_daily is
  'Daily basket cost at one retailer from national prices; items = how many were priced.';

grant execute on function public.item_prices_on(date[]) to anon, authenticated;
grant execute on function public.basket_daily(date, date, text[], text) to anon, authenticated;
