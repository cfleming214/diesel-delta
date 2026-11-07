-- BLS products as the app's products (DD-26). A BLS product is one Average Price item code, e.g.
-- 709112 "Milk, fresh, whole, fortified, per gal.". `npm run bot -- bls` writes one row per code
-- it loads: every code with a current U.S. series, plus any code the catalog maps. Retailers are
-- tracked under a product through the catalog items mapped to it (items.bls_item_code), so one
-- product can have several retailer specs, e.g. 2% and skim milk under FJ1101.

create table public.bls_products (
  item_code text primary key check (item_code ~ '^[0-9A-Z]{5,6}$'),
  -- BLS's own name, kept for citation; display_name is the curated one the app shows.
  item_name text not null,
  display_name text not null,
  category text not null check (category in (
    'Dairy', 'Meat', 'Produce', 'Bakery', 'Pantry', 'Canned', 'Frozen', 'Beverages', 'Snacks',
    'Household', 'Personal care', 'Fuel'
  )),
  -- What one BLS price buys (1 lb, 0.5 gal, 12 ct, 1 kwh, ...) and its label ("per ½ gal").
  unit_qty numeric(10, 3) check (unit_qty > 0),
  unit text check (unit in ('oz', 'lb', 'fl_oz', 'gal', 'l', 'ct', 'kwh', 'therm')),
  unit_label text not null,
  -- The same amount in base units (g, ml, count, ...), from price-bot/units.ts at ingest. A
  -- retailer's unit_price (per base unit) times base_qty is its price in BLS's unit.
  base_qty numeric(14, 4) check (base_qty > 0),
  base_dimension text
    check (base_dimension in ('mass_g', 'volume_ml', 'count', 'each', 'energy_kwh', 'energy_therm')),
  -- Current: BLS published the U.S. average in the latest month. Products that stop stay, with
  -- their history, and drop out of the app's list.
  current boolean not null,
  latest_month date check (extract(day from latest_month) = 1),
  -- Areas with a value in the latest month: 'nat' and any of the four Census regions.
  regions_current text[] not null default '{}'
    check (regions_current <@ array['nat', 'northeast', 'midwest', 'south', 'west']),
  updated_at timestamptz not null default now()
);

create index bls_products_current_idx on public.bls_products (current, category);

-- The link from a catalog item (a retailer spec) to its BLS product. bls_series_id is the national
-- series, APU0000 followed by the item code.
alter table public.items
  add column bls_item_code text generated always as (substring(bls_series_id from 8)) stored;
create index items_bls_item_code_idx on public.items (bls_item_code);

-- Census region for a state, matching src/data/geo/census.ts. Null outside the 50 states and DC.
create function public.census_region(p_state text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when p_state in ('CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA') then 'northeast'
    when p_state in ('IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD')
      then 'midwest'
    when p_state in ('DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'AL', 'KY', 'MS', 'TN',
      'AR', 'LA', 'OK', 'TX') then 'south'
    when p_state in ('AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA')
      then 'west'
  end
$$;

-- Stores already carry a PADD (for fuel); BLS compares by Census region.
alter table public.stores
  add column census_region text generated always as (public.census_region(state)) stored;

-- Retailer specs under each BLS product. Fuel items are BLS benchmarks only and have no retailer.
create view public.bls_product_items with (security_invoker = true) as
select
  p.item_code,
  i.id as item_id,
  i.name,
  i.size_qty,
  i.size_unit,
  i.priced_by,
  i.in_default_basket
from public.bls_products p
join public.items i on i.bls_item_code = p.item_code
where i.active and i.category <> 'Fuel';

alter table public.bls_products enable row level security;

create policy "BLS products are public" on public.bls_products
  for select to anon, authenticated using (true);

grant select on public.bls_products, public.bls_product_items to anon, authenticated;
