-- Read path for BLS products (DD-27): the product list, a product's monthly BLS series, and the
-- retailer prices tracked under it, all in BLS's unit, so the app can draw retailers on top of the
-- BLS line.
--
-- Region rule: a product's BLS line is the requested Census region when BLS publishes it this
-- month (bls_products.regions_current), else the U.S. average. Retailer prices use the requested
-- region (the user's stores) plus online retailers, which have one national price.
--
-- Retailer prices are in BLS's unit: unit_price is the regular price per base unit (g, ml, count),
-- so the effective (promo, else regular) price per base unit times bls_products.base_qty is the
-- price of BLS's quantity. Weekly medians across stores and every catalog item under the product.
-- A retailer's mock rows drop out once it has any real source, so real feeds replace sample lines.
--
-- These read `sources` (which clients can't) to tell sample data from real, so they run as definer
-- and return aggregates only.

create function public.bls_region_used(p_item_code text, p_region text) returns text
language sql stable
set search_path = ''
as $$
  select case
    when p_region <> 'nat' and exists (
      select 1 from public.bls_products p
      where p.item_code = p_item_code and p_region = any(p.regions_current)
    ) then p_region
    else 'nat'
  end
$$;

-- Retailer prices for one product in BLS's unit, one row per observation, mock rows already
-- dropped for retailers that have real data. Internal: the RPCs below aggregate it.
create function public.bls_retailer_prices(p_item_code text, p_region text, p_from date)
returns table (
  retailer_id text, day date, price numeric, store_id bigint, item_id text, online boolean,
  sample boolean
)
language sql stable
security definer
set search_path = ''
as $$
  with obs as (
    select o.retailer_id, o.day,
           o.unit_price * coalesce(o.promo_price, o.regular_price) / o.regular_price * p.base_qty
             as price,
           o.store_id, o.item_id, o.store_id is null as online, src.kind = 'mock' as sample
    from public.price_observations o
    join public.items i on i.id = o.item_id and i.bls_item_code = p_item_code
    join public.bls_products p on p.item_code = p_item_code
    join public.sources src on src.id = o.source_id
    left join public.stores s on s.id = o.store_id
    where o.day >= p_from
      and o.unit_price is not null and o.regular_price > 0 and p.base_qty is not null
      and (p_region = 'nat' or o.store_id is null or s.census_region = p_region)
  ),
  marked as (
    select obs.*, bool_or(not obs.sample) over (partition by obs.retailer_id) as has_real
    from obs
  )
  select m.retailer_id, m.day, m.price, m.store_id, m.item_id, m.online, m.sample
  from marked m
  where not (m.sample and m.has_real)
$$;

revoke execute on function public.bls_retailer_prices(text, text, date) from public, anon, authenticated;

-- The app's product list: every current BLS product with its latest price in the region used.
-- Changes are percentages against 1, 3 and 12 months earlier, null when BLS skipped that month.
create function public.bls_product_list(p_region text default 'nat')
returns table (
  item_code text, display_name text, category text, unit_label text, region_used text,
  series_id text, month date, price numeric, change_1m numeric, change_3m numeric,
  change_12m numeric, retailers integer, sample boolean, item_ids text[]
)
language sql stable
security definer
set search_path = ''
as $$
  with p as (
    select bp.*, public.bls_region_used(bp.item_code, p_region) as region_used
    from public.bls_products bp
    where bp.current
  )
  select p.item_code, p.display_name, p.category, p.unit_label, p.region_used, s.id,
         l.month, l.price,
         round((l.price / m1.price - 1) * 100, 2),
         round((l.price / m3.price - 1) * 100, 2),
         round((l.price / m12.price - 1) * 100, 2),
         coalesce(r.retailers, 0), coalesce(r.sample, false),
         coalesce(i.item_ids, '{}')
  from p
  join public.bls_series s on s.item_code = p.item_code and s.region = p.region_used
  cross join lateral (
    select bp.month, bp.price from public.bls_prices bp
    where bp.series_id = s.id order by bp.month desc limit 1
  ) l
  left join public.bls_prices m1 on m1.series_id = s.id and m1.month = (l.month - interval '1 month')::date
  left join public.bls_prices m3 on m3.series_id = s.id and m3.month = (l.month - interval '3 months')::date
  left join public.bls_prices m12 on m12.series_id = s.id and m12.month = (l.month - interval '12 months')::date
  left join lateral (
    select count(distinct rp.retailer_id)::integer as retailers, bool_or(rp.sample) as sample
    from public.bls_retailer_prices(p.item_code, p_region, current_date - 35) rp
  ) r on true
  left join lateral (
    select array_agg(pi.item_id order by pi.item_id) as item_ids
    from public.bls_product_items pi where pi.item_code = p.item_code
  ) i on true
  order by p.category, p.display_name;
$$;

-- One product's monthly BLS series: the region used, plus the U.S. average when that differs.
create function public.bls_product_monthly(
  p_item_code text, p_region text default 'nat', p_from date default null
)
returns table (region text, month date, price numeric)
language sql stable
set search_path = ''
as $$
  select s.region, bp.month, bp.price
  from public.bls_series s
  join public.bls_prices bp on bp.series_id = s.id
  where s.item_code = p_item_code
    and s.region in (public.bls_region_used(p_item_code, p_region), 'nat')
    and (p_from is null or bp.month >= p_from)
  order by s.region, bp.month;
$$;

-- Retailer prices under one product: the weekly median per retailer in BLS's unit, with how many
-- observations, stores and catalog items it pools. Weeks start on Monday.
create function public.product_retailer_weekly(
  p_item_code text, p_region text default 'nat', p_from date default (current_date - 371)
)
returns table (
  retailer_id text, week date, price numeric, observations integer, stores integer,
  items integer, online boolean, sample boolean
)
language sql stable
security definer
set search_path = ''
as $$
  select rp.retailer_id, date_trunc('week', rp.day)::date,
         round((percentile_cont(0.5) within group (order by rp.price))::numeric, 3),
         count(*)::integer, count(distinct rp.store_id)::integer,
         count(distinct rp.item_id)::integer, bool_and(rp.online), bool_or(rp.sample)
  from public.bls_retailer_prices(p_item_code, p_region, p_from) rp
  group by rp.retailer_id, date_trunc('week', rp.day)
  order by rp.retailer_id, 2;
$$;

comment on function public.bls_product_list is
  'Current BLS products with latest price, 1/3/12-month change and retailer coverage for a region.';
comment on function public.bls_product_monthly is
  'Monthly BLS prices for a product: the region used and the U.S. average.';
comment on function public.product_retailer_weekly is
  'Weekly median retailer prices for a BLS product, in BLS''s unit; sample = mock data.';

grant execute on function public.bls_region_used(text, text) to anon, authenticated;
grant execute on function public.bls_product_list(text) to anon, authenticated;
grant execute on function public.bls_product_monthly(text, text, date) to anon, authenticated;
grant execute on function public.product_retailer_weekly(text, text, date) to anon, authenticated;
